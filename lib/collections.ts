import { supabase } from '@/lib/supabase';

export interface CollectionRecord {
  id:                         string;
  reservation_id:             string;
  amount_received:            number;
  mode_of_payment:            string;
  acknowledgement_receipt_no: string | null;
  sales_invoice_number:       string | null;
  posting_date:               string;
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
  check_no?:                   string;
  check_date?:                 string;
  created_by?:                 string;
}

/**
 * Records a collection event and auto-allocates oldest-first across unpaid/partial lines.
 * Finance never decides allocation — the system does.
 */
export async function postCollection(
  reservationId: string,
  payload: PostCollectionPayload,
): Promise<void> {
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
