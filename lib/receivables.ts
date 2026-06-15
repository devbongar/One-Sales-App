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
       monthly_deferred, monthly_stretched_dp, balance_for_financing,
       first_payment_agreed`
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
    first_payment_agreed,
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

  /**
   * Due date for the i-th installment (0-indexed).
   * When first_payment_agreed is true, installment 0 is due on the RF payment date
   * (same day as the Reservation Fee), and subsequent installments shift one slot earlier.
   */
  function installmentDueDate(i: number): string {
    if (first_payment_agreed) {
      return i === 0 ? paymentDate : nthDueDate(i - 1);
    }
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
    // When first_payment_agreed, the last installment shifted one slot earlier, so retention shifts too.
    const retentionSlot = first_payment_agreed ? term_months - 1 : term_months;
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
  }

  // ── Insert all lines ──────────────────────────────────────────────────────
  const { error: insertError } = await supabase
    .from('receivables_database')
    .insert(lines);
  if (insertError) throw insertError;
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
  payment_status: 'Paid' | 'Unpaid' | 'Partial';
  mode_of_payment: string | null;
  acknowledgement_receipt_no: string | null;
  posting_date: string | null;
  sales_invoice_number: string | null;
  check_no: string | null;
  check_date: string | null;
}

export interface ReservationReceivableSummary {
  reservation_id: string;
  client_name: string;
  inventory_code: string;
  payment_scheme: string;
  project: string;
  total_lines: number;
  paid_lines: number;
  outstanding: number;
  next_due_date: string | null;
  next_due_amount: number | null;
  status: 'Complete' | 'Overdue' | 'Unpaid';
}

export async function fetchReceivableSummaries(): Promise<ReservationReceivableSummary[]> {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const { data: lines, error: linesErr } = await supabase
    .from('receivables_database')
    .select('reservation_id, client_name, inventory_code, due_date, total_amount_due, amount_paid, payment_status')
    .limit(10000);
  if (linesErr) throw linesErr;
  if (!lines || lines.length === 0) return [];

  const reservationIds = [...new Set((lines as any[]).map((l) => l.reservation_id as string))];
  const { data: reservations, error: resErr } = await supabase
    .from('reservations')
    .select('reservation_id, payment_scheme, project')
    .in('reservation_id', reservationIds);
  if (resErr) throw resErr;
  const schemeMap = new Map<string, string>(
    (reservations ?? []).map((r: any) => [r.reservation_id as string, r.payment_scheme as string])
  );
  const projectMap = new Map<string, string>(
    (reservations ?? []).map((r: any) => [r.reservation_id as string, (r.project as string) ?? ''])
  );

  const grouped = new Map<string, any[]>();
  for (const line of lines as any[]) {
    if (!grouped.has(line.reservation_id)) grouped.set(line.reservation_id, []);
    grouped.get(line.reservation_id)!.push(line);
  }

  const summaries: ReservationReceivableSummary[] = [];
  for (const [reservation_id, rLines] of grouped) {
    const first = rLines[0];
    const unpaid     = rLines.filter((l) => l.payment_status !== 'Paid');
    const paid_lines = rLines.length - unpaid.length;
    // Outstanding is the remaining balance on overdue lines (due date earlier than today)
    const outstanding = unpaid
      .filter((l) => l.due_date < today)
      .reduce(
        (sum, l) => sum + Math.max(0, Number(l.total_amount_due) - Number(l.amount_paid ?? 0)),
        0,
      );
    const unpaidSorted = [...unpaid].sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const nextDue      = unpaidSorted[0] ?? null;
    // For partial lines, next_due_amount shows the remaining balance, not the full amount
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

    summaries.push({
      reservation_id,
      client_name: first.client_name,
      inventory_code: first.inventory_code,
      payment_scheme: schemeMap.get(reservation_id) ?? '',
      project: projectMap.get(reservation_id) ?? '',
      total_lines: rLines.length,
      paid_lines,
      outstanding,
      next_due_date:   nextDue?.due_date ?? null,
      next_due_amount: nextDueAmount,
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

