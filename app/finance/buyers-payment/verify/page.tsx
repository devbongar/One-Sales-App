'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { approvePaymentReview, updateReservationStatus } from '@/lib/reservations';
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
  payment_proof_url:     string | null;
  director_reviewed_at:         string | null;
  finance_verified_at:          string | null;
  acknowledgement_receipt_no:   string | null;
  sales_invoice_no:             string | null;
  date_of_reservation_fee:      string | null;
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
          <FileText size={26} className="text-[#E8634A]" />
          <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">
            {fileName(url)}
          </span>
        </div>
      )}
    </a>
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

  // Modal states
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectConfirm,  setShowRejectConfirm]  = useState(false);
  const [approving,          setApproving]          = useState(false);
  const [rejecting,          setRejecting]          = useState(false);
  const [actionError,        setActionError]        = useState('');
  const [done,               setDone]               = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('financeBooking');
    if (!raw) { router.replace('/finance/buyers-payment'); return; }
    const b = JSON.parse(raw) as FinanceBooking;
    setBooking(b);
    if (b.acknowledgement_receipt_no) setAckReceiptNo(b.acknowledgement_receipt_no);
    if (b.sales_invoice_no)           setSalesInvoiceNo(b.sales_invoice_no);
    if (b.date_of_reservation_fee)    setDateOfResFee(b.date_of_reservation_fee);
  }, []);

  async function handleApprove() {
    if (!booking) return;
    setApproving(true);
    setActionError('');
    try {
      await approvePaymentReview(booking.reservation_id, ackReceiptNo.trim(), salesInvoiceNo.trim(), dateOfResFee);
      // Update sessionStorage so re-opening this booking shows read-only state
      const updated = {
        ...booking,
        booking_review_status:      'finance-verified',
        finance_verified_at:        new Date().toISOString(),
        acknowledgement_receipt_no: ackReceiptNo.trim(),
        sales_invoice_no:           salesInvoiceNo.trim(),
        date_of_reservation_fee:    dateOfResFee,
      };
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

  async function handleReject() {
    if (!booking) return;
    setRejecting(true);
    setActionError('');
    try {
      await updateReservationStatus(booking.reservation_id, 'Reserved-paid');
      setDone('rejected');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to reject. Please try again.');
    } finally {
      setRejecting(false);
      setShowRejectConfirm(false);
    }
  }

  const proofUrls      = parseJson(booking?.payment_proof_url ?? null);
  const alreadyVerified = booking?.booking_review_status === 'finance-verified' || !!booking?.finance_verified_at;
  const canApprove     = !alreadyVerified && ackReceiptNo.trim().length > 0 && salesInvoiceNo.trim().length > 0 && !!dateOfResFee;

  // ── Done screens ──────────────────────────────────────────────────────────

  if (done === 'approved') {
    return (
      <PageShell title="Finance Verification" backButton onBack={() => router.push('/finance/buyers-payment')}>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          <CheckCircle2 size={48} className="text-green-500" />
          <p className="text-base font-bold text-[#1C1C1E]">Payment Approved</p>
          <p className="text-sm text-[#8E8E93] text-center">
            The reservation fee payment for{' '}
            <span className="font-semibold text-[#1C1C1E]">{booking?.client_name}</span> has been approved.
          </p>
          <button
            onClick={() => router.push('/finance/buyers-payment')}
            className="mt-2 px-6 py-3 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80"
          >
            Back to Queue
          </button>
        </GlassCard>
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
            className="mt-2 px-6 py-3 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80"
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
          <div className="w-7 h-7 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Finance Verification" backButton onBack={() => router.push('/finance/buyers-payment')}>
      <div className="space-y-4 pb-6">

        {/* Reservation info */}
        <GlassCard className="px-4 py-1">
          {([
            [<Hash size={15}/>,      'Reservation ID', booking.reservation_id],
            [<User size={15}/>,      'Client',         booking.client_name],
            [<Building2 size={15}/>, 'Project',        booking.project],
            [<Tag size={15}/>,       'Unit',           [booking.tower, booking.floor, booking.unit_no, booking.inventory_code].filter(Boolean).join(' · ') || '—'],
          ] as [React.ReactNode, string, string][]).map(([icon, label, value]) => (
            <div key={label} className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] last:border-0">
              <span className="text-[#E8634A] shrink-0">{icon}</span>
              <span className="flex-1 text-sm font-medium text-[#1C1C1E]">{label}</span>
              <span className="text-xs text-right text-[#6C6C70] max-w-[55%]">{value}</span>
            </div>
          ))}
        </GlassCard>

        {/* Proof of Payment */}
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

        {/* RF Fields */}
        <GlassCard className="px-4 py-1">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
            Reservation Fee Details
          </p>

          {/* Acknowledgement Receipt No. */}
          <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
            <Receipt size={15} className="text-[#E8634A] shrink-0" />
            <span className="flex-1 text-sm font-medium text-[#1C1C1E]">
              Acknowledgement Receipt No.
              <span className="text-[#E8634A] text-xs leading-none ml-0.5">*</span>
            </span>
          </div>
          <div className="px-1 pb-3 pt-1">
            <input
              type="text"
              value={ackReceiptNo}
              onChange={e => !alreadyVerified && setAckReceiptNo(e.target.value)}
              readOnly={alreadyVerified}
              placeholder="Enter receipt number"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm text-[#1C1C1E] placeholder-[#C7C7CC] outline-none ${
                alreadyVerified
                  ? 'border-black/[0.06] bg-white text-[#3A3A3C] cursor-default'
                  : 'border-black/[0.1] bg-[#F2F2F7] focus:border-[#E8634A]/50'
              }`}
            />
          </div>

          {/* Sales Invoice No. */}
          <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] border-t border-t-black/[0.06]">
            <FileDigit size={15} className="text-[#E8634A] shrink-0" />
            <span className="flex-1 text-sm font-medium text-[#1C1C1E]">
              Sales Invoice No.
              {!alreadyVerified && <span className="text-[#E8634A] text-xs leading-none ml-0.5">*</span>}
            </span>
          </div>
          <div className="px-1 pb-3 pt-1">
            <input
              type="text"
              value={salesInvoiceNo}
              onChange={e => !alreadyVerified && setSalesInvoiceNo(e.target.value)}
              readOnly={alreadyVerified}
              placeholder="Enter invoice number"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm text-[#1C1C1E] placeholder-[#C7C7CC] outline-none ${
                alreadyVerified
                  ? 'border-black/[0.06] bg-white text-[#3A3A3C] cursor-default'
                  : 'border-black/[0.1] bg-[#F2F2F7] focus:border-[#E8634A]/50'
              }`}
            />
          </div>

          {/* Date of Reservation Fee */}
          <div className="flex items-center gap-3 py-3 px-1 border-t border-black/[0.06]">
            <CalendarDays size={15} className="text-[#E8634A] shrink-0" />
            <span className="flex-1 text-sm font-medium text-[#1C1C1E]">
              Date of Reservation Fee
              {!alreadyVerified && <span className="text-[#E8634A] text-xs leading-none ml-0.5">*</span>}
            </span>
            <input
              type="date"
              value={dateOfResFee}
              onChange={e => !alreadyVerified && setDateOfResFee(e.target.value)}
              readOnly={alreadyVerified}
              className={`text-sm text-[#1C1C1E] bg-transparent outline-none text-right ${alreadyVerified ? 'pointer-events-none' : ''}`}
            />
          </div>
        </GlassCard>

        {/* Error */}
        {actionError && (
          <p className="text-red-500 text-xs text-center px-4">{actionError}</p>
        )}

        {/* Already verified banner */}
        {alreadyVerified && (
          <GlassCard className="px-4 py-3 flex items-center gap-3 bg-green-50">
            <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-green-700">Payment already verified</p>
          </GlassCard>
        )}

        {/* Action buttons */}
        {!alreadyVerified && <div className="space-y-2.5">
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
            Approve
          </button>
          <button
            type="button"
            disabled={rejecting}
            onClick={() => { setActionError(''); setShowRejectConfirm(true); }}
            className="w-full py-4 rounded-2xl bg-[#FFF1F0] text-[#FF3B30] text-sm font-bold active:opacity-80"
          >
            Reject
          </button>
        </div>}

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
              <p className="text-base font-bold text-[#1C1C1E] text-center">Approve Payment?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This will mark the reservation fee payment as approved and save the RF details.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#E8634A]">{booking.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{booking.client_name}</span>
              </div>
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
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={approving} onClick={handleApprove}
                className="w-full py-3.5 rounded-2xl bg-green-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {approving
                  ? <><Loader2 size={15} className="animate-spin" /> Approving...</>
                  : <><CheckCircle2 size={15} /> Yes, Approve</>
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
                <span className="text-xs font-bold text-[#E8634A]">{booking.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{booking.client_name}</span>
              </div>
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={rejecting} onClick={handleReject}
                className="w-full py-3.5 rounded-2xl bg-[#FF3B30] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
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
