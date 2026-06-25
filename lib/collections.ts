import { supabase } from '@/lib/supabase';
import { generateCommissionSchedule } from '@/lib/commission';

export interface CollectionRecord {
  id:                         string;
  reservation_id:             string;
  amount_received:            number;
  mode_of_payment:            string;
  acknowledgement_receipt_no: string | null;
  sales_invoice_number:       string | null;
  posting_date:               string;
  transaction_date:           string | null;
  check_no:                   string | null;
  check_date:                 string | null;
  created_at:                 string;
  created_by:                 string | null;
}

export interface CollectionApplication {
  id:                 string;
  collection_id:      string;
  receivable_line_id: string;
  applied_amount:     number;
  created_at:         string;
}

export interface PostCollectionPayload {
  amount_received:             number;
  mode_of_payment:             string;
  acknowledgement_receipt_no?: string;
  sales_invoice_number?:       string;
  posting_date:                string;
  transaction_date?:           string;
  check_no?:                   string;
  check_date?:                 string;
  created_by?:                 string;
}

/**
 * Records a collection event and auto-allocates oldest-first across unpaid/partial lines.
 * Finance never decides allocation — the system does.
 * Also stamps finance_status on reservations when RF or 1st DP lines become fully Paid,
 * so the buyers payment page reflects the correct verification state.
 */
export async function postCollection(
  reservationId: string,
  payload: PostCollectionPayload,
): Promise<void> {
  // 0. Identify RF and 1st DP line IDs (lines 1 and 2 by due_date, non-superseded)
  //    and fetch reservation's first_payment_agreed + current finance_status in parallel
  const [{ data: topLines }, { data: resRow }] = await Promise.all([
    supabase
      .from('receivables_database')
      .select('id, payment_status')
      .eq('reservation_id', reservationId)
      .neq('payment_status', 'Superseded')
      .order('due_date', { ascending: true })
      .limit(2),
    supabase
      .from('reservations')
      .select('first_payment_agreed, finance_status')
      .eq('reservation_id', reservationId)
      .single(),
  ]);

  const rfLineId           = (topLines as any[])?.[0]?.id            ?? null;
  const dpLineId           = (topLines as any[])?.[1]?.id            ?? null;
  const rfAlreadyPaid      = (topLines as any[])?.[0]?.payment_status === 'Paid';
  const dpAlreadyPaid      = (topLines as any[])?.[1]?.payment_status === 'Paid';
  const firstPaymentAgreed = !!((resRow as any)?.first_payment_agreed);
  const currentFinStatus   = ((resRow as any)?.finance_status as string | null) ?? null;

  // 1. Fetch unpaid / partial lines ordered oldest-first
  const { data: lines, error: linesErr } = await supabase
    .from('receivables_database')
    .select('id, total_amount_due, amount_paid, payment_status')
    .eq('reservation_id', reservationId)
    .in('payment_status', ['Unpaid', 'Partial'])
    .order('due_date', { ascending: true });
  if (linesErr) throw linesErr;
  if (!lines || lines.length === 0) throw new Error('No unpaid lines for this reservation.');

  // 2. Insert collection record
  const { data: collection, error: collErr } = await supabase
    .from('collections')
    .insert({
      reservation_id:             reservationId,
      amount_received:            payload.amount_received,
      mode_of_payment:            payload.mode_of_payment,
      acknowledgement_receipt_no: payload.acknowledgement_receipt_no ?? null,
      sales_invoice_number:       payload.sales_invoice_number       ?? null,
      posting_date:               payload.posting_date,
      transaction_date:           payload.transaction_date           ?? null,
      check_no:                   payload.check_no   ?? null,
      check_date:                 payload.check_date ?? null,
      created_by:                 payload.created_by ?? null,
    })
    .select('id')
    .single();
  if (collErr) throw collErr;

  // 3. Allocate oldest-first
  let remaining = payload.amount_received;
  const applications: { collection_id: string; receivable_line_id: string; applied_amount: number }[] = [];
  const lineUpdates:  { id: string; amount_paid: number; payment_status: string }[] = [];

  for (const line of lines as any[]) {
    if (remaining <= 0) break;
    const currentPaid = Number(line.amount_paid ?? 0);
    const balance     = Math.max(0, Number(line.total_amount_due) - currentPaid);
    if (balance <= 0) continue;

    const applied   = Math.min(remaining, balance);
    const newPaid   = currentPaid + applied;
    const newStatus = newPaid >= Number(line.total_amount_due) - 0.005 ? 'Paid' : 'Partial';

    applications.push({ collection_id: collection.id, receivable_line_id: line.id, applied_amount: applied });
    lineUpdates.push({ id: line.id, amount_paid: newPaid, payment_status: newStatus });
    remaining -= applied;
  }

  // 4. Insert applications
  if (applications.length > 0) {
    const { error: appErr } = await supabase.from('collection_applications').insert(applications);
    if (appErr) throw appErr;
  }

  // 5. Update lines sequentially (Supabase REST doesn't support bulk update by row)
  for (const upd of lineUpdates) {
    const { error } = await supabase
      .from('receivables_database')
      .update({ amount_paid: upd.amount_paid, payment_status: upd.payment_status })
      .eq('id', upd.id);
    if (error) throw error;
  }

  // 6. Stamp finance_status on reservations when RF or 1st DP become fully Paid
  const justPaidIds  = new Set(lineUpdates.filter(u => u.payment_status === 'Paid').map(u => u.id));
  const rfJustPaid   = !rfAlreadyPaid && !!rfLineId && justPaidIds.has(rfLineId);
  const dpJustPaid   = !dpAlreadyPaid && !!dpLineId && justPaidIds.has(dpLineId);
  const rfNowPaid    = rfAlreadyPaid || rfJustPaid;
  const dpNowPaid    = dpAlreadyPaid || dpJustPaid;

  if (!rfJustPaid && !dpJustPaid) return; // nothing relevant changed

  const now         = new Date().toISOString();
  const paymentDate = payload.transaction_date || payload.posting_date;
  const orNo        = payload.acknowledgement_receipt_no ?? null;
  const siNo        = payload.sales_invoice_number       ?? null;

  if (firstPaymentAgreed) {
    // Combined mode: only stamp dp-verified when BOTH lines are fully paid
    if (rfNowPaid && dpNowPaid && currentFinStatus !== 'dp-verified') {
      await supabase.from('reservations').update({
        finance_status:                'dp-verified',
        finance_verified_at:           now,
        date_of_reservation_fee:       paymentDate,
        acknowledgement_receipt_no:    orNo,
        sales_invoice_no:              siNo,
        dp_verified_at:                now,
        date_of_1st_dp:               paymentDate,
        dp_acknowledgement_receipt_no: orNo,
        dp_sales_invoice_no:           siNo,
      }).eq('reservation_id', reservationId);
      // Generate commission schedule — same trigger as buyers payment RF verification
      generateCommissionSchedule(reservationId).catch(e =>
        console.error('[commission] collection-posting combined stamp failed:', e)
      );
    }
  } else {
    // Normal mode: stamp rf-verified when RF paid, dp-verified when 1st DP paid
    if (rfJustPaid && !['rf-verified', 'dp-verified'].includes(currentFinStatus ?? '')) {
      await supabase.from('reservations').update({
        finance_status:             'rf-verified',
        finance_verified_at:        now,
        date_of_reservation_fee:    paymentDate,
        acknowledgement_receipt_no: orNo,
        sales_invoice_no:           siNo,
      }).eq('reservation_id', reservationId);
      // Generate commission schedule — same trigger as buyers payment RF verification
      generateCommissionSchedule(reservationId).catch(e =>
        console.error('[commission] collection-posting rf stamp failed:', e)
      );
    }
    if (dpJustPaid && currentFinStatus !== 'dp-verified') {
      await supabase.from('reservations').update({
        finance_status:                'dp-verified',
        dp_verified_at:               now,
        date_of_1st_dp:              paymentDate,
        dp_acknowledgement_receipt_no: orNo,
        dp_sales_invoice_no:           siNo,
      }).eq('reservation_id', reservationId);
    }
  }
}

