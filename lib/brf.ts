import { supabase } from '@/lib/supabase';
import { resolveDueDate, fetchTurnoverDate } from '@/lib/admin';
import { regenerateCommissionSchedule } from '@/lib/commission';
import { reapplyCollections } from '@/lib/collections';
import { updateInventoryUnitStatus } from '@/lib/inventory';

// ── Constants ─────────────────────────────────────────────────────────────────

export const BRF_TYPES = ['Payment Schedule Restructuring', 'Change of Unit'] as const;
export type BrfType = typeof BRF_TYPES[number];
export function isBrfType(t: string): t is BrfType {
  return BRF_TYPES.includes(t as BrfType);
}

// ── Supersede ─────────────────────────────────────────────────────────────────

// Supersede ALL active lines — full clean slate so reapplyCollections can replay
// every collection onto the freshly generated schedule with no duplicates.
// requestId is stamped on each superseded line so the display can show only the
// immediately prior schedule instead of all historical BRF rounds.
export async function supersedeReceivableLines(reservationId: string, requestId: string): Promise<void> {
  const { count: before } = await supabase
    .from('receivables_database')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_id', reservationId)
    .neq('payment_status', 'Superseded');

  const { error } = await supabase
    .from('receivables_database')
    .update({ payment_status: 'Superseded', superseded_by_request_id: requestId })
    .eq('reservation_id', reservationId)
    .neq('payment_status', 'Superseded');
  if (error) throw error;

  if (before && before > 0) {
    const { count: after } = await supabase
      .from('receivables_database')
      .select('id', { count: 'exact', head: true })
      .eq('reservation_id', reservationId)
      .neq('payment_status', 'Superseded');
    if (after && after > 0) {
      throw new Error(
        `RLS blocked superseding: ${after} of ${before} active lines were not updated for ${reservationId}. ` +
        'Apply the fix_receivables_database_rls.sql migration in Supabase.'
      );
    }
  }
}

export async function supersedeCommissionLines(reservationId: string): Promise<void> {
  const { error } = await supabase
    .from('commission_schedule')
    .update({ status: 'Superseded' })
    .eq('reservation_id', reservationId)
    .not('status', 'in', '("Released","Paid")');
  if (error) throw error;
}

// ── Compute remaining balance ─────────────────────────────────────────────────

export async function computeRemainingBalance(reservationId: string): Promise<number> {
  const { data: res } = await supabase
    .from('reservations')
    .select('total_contract_price')
    .eq('reservation_id', reservationId)
    .single();
  const tcp = Number((res as any)?.total_contract_price) || 0;

  const { data: lines } = await supabase
    .from('receivables_database')
    .select('amount_paid, total_amount_due, payment_status')
    .eq('reservation_id', reservationId);

  const totalPaid = ((lines ?? []) as any[]).reduce((sum, l) => {
    // Paid lines with null amount_paid → use total_amount_due (same logic as commission.ts)
    if (l.payment_status === 'Paid' && (l.amount_paid == null || Number(l.amount_paid) === 0)) {
      return sum + Number(l.total_amount_due || 0);
    }
    return sum + Number(l.amount_paid || 0);
  }, 0);

  return Math.max(0, tcp - totalPaid);
}

// ── Regenerate receivable lines ───────────────────────────────────────────────

