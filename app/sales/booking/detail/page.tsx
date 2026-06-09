'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  getBookingProgress, saveBookingFlags, savePrivacyConsent, BookingProgress,
} from '@/lib/booking-progress';
import {
  Hash, Building2, Tag, User, ChevronRight,
  Lock, Check, FileText, Loader2, UserCheck, ShieldCheck, ShieldAlert, Heart,
  CheckCircle2, XCircle, Send, Clock,
} from 'lucide-react';
import { submitForReview } from '@/lib/review';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadOnlyRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
      <span className="text-[#C03D25] shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium text-[#1C1C1E]">{label}</span>
      <span className="text-sm text-right text-[#6C6C70] max-w-[180px] truncate">{value || '—'}</span>
    </div>
  );
}

function ToggleRow({ icon, label, value, onToggle, locked, saving }: {
  icon: React.ReactNode; label: string;
  value: boolean; onToggle: () => void;
  locked?: boolean; saving?: boolean;
}) {
  const interactive = !locked && !saving;
  return (
    <button type="button" onClick={interactive ? onToggle : undefined}
      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${
        interactive ? 'active:bg-black/[0.03]' : 'cursor-default'
      }`}>
      <span className={value ? 'text-[#C03D25]' : 'text-[#C7C7CC]'}>{icon}</span>
      <span className={`flex-1 text-sm font-medium text-left ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
        {label}
      </span>
      {locked && <Lock size={12} className="text-[#C7C7CC] shrink-0" />}
      {saving && <Loader2 size={16} className="text-[#C03D25] animate-spin shrink-0" />}
      <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
        value ? 'bg-[#C03D25]' : 'bg-[#E5E5EA]'
      } ${locked ? 'opacity-50' : ''}`}>
        <div className={`absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          value ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`} />
      </div>
    </button>
  );
}

function StageCard({ number, title, complete, locked, badge, children }: {
  number: number; title: string; complete: boolean; locked?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className={`overflow-hidden ${locked ? 'opacity-50' : ''}`}>
      <div className={`px-4 py-3 flex items-center justify-between border-b border-black/[0.06] ${
        complete ? 'bg-green-50' : 'bg-[#F2F2F7]/60'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            complete ? 'bg-green-500' : locked ? 'bg-[#C7C7CC]' : 'bg-[#C03D25]'
          }`}>
            {complete
              ? <Check size={14} className="text-white" />
              : locked
              ? <Lock size={13} className="text-white" />
              : <span className="text-xs font-bold text-white">{number}</span>}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Stage {number}</p>
            <p className="text-sm font-bold text-[#1C1C1E]">{title}</p>
          </div>
        </div>
        {badge !== undefined ? badge : (
          complete  ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Complete</span>
          : !locked ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C03D25]/10 text-[#C03D25]">In Progress</span>
          :           <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F2F2F7] text-[#8E8E93]">Locked</span>
        )}
      </div>
      <div className="divide-y divide-black/[0.05]">{children}</div>
    </GlassCard>
  );
}

function StageRow({ icon, label, done, onTap, locked }: {
  icon: React.ReactNode; label: string; done: boolean; onTap?: () => void; locked?: boolean;
}) {
  return (
    <button type="button" onClick={!locked ? onTap : undefined}
      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${
        locked ? 'cursor-default' : 'active:bg-black/[0.03]'
      }`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
        done ? 'bg-green-500' : 'bg-[#E5E5EA]'
      }`}>
        {done && <Check size={10} className="text-white" />}
      </div>
      <span className="flex-1 text-sm font-medium text-[#1C1C1E] text-left">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {done ? 'Done' : 'Pending'}
        </span>
        {!locked && <ChevronRight size={14} className="text-[#C7C7CC]" />}
      </div>
    </button>
  );
}

// ─── Privacy Policy text ──────────────────────────────────────────────────────

const POLICY_PARAGRAPHS = [
  `PH1 World Developers, Inc. and/or its subsidiaries (the 'Company') recognize the utmost importance of protecting your privacy. As such, the Company has adopted this Privacy Policy (the 'Policy'), which is consistent with Republic Act No. 10173, otherwise known as the Data Privacy Act of 2012 (the 'DPA'), its Implementing Rules and Regulations (the 'IRR'), and all applicable regulations and issuances on data privacy and data protection.`,
  `As its customer or client, the Company may collect, use, share, retain, and dispose (collectively, to 'Process') the following personal information and/or sensitive personal information ('Personal Data') from you:\n\na. Basic personal information, such as full name, nickname, home address / billing address / shipping address, e-mail address, employment information, telephone number, other contact numbers, username and password.\nb. Sensitive personal information, such as age, nationality, marital status, gender, health, education, and government-issued identification documents which include, but are not limited to, identification cards, licenses, and social security number.\nc. Income information and financial details, such as credit history, bank accounts, credit cards and debit card information.`,
  `The foregoing Personal Data shall be used by the Company in a reasonable manner and when necessary for a declared and specific purpose, which may be any of the following:\n\na. When you inquire about or purchase a unit or property: to conduct the appropriate credit investigation and evaluate the credit risk associated with your financial obligation to the Company arising from your purchase; to facilitate the sale and the turnover of a unit or property which includes the execution of contracts, the preparation of documentation leading to the transfer of title, and performance of financial processes (i.e. reservation fees, amortization and handover fees) associated with the sale; to provide information or services concerning the trading, brokerage, leasing, management and other incidental operations of real estate; to update our records and keep your contact details and billing address up to date; and, to ensure the safety and security of the other unit or property owners, tenants and/or occupants.\nb. To carry out the necessary due diligence;\nc. For you to provide reviews on our products and services;\nd. To generate statistical insight;\ne. To conduct research and analysis (through surveys or polls) in order to improve your experience and satisfaction;\nf. To respond to specific complaints, inquiries, requests, or to provide requested information;\ng. To provide timely and efficient customer care activities and services;`,
  `You shall be responsible for ensuring that the Personal Data you submitted to the Company is accurate, complete, and up to date. All Personal Data Processed by the Company shall be considered correct unless you request that it be updated.`,
  `All Personal Data provided by you will be kept strictly confidential. Accordingly, the Company will not disclose or share your Personal Data to third parties without your consent. However, the Company may share your Personal Data to its agents, brokers, employees and/or personnel on a need-to-know basis. In which case, your Personal Data will be used in a manner consistent with the purpose for which it was originally collected and to which you consented, and pursuant to the DPA, its IRR, and all applicable regulations and issuances on data privacy and protection.`,
  `The Company may also share your Personal Data with third parties who perform services for it. Under such circumstances, the Company requires its service providers to limit the use of your Personal Data in a manner consistent with the purpose for which it was originally collected, and to protect your Personal Data aligned with the Company's security standards.`,
  `Further, the Company may share your Personal Data to unrelated third parties, upon your request, when legally required to do so, or when it is necessary to protect and/or defend the Company's rights, property, or safety, and those of other individuals. Nevertheless, the Company will continue, as far as practicable, to take all necessary measures to protect your Personal Data.`,
  `To secure your Personal Data, the Company employs appropriate organizational, technical, and physical security measures to protect the Personal Data you provide against accidental, unlawful, or unauthorized destruction, loss, alteration, access, disclosure, or use, and other unlawful forms of Processing. The Company shall keep your Personal Data within five (5) years from the date of your last transaction with the Company (i.e. release of transferred title or documents relating to a cancellation of the sale), or as may be required by law, unless you expressly withdraw your consent in writing.`,
  `As the owner of the Personal Data, you have the right to be informed of:\n\ni. the Personal Data being, or that was, Processed by the Company;\nii. the right to gain reasonable access to your Personal Data;\niii. the right to object to the Processing of your Personal Data;\niv. the right to suspend, withdraw, or order the removal or destruction of your Personal Data;\nv. the right to dispute any error in your Personal Data and have the Company correct it immediately; and\nvi. the right to obtain a copy of the Personal Data in electronic format, if available.`,
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookingDetailPage() {
  const router = useRouter();

  const [reservation, setReservation] = useState<{
    reservation_id?: string; project?: string; inventory_code?: string; client_name?: string;
  } | null>(null);
  const [progress,        setProgress]        = useState<BookingProgress | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [hasCoOwnership,  setHasCoOwnership]  = useState(false);
  const [hasAttyInFact,   setHasAttyInFact]   = useState(false);
  const [savingFlags,     setSavingFlags]     = useState(false);

  // Privacy consent
  const [privacyConsent,  setPrivacyConsent]  = useState(false);
  const [signature,       setSignature]       = useState<string | null>(null);
  const [agreed,          setAgreed]          = useState(false);
  const [agreedEsig,      setAgreedEsig]      = useState(false);
  const [savingConsent,   setSavingConsent]   = useState(false);
  const [submitting,      setSubmitting]      = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { router.replace('/sales/booking'); return; }
    const r = JSON.parse(raw);
    setReservation(r);
    if (r.reservation_id) {
      getBookingProgress(r.reservation_id)
        .then(p => {
          setProgress(p);
          setPrivacyConsent(p.privacy_consent);
          setSignature(p.signature_base64 ?? null);
          setHasCoOwnership(p.has_co_ownership);
          setHasAttyInFact(p.has_atty_in_fact);
        })
        .catch(err => { console.error('[detail] progress error:', err); setProgress(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function handleConsent() {
    setSavingConsent(true);
    try {
      await savePrivacyConsent(reservation?.reservation_id ?? '');
      setPrivacyConsent(true);
    } catch (err) {
      alert('Failed to save consent. Please try again.');
      console.error(err);
    } finally {
      setSavingConsent(false);
    }
  }

  async function handleSubmitForReview() {
    setSubmitting(true);
    try {
      await submitForReview(reservation?.reservation_id ?? '');
      setProgress(prev => prev ? { ...prev, booking_review_status: 'submitted' } : prev);
    } catch (err) {
      alert('Failed to submit. Please try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleCoOwner() {
    const next = !hasCoOwnership;
    setSavingFlags(true);
    try {
      await saveBookingFlags(reservation?.reservation_id ?? '', next, hasAttyInFact);
      setHasCoOwnership(next);
    } catch (err) { console.error(err); }
    finally { setSavingFlags(false); }
  }

  async function toggleAttyInFact() {
    const next = !hasAttyInFact;
    setSavingFlags(true);
    try {
      await saveBookingFlags(reservation?.reservation_id ?? '', hasCoOwnership, next);
      setHasAttyInFact(next);
    } catch (err) { console.error(err); }
    finally { setSavingFlags(false); }
  }

  const stage1Complete = progress
    ? progress.buyer_info_saved
      && (!progress.has_spouse  || progress.spouse_saved)
      && (!hasCoOwnership       || progress.co_owner_saved)
      && (!hasAttyInFact        || progress.atty_saved)
    : false;

  function goToBuyerInfo() { router.push('/sales/booking/buyer-info'); }
  function goToSpouse()    { router.push('/sales/booking/spouse'); }
  function goToCoOwner() {
    sessionStorage.setItem('coowner_hasAttyInFact', hasAttyInFact ? '1' : '0');
    router.push('/sales/booking/co-owner');
  }
  function goToAttyInFact() {
    sessionStorage.setItem('atty_hasCoOwnership', hasCoOwnership ? '1' : '0');
    router.push('/sales/booking/atty-in-fact');
  }

  return (
    <PageShell title="Booking" backButton onBack={() => router.push('/sales/booking')}>
      <div className="space-y-4 pb-6">

        {/* Reservation info */}
        <GlassCard className="px-4 py-1">
          <ReadOnlyRow icon={<Hash size={16} />}      label="Reservation ID" value={reservation?.reservation_id} />
          <ReadOnlyRow icon={<Building2 size={16} />} label="Project"        value={reservation?.project} />
          <ReadOnlyRow icon={<Tag size={16} />}       label="Inventory Code" value={reservation?.inventory_code} />
          <ReadOnlyRow icon={<User size={16} />}      label="Client"         value={reservation?.client_name} />
        </GlassCard>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={28} className="text-[#C03D25] animate-spin" />
          </div>

        ) : !privacyConsent ? (
          /* ── Privacy Policy gate ── */
          <>
            <GlassCard className="overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 flex items-center gap-3 bg-[#F2F2F7]/60 border-b border-black/[0.06]">
                <div className="w-8 h-8 rounded-xl bg-[#C03D25] flex items-center justify-center shrink-0">
                  <ShieldAlert size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Required</p>
                  <p className="text-sm font-bold text-[#1C1C1E]">Data Privacy Policy</p>
                </div>
              </div>

              {/* Scrollable policy text */}
              <div className="px-4 py-4 max-h-72 overflow-y-auto space-y-3">
                <p className="text-xs font-bold text-[#1C1C1E] uppercase tracking-wide">
                  DATA PRIVACY POLICY
                </p>
                {POLICY_PARAGRAPHS.map((para, i) => (
                  <p key={i} className="text-xs text-[#3C3C43] leading-relaxed whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>

              {/* Consent checkboxes */}
              <div className="px-4 py-4 border-t border-black/[0.06] bg-[#F2F2F7]/40 space-y-4">
                <button type="button" onClick={() => setAgreed(p => !p)}
                  className="flex items-start gap-3 w-full text-left active:opacity-70">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    agreed ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C7C7CC] bg-white'
                  }`}>
                    {agreed && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-[#3C3C43] leading-relaxed">
                    I have read and understood the Data Privacy Policy and I give my consent to the collection, use, and processing of my personal data as described above.
                  </span>
                </button>

                <button type="button" onClick={() => setAgreedEsig(p => !p)}
                  className="flex items-start gap-3 w-full text-left active:opacity-70">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    agreedEsig ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C7C7CC] bg-white'
                  }`}>
                    {agreedEsig && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs text-[#3C3C43] leading-relaxed">
                    I agree to affix my e-signature to signify my conformity with the Data Privacy Policy.
                  </span>
                </button>

                {/* Signature preview */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#8E8E93]">Signature on File</p>
                  <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden flex items-center justify-center h-24">
                    {signature ? (
                      <img src={signature} alt="Signature" className="h-full w-full object-contain p-2" />
                    ) : (
                      <span className="text-xs text-[#C7C7CC]">No signature on file</span>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>

            <button type="button" onClick={handleConsent}
              disabled={!agreed || !agreedEsig || !signature || savingConsent}
              className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity disabled:opacity-40">
              {savingConsent ? 'Processing…' : 'I Agree & Proceed'}
            </button>
          </>

        ) : (
          /* ── Stages (consent already given) ── */
          <>
            {/* Stage 1 — Buyer's Information */}
            <StageCard number={1} title="Buyer's Information" complete={stage1Complete}>
              <ToggleRow
                icon={<UserCheck size={15} />}
                label="Has Co-Owner?"
                value={hasCoOwnership}
                onToggle={toggleCoOwner}
                locked={progress?.co_owner_saved}
                saving={savingFlags}
              />
              <ToggleRow
                icon={<ShieldCheck size={15} />}
                label="Has Attorney in Fact?"
                value={hasAttyInFact}
                onToggle={toggleAttyInFact}
                locked={progress?.atty_saved}
                saving={savingFlags}
              />
              <div className="h-px bg-black/[0.06]" />
              <StageRow
                icon={<User size={14} />}
                label="Personal Information"
                done={progress?.buyer_info_saved ?? false}
                onTap={goToBuyerInfo}
              />
              {progress?.has_spouse && (
                <StageRow
                  icon={<Heart size={14} />}
                  label="Spouse Information"
                  done={progress?.spouse_saved ?? false}
                  onTap={goToSpouse}
                />
              )}
              {hasCoOwnership && (
                <StageRow
                  icon={<UserCheck size={14} />}
                  label="Co-Owner Information"
                  done={progress?.co_owner_saved ?? false}
                  onTap={goToCoOwner}
                />
              )}
              {hasAttyInFact && (
                <StageRow
                  icon={<ShieldCheck size={14} />}
                  label="Attorney in Fact"
                  done={progress?.atty_saved ?? false}
                  onTap={goToAttyInFact}
                />
              )}
            </StageCard>

            {/* Stage 2 — Required Documents */}
            <StageCard number={2} title="Required Documents" complete={progress?.documents_saved ?? false} locked={!stage1Complete}>
              <StageRow
                icon={<FileText size={14} />}
                label="Upload Documents"
                done={progress?.documents_saved ?? false}
                locked={!stage1Complete}
                onTap={() => router.push('/sales/booking/documents')}
              />
            </StageCard>

            {/* ── Review Pipeline (visible once docs are saved) ── */}
            {(() => {
              const rs = progress?.booking_review_status ?? null;
              const dirApproved  = rs === 'director-approved' || rs === 'finance-verified';
              const finVerified  = rs === 'finance-verified';
              const docsReady    = progress?.documents_saved ?? false;

              return (
                <>
                  {/* Stage 3 — Director Review */}
                  <StageCard
                    number={3}
                    title="Director Review"
                    complete={dirApproved}
                    locked={!docsReady}
                    badge={
                      !docsReady ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F2F2F7] text-[#8E8E93]">Locked</span>
                      : rs === 'submitted'         ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Submitted</span>
                      : rs === 'director-rejected' ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Rejected</span>
                      : dirApproved               ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Approved</span>
                      : <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Pending</span>
                    }
                  >
                    {!docsReady && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-[#C7C7CC]">Complete document upload first</p>
                      </div>
                    )}
                    {docsReady && !rs && (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <Send size={13} className="text-[#8E8E93]" />
                        <p className="text-xs text-[#8E8E93]">Ready to submit for director review</p>
                      </div>
                    )}
                    {rs === 'submitted' && (
                      <div className="px-4 py-3 flex items-center gap-3">
                        <Clock size={13} className="text-blue-500" />
                        <p className="text-xs font-medium text-blue-600">Under review by Sales Director</p>
                      </div>
                    )}
                    {rs === 'director-rejected' && (
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <XCircle size={13} className="text-red-500" />
                          <p className="text-xs font-semibold text-red-600">Rejected — please review and resubmit</p>
                        </div>
                        {progress?.director_notes && (
                          <p className="text-xs text-[#3A3A3C] bg-red-50 border border-red-100 rounded-xl px-3 py-2 leading-relaxed">
                            {progress.director_notes}
                          </p>
                        )}
                      </div>
                    )}
                    {dirApproved && (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-green-600" />
                        <p className="text-xs font-semibold text-green-700">Approved by Sales Director</p>
                      </div>
                    )}
                  </StageCard>

                  {/* Stage 4 — Finance Verification */}
                  <StageCard
                    number={4}
                    title="Finance Verification"
                    complete={finVerified}
                    locked={!dirApproved}
                    badge={
                      !dirApproved  ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F2F2F7] text-[#8E8E93]">Locked</span>
                      : finVerified ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Verified</span>
                      :               <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Pending</span>
                    }
                  >
                    {!dirApproved && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-[#C7C7CC]">Awaiting director approval</p>
                      </div>
                    )}
                    {dirApproved && !finVerified && (
                      <div className="px-4 py-3 flex items-center gap-3">
                        <Clock size={13} className="text-amber-500" />
                        <p className="text-xs font-medium text-amber-600">Awaiting 1st DP verification by Finance</p>
                      </div>
                    )}
                    {finVerified && (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-green-600" />
                        <p className="text-xs font-semibold text-green-700">1st DP verified by Finance</p>
                      </div>
                    )}
                  </StageCard>

                  {/* Submit / Resubmit button */}
                  {docsReady && (!rs || rs === 'director-rejected') && (
                    <button
                      type="button"
                      onClick={handleSubmitForReview}
                      disabled={submitting}
                      className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 disabled:opacity-40 transition-opacity"
                    >
                      {submitting
                        ? 'Submitting…'
                        : rs === 'director-rejected'
                        ? 'Resubmit for Director Review'
                        : 'Submit for Director Review'}
                    </button>
                  )}

                  {/* Booking complete banner */}
                  {finVerified && (
                    <GlassCard className="px-4 py-4 flex items-center gap-3 bg-green-50">
                      <div className="w-10 h-10 rounded-2xl bg-green-500 flex items-center justify-center shrink-0">
                        <Check size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-800">Booking Complete</p>
                        <p className="text-xs text-green-600 mt-0.5">All stages verified successfully</p>
                      </div>
                    </GlassCard>
                  )}
                </>
              );
            })()}
          </>
        )}

      </div>
    </PageShell>
  );
}
