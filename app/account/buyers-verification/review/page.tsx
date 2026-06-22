'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { amdReview } from '@/lib/review';
import { generateReservationAgreement, generateBuyerInformationForm, generateTermsOfPayment } from '@/lib/pdf-generators';
import {
  Building2, Tag, User, FileText,
  CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Loader2, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewBooking {
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
  booking_review_status: string | null;
  director_notes:        string | null;
  net_list_price:        number | null;
  vat:                   number | null;
  other_charges:         number | null;
  total_contract_price:  number | null;
  scheme_name:           string | null;
  payment_term:          string | null;
  list_price:              number | null;
  promo_discount_pct:      number | null;
  promo_discount_amount:   number | null;
  payterm_discount_pct:    number | null;
  payterm_discount_amount: number | null;
  hic_discount:            number | null;
  employee_discount_amount:number | null;
  dp_rate:                 number | null;
  term_months:             number | null;
  dp_amount:               number | null;
  net_spot_dp:             number | null;
  monthly_stretched_dp:    number | null;
  monthly_deferred:        number | null;
  bank_monthly:            number | null;
  hdmf_monthly:            number | null;
  balance_for_financing:   number | null;
  reservation_fee:         number | null;
  due_from:                string | null;
  due_to:                  string | null;
  payment_proof_url:     string | null;
  proof_of_1st_dp_urls:  string | null;
  proof_of_billing_urls:             string | null;
  proof_of_income_urls:              string | null;
  existing_loan_disclosure_urls:     string | null;
  additional_proof_of_income_urls:   string | null;
  signed_floor_layout_urls:          string | null;
  proof_of_valid_id_urls:            string | null;
  co_owner_id_urls:      string[] | null;
  atty_in_fact_id_urls:  string[] | null;
  spouse_id_urls:        string[] | null;
  has_co_ownership:      boolean | null;
  has_atty_in_fact:      boolean | null;
  has_spouse:            boolean | null;
  signature_base64:      string | null;
  created_at:            string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusChip(status: string | null) {
  switch (status) {
    case 'director-approved': return { label: 'Pending AMD',   cls: 'bg-amber-100 text-amber-700' };
    case 'amd-approved':      return { label: 'AMD Approved', cls: 'bg-green-100 text-green-700' };
    case 'amd-rejected':      return { label: 'AMD Rejected', cls: 'bg-red-100 text-red-700' };
    default:                  return { label: 'Pending',       cls: 'bg-amber-100 text-amber-700' };
  }
}

function parseJson(s: string | null): string[] {
  try { return JSON.parse(s ?? '[]') as string[]; } catch { return []; }
}
function fileName(url: string) {
  return decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file');
}
function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}
function fmt(n: number | null) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}
function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}


// ─── File overlay (images + PDFs) ────────────────────────────────────────────

function FileOverlay({ url, title, onClose, isBlob }: { url: string; title: string; onClose: () => void; isBlob?: boolean }) {
  useEffect(() => {
    return () => { if (isBlob) URL.revokeObjectURL(url); };
  }, [url, isBlob]);

  const img = isImage(url);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1C1C1E]">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] border-b border-white/10 shrink-0">
        <p className="text-white text-[13px] font-semibold truncate">{title}</p>
        <button
          onClick={onClose}
          className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      {img ? (
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={title} className="max-w-full max-h-full object-contain" />
        </div>
      ) : (
        <iframe src={url} className="flex-1 w-full border-0" title={title} />
      )}
      <div className="shrink-0 px-4 py-4 bg-[#1C1C1E] border-t border-white/10">
        <button onClick={onClose} className="w-full py-3.5 rounded-2xl bg-white/10 text-white text-sm font-semibold active:bg-white/20 transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Document preview cards ───────────────────────────────────────────────────

function DocPreviewCard({
  label, icon, date, onOpen, generating,
}: {
  label: string;
  icon: JSX.Element;
  date: string | null;
  onOpen: () => void;
  generating: boolean;
}) {
  return (
    <button onClick={onOpen} disabled={generating} className="w-full text-left active:opacity-70 transition-opacity disabled:opacity-60">
      <GlassCard className="px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#C03D25]/10 flex items-center justify-center shrink-0">
          {generating ? <Loader2 size={18} className="text-[#C03D25] animate-spin" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1C1C1E]">{label}</p>
          <p className="text-xs text-[#8E8E93] mt-0.5">{generating ? 'Generating PDF…' : formatDate(date)}</p>
        </div>
        <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
      </GlassCard>
    </button>
  );
}

