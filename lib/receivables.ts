import { supabase } from '@/lib/supabase';
import { resolveDueDate, fetchTurnoverDate } from '@/lib/admin';

/**
 * Generates receivable lines in `receivables_database` for a reservation.
 * Called once — on first-time Confirm Payment in the proof-of-payment page.
 * Silently skips if lines already exist for this reservation_id.
 */
export async function generateReceivableLines(
  reservationId: string,
  paymentDate: string, // YYYY-MM-DD (the date the reservation fee was paid)
): Promise<void> {
  // Guard: skip if already generated
  const { count } = await supabase
    .from('receivables_database')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_id', reservationId);
  if (count && count > 0) return;

  // Fetch all computation data from the reservations table
  const { data: res, error } = await supabase
    .from('reservations')
    .select(
      `client_id, client_name, inventory_code,
       project, tower,
       payment_scheme, term_months,
       net_list_price, vat, other_charges, total_contract_price,
       hic_discount, reservation_fee, retention_fee,
       net_amount, dp_amount, net_spot_dp,
       monthly_deferred, monthly_stretched_dp, balance_for_financing`
    )
    .eq('reservation_id', reservationId)
    .single();
  if (error || !res) throw error ?? new Error('Reservation not found');

  const {
    client_id, client_name, inventory_code,
    project, tower,
    payment_scheme, term_months,
    net_list_price, vat, other_charges, total_contract_price: tcp,
    hic_discount, reservation_fee, retention_fee,
    net_amount, dp_amount: _dp_amount, net_spot_dp,
    monthly_deferred, monthly_stretched_dp, balance_for_financing,
  } = res;

  // Turnover date drives the Retention Fee due date (falls back to computed date)
  const turnoverDate = await fetchTurnoverDate(project, tower);

  // ── Due date helpers ──────────────────────────────────────────────────────
  // Parse date parts directly from the string — no Date object, no timezone shift.
  const [resYear, resMonth1, resDay] = paymentDate.split('-').map(Number);
  // Look up the configured due day for this reservation day (from due_date_assignments).
  // sameMonth is ignored — all payment schemes start the month AFTER reservation.
  const { dueDay } = await resolveDueDate(resDay);

  // Look up due date settings for the turnover date's own day (e.g. Aug 22 → 30, sameMonth: false).
  // sameMonth=false means the due date falls in the month AFTER the turnover month.
  let turnoverDueDay  = dueDay;
  let turnoverSameMonth = false;
  if (turnoverDate) {
    const turnoverDay = Number(turnoverDate.split('-')[2]);
    const resolved = await resolveDueDate(turnoverDay);
    turnoverDueDay   = resolved.dueDay;
    turnoverSameMonth = resolved.sameMonth;
  }

  /**
   * Returns the due date for the nth installment (0-indexed), as 'YYYY-MM-DD'.
   * n=0 → next calendar month after reservation
   * n=1 → 2 months after, etc.
   * Caps day at the last day of the target month (handles Feb 28/29 correctly).
   */
  /** Formats year/month(1-indexed)/day as 'YYYY-MM-DD'. No Date object — no timezone shift. */
  function toDateStr(year: number, month1: number, day: number): string {
    return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /** Last day of a given year/month(1-indexed). */
  function lastDayOf(year: number, month1: number): number {
    return new Date(year, month1, 0).getDate(); // month1 = next month's index at day 0
  }

  /**
   * Returns the due date for the nth installment (0-indexed), as 'YYYY-MM-DD'.
   * n=0 → next calendar month after reservation; n=1 → 2 months after, etc.
   * Day is always dueDay, capped at end of month (handles Feb 28/29 correctly).
   */
  function nthDueDate(n: number): string {
    let year   = resYear;
    let month1 = resMonth1 + 1 + n; // 1-indexed, start from next month
    while (month1 > 12) { month1 -= 12; year++; }
    const day = Math.min(dueDay, lastDayOf(year, month1));
    return toDateStr(year, month1, day);
  }

  function installmentDueDate(i: number): string {
    return nthDueDate(i);
  }

  /**
   * Takes a raw turnover date ('YYYY-MM-DD') and applies due date settings
   * based on the turnover date's own day.
   * sameMonth=false → due date falls in the month AFTER turnover month.
   * e.g. Aug 22, 2030 → resolveDueDate(22)={dueDay:30, sameMonth:false} → Sep 30, 2030
   */
  function applyDueDayToTurnover(dateStr: string): string {
    let [y, m] = dateStr.split('-').map(Number);
    if (!turnoverSameMonth) {
      m += 1;
      if (m > 12) { m = 1; y++; }
    }
    const day = Math.min(turnoverDueDay, lastDayOf(y, m));
    return toDateStr(y, m, day);
  }

  // ── Proportional breakdown per peso of TCP ────────────────────────────────
  const tcpRatio = tcp > 0 ? 1 / tcp : 0;
  function breakdown(amount: number) {
    return {
      principal:     Math.round(amount * net_list_price * tcpRatio),
      hic:           hic_discount > 0 ? Math.round(amount * hic_discount * tcpRatio) : null,
      vat:           Math.round(amount * vat * tcpRatio),
      other_charges: Math.round(amount * other_charges * tcpRatio),
    };
  }

  // ── Base fields shared across all lines ───────────────────────────────────
  const base = {
    reservation_id:             reservationId,
    client_id:                  client_id ?? null,
    client_name,
    inventory_code,
    payment_scheme,
    payment_status:             'Unpaid',
    mode_of_payment:            null,
    acknowledgement_receipt_no: null,
    posting_date:               null,
  };

  const lines: Record<string, unknown>[] = [];

  // ── Line 1: Reservation Fee (always — starts Unpaid like all other lines) ──
  lines.push({
    ...base,
    type_of_payment: 'Reservation Fee',
    due_date:        paymentDate,
    total_amount_due: reservation_fee,
    principal:       reservation_fee,
    hic:             null,
    vat:             0,
    other_charges:   0,
  });

  // ── Remaining lines depend on payment scheme ──────────────────────────────

  if (payment_scheme === 'spot_cash') {
    // Retention: turnover date with due-day applied; fallback to next month
    const retentionDueDate = turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0);
    lines.push({
      ...base,
      type_of_payment:  'Retention Fee',
      due_date:         retentionDueDate,
      total_amount_due: retention_fee,
      principal:        retention_fee,
      hic:              null,
      vat:              0,
      other_charges:    0,
    });
    lines.push({
      ...base,
      type_of_payment:  'Cash Out Balance',
      due_date:         nthDueDate(0),
      total_amount_due: net_amount,
      ...breakdown(net_amount),
    });

  } else if (payment_scheme === 'deferred_cash') {
    for (let i = 0; i < term_months; i++) {
      lines.push({
        ...base,
        type_of_payment:  `Monthly Deferred ${i + 1}/${term_months}`,
        due_date:         installmentDueDate(i),
        total_amount_due: monthly_deferred,
        ...breakdown(monthly_deferred),
      });
    }
    // Retention due date:
    // - term > 12 (e.g. 54 months): month after the last installment, regardless of turnover date
    // - all other terms: turnover date with due-day applied (fallback: month after last installment)
    const retentionSlot = term_months;
    const retentionDueDate = term_months > 12
      ? nthDueDate(retentionSlot)
      : turnoverDate
        ? applyDueDayToTurnover(turnoverDate)
        : nthDueDate(retentionSlot);
    lines.push({
      ...base,
      type_of_payment:  'Retention Fee',
      due_date:         retentionDueDate,
      total_amount_due: retention_fee,
      principal:        retention_fee,
      hic:              null,
      vat:              0,
      other_charges:    0,
    });

  } else if (payment_scheme === 'spot_dp') {
    lines.push({
      ...base,
      type_of_payment:  'Downpayment',
      due_date:         installmentDueDate(0),
      total_amount_due: net_spot_dp,
      ...breakdown(net_spot_dp),
    });
    lines.push({
      ...base,
      type_of_payment:  'Loan Take-out',
      due_date:         turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
      total_amount_due: balance_for_financing,
      ...breakdown(balance_for_financing),
    });

  } else if (payment_scheme === 'stretched_dp') {
    for (let i = 0; i < term_months; i++) {
      lines.push({
        ...base,
        type_of_payment:  `Monthly DP ${i + 1}/${term_months}`,
        due_date:         installmentDueDate(i),
        total_amount_due: monthly_stretched_dp,
        ...breakdown(monthly_stretched_dp),
      });
    }
    lines.push({
      ...base,
      type_of_payment:  'Loan Take-out',
      due_date:         installmentDueDate(term_months),
      total_amount_due: balance_for_financing,
      ...breakdown(balance_for_financing),
    });
  }

  // ── Insert all lines ──────────────────────────────────────────────────────
  const { error: insertError } = await supabase
    .from('receivables_database')
    .insert(lines);
  if (insertError) throw insertError;
}