// Full clean-slate regeneration: creates every line from scratch using the new TCP.
// Called after supersedeReceivableLines has marked ALL prior lines Superseded.
// reapplyCollections then replays all posted collections onto these fresh lines.
export async function regenerateReceivableLines(
  reservationId: string,
  newPaytermScheme: string,
  newTermMonths: number,
  newTcp: number,
  dpPercent: number = 0,
): Promise<void> {
  const { data: res, error } = await supabase
    .from('reservations')
    .select(
      'client_id, client_name, inventory_code, project, tower, ' +
      'net_list_price, vat, other_charges, total_contract_price, hic_discount, ' +
      'reservation_fee, retention_fee'
    )
    .eq('reservation_id', reservationId)
    .single();
  if (error || !res) throw error ?? new Error('Reservation not found');

  const r = res as any;

  // Anchor due-dates to the original RF payment date (found via Superseded RF line)
  const { data: rfLine } = await supabase
    .from('receivables_database')
    .select('due_date')
    .eq('reservation_id', reservationId)
    .eq('type_of_payment', 'Reservation Fee')
    .maybeSingle();
  const paymentDate: string = (rfLine as any)?.due_date ?? new Date().toISOString().split('T')[0];

  // Due-date helpers (identical to generateReceivableLines)
  const [resYear, resMonth1, resDay] = paymentDate.split('-').map(Number);
  const turnoverDate = await fetchTurnoverDate(r.project, r.tower);
  const { dueDay } = await resolveDueDate(resDay);

  let turnoverDueDay = dueDay;
  let turnoverSameMonth = false;
  if (turnoverDate) {
    const td = await resolveDueDate(Number(turnoverDate.split('-')[2]));
    turnoverDueDay = td.dueDay;
    turnoverSameMonth = td.sameMonth;
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
  function applyDueDayToTurnover(dateStr: string) {
    let [y, m] = dateStr.split('-').map(Number);
    if (!turnoverSameMonth) { m++; if (m > 12) { m = 1; y++; } }
    return toDateStr(y, m, Math.min(turnoverDueDay, lastDayOf(y, m)));
  }

  // Proportional breakdown — uses newTcp composition from updated reservation
  const tcp = Number(r.total_contract_price) || 0;
  const tcpRatio = tcp > 0 ? 1 / tcp : 0;
  const hicNum = Number(r.hic_discount) || 0;
  function breakdown(amount: number) {
    return {
      principal:     Math.round(amount * Number(r.net_list_price) * tcpRatio),
      hic:           hicNum > 0 ? Math.round(amount * hicNum * tcpRatio) : null,
      vat:           Math.round(amount * Number(r.vat) * tcpRatio),
      other_charges: Math.round(amount * Number(r.other_charges) * tcpRatio),
    };
  }

  const resFeeNum = Number(r.reservation_fee) || 0;
  const retFeeNum = Number(r.retention_fee)   || 0;

  const base = {
    reservation_id:             reservationId,
    client_id:                  r.client_id ?? null,
    client_name:                r.client_name,
    inventory_code:             r.inventory_code,
    payment_scheme:             newPaytermScheme,
    payment_status:             'Unpaid',
    mode_of_payment:            null,
    acknowledgement_receipt_no: null,
    posting_date:               null,
  };

  const lines: Record<string, unknown>[] = [];

  // RF line — always first, anchored to original RF date
  lines.push({
    ...base,
    type_of_payment:  'Reservation Fee',
    due_date:         paymentDate,
    total_amount_due: resFeeNum,
    principal:        resFeeNum,
    hic:              null,
    vat:              0,
    other_charges:    0,
  });

  if (newPaytermScheme === 'deferred_cash') {
    const installable = newTcp - resFeeNum - retFeeNum;
    const monthly = newTermMonths > 0 ? Math.round(installable / newTermMonths) : 0;
    for (let i = 0; i < newTermMonths; i++) {
      lines.push({
        ...base,
        type_of_payment:  `Monthly Deferred ${i + 1}/${newTermMonths}`,
        due_date:         nthDueDate(i),
        total_amount_due: monthly,
        ...breakdown(monthly),
      });
    }
    const retDue = newTermMonths > 12
      ? nthDueDate(newTermMonths)
      : turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(newTermMonths);
    lines.push({
      ...base,
      type_of_payment:  'Retention Fee',
      due_date:         retDue,
      total_amount_due: retFeeNum,
      principal:        retFeeNum,
      hic:              null,
      vat:              0,
      other_charges:    0,
    });

  } else if (newPaytermScheme === 'spot_cash') {
    const installable = newTcp - resFeeNum - retFeeNum;
    lines.push({
      ...base,
      type_of_payment:  'Cash Out Balance',
      due_date:         nthDueDate(0),
      total_amount_due: installable,
      ...breakdown(installable),
    });
    lines.push({
      ...base,
      type_of_payment:  'Retention Fee',
      due_date:         turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
      total_amount_due: retFeeNum,
      principal:        retFeeNum,
      hic:              null,
      vat:              0,
      other_charges:    0,
    });

  } else if (newPaytermScheme === 'spot_dp') {
    const grossDp    = Math.round(newTcp * dpPercent / 100);
    const loanAmount = newTcp - grossDp;
    const netDp      = grossDp - resFeeNum;
    lines.push({
      ...base,
      type_of_payment:  'Downpayment',
      due_date:         nthDueDate(0),
      total_amount_due: netDp,
      ...breakdown(netDp),
    });
    lines.push({
      ...base,
      type_of_payment:  'Loan Take-out',
      due_date:         turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
      total_amount_due: loanAmount,
      ...breakdown(loanAmount),
    });

  } else if (newPaytermScheme === 'stretched_dp') {
    const grossDp    = Math.round(newTcp * dpPercent / 100);
    const loanAmount = newTcp - grossDp;
    const netDp      = grossDp - resFeeNum;
    const monthly    = newTermMonths > 0 ? Math.round(netDp / newTermMonths) : 0;
    for (let i = 0; i < newTermMonths; i++) {
      lines.push({
        ...base,
        type_of_payment:  `Monthly DP ${i + 1}/${newTermMonths}`,
        due_date:         nthDueDate(i),
        total_amount_due: monthly,
        ...breakdown(monthly),
      });
    }
    lines.push({
      ...base,
      type_of_payment:  'Loan Take-out',
      due_date:         turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(newTermMonths),
      total_amount_due: loanAmount,
      ...breakdown(loanAmount),
    });
  }

  if (lines.length === 0) throw new Error(`No lines generated for scheme: ${newPaytermScheme}`);

  const { error: insertError } = await supabase.from('receivables_database').insert(lines);
  if (insertError) throw insertError;
}

// ── BRF orchestrator ──────────────────────────────────────────────────────────

export interface BRFApprovalOptions {
  requestId:               string;
  reservationId:           string;
  typeOfRequest:           string;
  approvedBy:              string;
  newPaytermCode:          string;
  newPaytermScheme:        string;     // snake_case: deferred_cash, spot_cash, spot_dp, stretched_dp
  newSchemeName:           string;     // display label from Payterm table e.g. 'Deferred Cash'
  newTermMonths:           number;
  remainingBalance:        number;
  newPaytermDiscountPct:   number;
  newPaytermDiscountAmount: number;
  newDpPercent:            number;
  newListPrice:            number;
  newPromoAmount:          number;
  newEmployeeAmount:       number;
  newNlp:                  number;
  newVat:                  number;
  newOtherCharges:         number;
  newHicAmount:            number;
  newTcp:                  number;
  newUnitArea?:            number;
  newInventoryCode?:       string;
  onStep?:                 (step: number) => void;
}

export async function processBRF(opts: BRFApprovalOptions): Promise<void> {
  const {
    requestId, reservationId, typeOfRequest, approvedBy,
    newPaytermCode, newPaytermScheme, newSchemeName, newTermMonths, remainingBalance,
    newPaytermDiscountPct, newPaytermDiscountAmount, newDpPercent,
    newListPrice, newPromoAmount, newEmployeeAmount,
    newNlp, newVat, newOtherCharges, newHicAmount, newTcp,
    newUnitArea, newInventoryCode, onStep,
  } = opts;

  // Idempotency guard
  const { data: req } = await supabase
    .from('requests_and_inquiries')
    .select('approval_status')
    .eq('id', requestId)
    .single();
  if ((req as any)?.approval_status === 'Resolved') return;

  // ── Change of Unit: swap inventory ────────────────────────────────────────
  if (typeOfRequest === 'Change of Unit' && newInventoryCode) {
    const { data: resData } = await supabase
      .from('reservations')
      .select('inventory_code')
      .eq('reservation_id', reservationId)
      .single();
    const oldCode = (resData as any)?.inventory_code as string | null;

    if (oldCode) {
      await updateInventoryUnitStatus(oldCode, 'Available');
    }
    await supabase
      .from('reservations')
      .update({ inventory_code: newInventoryCode })
      .eq('reservation_id', reservationId);
    await updateInventoryUnitStatus(newInventoryCode, 'Reserved');
  }

  // ── Snapshot full reservation row before overwrite ───────────────────────
  const { data: resRow } = await supabase
    .from('reservations')
    .select('*')
    .eq('reservation_id', reservationId)
    .single();
  const resFee = Number((resRow as any)?.reservation_fee) || 0;
  const retFee = Number((resRow as any)?.retention_fee) || 0;

  const updatePayload = {
    payment_scheme:          newPaytermScheme,
    scheme_name:             newSchemeName,
    term_months:             newTermMonths,
    payterm_discount_pct:    newPaytermDiscountPct,
    payterm_discount_amount: newPaytermDiscountAmount,
    list_price:              newListPrice,
    promo_discount_amount:   newPromoAmount,
    employee_discount_amount: newEmployeeAmount,
    net_list_price:          newNlp,
    vat:                     newVat,
    other_charges:           newOtherCharges,
    hic_discount:            newHicAmount,
    total_contract_price:    newTcp,
    net_amount:              newTcp - resFee - retFee,
    dp_rate:                 newDpPercent > 0 ? `${newDpPercent}%` : null,
    ...(typeOfRequest === 'Change of Unit' && newUnitArea != null ? { unit_area: newUnitArea } : {}),
  };

  await supabase.from('audit_log_reservation').insert({
    reservation_id: reservationId,
    request_id:     requestId,
    event_type:     typeOfRequest === 'Change of Unit' ? 'change_of_unit' : 'payment_restructuring',
    changed_by:     approvedBy,
    before_state:   resRow ?? {},
    after_state:    { ...(resRow ?? {}), ...updatePayload },
  });
  onStep?.(1);

  // ── Update reservation with new TCP / payterm values ─────────────────────
  // Must happen BEFORE regenerateReceivableLines so breakdown ratios use new TCP.
  await supabase
    .from('reservations')
    .update(updatePayload)
    .eq('reservation_id', reservationId);
  onStep?.(2);

  const today = new Date().toISOString().split('T')[0];

  // ── Supersede receivables + commissions ───────────────────────────────────
  // All active lines (including previously Paid ones) are superseded so
  // reapplyCollections can replay every collection onto the fresh schedule.
  await supersedeReceivableLines(reservationId, requestId);
  await supersedeCommissionLines(reservationId);

  // Verify superseding actually worked — if any non-Superseded lines still exist,
  // an RLS UPDATE policy silently blocked the update. Fail now before inserting
  // new lines on top of the old ones (which would mix two schedules).
  const { count: stillActive } = await supabase
    .from('receivables_database')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_id', reservationId)
    .neq('payment_status', 'Superseded');
  if (stillActive && stillActive > 0) {
    throw new Error(
      `Superseding failed: ${stillActive} active line(s) remain for ${reservationId}. ` +
      'Check the receivables_database RLS UPDATE policy.'
    );
  }
  onStep?.(3);

  // ── Regenerate payment schedule (uses updated TCP from reservation) ───────
  await regenerateReceivableLines(reservationId, newPaytermScheme, newTermMonths, newTcp, newDpPercent);
  onStep?.(4);

  // ── Re-apply all existing collections against the new active lines ────────
  // Fixes partial payments that were stranded on superseded lines.
  // Old collection_applications (pointing to superseded lines) are preserved as audit trail.
  await reapplyCollections(reservationId);
  onStep?.(5);

  // ── Regenerate commission schedule ────────────────────────────────────────
  await regenerateCommissionSchedule(reservationId);
  onStep?.(6);

  // ── Mark request as processed ─────────────────────────────────────────────
  const { data: updatedRows, error: updateErr } = await supabase
    .from('requests_and_inquiries')
    .update({
      approval_status:    'Resolved',
      approved_by:        approvedBy,
      date_approved:      today,
      status:             'closed',
      new_payterm_code:   newPaytermCode,
      new_payterm_scheme: newPaytermScheme,
      new_term_months:    newTermMonths,
      remaining_balance:  remainingBalance,
    })
    .eq('id', requestId)
    .select('id');
  if (updateErr) throw new Error(`Request update failed: ${updateErr.message}`);
  if (!updatedRows || updatedRows.length === 0) {
    throw new Error('Request status update was blocked (check RLS policies on requests_and_inquiries).');
  }
  onStep?.(7);
}
