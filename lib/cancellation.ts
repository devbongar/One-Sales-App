'use client';

import { supabase } from '@/lib/supabase';


export async function cancelReservation(
  reservationId: string,
  reason:        string,
  cancelledBy:   string,
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Mark reservation Cancelled — guard against race: only update if still Reserved + amd-rejected
  const { error: resErr } = await supabase
    .from('reservations')
    .update({
      status:               'Cancelled',
      cancelled_at:         now,
      cancelled_by:         cancelledBy,
      cancellation_reason:  reason,
    })
    .eq('reservation_id', reservationId)
    .in('status', ['Reserved', 'Pending Proof']);
  if (resErr) throw resErr;

  // 2. Fetch inventory_code to reopen the unit
  const { data: res } = await supabase
    .from('reservations')
    .select('inventory_code')
    .eq('reservation_id', reservationId)
    .single();
  const inventoryCode = (res as any)?.inventory_code ?? null;

  // 3. Reopen inventory unit
  if (inventoryCode) {
    await supabase
      .from('Inventory')
      .update({ status: 'Available' })
      .eq('inventory_code', inventoryCode);
  }

  // 4. Void Unpaid receivable lines (leave Partial, Paid, Superseded)
  await supabase
    .from('receivables_database')
    .update({ payment_status: 'Cancelled' })
    .eq('reservation_id', reservationId)
    .eq('payment_status', 'Unpaid');

  // 5. Void Pending commission lines (leave For Release, Released, Paid, Superseded)
  await supabase
    .from('commission_schedule')
    .update({ status: 'Cancelled' })
    .eq('reservation_id', reservationId)
    .eq('status', 'Pending');
}

export async function restoreReservation(
  reservationId: string,
  restoredBy:    string,
): Promise<void> {
  // 1. Fetch inventory_code
  const { data: res } = await supabase
    .from('reservations')
    .select('inventory_code')
    .eq('reservation_id', reservationId)
    .single();
  const inventoryCode = (res as any)?.inventory_code ?? null;

  // 2. Check if unit is still Available — block if taken
  if (inventoryCode) {
    const { data: unit } = await supabase
      .from('Inventory')
      .select('status')
      .eq('inventory_code', inventoryCode)
      .single();
    const unitStatus = (unit as any)?.status ?? null;
    if (unitStatus !== 'Available') {
      throw new Error(
        `Cannot restore — unit ${inventoryCode} is already reserved by another client.`
      );
    }
  }

  // 3. Restore reservation
  await supabase
    .from('reservations')
    .update({
      status:               'Reserved',
      cancelled_at:         null,
      cancelled_by:         null,
      cancellation_reason:  null,
      amd_rejected_at:      null,
      rf_rejected_at:       null,
    })
    .eq('reservation_id', reservationId)
    .eq('status', 'Cancelled');

  // 4. Re-reserve inventory unit
  if (inventoryCode) {
    await supabase
      .from('Inventory')
      .update({ status: 'Reserved' })
      .eq('inventory_code', inventoryCode);
  }

  // 5. Restore Cancelled receivable lines → Unpaid
  await supabase
    .from('receivables_database')
    .update({ payment_status: 'Unpaid' })
    .eq('reservation_id', reservationId)
    .eq('payment_status', 'Cancelled');

  // 6. Restore Cancelled commission lines → Pending
  await supabase
    .from('commission_schedule')
    .update({ status: 'Pending' })
    .eq('reservation_id', reservationId)
    .eq('status', 'Cancelled');
}

export async function cancelExpiredReservations(): Promise<void> {
  const { error } = await supabase.rpc('cancel_expired_reservations');
  if (error) throw error;
}