/**
 * After a BRF schedule replacement, re-allocates all existing collections oldest-first
 * against the current active (non-superseded) lines.
 *
 * Old collection_applications are left intact — they point to superseded lines and serve
 * as the pre-BRF audit trail. New applications are inserted for the new active lines.
 * Collection records themselves (dates, amounts) are never modified.
 */
export async function reapplyCollections(reservationId: string): Promise<void> {
  // 1. Fetch all collections chronologically — oldest posting date first
  const { data: collections, error: colErr } = await supabase
    .from('collections')
    .select('id, amount_received')
    .eq('reservation_id', reservationId)
    .order('posting_date', { ascending: true })
    .order('created_at',   { ascending: true });
  if (colErr) throw colErr;
  if (!collections || collections.length === 0) return;

  // 2. Reset all active (non-superseded) lines to Unpaid / amount_paid = 0
  const { error: resetErr } = await supabase
    .from('receivables_database')
    .update({ amount_paid: 0, payment_status: 'Unpaid' })
    .eq('reservation_id', reservationId)
    .neq('payment_status', 'Superseded');
  if (resetErr) throw resetErr;

  // 3. Replay each collection oldest-first against the current active lines
  for (const col of collections as { id: string; amount_received: number }[]) {
    const { data: lines, error: linesErr } = await supabase
      .from('receivables_database')
      .select('id, total_amount_due, amount_paid, payment_status')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('due_date', { ascending: true });
    if (linesErr) throw linesErr;
    if (!lines || lines.length === 0) continue;

    let remaining = Number(col.amount_received);
    const applications: { collection_id: string; receivable_line_id: string; applied_amount: number }[] = [];
    const lineUpdates:  { id: string; amount_paid: number; payment_status: string }[] = [];

    for (const line of lines as any[]) {
      if (remaining <= 0) break;
      const currentPaid = Number(line.amount_paid ?? 0);
      const balance     = Math.max(0, Number(line.total_amount_due) - currentPaid);
      if (balance <= 0) continue;

      const applied   = Math.min(remaining, balance);
      const newPaid   = currentPaid + applied;
      const newStatus = newPaid >= Number(line.total_amount_due) - 0.005 ? 'Paid' : 'Partial';

      applications.push({ collection_id: col.id, receivable_line_id: line.id, applied_amount: applied });
      lineUpdates.push({ id: line.id, amount_paid: newPaid, payment_status: newStatus });
      remaining -= applied;
    }

    if (applications.length > 0) {
      const { error: appErr } = await supabase.from('collection_applications').insert(applications);
      if (appErr) throw appErr;
    }

    for (const upd of lineUpdates) {
      const { error } = await supabase
        .from('receivables_database')
        .update({ amount_paid: upd.amount_paid, payment_status: upd.payment_status })
        .eq('id', upd.id);
      if (error) throw error;
    }
  }
}

export async function fetchCollections(reservationId: string): Promise<CollectionRecord[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('posting_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CollectionRecord[];
}

export async function fetchCollectionApplicationsByIds(
  collectionIds: string[],
): Promise<CollectionApplication[]> {
  if (collectionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('collection_applications')
    .select('*')
    .in('collection_id', collectionIds);
  if (error) throw error;
  return (data ?? []) as CollectionApplication[];
}