/* ─── Expected schedule (dry-run) ───────────────────────────────────────── */

export interface ExpectedLine {
  type_of_payment: string;
  expected_due_date: string;
}

/**
 * Re-derives what the collection schedule SHOULD look like for a reservation.
 * Uses the stored Reservation Fee line's due_date as paymentDate so the
 * comparison is self-consistent with how lines were originally generated.
 */
export async function computeExpectedSchedule(reservationId: string): Promise<ExpectedLine[]> {
  // 1. Fetch reservation data
  const { data: res, error } = await supabase
    .from('reservations')
    .select(
      `project, tower, payment_scheme, term_months`
    )
    .eq('reservation_id', reservationId)
    .single();
  if (error || !res) throw error ?? new Error('Reservation not found');

  const { project, tower, payment_scheme, term_months } = res;

  // 2. Get the paymentDate from the stored Reservation Fee line
  const { data: rfLine } = await supabase
    .from('receivables_database')
    .select('due_date')
    .eq('reservation_id', reservationId)
    .eq('type_of_payment', 'Reservation Fee')
    .single();
  if (!rfLine) throw new Error('Reservation Fee line not found in schedule');
  const paymentDate = rfLine.due_date as string;

  // 3. Replicate due-date helpers
  const [resYear, resMonth1, resDay] = paymentDate.split('-').map(Number);
  const turnoverDate = await fetchTurnoverDate(project, tower);
  const { dueDay } = await resolveDueDate(resDay);

  let turnoverDueDay = dueDay;
  let turnoverSameMonth = false;
  if (turnoverDate) {
    const td = Number(turnoverDate.split('-')[2]);
    const r = await resolveDueDate(td);
    turnoverDueDay = r.dueDay;
    turnoverSameMonth = r.sameMonth;
  }

  function toDateStr(y: number, m: number, d: number) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function lastDayOf(y: number, m: number) { return new Date(y, m, 0).getDate(); }
  function nthDueDate(n: number) {
    let year = resYear; let month1 = resMonth1 + 1 + n;
    while (month1 > 12) { month1 -= 12; year++; }
    return toDateStr(year, month1, Math.min(dueDay, lastDayOf(year, month1)));
  }
  function installmentDueDate(i: number) { return nthDueDate(i); }
  function applyDueDayToTurnover(dateStr: string) {
    let [y, m] = dateStr.split('-').map(Number);
    if (!turnoverSameMonth) { m++; if (m > 12) { m = 1; y++; } }
    return toDateStr(y, m, Math.min(turnoverDueDay, lastDayOf(y, m)));
  }

  // 4. Build expected lines
  const lines: ExpectedLine[] = [];
  lines.push({ type_of_payment: 'Reservation Fee', expected_due_date: paymentDate });

  if (payment_scheme === 'spot_cash') {
    lines.push({
      type_of_payment: 'Retention Fee',
      expected_due_date: turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
    });
    lines.push({ type_of_payment: 'Cash Out Balance', expected_due_date: nthDueDate(0) });

  } else if (payment_scheme === 'deferred_cash') {
    for (let i = 0; i < term_months; i++) {
      lines.push({ type_of_payment: `Monthly Deferred ${i + 1}/${term_months}`, expected_due_date: installmentDueDate(i) });
    }
    const retentionSlot = term_months;
    lines.push({
      type_of_payment: 'Retention Fee',
      expected_due_date: term_months > 12
        ? nthDueDate(retentionSlot)
        : turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(retentionSlot),
    });

  } else if (payment_scheme === 'spot_dp') {
    lines.push({ type_of_payment: 'Downpayment', expected_due_date: installmentDueDate(0) });
    lines.push({
      type_of_payment: 'Loan Take-out',
      expected_due_date: turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
    });

  } else if (payment_scheme === 'stretched_dp') {
    for (let i = 0; i < term_months; i++) {
      lines.push({ type_of_payment: `Monthly DP ${i + 1}/${term_months}`, expected_due_date: installmentDueDate(i) });
    }
    lines.push({ type_of_payment: 'Loan Take-out', expected_due_date: installmentDueDate(term_months) });
  }

  return lines;
}