function AgreementPreviewCard({ b, onPdf }: { b: ReviewBooking; onPdf: (url: string, title: string) => void }) {
  const [generating, setGenerating] = useState(false);
  async function handleOpen() {
    setGenerating(true);
    try {
      const url = await generateReservationAgreement(b.reservation_id, false) as string;
      onPdf(url, 'Reservation Agreement');
    } finally { setGenerating(false); }
  }
  return <DocPreviewCard label="Reservation Agreement" icon={<FileText size={18} className="text-[#C03D25]" />} date={b.created_at} onOpen={handleOpen} generating={generating} />;
}

function TermsPreviewCard({ b, onPdf }: { b: ReviewBooking; onPdf: (url: string, title: string) => void }) {
  const [generating, setGenerating] = useState(false);
  async function handleOpen() {
    setGenerating(true);
    try {
      const url = await generateTermsOfPayment(b.reservation_id, false) as string;
      onPdf(url, 'Terms of Payment');
    } finally { setGenerating(false); }
  }
  return <DocPreviewCard label="Terms of Payment" icon={<FileText size={18} className="text-[#C03D25]" />} date={b.created_at} onOpen={handleOpen} generating={generating} />;
}

// ─────────────────────────────────────────────────────────────────────────────

function FileTile({ url, onOpen }: { url: string; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square active:opacity-70 w-full"
    >
      {isImage(url) ? (
        <img src={url} alt={fileName(url)} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
          <FileText size={26} className="text-[#C03D25]" />
          <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">{fileName(url)}</span>
        </div>
      )}
    </button>
  );
}

