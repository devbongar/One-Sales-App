import { supabase } from '@/lib/supabase';

export async function withdrawSubmission(reservationId: string): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .update({ booking_review_status: null })
    .eq('reservation_id', reservationId);
  if (error) throw error;
}

export async function submitForReview(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_for_review', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function directorReview(
  reservationId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('director_review', {
    p_reservation_id: reservationId,
    p_approved:       approved,
    p_notes:          notes ?? null,
  });
  if (error) throw error;
}

export async function submitToAmd(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_to_amd', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  await supabase.from('reservations').update({ amd_rejected_at: null }).eq('reservation_id', reservationId);
}

export async function amdReview(
  reservationId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('amd_review', {
    p_reservation_id: reservationId,
    p_approved:       approved,
    p_notes:          notes ?? null,
  });
  if (error) throw error;

  if (approved) {
    // If finance already verified DP, flip status to Booked now that AMD approved
    const { data: res } = await supabase
      .from('reservations')
      .select('finance_status, inventory_code')
      .eq('reservation_id', reservationId)
      .single();
    const finDone = (res as any)?.finance_status === 'dp-verified';
    if (finDone) {
      await supabase.from('reservations')
        .update({ status: 'Booked', amd_rejected_at: null })
        .eq('reservation_id', reservationId);
      const invCode = (res as any)?.inventory_code as string | null;
      if (invCode) {
        const { updateInventoryUnitStatus } = await import('@/lib/inventory');
        await updateInventoryUnitStatus(invCode, 'Booked').catch(console.error);
      }
    } else {
      await supabase.from('reservations')
        .update({ amd_rejected_at: null })
        .eq('reservation_id', reservationId);
    }
  } else {
    // Stamp rejection time for auto-cancel countdown
    await supabase.from('reservations').update({
      amd_rejected_at: new Date().toISOString(),
    }).eq('reservation_id', reservationId);
  }
}

export async function financeVerify(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('finance_verify', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}