export interface RepairPreviewItem {
  type_of_payment: string;
  current_due_date: string | null;
  correct_due_date: string;
  total_amount_due: number;
  action: 'update' | 'insert';
}

export interface RepairResult {
  updatedDates: number;
  insertedLines: number;
}

interface FullLine { type_of_payment: string; due_date: string; total_amount_due: number; principal: number; hic: number | null; vat: number; other_charges: number; }
interface RepairPlan {
  plan: RepairPreviewItem[];
  toInsertRows: Record<string, unknown>[];
  toUpdateIds: { id: string; due_date: string }[];
}

async function _buildRepairPlan(reservationId: string): Promise<RepairPlan> {
  const { data: res, error } = await supabase
    .from('reservations')
    .select(
      `client_id, client_name, inventory_code,
       project, tower,
       payment_scheme, term_months,
       net_list_price, vat, other_charges, total_contract_price,
       hic_discount, reservation_fee, retention_fee,
       net_amount, dp_amount, net_spot_dp,
       monthly_deferred, monthly_stretched_dp, balance_for_financing`
    )
    .eq('reservation_id', reservationId)
    .single();
  if (error || !res) throw error ?? new Error('Reservation not found');

  const {
    client_id, client_name, inventory_code, project, tower,
    payment_scheme, term_months,
    net_list_price, vat, other_charges, total_contract_price: tcp,
    hic_discount, reservation_fee, retention_fee,
    net_amount, net_spot_dp,
    monthly_deferred, monthly_stretched_dp, balance_for_financing,
  } = res;

  const { data: rfLine } = await supabase
    .from('receivables_database').select('due_date')
    .eq('reservation_id', reservationId).eq('type_of_payment', 'Reservation Fee').single();
  if (!rfLine) throw new Error('Reservation Fee line not found — cannot repair without it');
  const paymentDate = rfLine.due_date as string;

  const [resYear, resMonth1, resDay] = paymentDate.split('-').map(Number);
  const turnoverDate = await fetchTurnoverDate(project, tower);
  const { dueDay } = await resolveDueDate(resDay);
  let turnoverDueDay = dueDay; let turnoverSameMonth = false;
  if (turnoverDate) {
    const r = await resolveDueDate(Number(turnoverDate.split('-')[2]));
    turnoverDueDay = r.dueDay; turnoverSameMonth = r.sameMonth;
  }
  function toDateStr(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function lastDayOf(y: number, m: number) { return new Date(y, m, 0).getDate(); }
  function nthDueDate(n: number) {
    let y = resYear; let m = resMonth1 + 1 + n;
    while (m > 12) { m -= 12; y++; }
    return toDateStr(y, m, Math.min(dueDay, lastDayOf(y, m)));
  }
  function installmentDueDate(i: number) { return nthDueDate(i); }
  function applyDueDayToTurnover(d: string) {
    let [y, m] = d.split('-').map(Number);
    if (!turnoverSameMonth) { m++; if (m > 12) { m = 1; y++; } }
    return toDateStr(y, m, Math.min(turnoverDueDay, lastDayOf(y, m)));
  }
  const tcpRatio = tcp > 0 ? 1 / tcp : 0;
  function breakdown(amount: number) {
    return {
      principal:     Math.round(amount * net_list_price * tcpRatio),
      hic:           hic_discount > 0 ? Math.round(amount * hic_discount * tcpRatio) : null,
      vat:           Math.round(amount * vat * tcpRatio),
      other_charges: Math.round(amount * other_charges * tcpRatio),
    };
  }

  const expected: FullLine[] = [];
  const base = { reservation_id: reservationId, client_id: client_id ?? null, client_name, inventory_code, payment_scheme, payment_status: 'Unpaid', mode_of_payment: null, acknowledgement_receipt_no: null, posting_date: null };

  expected.push({ type_of_payment: 'Reservation Fee', due_date: paymentDate, total_amount_due: reservation_fee, principal: reservation_fee, hic: null, vat: 0, other_charges: 0 });
  if (payment_scheme === 'spot_cash') {
    expected.push({ type_of_payment: 'Retention Fee', due_date: turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0), total_amount_due: retention_fee, principal: retention_fee, hic: null, vat: 0, other_charges: 0 });
    expected.push({ type_of_payment: 'Cash Out Balance', due_date: nthDueDate(0), total_amount_due: net_amount, ...breakdown(net_amount) });
  } else if (payment_scheme === 'deferred_cash') {
    for (let i = 0; i < term_months; i++) expected.push({ type_of_payment: `Monthly Deferred ${i+1}/${term_months}`, due_date: installmentDueDate(i), total_amount_due: monthly_deferred, ...breakdown(monthly_deferred) });
    const retSlot = term_months;
    expected.push({ type_of_payment: 'Retention Fee', due_date: term_months > 12 ? nthDueDate(retSlot) : turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(retSlot), total_amount_due: retention_fee, principal: retention_fee, hic: null, vat: 0, other_charges: 0 });
  } else if (payment_scheme === 'spot_dp') {
    expected.push({ type_of_payment: 'Downpayment', due_date: installmentDueDate(0), total_amount_due: net_spot_dp, ...breakdown(net_spot_dp) });
    expected.push({ type_of_payment: 'Loan Take-out', due_date: turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0), total_amount_due: balance_for_financing, ...breakdown(balance_for_financing) });
  } else if (payment_scheme === 'stretched_dp') {
    for (let i = 0; i < term_months; i++) expected.push({ type_of_payment: `Monthly DP ${i+1}/${term_months}`, due_date: installmentDueDate(i), total_amount_due: monthly_stretched_dp, ...breakdown(monthly_stretched_dp) });
    expected.push({ type_of_payment: 'Loan Take-out', due_date: installmentDueDate(term_months), total_amount_due: balance_for_financing, ...breakdown(balance_for_financing) });
  }

  const { data: stored } = await supabase.from('receivables_database')
    .select('id, type_of_payment, due_date, payment_status').eq('reservation_id', reservationId);
  const storedMap = new Map((stored ?? []).map((l: any) => [l.type_of_payment as string, l as { id: string; due_date: string; payment_status: string }]));

  const plan: RepairPreviewItem[] = [];
  const toInsertRows: Record<string, unknown>[] = [];
  const toUpdateIds: { id: string; due_date: string }[] = [];

  for (const exp of expected) {
    const s = storedMap.get(exp.type_of_payment);
    if (!s) {
      plan.push({ type_of_payment: exp.type_of_payment, current_due_date: null, correct_due_date: exp.due_date, total_amount_due: exp.total_amount_due, action: 'insert' });
      toInsertRows.push({ ...base, ...exp });
    } else if (s.due_date !== exp.due_date && s.payment_status !== 'Paid') {
      plan.push({ type_of_payment: exp.type_of_payment, current_due_date: s.due_date, correct_due_date: exp.due_date, total_amount_due: exp.total_amount_due, action: 'update' });
      toUpdateIds.push({ id: s.id, due_date: exp.due_date });
    }
  }

  return { plan, toInsertRows, toUpdateIds };
}