function DocCard({ label, urls, onFileOpen }: { label: string; urls: string[]; onFileOpen: (url: string) => void }) {
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">{label}</p>
        {urls.length > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {urls.length} file{urls.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {urls.length === 0 ? (
        <p className="text-xs text-[#C7C7CC] italic">No file uploaded</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {urls.map(url => <FileTile key={url} url={url} onOpen={onFileOpen} />)}
        </div>
      )}
    </GlassCard>
  );
}

function GroupLabel({ label }: { label: string }) {
  return <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-[0.12em] px-1 pt-2">{label}</p>;
}

// ─── Buyer Information Form card ──────────────────────────────────────────────

function BuyerInfoPreviewCard({ b, onPdf }: { b: ReviewBooking; onPdf: (url: string, title: string) => void }) {
  const [generating, setGenerating] = useState(false);
  async function handleOpen() {
    setGenerating(true);
    try {
      const url = await generateBuyerInformationForm(b.reservation_id, false) as string;
      onPdf(url, 'Buyer Information Form');
    } finally { setGenerating(false); }
  }
  return <DocPreviewCard label="Buyer Information Form" icon={<User size={18} className="text-[#C03D25]" />} date={b.created_at} onOpen={handleOpen} generating={generating} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DirectorReviewPage() {
  const router = useRouter();
  const [booking,     setBooking]     = useState<ReviewBooking | null>(null);
  const [rejecting,   setRejecting]   = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState<'approved' | 'rejected' | null>(null);
  const [fileUrl,     setFileUrl]     = useState<string | null>(null);
  const [fileTitle,   setFileTitle]   = useState('');
  const [fileIsBlob,  setFileIsBlob]  = useState(false);

  function openFile(url: string, title: string, isBlob = false) { setFileUrl(url); setFileTitle(title); setFileIsBlob(isBlob); }
  function closeFile() { setFileUrl(null); setFileTitle(''); setFileIsBlob(false); }

  useEffect(() => {
    const raw = sessionStorage.getItem('reviewBooking');
    if (!raw) { router.replace('/account/buyers-verification'); return; }
    const b = JSON.parse(raw) as ReviewBooking;
    setBooking(b);
  }, []);

  async function handleApprove() {
    if (!booking) return;
    setSaving(true);
    try {
      await amdReview(booking.reservation_id, true);
      setDone('approved');
    } catch (err) { alert('Failed to approve. Please try again.'); console.error(err); }
    finally { setSaving(false); }
  }

  async function handleReject() {
    if (!booking) return;
    if (!rejectNotes.trim()) { alert('Please enter rejection notes.'); return; }
    setSaving(true);
    try {
      await amdReview(booking.reservation_id, false, rejectNotes.trim());
      setDone('rejected');
    } catch (err) { alert('Failed to reject. Please try again.'); console.error(err); }
    finally { setSaving(false); }
  }

  const alreadyReviewed = booking?.booking_review_status === 'amd-approved'
    || booking?.booking_review_status === 'amd-rejected';

  if (done) {
    return (
      <PageShell title="AMD Review" backButton onBack={() => router.push('/account/buyers-verification')}>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          {done === 'approved'
            ? <CheckCircle2 size={48} className="text-green-500" />
            : <XCircle size={48} className="text-red-500" />}
          <p className="text-base font-bold text-[#1C1C1E]">
            {done === 'approved' ? 'Booking Approved' : 'Booking Rejected'}
          </p>
          <p className="text-sm text-[#8E8E93] text-center">
            {done === 'approved'
              ? 'This booking has been approved and forwarded to Finance.'
              : 'The agent has been notified to review and resubmit.'}
          </p>
          {done === 'approved' ? (
            <button
              onClick={() => {
                sessionStorage.setItem('selectedReservation', JSON.stringify({
                  reservation_id: booking?.reservation_id,
                  client_name:    booking?.client_name,
                  project:        booking?.project,
                  inventory_code: booking?.inventory_code,
                }));
                router.push('/sales/booking/detail');
              }}
              className="mt-2 px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              View Booking Detail
            </button>
          ) : (
            <button
              onClick={() => router.push('/account/buyers-verification')}
              className="mt-2 px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Back to Queue
            </button>
          )}
        </GlassCard>
      </PageShell>
    );
  }

  if (!booking) {
    return (
      <PageShell title="AMD Review" backButton onBack={() => router.push('/account/buyers-verification')}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-[#C03D25] animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <>
    <PageShell title="AMD Review" backButton onBack={() => router.push('/account/buyers-verification')}>
      <div className="space-y-3 pb-4">

        {/* Already reviewed notice */}
        {alreadyReviewed && (
          <GlassCard className={`px-4 py-3 flex items-center gap-3 ${
            booking.booking_review_status === 'amd-rejected' ? 'bg-red-50' : 'bg-green-50'
          }`}>
            {booking.booking_review_status === 'amd-rejected'
              ? <XCircle size={16} className="text-red-500 shrink-0" />
              : <CheckCircle2 size={16} className="text-green-600 shrink-0" />}
            <p className={`text-xs font-semibold ${
              booking.booking_review_status === 'amd-rejected' ? 'text-red-700' : 'text-green-700'
            }`}>
              {booking.booking_review_status === 'amd-approved' ? 'You have already AMD-approved this booking.'
              : booking.booking_review_status === 'amd-rejected' ? 'You have already rejected this booking.'
              : ''}
            </p>
          </GlassCard>
        )}

        {/* Reservation hero card */}
        <GlassCard className="overflow-hidden">
          <div className="px-4 py-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
              <span className="text-lg font-bold text-white">
                {getInitials(booking.client_name ?? '?')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Reservation ID</p>
              <p className="text-lg font-bold text-[#1C1C1E] truncate">{booking.reservation_id}</p>
              <p className="text-sm text-[#6C6C70] truncate">{booking.client_name ?? '—'}</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${statusChip(booking.booking_review_status).cls}`}>
              {statusChip(booking.booking_review_status).label}
            </span>
          </div>
          <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Building2 size={12} className="text-[#C7C7CC]" />
              <span className="text-xs text-[#6C6C70]">{booking.project ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag size={12} className="text-[#C7C7CC]" />
              <span className="text-xs font-medium text-[#6C6C70]">
                {[booking.tower ? `Tower ${booking.tower}` : null, booking.inventory_code].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          </div>
          {booking.seller_name && (
            <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center gap-1.5">
              <User size={12} className="text-[#C7C7CC]" />
              <span className="text-xs text-[#6C6C70]">{booking.seller_name}</span>
            </div>
          )}
        </GlassCard>

        <AgreementPreviewCard b={booking} onPdf={(url, title) => openFile(url, title, true)} />
        <TermsPreviewCard b={booking} onPdf={(url, title) => openFile(url, title, true)} />
        <BuyerInfoPreviewCard b={booking} onPdf={(url, title) => openFile(url, title, true)} />

        {/* Booking Documents */}
        <GroupLabel label="Booking Documents" />
        <DocCard label="Proof of Billing"           urls={parseJson(booking.proof_of_billing_urls)} onFileOpen={url => openFile(url, fileName(url))} />
        <DocCard label="Proof of Income"            urls={parseJson(booking.proof_of_income_urls)} onFileOpen={url => openFile(url, fileName(url))} />
        <DocCard label="Additional Proof of Income" urls={parseJson(booking.additional_proof_of_income_urls)} onFileOpen={url => openFile(url, fileName(url))} />
        <DocCard label="Existing Loan Disclosure"   urls={parseJson(booking.existing_loan_disclosure_urls)} onFileOpen={url => openFile(url, fileName(url))} />
        <DocCard label="Signed Floor Layout"        urls={parseJson(booking.signed_floor_layout_urls)} onFileOpen={url => openFile(url, fileName(url))} />
        <DocCard label="Buyer Valid ID"             urls={parseJson(booking.proof_of_valid_id_urls)} onFileOpen={url => openFile(url, fileName(url))} />
        {booking.has_co_ownership  && <DocCard label="Co-Owner Valid ID"         urls={booking.co_owner_id_urls ?? []} onFileOpen={url => openFile(url, fileName(url))} />}
        {booking.has_spouse        && <DocCard label="Spouse Valid ID"           urls={booking.spouse_id_urls ?? []} onFileOpen={url => openFile(url, fileName(url))} />}
        {booking.has_atty_in_fact  && <DocCard label="Attorney in Fact Valid ID" urls={booking.atty_in_fact_id_urls ?? []} onFileOpen={url => openFile(url, fileName(url))} />}

        {/* Previous rejection notes */}
        {booking.director_notes && (
          <GlassCard className="px-4 py-3 space-y-1.5 bg-red-50">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-500" />
              <p className="text-xs font-bold text-red-700">Previous Rejection Notes</p>
            </div>
            <p className="text-xs text-[#3A3A3C] leading-relaxed">{booking.director_notes}</p>
          </GlassCard>
        )}


        {/* Action buttons */}
        {!alreadyReviewed && (
          <>
            {rejecting ? (
              <GlassCard className="p-4 space-y-3">
                <p className="text-xs font-bold text-[#1C1C1E]">Rejection Notes <span className="text-red-500">*</span></p>
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Describe what needs to be corrected…"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white resize-none placeholder:text-[#C7C7CC]"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setRejecting(false); setRejectNotes(''); }}
                    className="flex-1 py-3.5 rounded-2xl border border-black/[0.08] text-sm font-semibold text-[#8E8E93] active:bg-black/[0.02]">
                    Cancel
                  </button>
                  <button type="button" onClick={handleReject}
                    disabled={saving || !rejectNotes.trim()}
                    className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80 disabled:opacity-40">
                    {saving ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                </div>
              </GlassCard>
            ) : (
              <div className="flex gap-3">
                <button type="button" onClick={() => setRejecting(true)}
                  className="flex-1 py-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold border border-red-200 active:opacity-70">
                  Reject
                </button>
                <button type="button" onClick={handleApprove} disabled={saving}
                  className="flex-1 py-4 rounded-2xl bg-green-500 text-white text-sm font-bold shadow-[0_4px_16px_rgba(34,197,94,0.3)] active:opacity-80 disabled:opacity-40">
                  {saving ? 'Approving…' : 'Approve'}
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </PageShell>

    {fileUrl && <FileOverlay url={fileUrl} title={fileTitle} isBlob={fileIsBlob} onClose={closeFile} />}
    </>
  );
}
