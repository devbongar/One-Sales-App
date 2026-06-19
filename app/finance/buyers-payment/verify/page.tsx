'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { approvePaymentReview, updateReservationStatus } from '@/lib/reservations';
import { updateInventoryUnitStatus } from '@/lib/inventory';
import { generateCommissionSchedule, CommissionGenerateResult } from '@/lib/commission';
import { addActivityLog } from '@/lib/activity-log';
import { getSession } from '@/lib/auth';
import { triggerEmails } from '@/lib/email';
import {
  FileText, FolderOpen, CheckCircle2, XCircle,
  Hash, User, Building2, Tag,
  Receipt, FileDigit, CalendarDays, AlertTriangle, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceBooking {
  reservation_id:        string;
  client_name:           string;
  project:               string;
  inventory_code:        string | null;
  unit_type:             string;
  unit_area:             number | null;
  tower:                 string | null;
  floor:                 string | null;
  unit_no:               string | null;
  seller_name:           string | null;
  status:                string | null;
  booking_review_status: string | null;
  net_list_price:        number | null;
  vat:                   number | null;
  other_charges:         number | null;
  total_contract_price:  number | null;
  scheme_name:           string | null;
  payment_term:          string | null;
  payment_proof_url:          string | null;
  proof_of_valid_id_urls:     string | null;
  director_reviewed_at:         string | null;
  finance_verified_at:          string | null;
  acknowledgement_receipt_no:   string | null;
  sales_invoice_no:             string | null;
  date_of_reservation_fee:      string | null;
  proof_of_1st_dp_urls:         string | null;
  dp_acknowledgement_receipt_no: string | null;
  dp_sales_invoice_no:          string | null;
  date_of_1st_dp:               string | null;
  dp_verified_at:               string | null;
  rf_payment_mode:              string | null;
  subsequent_mode:              string | null;
  ada_bank:                     string | null;
  first_payment_agreed:         boolean | null;
  proof_of_fdp_urls:            string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(s: string | null): string[] {
  try { return JSON.parse(s ?? '[]') as string[]; } catch { return []; }
}
function fileName(url: string) {
  return decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file');
}
function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function todayIso() {
  return new Date().toISOString().split('T')[0];
}

// ─── File tile ────────────────────────────────────────────────────────────────

function FileTile({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square active:opacity-70">
      {isImage(url) ? (
        <img src={url} alt={fileName(url)} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
          <FileText size={26} className="text-[#C03D25]" />
          <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">
            {fileName(url)}
          </span>
        </div>
      )}
    </a>
  );
}

// ─── Input field sub-component ────────────────────────────────────────────────

function VerifyInput({
  icon, label, value, onChange, readOnly, placeholder, type = 'text',
}: {
  icon: React.ReactNode; label: string; value: string;
  onChange: (v: string) => void; readOnly: boolean;
  placeholder?: string; type?: string;
}) {
  return (
    <>
      <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
        <span className="text-[#C03D25] shrink-0">{icon}</span>
        <span className="flex-1 text-sm font-medium text-[#1C1C1E]">
          {label}
          {!readOnly && <span className="text-[#C03D25] text-xs leading-none ml-0.5">*</span>}
        </span>
        {type === 'date' && (
          <input
            type="date"
            value={value}
            onChange={e => !readOnly && onChange(e.target.value)}
            readOnly={readOnly}
            className={`text-sm text-[#1C1C1E] bg-transparent outline-none text-right ${readOnly ? 'pointer-events-none' : ''}`}
          />
        )}
      </div>
      {type !== 'date' && (
        <div className="px-1 pb-3 pt-1">
          <input
            type={type}
            value={value}
            onChange={e => !readOnly && onChange(e.target.value)}
            readOnly={readOnly}
            placeholder={placeholder}
            className={`w-full px-3 py-2.5 rounded-xl border text-sm text-[#1C1C1E] placeholder-[#C7C7CC] outline-none ${
              readOnly
                ? 'border-black/[0.06] bg-white text-[#3A3A3C] cursor-default'
                : 'border-black/[0.1] bg-[#F2F2F7] focus:border-[#C03D25]/50'
            }`}
          />
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceVerifyPage() {
  const router = useRouter();
  const [booking, setBooking] = useState<FinanceBooking | null>(null);

  // RF fields
  const [ackReceiptNo,   setAckReceiptNo]   = useState('');
  const [salesInvoiceNo, setSalesInvoiceNo] = useState('');
  const [dateOfResFee,   setDateOfResFee]   = useState(todayIso());

  // DP fields
  const [dpAckReceiptNo,   setDpAckReceiptNo]   = useState('');
  const [dpSalesInvoiceNo, setDpSalesInvoiceNo] = useState('');
  const [dpDate,           setDpDate]           = useState(todayIso());

  const [displayName, setDisplayName] = useState<string | null>(null);

  // Modal states
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectConfirm,  setShowRejectConfirm]  = useState(false);
  const [approving,          setApproving]          = useState(false);
  const [rejecting,          setRejecting]          = useState(false);
  const [actionError,        setActionError]        = useState('');
  const [rejectComment,      setRejectComment]      = useState('');
  const [done,               setDone]               = useState<'approved' | 'rejected' | null>(null);
  const [commissionWarn,     setCommissionWarn]     = useState<CommissionGenerateResult | null>(null);

  useEffect(() => {
    getSession().then(s => setDisplayName(s?.display_name || s?.full_name || null));
    const raw = sessionStorage.getItem('financeBooking');
    if (!raw) { router.replace('/finance/buyers-payment'); return; }
    const b = JSON.parse(raw) as FinanceBooking;
    setBooking(b);
    // RF fields
    if (b.acknowledgement_receipt_no) setAckReceiptNo(b.acknowledgement_receipt_no);
    if (b.sales_invoice_no)           setSalesInvoiceNo(b.sales_invoice_no);
    if (b.date_of_reservation_fee)    setDateOfResFee(b.date_of_reservation_fee);
    // DP fields
    if (b.dp_acknowledgement_receipt_no) setDpAckReceiptNo(b.dp_acknowledgement_receipt_no);
    if (b.dp_sales_invoice_no)           setDpSalesInvoiceNo(b.dp_sales_invoice_no);
    if (b.date_of_1st_dp)               setDpDate(b.date_of_1st_dp);
  }, []);


  async function handleApprove() {
    if (!booking) return;
    setApproving(true);
    setActionError('');
    try {
      await approvePaymentReview(booking.reservation_id, ackReceiptNo.trim(), salesInvoiceNo.trim(), dateOfResFee);
      const updated = {
        ...booking,
        finance_status:             'rf-verified',
        finance_verified_at:        new Date().toISOString(),
        acknowledgement_receipt_no: ackReceiptNo.trim(),
        sales_invoice_no:           salesInvoiceNo.trim(),
        date_of_reservation_fee:    dateOfResFee,
      };
      triggerEmails('on_finance_verified', booking.reservation_id).catch(e => console.error('[email-trigger]', e));
      // Generate commission schedule on RF verification
      generateCommissionSchedule(booking.reservation_id).then(result => {
        if (!result.ok && result.reason !== 'already-exists') setCommissionWarn(result);
      }).catch(e => console.error('[commission] Failed to generate schedule:', e));
      sessionStorage.setItem('financeBooking', JSON.stringify(updated));
      setBooking(updated);
      setDone('approved');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to approve. Please try again.');
    } finally {
      setApproving(false);
      setShowApproveConfirm(false);
    }
  }

  async function handleApproveDp() {
    if (!booking) return;
    setApproving(true);
    setActionError('');
    try {
      const now = new Date().toISOString();

      // 1. Update reservations — set dp-verified; mark Booked only if AMD also approved
      const { data: resRow } = await supabase
        .from('reservations')
        .select('booking_review_status')
        .eq('reservation_id', booking.reservation_id)
        .single();
      const amdDone = resRow?.booking_review_status === 'amd-approved';
      const { error } = await supabase
        .from('reservations')
        .update({
          dp_acknowledgement_receipt_no: dpAckReceiptNo.trim(),
          dp_sales_invoice_no:           dpSalesInvoiceNo.trim(),
          date_of_1st_dp:               dpDate,
          dp_verified_at:               now,
          finance_status:               'dp-verified',
          ...(amdDone ? { status: 'Booked' } : {}),
        })
        .eq('reservation_id', booking.reservation_id);
      if (error) throw new Error(error.message);

      await addActivityLog(booking.reservation_id, 'dp-verified', displayName).catch(e => console.error('[activity-log]', e));
      if (amdDone) triggerEmails('on_booked', booking.reservation_id).catch(e => console.error('[email-trigger]', e));

      // 2. Update inventory unit status to Booked
      if (booking.inventory_code) {
        await updateInventoryUnitStatus(booking.inventory_code, 'Booked');
      }

      // 3. Post the 1st receivable line (excluding Reservation Fee) as Paid
      const { data: lines } = await supabase
        .from('receivables_database')
        .select('id, type_of_payment, total_amount_due')
        .eq('reservation_id', booking.reservation_id)
        .neq('type_of_payment', 'Reservation Fee')
        .order('due_date', { ascending: true })
        .limit(1);
      if (lines && lines.length > 0) {
        await supabase
          .from('receivables_database')
          .update({
            payment_status:             'Paid',
            amount_paid:                (lines[0] as any).total_amount_due ?? null,
            acknowledgement_receipt_no: dpAckReceiptNo.trim(),
            sales_invoice_number:       dpSalesInvoiceNo.trim(),
            posting_date:              dpDate,
          })
          .eq('id', lines[0].id);
      }

      const updated = {
        ...booking,
        status:                        amdDone ? 'Booked' : booking.status,
        finance_status:                'dp-verified',
        dp_acknowledgement_receipt_no: dpAckReceiptNo.trim(),
        dp_sales_invoice_no:           dpSalesInvoiceNo.trim(),
        date_of_1st_dp:               dpDate,
        dp_verified_at:               now,
      };
      sessionStorage.setItem('financeBooking', JSON.stringify(updated));
      setBooking(updated);
      setDone('approved');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to verify. Please try again.');
    } finally {
      setApproving(false);
      setShowApproveConfirm(false);
    }
  }

  async function handleReject() {
    if (!booking) return;
    setRejecting(true);
    setActionError('');
    try {
      await supabase.from('reservations')
        .update({ finance_status: 'rf-rejected', finance_rejection_reason: rejectComment.trim() || null })
        .eq('reservation_id', booking.reservation_id);
      setDone('rejected');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to reject. Please try again.');
    } finally {
      setRejecting(false);
      setShowRejectConfirm(false);
    }
  }

  async function handleApproveCombined() {
    if (!booking) return;
    setApproving(true);
    setActionError('');
    try {
      const now = new Date().toISOString();

      // RF verification
      await approvePaymentReview(booking.reservation_id, ackReceiptNo.trim(), salesInvoiceNo.trim(), dateOfResFee);
      // Generate commission schedule on RF verification
      generateCommissionSchedule(booking.reservation_id).then(result => {
        if (!result.ok && result.reason !== 'already-exists') setCommissionWarn(result);
      }).catch(e => console.error('[commission] Failed to generate schedule:', e));

      // DP verification — check AMD status then write dp fields + jump straight to dp-verified
      const { data: resRow } = await supabase
        .from('reservations')
        .select('booking_review_status')
        .eq('reservation_id', booking.reservation_id)
        .single();
      const amdDone = resRow?.booking_review_status === 'amd-approved';
      const { error } = await supabase
        .from('reservations')
        .update({
          dp_acknowledgement_receipt_no: dpAckReceiptNo.trim(),
          dp_sales_invoice_no:           dpSalesInvoiceNo.trim(),
          date_of_1st_dp:               dpDate,
          dp_verified_at:               now,
          finance_status:               'dp-verified',
          ...(amdDone ? { status: 'Booked' } : {}),
        })
        .eq('reservation_id', booking.reservation_id);
      if (error) throw new Error(error.message);

      await addActivityLog(booking.reservation_id, 'dp-verified', displayName).catch(e => console.error('[activity-log]', e));
      if (amdDone) triggerEmails('on_booked', booking.reservation_id).catch(e => console.error('[email-trigger]', e));

      if (booking.inventory_code) {
        await updateInventoryUnitStatus(booking.inventory_code, 'Booked');
      }

      // Mark 1st installment line as Paid
      const { data: lines } = await supabase
        .from('receivables_database')
        .select('id, total_amount_due')
        .eq('reservation_id', booking.reservation_id)
        .neq('type_of_payment', 'Reservation Fee')
        .order('due_date', { ascending: true })
        .limit(1);
      if (lines && lines.length > 0) {
        await supabase
          .from('receivables_database')
          .update({
            payment_status:             'Paid',
            amount_paid:                (lines[0] as any).total_amount_due ?? null,
            acknowledgement_receipt_no: dpAckReceiptNo.trim(),
            sales_invoice_number:       dpSalesInvoiceNo.trim(),
            posting_date:              dpDate,
          })
          .eq('id', lines[0].id);
      }

      const updated = {
        ...booking,
        status:                        amdDone ? 'Booked' : booking.status,
        finance_status:                'dp-verified',
        acknowledgement_receipt_no:    ackReceiptNo.trim(),
        sales_invoice_no:              salesInvoiceNo.trim(),
        date_of_reservation_fee:       dateOfResFee,
        finance_verified_at:           now,
        dp_acknowledgement_receipt_no: dpAckReceiptNo.trim(),
        dp_sales_invoice_no:           dpSalesInvoiceNo.trim(),
        date_of_1st_dp:               dpDate,
        dp_verified_at:               now,
      };
      sessionStorage.setItem('financeBooking', JSON.stringify(updated));
      setBooking(updated);
      setDone('approved');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to verify. Please try again.');
    } finally {
      setApproving(false);
      setShowApproveConfirm(false);
    }
  }

  const proofUrls   = parseJson(booking?.payment_proof_url ?? null);
  const validIdUrls = parseJson(booking?.proof_of_valid_id_urls ?? null);
  const fdpUrls     = parseJson(booking?.proof_of_fdp_urls ?? null);

  const rfVerified  = !!booking?.finance_verified_at;
  const dpVerified  = !!booking?.dp_verified_at;
  const isDPPending = rfVerified && !dpVerified;
  // When buyer agreed to pay 1st DP in advance, verify RF + 1st DP together in one step
  const isCombined  = !!booking?.first_payment_agreed && !rfVerified && !dpVerified;
  const alreadyVerified = isDPPending ? dpVerified : rfVerified;

  const canApproveRF = !rfVerified && ackReceiptNo.trim().length > 0 && salesInvoiceNo.trim().length > 0 && !!dateOfResFee;
  const canApproveDP = !dpVerified && dpAckReceiptNo.trim().length > 0 && dpSalesInvoiceNo.trim().length > 0 && !!dpDate;
  const canApprove   = isCombined ? canApproveRF && canApproveDP : isDPPending ? canApproveDP : canApproveRF;

  // ── Done screens ──────────────────────────────────────────────────────────

  if (done === 'approved') {
    const title = dpVerified ? '1st DP Verified' : 'Payment Approved';
    const desc  = dpVerified
      ? `The reservation fee and 1st down payment for ${booking?.client_name} have been verified.`
      : `The reservation fee payment for ${booking?.client_name} has been approved.`;
    const commissionWarnMsg = commissionWarn && !commissionWarn.ok
      ? commissionWarn.reason === 'no-tranches'
        ? `Commission schedule could not be generated — no tranching schedule is set up for this project/rank/seller type combination. Please configure it in the commission settings.`
        : commissionWarn.reason === 'missing-fields'
        ? `Commission schedule could not be generated — seller position rank, product type, or seller type is missing on this reservation.`
        : null
      : null;
    return (
      <PageShell title="Finance Verification" backButton onBack={() => router.push('/finance/buyers-payment')}>
        <div className="space-y-3">
          <GlassCard className="p-8 flex flex-col items-center gap-4">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-base font-bold text-[#1C1C1E]">{title}</p>
            <p className="text-sm text-[#8E8E93] text-center">{desc}</p>
            <button
              onClick={() => router.push('/finance/buyers-payment')}
              className="mt-2 px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Back to Queue
            </button>
          </GlassCard>
          {commissionWarnMsg && (
            <GlassCard className="px-4 py-4 flex items-start gap-3 bg-amber-50 border border-amber-200">
              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">Commission Schedule Not Generated</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{commissionWarnMsg}</p>
              </div>
            </GlassCard>
          )}
        </div>
      </PageShell>
    );
  }

  if (done === 'rejected') {
    return (
      <PageShell title="Finance Verification" backButton onBack={() => router.push('/finance/buyers-payment')}>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          <XCircle size={48} className="text-[#FF3B30]" />
          <p className="text-base font-bold text-[#1C1C1E]">Payment Rejected</p>
          <p className="text-sm text-[#8E8E93] text-center">
            The submission has been returned to the seller for correction.
          </p>
          <button
            onClick={() => router.push('/finance/buyers-payment')}
            className="mt-2 px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
          >
            Back to Queue
          </button>
        </GlassCard>
      </PageShell>
    );
  }

  if (!booking) {
    return (
      <PageShell title="Finance Verification" backButton onBack={() => router.push('/finance/buyers-payment')}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-[#C03D25] animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Finance Verification" backButton onBack={() => router.push('/finance/buyers-payment')}>
      <div className="space-y-4 pb-6">

        {/* Hero card */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(192,61,37,0.1)] flex items-center justify-center shrink-0">
              {dpVerified
                ? <CheckCircle2 size={24} className="text-green-600" />
                : <Receipt size={24} className="text-[#C03D25]" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#8E8E93] uppercase tracking-wider font-semibold">Reservation ID</p>
              <p className="text-base font-bold text-[#C03D25] tracking-wider">{booking.reservation_id}</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${
              dpVerified            ? 'bg-green-100 text-green-700'
              : rfVerified          ? 'bg-green-100 text-green-700'
              : isDPPending         ? 'bg-purple-100 text-purple-700'
              : 'bg-amber-100 text-amber-700'
            }`}>
              {dpVerified    ? '1st DP Verified'
               : rfVerified  ? 'RF Verified'
               : isDPPending ? '1st DP Pending'
               : 'RF Verification'}
            </span>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-black/[0.06]">
            <div className="flex items-center gap-2">
              <User size={11} className="text-[#C7C7CC] shrink-0" />
              <span className="text-sm font-semibold text-[#1C1C1E]">{booking.client_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={11} className="text-[#C7C7CC] shrink-0" />
              <span className="text-xs text-[#6C6C70]">{booking.project}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tag size={11} className="text-[#C7C7CC] shrink-0" />
              <span className="text-xs text-[#6C6C70]">
                {[booking.tower, booking.floor, booking.unit_no, booking.inventory_code].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
            {booking.seller_name && (
              <div className="flex items-center gap-2">
                <User size={11} className="text-[#C7C7CC] shrink-0" />
                <span className="text-xs text-[#6C6C70]">{booking.seller_name}</span>
              </div>
            )}
          </div>
        </GlassCard>

        {/* ── Reservation Fee Section (always shown) ── */}
        <GlassCard className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#1C1C1E] uppercase tracking-wider">Proof of Payment</p>
            {proofUrls.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                {proofUrls.length} file{proofUrls.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {proofUrls.length === 0 ? (
            <div className="py-7 flex flex-col items-center gap-2">
              <FolderOpen size={22} className="text-[#C7C7CC]" />
              <p className="text-xs text-[#C7C7CC]">No proof of payment uploaded</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {proofUrls.map(url => <FileTile key={url} url={url} />)}
            </div>
          )}
        </GlassCard>

        <GlassCard className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#1C1C1E] uppercase tracking-wider">Valid ID</p>
            {validIdUrls.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                {validIdUrls.length} file{validIdUrls.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {validIdUrls.length === 0 ? (
            <div className="py-7 flex flex-col items-center gap-2">
              <FolderOpen size={22} className="text-[#C7C7CC]" />
              <p className="text-xs text-[#C7C7CC]">No valid ID uploaded</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {validIdUrls.map(url => <FileTile key={url} url={url} />)}
            </div>
          )}
        </GlassCard>

        {/* Proof of First Downpayment */}
        {booking.first_payment_agreed && (
          <GlassCard className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#1C1C1E] uppercase tracking-wider">Proof of First Downpayment</p>
              {fdpUrls.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  {fdpUrls.length} file{fdpUrls.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {fdpUrls.length === 0 ? (
              <div className="py-7 flex flex-col items-center gap-2">
                <FolderOpen size={22} className="text-[#C7C7CC]" />
                <p className="text-xs text-[#C7C7CC]">No proof of first downpayment uploaded</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {fdpUrls.map(url => <FileTile key={url} url={url} />)}
              </div>
            )}
          </GlassCard>
        )}

        {/* Payment Mode Info */}
        {(booking.rf_payment_mode || booking.subsequent_mode) && (
          <GlassCard className="px-4 py-1">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
              Mode of Payment
            </p>
            {booking.rf_payment_mode && (
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <Receipt size={15} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Reservation Payment</span>
                <span className="text-xs text-right text-[#6C6C70]">{booking.rf_payment_mode}</span>
              </div>
            )}
            {booking.subsequent_mode && (
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] last:border-0">
                <CalendarDays size={15} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Subsequent Payment</span>
                <span className="text-xs text-right text-[#6C6C70]">{booking.subsequent_mode}</span>
              </div>
            )}
            {booking.ada_bank && (
              <div className="flex items-center gap-3 py-2.5">
                <Building2 size={15} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Preferred Bank</span>
                <span className="text-xs text-right text-[#6C6C70]">{booking.ada_bank}</span>
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="px-4 py-1">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
            Reservation Fee Details
          </p>
          <VerifyInput
            icon={<Receipt size={15}/>}
            label="Acknowledgement Receipt No."
            value={ackReceiptNo}
            onChange={setAckReceiptNo}
            readOnly={rfVerified || isDPPending}
            placeholder="Enter receipt number"
          />
          <VerifyInput
            icon={<FileDigit size={15}/>}
            label="Sales Invoice No."
            value={salesInvoiceNo}
            onChange={setSalesInvoiceNo}
            readOnly={rfVerified || isDPPending}
            placeholder="Enter invoice number"
          />
          <VerifyInput
            icon={<CalendarDays size={15}/>}
            label="Date of Reservation Fee"
            value={dateOfResFee}
            onChange={setDateOfResFee}
            readOnly={rfVerified || isDPPending}
            type="date"
          />
        </GlassCard>

        {/* ── 1st DP Section (shown when pending, already verified, or combined mode) ── */}
        {(isDPPending || dpVerified || isCombined) && (
          <>
            <GlassCard className="px-4 py-1">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
                1st Down Payment Details
              </p>
              <VerifyInput
                icon={<Receipt size={15}/>}
                label="Acknowledgement Receipt No."
                value={dpAckReceiptNo}
                onChange={setDpAckReceiptNo}
                readOnly={dpVerified}
                placeholder="Enter receipt number"
              />
              <VerifyInput
                icon={<FileDigit size={15}/>}
                label="Sales Invoice No."
                value={dpSalesInvoiceNo}
                onChange={setDpSalesInvoiceNo}
                readOnly={dpVerified}
                placeholder="Enter invoice number"
              />
              <VerifyInput
                icon={<CalendarDays size={15}/>}
                label="Date of 1st Down Payment"
                value={dpDate}
                onChange={setDpDate}
                readOnly={dpVerified}
                type="date"
              />
            </GlassCard>
          </>
        )}

        {/* Error */}
        {actionError && (
          <p className="text-red-500 text-xs text-center px-4">{actionError}</p>
        )}

        {/* Verified banners */}
        {rfVerified && !isDPPending && !dpVerified && (
          <GlassCard className="px-4 py-3 flex items-center gap-3 bg-green-50">
            <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-green-700">Reservation fee verified</p>
          </GlassCard>
        )}
        {dpVerified && (
          <GlassCard className="px-4 py-3 flex items-center gap-3 bg-green-50">
            <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-green-700">RF &amp; 1st DP fully verified</p>
          </GlassCard>
        )}

        {/* Action buttons — only when something is pending */}
        {(!rfVerified || isDPPending) && !dpVerified && (
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={!canApprove || approving}
              onClick={() => { setActionError(''); setShowApproveConfirm(true); }}
              className={`w-full py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canApprove
                  ? 'bg-green-500 text-white shadow-[0_4px_16px_rgba(34,197,94,0.35)] active:opacity-80'
                  : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
              }`}
            >
              <CheckCircle2 size={15} />
              {isCombined ? 'Approve RF & 1st DP' : isDPPending ? 'Verify 1st DP' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={rejecting}
              onClick={() => { setActionError(''); setShowRejectConfirm(true); }}
              className="w-full py-4 rounded-2xl bg-[#FFF1F0] text-[#FF3B30] text-sm font-bold active:opacity-80"
            >
              Reject
            </button>
          </div>
        )}

      </div>

      {/* Approve Confirmation Modal */}
      {showApproveConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <CheckCircle2 size={24} className="text-green-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">
                {isCombined ? 'Approve RF & 1st DP?' : isDPPending ? 'Verify 1st Down Payment?' : 'Approve Payment?'}
              </p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                {isCombined
                  ? 'Both the reservation fee and 1st down payment will be verified together in one step.'
                  : isDPPending
                  ? 'This will mark the 1st DP as verified and save the details.'
                  : 'This will mark the reservation fee payment as approved and save the RF details.'}
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{booking.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{booking.client_name}</span>
              </div>
              {isCombined ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">RF Receipt No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{ackReceiptNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">RF Invoice No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{salesInvoiceNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Date of RF</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{fmtDate(dateOfResFee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">1st DP Receipt No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{dpAckReceiptNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">1st DP Invoice No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{dpSalesInvoiceNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Date of 1st DP</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{fmtDate(dpDate)}</span>
                  </div>
                </>
              ) : isDPPending ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Ack. Receipt No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{dpAckReceiptNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Sales Invoice No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{dpSalesInvoiceNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Date of 1st DP</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{fmtDate(dpDate)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Ack. Receipt No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{ackReceiptNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Sales Invoice No.</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{salesInvoiceNo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">Date of RF</span>
                    <span className="text-xs font-semibold text-[#1C1C1E]">{fmtDate(dateOfResFee)}</span>
                  </div>
                </>
              )}
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={approving} onClick={isCombined ? handleApproveCombined : isDPPending ? handleApproveDp : handleApprove}
                className="w-full py-3.5 rounded-2xl bg-green-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {approving
                  ? <><Loader2 size={15} className="animate-spin" /> {isCombined ? 'Verifying...' : isDPPending ? 'Verifying...' : 'Approving...'}</>
                  : <><CheckCircle2 size={15} /> {isCombined ? 'Yes, Approve Both' : isDPPending ? 'Yes, Verify' : 'Yes, Approve'}</>
                }
              </button>
              <button type="button" disabled={approving} onClick={() => setShowApproveConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {showRejectConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-[#FF3B30]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Reject Payment?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                The submission will be returned to the seller so they can correct and re-submit.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{booking.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{booking.client_name}</span>
              </div>
            </div>
            <div className="px-6 pt-4 pb-2 space-y-1.5">
              <p className="text-xs font-semibold text-[#3C3C43]">
                Rejection Reason
                <span className="text-[#FF3B30] ml-0.5">*</span>
              </p>
              <textarea
                rows={3}
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="State the reason for rejection so the seller can correct and resubmit…"
                className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] placeholder-[#C7C7CC] outline-none resize-none focus:border-[#FF3B30]/50"
              />
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-1">{actionError}</p>}
            <div className="px-6 pb-7 pt-3 flex flex-col gap-2.5">
              <button type="button" disabled={rejecting || !rejectComment.trim()} onClick={handleReject}
                className="w-full py-3.5 rounded-2xl bg-[#FF3B30] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-80">
                {rejecting
                  ? <><Loader2 size={15} className="animate-spin" /> Rejecting...</>
                  : 'Yes, Reject'
                }
              </button>
              <button type="button" disabled={rejecting} onClick={() => setShowRejectConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