/**
 * Returns a preview of what repairSchedule would change — no DB writes.
 * Excludes paid lines from updates (same rule as repairSchedule).
 */
export async function previewRepair(reservationId: string): Promise<RepairPreviewItem[]> {
  const { plan } = await _buildRepairPlan(reservationId);
  return plan;
}

/**
 * Fixes a reservation's collection schedule for the selected line types only.
 * - Updates stored lines whose due_date differs from expected (unpaid only)
 * - Inserts any expected lines that are missing entirely
 * Does NOT delete unexpected/extra lines.
 * @param selectedTypes  If provided, only fixes those type_of_payment values.
 */
export async function repairSchedule(reservationId: string, selectedTypes?: Set<string>): Promise<RepairResult> {
  const { toInsertRows, toUpdateIds, plan } = await _buildRepairPlan(reservationId);

  const filteredUpdates = selectedTypes
    ? toUpdateIds.filter((u) => {
        const item = plan.find((p) => p.action === 'update' && p.correct_due_date === u.due_date);
        return item ? selectedTypes.has(item.type_of_payment) : false;
      })
    : toUpdateIds;

  const filteredInserts = selectedTypes
    ? toInsertRows.filter((r) => selectedTypes.has(r.type_of_payment as string))
    : toInsertRows;

  await Promise.all(filteredUpdates.map(({ id, due_date }) =>
    supabase.from('receivables_database').update({ due_date }).eq('id', id)
  ));

  if (filteredInserts.length > 0) {
    const { error: insertErr } = await supabase.from('receivables_database').insert(filteredInserts);
    if (insertErr) throw insertErr;
  }

  return { updatedDates: filteredUpdates.length, insertedLines: filteredInserts.length };
}

