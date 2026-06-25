import { supabase } from '@/lib/supabase';
import { resolveDueDate, fetchTurnoverDate } from '@/lib/admin';
import { regenerateCommissionSchedule } from '@/lib/commission';
import { reapplyCollections } from '@/lib/collections';

// ── Constants ─────────────────────────────────────────────────────────────────

export const BRF_TYPES = ['Payment Schedule Restructuring', 'Change of Unit'] as const;
export type BrfType = typeof BRF_TYPES[number];
export function isBrfType(t: string): t is BrfType {
  return BRF_TYPES.includes(t as BrfType);
}

// ── Supersede ─────────────────────────────────────────────────────────────────

export async function supersedeReceivableLines(reservationId: string): Promise<void> {
  const { error } = await supabase
    .from('receivables_database')
    .update({ payment_status: 'Superseded' })
    .eq('reservation_id', reservationId)
    .in('payment_status', ['Unpaid', 'Partial']);
  if (error) throw error;
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

// Installment line types that count as "elapsed months" — excludes one-off fees
const INSTALLMENT_EXCLUDES = [
  'Reservation Fee', 'Retention Fee', 'Downpayment',
  'Cash Out Balance', 'Loan Take-out',
];

export async function regenerateReceivableLines(
  reservationId: string,
  newPaytermScheme: string,
  newTermMonths: number,
  remainingBalance: number,
  elapsedMonths: number = 0,
  dpPercent: number = 0,
): Promise<void> {
  const { data: res, error } = await supabase
    .from('reservations')
    .select(
      'client_id, client_name, inventory_code, project, tower, ' +
      'net_list_price, vat, other_charges, total_contract_price, hic_discount, retention_fee'
    )
    .eq('reservation_id', reservationId)
    .single();
  if (error || !res) throw error ?? new Error('Reservation not found');

  const r = res as any;

  // Anchor due-dates to the original RF payment date
  const { data: rfLine } = await supabase
    .from('receivables_database')
    .select('due_date')
    .eq('reservation_id', reservationId)
    .eq('type_of_payment', 'Reservation Fee')
    .maybeSingle();
  const paymentDate: string = (rfLine as any)?.due_date ?? new Date().toISOString().split('T')[0];

  // Is retention fee already paid? If so, exclude it from the new schedule.
  const { data: retLine } = await supabase
    .from('receivables_database')
    .select('payment_status')
    .eq('reservation_id', reservationId)
    .eq('type_of_payment', 'Retention Fee')
    .maybeSingle();
  const retentionAlreadyPaid = (retLine as any)?.payment_status === 'Paid';

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

  // Proportional breakdown — same TCP composition as original
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

  const retFee = retentionAlreadyPaid ? 0 : Number(r.retention_fee) || 0;
  const installable = remainingBalance - retFee;
  const lines: Record<string, unknown>[] = [];

  if (newPaytermScheme === 'deferred_cash') {
    const effectiveTerm = newTermMonths - elapsedMonths;
    const monthly = effectiveTerm > 0 ? Math.round(installable / effectiveTerm) : 0;
    for (let i = 0; i < effectiveTerm; i++) {
      lines.push({
        ...base,
        type_of_payment:  `Monthly Deferred ${i + 1}/${effectiveTerm}`,
        due_date:         nthDueDate(elapsedMonths + i),
        total_amount_due: monthly,
        ...breakdown(monthly),
      });
    }
    if (!retentionAlreadyPaid) {
      const retDue = newTermMonths > 12
        ? nthDueDate(newTermMonths)
        : turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(newTermMonths);
      lines.push({
        ...base,
        type_of_payment:  'Retention Fee',
        due_date:         retDue,
        total_amount_due: Number(r.retention_fee) || 0,
        principal:        Number(r.retention_fee) || 0,
        hic:              null,
        vat:              0,
        other_charges:    0,
      });
    }

  } else if (newPaytermScheme === 'spot_cash') {
    lines.push({
      ...base,
      type_of_payment:  'Cash Out Balance',
      due_date:         nthDueDate(0),
      total_amount_due: installable,
      ...breakdown(installable),
    });
    if (!retentionAlreadyPaid) {
      lines.push({
        ...base,
        type_of_payment:  'Retention Fee',
        due_date:         turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
        total_amount_due: Number(r.retention_fee) || 0,
        principal:        Number(r.retention_fee) || 0,
        hic:              null,
        vat:              0,
        other_charges:    0,
      });
    }

  } else if (newPaytermScheme === 'spot_dp') {
    lines.push({
      ...base,
      type_of_payment:  'Downpayment',
      due_date:         nthDueDate(0),
      total_amount_due: installable,
      ...breakdown(installable),
    });
    lines.push({
      ...base,
      type_of_payment:  'Loan Take-out',
      due_date:         turnoverDate ? applyDueDayToTurnover(turnoverDate) : nthDueDate(0),
      total_amount_due: 0,
      principal:        0,
      hic:              null,
      vat:              0,
      other_charges:    0,
    });

  } else if (newPaytermScheme === 'stretched_dp') {
    const effectiveTerm = newTermMonths - elapsedMonths;
    const loanAmount   = Math.round(tcp * (1 - dpPercent / 100));
    const remainingDp  = Math.max(0, remainingBalance - loanAmount);
    if (remainingDp > 0 && effectiveTerm > 0) {
      const monthly = Math.round(remainingDp / effectiveTerm);
      for (let i = 0; i < effectiveTerm; i++) {
        lines.push({
          ...base,
          type_of_payment:  `Monthly DP ${i + 1}/${effectiveTerm}`,
          due_date:         nthDueDate(elapsedMonths + i),
          total_amount_due: monthly,
          ...breakdown(monthly),
        });
      }
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
  newNlp:                  number;
  newVat:                  number;
  newOtherCharges:         number;
  newTcp:                  number;
  newInventoryCode?:       string;
}

export async function processBRF(opts: BRFApprovalOptions): Promise<void> {
  const {
    requestId, reservationId, typeOfRequest, approvedBy,
    newPaytermCode, newPaytermScheme, newSchemeName, newTermMonths, remainingBalance,
    newPaytermDiscountPct, newPaytermDiscountAmount, newDpPercent,
    newNlp, newVat, newOtherCharges, newTcp,
    newInventoryCode,
  } = opts;

  // Idempotency guard
  const { data: req } = await supabase
    .from('requests_and_inquiries')
    .select('approval_status')
    .eq('id', requestId)
    .single();
  if ((req as any)?.approval_status === 'Approved') return;

  // ── Change of Unit: swap inventory ────────────────────────────────────────
  if (typeOfRequest === 'Change of Unit' && newInventoryCode) {
    const { data: resData } = await supabase
      .from('reservations')
      .select('inventory_code')
      .eq('reservation_id', reservationId)
      .single();
    const oldCode = (resData as any)?.inventory_code as string | null;

    if (oldCode) {
      await supabase.from('inventory').update({ status: 'Available' }).eq('inventory_code', oldCode);
    }
    await supabase
      .from('reservations')
      .update({ inventory_code: newInventoryCode })
      .eq('reservation_id', reservationId);
    await supabase.from('inventory').update({ status: 'Reserved' }).eq('inventory_code', newInventoryCode);
  }

  // ── Update reservation with new TCP / payterm values ─────────────────────
  // Must happen BEFORE regenerateReceivableLines so breakdown ratios use new TCP.
  const { data: resRow } = await supabase
    .from('reservations')
    .select('reservation_fee, retention_fee')
    .eq('reservation_id', reservationId)
    .single();
  const resFee = Number((resRow as any)?.reservation_fee) || 0;
  const retFee = Number((resRow as any)?.retention_fee) || 0;

  await supabase
    .from('reservations')
    .update({
      payment_scheme:          newPaytermScheme,
      scheme_name:             newSchemeName,
      term_months:             newTermMonths,
      payterm_discount_pct:    newPaytermDiscountPct,
      payterm_discount_amount: newPaytermDiscountAmount,
      net_list_price:          newNlp,
      vat:                     newVat,
      other_charges:           newOtherCharges,
      total_contract_price:    newTcp,
      net_amount:              newTcp - resFee - retFee,
    })
    .eq('reservation_id', reservationId);

  // ── Compute elapsed installment months ───────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const { data: activeLines } = await supabase
    .from('receivables_database')
    .select('type_of_payment, due_date')
    .eq('reservation_id', reservationId)
    .neq('payment_status', 'Superseded')
    .lt('due_date', today);

  const elapsedMonths = ((activeLines ?? []) as any[])
    .filter(l => !INSTALLMENT_EXCLUDES.includes(l.type_of_payment))
    .length;

  if (
    (newPaytermScheme === 'deferred_cash' || newPaytermScheme === 'stretched_dp') &&
    elapsedMonths >= newTermMonths
  ) {
    throw new Error(
      `Cannot restructure: ${elapsedMonths} month${elapsedMonths !== 1 ? 's' : ''} already elapsed. ` +
      `New term (${newTermMonths}) must be greater than ${elapsedMonths}.`
    );
  }

  // ── Supersede receivables + commissions ───────────────────────────────────
  await supersedeReceivableLines(reservationId);
  await supersedeCommissionLines(reservationId);

  // ── Regenerate payment schedule (uses updated TCP from reservation) ───────
  await regenerateReceivableLines(reservationId, newPaytermScheme, newTermMonths, remainingBalance, elapsedMonths, newDpPercent);

  // ── Re-apply all existing collections against the new active lines ────────
  // Fixes partial payments that were stranded on superseded lines.
  // Old collection_applications (pointing to superseded lines) are preserved as audit trail.
  await reapplyCollections(reservationId);

  // ── Regenerate commission schedule ────────────────────────────────────────
  await regenerateCommissionSchedule(reservationId);

  // ── Mark request as processed ─────────────────────────────────────────────
  const { data: updatedRows, error: updateErr } = await supabase
    .from('requests_and_inquiries')
    .update({
      approval_status:    'Approved',
      resolution_status:  'Resolved',
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
}
