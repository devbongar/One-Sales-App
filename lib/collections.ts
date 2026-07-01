import { supabase } from '@/lib/supabase';
import { generateCommissionSchedule } from '@/lib/commission';

export const COLLECTION_TYPES = ['Admin Fee', "Developer's Incentive", 'Penalties'] as const;
export type CollectionType = typeof COLLECTION_TYPES[number];

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
  type_of_collection:         string | null;
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
  type_of_collection?:         string | null;
}

/**
 * Records a collection and routes it based on type_of_collection:
 *   null                   → allocate oldest-first to receivable lines (existing behaviour)
 *   'Admin Fee'            → record only, no allocation
 *   "Developer's Incentive"→ record only, no allocation
 *   'Penalties'            → allocate oldest-first to penalty_lines for this reservation
 */
export async function postCollection(
  reservationId: string,
  payload: PostCollectionPayload,
): Promise<void> {
  const type = payload.type_of_collection ?? null;

  // ── Insert collection record (all types) ─────────────────────────────────────
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
      type_of_collection:         type,
    })
    .select('id')
    .single();
  if (collErr) throw collErr;

  // ── Admin Fee / Developer's Incentive: record only, done ─────────────────────
  if (type === 'Admin Fee' || type === "Developer's Incentive") return;

  // ── Penalties: apply to penalty_lines oldest-first, with credit carry-forward ─
  if (type === 'Penalties') {
    // 1. Fetch open credits (balance > 0) oldest-first
    const { data: openCredits, error: credErr } = await supabase
      .from('penalty_credits')
      .select('id, ar_no, amount, consumed_amount')
      .eq('reservation_id', reservationId)
      .gt('balance', 0)
      .order('created_at', { ascending: true });
    if (credErr) throw credErr;

    const credits = (openCredits ?? []) as { id: number; ar_no: string | null; amount: number; consumed_amount: number }[];
    const creditTotal = credits.reduce((s, c) => s + (Number(c.amount) - Number(c.consumed_amount)), 0);

    // 2. Fetch penalty lines (Unpaid/Partial) oldest-first
    const { data: penaltyLines, error: plErr } = await supabase
      .from('penalty_lines')
      .select('id, penalty_amount, collection, payment_status')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('original_due_date', { ascending: true });
    if (plErr) throw plErr;

    // 3. Allocate: open credits first, then new payment
    let remaining = Number(payload.amount_received) + creditTotal;
    const penaltyApps:    { collection_id: string; penalty_line_id: number; amount_applied: number }[] = [];
    const penaltyUpdates: { id: number; collection: number; payment_status: string }[] = [];

    for (const line of (penaltyLines ?? []) as any[]) {
      if (remaining <= 0) break;
      const currentCollection = Number(line.collection ?? 0);
      const lineBalance = Math.max(0, Number(line.penalty_amount) - currentCollection);
      if (lineBalance <= 0) continue;

      const applied       = Math.min(remaining, lineBalance);
      const newCollection = currentCollection + applied;
      const newStatus     = newCollection >= Number(line.penalty_amount) - 0.005 ? 'Paid' : 'Partial';

      penaltyApps.push({ collection_id: collection.id, penalty_line_id: line.id, amount_applied: applied });
      penaltyUpdates.push({ id: line.id, collection: newCollection, payment_status: newStatus });
      remaining -= applied;
    }

    // 4. Insert penalty_collection_applications
    if (penaltyApps.length > 0) {
      const { error: appErr } = await supabase.from('penalty_collection_applications').insert(penaltyApps);
      if (appErr) throw appErr;
    }

    // 5. Update penalty lines
    for (const upd of penaltyUpdates) {
      const { error } = await supabase
        .from('penalty_lines')
        .update({
          collection:     upd.collection,
          payment_status: upd.payment_status,
          ar_no:          payload.acknowledgement_receipt_no ?? null,
          ar_date:        payload.posting_date,
        })
        .eq('id', upd.id);
      if (error) throw error;
    }

    // 6. Consume existing credits (oldest-first)
    const totalAllocated  = Number(payload.amount_received) + creditTotal - remaining;
    let   creditToConsume = Math.min(creditTotal, totalAllocated);
    const now             = new Date().toISOString();

    for (const credit of credits) {
      if (creditToConsume <= 0.005) break;
      const available        = Number(credit.amount) - Number(credit.consumed_amount);
      const used             = Math.min(creditToConsume, available);
      const newConsumed      = Number(credit.consumed_amount) + used;
      const isFullyConsumed  = newConsumed >= Number(credit.amount) - 0.005;

      const { error } = await supabase
        .from('penalty_credits')
        .update({
          consumed_amount:         newConsumed,
          consuming_collection_id: isFullyConsumed ? collection.id : null,
          consumed_at:             isFullyConsumed ? now : null,
        })
        .eq('id', credit.id);
      if (error) throw error;
      creditToConsume -= used;
    }

    // 7. If new payment has unallocated portion, create a credit record
    const newPaymentConsumed = Math.max(0, totalAllocated - creditTotal);
    const newPaymentExcess   = Number(payload.amount_received) - newPaymentConsumed;

    if (newPaymentExcess > 0.005) {
      const { error: creditErr } = await supabase
        .from('penalty_credits')
        .insert({
          reservation_id:       reservationId,
          source_collection_id: collection.id,
          ar_no:                payload.acknowledgement_receipt_no ?? null,
          amount:               Math.round(newPaymentExcess * 100) / 100,
        });
      if (creditErr) throw creditErr;
    }

    return;
  }

  // ── null (Standard): allocate to receivable lines oldest-first ───────────────

  // Identify RF and 1st DP line IDs + reservation meta in parallel
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

  const { data: lines, error: linesErr } = await supabase
    .from('receivables_database')
    .select('id, total_amount_due, amount_paid, payment_status')
    .eq('reservation_id', reservationId)
    .in('payment_status', ['Unpaid', 'Partial'])
    .order('due_date', { ascending: true });
  if (linesErr) throw linesErr;
  if (!lines || lines.length === 0) throw new Error('No unpaid lines for this reservation.');

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

  if (applications.length > 0) {
    const { error: appErr } = await supabase.from('collection_applications').insert(applications);
    if (appErr) throw appErr;
  }

  for (const upd of lineUpdates) {
    const { error } = await supabase
      .from('receivables_database')
      .update({
        amount_paid:                upd.amount_paid,
        payment_status:             upd.payment_status,
        mode_of_payment:            payload.mode_of_payment,
        acknowledgement_receipt_no: payload.acknowledgement_receipt_no ?? null,
        sales_invoice_number:       payload.sales_invoice_number       ?? null,
        posting_date:               payload.posting_date,
        transaction_date:           payload.transaction_date           ?? null,
        check_no:                   payload.check_no   ?? null,
        check_date:                 payload.check_date ?? null,
      })
      .eq('id', upd.id);
    if (error) throw error;
  }

  // Stamp finance_status when RF or 1st DP become fully Paid
  const justPaidIds = new Set(lineUpdates.filter(u => u.payment_status === 'Paid').map(u => u.id));
  const rfJustPaid  = !rfAlreadyPaid && !!rfLineId && justPaidIds.has(rfLineId);
  const dpJustPaid  = !dpAlreadyPaid && !!dpLineId && justPaidIds.has(dpLineId);
  const rfNowPaid   = rfAlreadyPaid || rfJustPaid;
  const dpNowPaid   = dpAlreadyPaid || dpJustPaid;

  if (!rfJustPaid && !dpJustPaid) return;

  const now         = new Date().toISOString();
  const paymentDate = payload.transaction_date || payload.posting_date;
  const orNo        = payload.acknowledgement_receipt_no ?? null;
  const siNo        = payload.sales_invoice_number       ?? null;

  if (firstPaymentAgreed) {
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
      generateCommissionSchedule(reservationId).catch(e =>
        console.error('[commission] collection-posting combined stamp failed:', e)
      );
    }
  } else {
    if (rfJustPaid && !['rf-verified', 'dp-verified'].includes(currentFinStatus ?? '')) {
      await supabase.from('reservations').update({
        finance_status:             'rf-verified',
        finance_verified_at:        now,
        date_of_reservation_fee:    paymentDate,
        acknowledgement_receipt_no: orNo,
        sales_invoice_no:           siNo,
      }).eq('reservation_id', reservationId);
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
 * After a BRF schedule replacement, re-allocates all standard collections (type_of_collection IS NULL)
 * oldest-first against the current active (non-superseded) lines.
 * Admin Fee, Developer's Incentive, and Penalties collections are skipped — they have nothing to replay.
 */
export async function reapplyCollections(reservationId: string): Promise<void> {
  const { data: collections, error: colErr } = await supabase
    .from('collections')
    .select('id, amount_received, mode_of_payment, acknowledgement_receipt_no, sales_invoice_number, posting_date, transaction_date, check_no, check_date')
    .eq('reservation_id', reservationId)
    .is('type_of_collection', null)
    .order('posting_date', { ascending: true })
    .order('created_at',   { ascending: true });
  if (colErr) throw colErr;
  if (!collections || collections.length === 0) return;

  const { error: resetErr } = await supabase
    .from('receivables_database')
    .update({
      amount_paid:                0,
      payment_status:             'Unpaid',
      mode_of_payment:            null,
      acknowledgement_receipt_no: null,
      sales_invoice_number:       null,
      posting_date:               null,
      transaction_date:           null,
      check_no:                   null,
      check_date:                 null,
    })
    .eq('reservation_id', reservationId)
    .neq('payment_status', 'Superseded');
  if (resetErr) throw resetErr;

  for (const col of collections as {
    id: string; amount_received: number;
    mode_of_payment: string; acknowledgement_receipt_no: string | null;
    sales_invoice_number: string | null; posting_date: string;
    transaction_date: string | null;
    check_no: string | null; check_date: string | null;
  }[]) {
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
        .update({
          amount_paid:                upd.amount_paid,
          payment_status:             upd.payment_status,
          mode_of_payment:            col.mode_of_payment,
          acknowledgement_receipt_no: col.acknowledgement_receipt_no,
          sales_invoice_number:       col.sales_invoice_number,
          posting_date:               col.posting_date,
          transaction_date:           col.transaction_date,
          check_no:                   col.check_no,
          check_date:                 col.check_date,
        })
        .eq('id', upd.id);
      if (error) throw error;
    }
  }
}

/**
 * Clears all penalty collection state for a reservation without replaying.
 * Sets collection=0 / Unpaid on all penalty_lines, deletes
 * penalty_collection_applications and penalty_credits.
 * Call this BEFORE regenerating penalty_lines so the RPC guard sees
 * collection=0 and computes the correct penalty_amount.
 */
export async function resetPenaltyCollections(reservationId: string): Promise<void> {
  const { data: lineIdRows, error: idErr } = await supabase
    .from('penalty_lines')
    .select('id')
    .eq('reservation_id', reservationId);
  if (idErr) throw idErr;

  const { error: resetErr } = await supabase
    .from('penalty_lines')
    .update({ collection: 0, payment_status: 'Unpaid', ar_no: null, ar_date: null })
    .eq('reservation_id', reservationId);
  if (resetErr) throw resetErr;

  const ids = (lineIdRows ?? []).map((l: any) => l.id as number);
  if (ids.length > 0) {
    const { error: delAppErr } = await supabase
      .from('penalty_collection_applications')
      .delete()
      .in('penalty_line_id', ids);
    if (delAppErr) throw delAppErr;
  }

  const { error: delCreditErr } = await supabase
    .from('penalty_credits')
    .delete()
    .eq('reservation_id', reservationId);
  if (delCreditErr) throw delCreditErr;
}

/**
 * Resets all penalty_lines for a reservation to zero and replays every
 * 'Penalties' collection oldest-first.  Any excess becomes a penalty_credit.
 * Call this after regenerating penalty lines so that updated penalty_amounts
 * are correctly reflected in collection/payment_status.
 */
export async function reapplyPenaltyCollections(reservationId: string): Promise<void> {
  await resetPenaltyCollections(reservationId);

  // Fetch all Penalties collections oldest-first
  const { data: collections, error: colErr } = await supabase
    .from('collections')
    .select('id, amount_received, acknowledgement_receipt_no, posting_date')
    .eq('reservation_id', reservationId)
    .eq('type_of_collection', 'Penalties')
    .order('posting_date', { ascending: true })
    .order('created_at',   { ascending: true });
  if (colErr) throw colErr;
  if (!collections || collections.length === 0) return;

  // 6. Replay each collection
  for (const col of collections as { id: string; amount_received: number; acknowledgement_receipt_no: string | null; posting_date: string }[]) {
    const { data: penaltyLines, error: plErr } = await supabase
      .from('penalty_lines')
      .select('id, penalty_amount, collection, payment_status')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('original_due_date', { ascending: true });
    if (plErr) throw plErr;

    let remaining = Number(col.amount_received);

    if (!penaltyLines || penaltyLines.length === 0) {
      // All lines already paid — entire amount is excess credit
      if (remaining > 0.005) {
        const { error: creditErr } = await supabase.from('penalty_credits').insert({
          reservation_id:       reservationId,
          source_collection_id: col.id,
          ar_no:                col.acknowledgement_receipt_no ?? null,
          amount:               Math.round(remaining * 100) / 100,
        });
        if (creditErr) throw creditErr;
      }
      continue;
    }

    const apps:    { collection_id: string; penalty_line_id: number; amount_applied: number }[] = [];
    const updates: { id: number; collection: number; payment_status: string }[] = [];

    for (const line of penaltyLines as any[]) {
      if (remaining <= 0) break;
      const currentCollection = Number(line.collection ?? 0);
      const lineBalance = Math.max(0, Number(line.penalty_amount) - currentCollection);
      if (lineBalance <= 0) continue;

      const applied       = Math.min(remaining, lineBalance);
      const newCollection = currentCollection + applied;
      const newStatus     = newCollection >= Number(line.penalty_amount) - 0.005 ? 'Paid' : 'Partial';

      apps.push({ collection_id: col.id, penalty_line_id: line.id, amount_applied: applied });
      updates.push({ id: line.id, collection: newCollection, payment_status: newStatus });
      remaining -= applied;
    }

    if (apps.length > 0) {
      const { error: appErr } = await supabase.from('penalty_collection_applications').insert(apps);
      if (appErr) throw appErr;
    }

    for (const upd of updates) {
      const { error } = await supabase
        .from('penalty_lines')
        .update({
          collection:     upd.collection,
          payment_status: upd.payment_status,
          ar_no:          col.acknowledgement_receipt_no ?? null,
          ar_date:        col.posting_date,
        })
        .eq('id', upd.id);
      if (error) throw error;
    }

    // Excess → create credit
    if (remaining > 0.005) {
      const { error: creditErr } = await supabase.from('penalty_credits').insert({
        reservation_id:       reservationId,
        source_collection_id: col.id,
        ar_no:                col.acknowledgement_receipt_no ?? null,
        amount:               Math.round(remaining * 100) / 100,
      });
      if (creditErr) throw creditErr;
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