/* ─── Read / Update ──────────────────────────────────────────────────────── */

export interface ReceivableLine {
  id: string;
  reservation_id: string;
  client_name: string;
  inventory_code: string;
  type_of_payment: string;
  due_date: string;
  total_amount_due: number;
  amount_paid: number | null;
  principal: number | null;
  hic: number | null;
  vat: number | null;
  other_charges: number | null;
  payment_status: 'Paid' | 'Unpaid' | 'Partial' | 'Superseded';
  mode_of_payment: string | null;
  acknowledgement_receipt_no: string | null;
  posting_date: string | null;
  sales_invoice_number: string | null;
  check_no: string | null;
  check_date: string | null;
  superseded_by_request_id?: string | null;
}

export interface ReservationReceivableSummary {
  reservation_id:      string;
  client_id:           string | null;
  client_name:         string;
  inventory_code:      string;
  payment_scheme:      string;
  project:             string;
  total_lines:         number;
  paid_lines:          number;
  total_contract_price: number;
  total_paid:          number;
  outstanding:         number;
  next_due_date:       string | null;
  next_due_amount:     number | null;
  status:              'Complete' | 'Overdue' | 'Unpaid';
}

export async function fetchReceivableSummaries(): Promise<ReservationReceivableSummary[]> {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const { data: lines, error: linesErr } = await supabase
    .from('receivables_database')
    .select('reservation_id, client_id, client_name, inventory_code, due_date, total_amount_due, amount_paid, payment_status')
    .limit(10000);
  if (linesErr) throw linesErr;
  if (!lines || lines.length === 0) return [];

  const reservationIds = [...new Set((lines as any[]).map((l) => l.reservation_id as string))];
  const { data: reservations, error: resErr } = await supabase
    .from('reservations')
    .select('reservation_id, payment_scheme, project, total_contract_price')
    .in('reservation_id', reservationIds);
  if (resErr) throw resErr;
  const schemeMap = new Map<string, string>(
    (reservations ?? []).map((r: any) => [r.reservation_id as string, r.payment_scheme as string])
  );
  const projectMap = new Map<string, string>(
    (reservations ?? []).map((r: any) => [r.reservation_id as string, (r.project as string) ?? ''])
  );
  const tcpMap = new Map<string, number>(
    (reservations ?? []).map((r: any) => [r.reservation_id as string, Number(r.total_contract_price) || 0])
  );

  const grouped = new Map<string, any[]>();
  for (const line of lines as any[]) {
    if (!grouped.has(line.reservation_id)) grouped.set(line.reservation_id, []);
    grouped.get(line.reservation_id)!.push(line);
  }

  const summaries: ReservationReceivableSummary[] = [];
  for (const [reservation_id, rLines] of grouped) {
    const first = rLines[0];
    // Exclude Superseded lines — they belong to a prior schedule and must not affect
    // totals, status, or next-due calculations for the current schedule.
    const active     = rLines.filter((l) => l.payment_status !== 'Superseded');
    const unpaid     = active.filter((l) => l.payment_status !== 'Paid');
    const paid_lines = active.length - unpaid.length;
    const outstanding = unpaid
      .filter((l) => l.due_date < today)
      .reduce(
        (sum, l) => sum + Math.max(0, Number(l.total_amount_due) - Number(l.amount_paid ?? 0)),
        0,
      );
    const unpaidSorted = [...unpaid].sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const nextDue      = unpaidSorted[0] ?? null;
    const nextDueAmount = nextDue
      ? Math.max(0, Number(nextDue.total_amount_due) - Number(nextDue.amount_paid ?? 0))
      : null;

    let status: 'Complete' | 'Overdue' | 'Unpaid';
    if (unpaid.length === 0) {
      status = 'Complete';
    } else if (unpaid.some((l) => l.due_date < today)) {
      status = 'Overdue';
    } else {
      status = 'Unpaid';
    }

    // totalPaid must include all lines (including Superseded partials) — money paid
    // before a BRF restructuring is real money received and must be counted.
    const totalPaid = rLines.reduce((sum: number, l: any) => {
      if (l.payment_status === 'Paid' && (l.amount_paid == null || Number(l.amount_paid) === 0)) {
        return sum + Number(l.total_amount_due || 0);
      }
      return sum + Number(l.amount_paid || 0);
    }, 0);

    summaries.push({
      reservation_id,
      client_id:            first.client_id ?? null,
      client_name:          first.client_name,
      inventory_code:       first.inventory_code,
      payment_scheme:       schemeMap.get(reservation_id) ?? '',
      project:              projectMap.get(reservation_id) ?? '',
      total_lines:          active.length,
      paid_lines,
      total_contract_price: tcpMap.get(reservation_id) ?? 0,
      total_paid:           totalPaid,
      outstanding,
      next_due_date:        nextDue?.due_date ?? null,
      next_due_amount:      nextDueAmount,
      status,
    });
  }

  return summaries;
}

export async function fetchReceivableLines(reservationId: string): Promise<ReceivableLine[]> {
  const { data, error } = await supabase
    .from('receivables_database')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('due_date');
  if (error) throw error;
  return (data ?? []) as ReceivableLine[];
}

/* ─── Turnover due-date fix ──────────────────────────────────────────────── */

export interface DueDateFixPreview {
  reservation_id: string;
  client_name: string;
  inventory_code: string;
  line_id: string;
  type_of_payment: string;
  current_due_date: string;
  correct_due_date: string;
}

function applyDueDayStatic(turnoverDate: string, dueDay: number, sameMonth: boolean): string {
  let [y, m] = turnoverDate.split('-').map(Number);
  if (!sameMonth) { m += 1; if (m > 12) { m = 1; y++; } }
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Scans all reservations that now have a turnover date configured and returns
 * the set of receivable lines whose stored due_date differs from what the
 * correct turnover-based date should be.
 */
export async function previewTurnoverDueDateFixes(): Promise<DueDateFixPreview[]> {
  // 1. Fetch all project towers that have a turnover date set
  const { data: towers, error: twErr } = await supabase
    .from('project_towers')
    .select('project, tower, turnover_date')
    .not('turnover_date', 'is', null);
  if (twErr) throw twErr;
  if (!towers || towers.length === 0) return [];

  const turnoverMap = new Map<string, string>(
    (towers as any[]).map((t) => [`${t.project}::${t.tower}`, t.turnover_date as string])
  );

  // 2. Fetch all reservations
  const { data: reservations, error: resErr } = await supabase
    .from('reservations')
    .select('reservation_id, project, tower, payment_scheme, term_months');
  if (resErr) throw resErr;
  if (!reservations) return [];

  // 3. Identify affected reservations and which line type to check
  type ResRow = { reservation_id: string; project: string; tower: string; payment_scheme: string; term_months: number };
  const affected: Array<{ res: ResRow; turnoverDate: string; lineType: string }> = [];
  for (const r of reservations as ResRow[]) {
    const td = turnoverMap.get(`${r.project}::${r.tower}`);
    if (!td) continue;
    if (r.payment_scheme === 'spot_cash') {
      affected.push({ res: r, turnoverDate: td, lineType: 'Retention Fee' });
    } else if (r.payment_scheme === 'deferred_cash' && (r.term_months ?? 0) <= 12) {
      affected.push({ res: r, turnoverDate: td, lineType: 'Retention Fee' });
    } else if (r.payment_scheme === 'spot_dp') {
      affected.push({ res: r, turnoverDate: td, lineType: 'Loan Take-out' });
    }
  }
  if (affected.length === 0) return [];

  // 4. Batch-fetch existing turnover-dependent lines
  const resIds = [...new Set(affected.map((a) => a.res.reservation_id))];
  const { data: lines, error: linesErr } = await supabase
    .from('receivables_database')
    .select('id, reservation_id, client_name, inventory_code, type_of_payment, due_date')
    .in('reservation_id', resIds)
    .in('type_of_payment', ['Retention Fee', 'Loan Take-out']);
  if (linesErr) throw linesErr;

  type LineRow = { id: string; reservation_id: string; client_name: string; inventory_code: string; type_of_payment: string; due_date: string };
  const lineMap = new Map<string, LineRow>();
  for (const l of (lines ?? []) as LineRow[]) {
    lineMap.set(`${l.reservation_id}::${l.type_of_payment}`, l);
  }

  // 5. Resolve due-day config per unique turnover-day (cached to avoid N+1 DB calls)
  const dueDayCache = new Map<number, { dueDay: number; sameMonth: boolean }>();
  async function getDueDayConfig(day: number) {
    if (!dueDayCache.has(day)) dueDayCache.set(day, await resolveDueDate(day));
    return dueDayCache.get(day)!;
  }

  // 6. Compute correct dates and collect differences
  const previews: DueDateFixPreview[] = [];
  for (const { res, turnoverDate, lineType } of affected) {
    const line = lineMap.get(`${res.reservation_id}::${lineType}`);
    if (!line) continue;
    const turnoverDay = Number(turnoverDate.split('-')[2]);
    const { dueDay, sameMonth } = await getDueDayConfig(turnoverDay);
    const correctDate = applyDueDayStatic(turnoverDate, dueDay, sameMonth);
    if (line.due_date !== correctDate) {
      previews.push({
        reservation_id: res.reservation_id,
        client_name: line.client_name,
        inventory_code: line.inventory_code,
        line_id: line.id,
        type_of_payment: lineType,
        current_due_date: line.due_date,
        correct_due_date: correctDate,
      });
    }
  }
  return previews;
}

export async function applyTurnoverDueDateFixes(
  fixes: { line_id: string; correct_due_date: string }[]
): Promise<void> {
  await Promise.all(
    fixes.map(({ line_id, correct_due_date }) =>
      supabase.from('receivables_database').update({ due_date: correct_due_date }).eq('id', line_id)
    )
  );
}

