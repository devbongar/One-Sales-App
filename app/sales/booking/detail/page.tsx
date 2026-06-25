'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  getBookingProgress, saveBookingFlags, savePrivacyConsent, BookingProgress,
} from '@/lib/booking-progress';
import { deleteCoOwner } from '@/lib/co-owners';
import { deleteAttyInFact } from '@/lib/atty-in-fact';
import { generateCommissionSchedule } from '@/lib/commission';
import { withdrawSubmission, submitForReview, directorReview, amdReview } from '@/lib/review';
import { addActivityLog, getActivityLog, ActivityLogEntry } from '@/lib/activity-log';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { triggerEmails } from '@/lib/email';
import {
  Building2, Tag, User, ChevronRight,
  Lock, Check, FileText, Loader2, UserCheck, ShieldCheck, ShieldAlert, Heart,
  CheckCircle2, XCircle, Send, Clock, AlertTriangle, Eye, Banknote,
  RotateCcw, X, ThumbsUp, ThumbsDown, CalendarCheck,
} from 'lucide-react';

// ─── Sub-components ───────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

function StageCard({ number, title, icon, complete, locked, viewOnly, badge, children }: {
  number: number; title: string; icon?: React.ReactNode; complete: boolean;
  locked?: boolean; viewOnly?: boolean; badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentBorder = complete ? 'border-l-green-500' : locked ? 'border-l-[#D1D1D6]' : 'border-l-[#C03D25]';
  return (
    <GlassCard className={`overflow-hidden border-l-4 ${accentBorder} ${locked ? 'opacity-60' : ''}`}>
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-black/[0.06]">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-[#8E8E93] shrink-0">{icon}</span>}
          <p className="text-[15px] font-bold text-[#1C1C1E]">{title}</p>
        </div>
        {badge !== undefined ? badge : (
          complete  ? <CheckCircle2 size={16} className="text-green-500" />
          : locked  ? <Lock size={14} className="text-[#C7C7CC]" />
          : null
        )}
      </div>
      <div className="divide-y divide-black/[0.05]">{children}</div>
    </GlassCard>
  );
}

function StageRow({ icon, label, done, onTap, locked, viewOnly }: {
  icon: React.ReactNode; label: string; done: boolean; onTap?: () => void;
  locked?: boolean; viewOnly?: boolean;
}) {
  const canTap = !locked;
  return (
    <button type="button" onClick={canTap ? onTap : undefined}
      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${
        locked ? 'cursor-default' : 'active:bg-black/[0.03]'
      }`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
        done ? 'bg-green-500 border-green-500' : 'bg-transparent border-[#C7C7CC]'
      }`}>
        {done && <Check size={9} className="text-white" />}
      </div>
      <span className={`flex-1 text-sm font-medium text-left ${done ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
        {label}
      </span>
      {locked ? null
        : viewOnly ? <Eye size={13} className="text-[#C7C7CC]" />
        : <ChevronRight size={14} className="text-[#C7C7CC]" />
      }
    </button>
  );
}

// ─── Activity Log Row ────────────────────────────────────────────────────────

const LOG_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  'submitted':          { label: 'Submitted for Director Review',    color: 'text-[#3A3A3C]',  bg: 'bg-[#3A3A3C]',  icon: <Send size={9} className="text-white" /> },
  'resubmitted':        { label: 'Resubmitted for Director Review',  color: 'text-[#3A3A3C]',  bg: 'bg-[#3A3A3C]',  icon: <RotateCcw size={9} className="text-white" /> },
  'withdrawn':          { label: 'Submission Withdrawn',             color: 'text-[#3A3A3C]',  bg: 'bg-[#8E8E93]',  icon: <RotateCcw size={9} className="text-white" /> },
  'director-approved':  { label: 'Approved by Director',             color: 'text-[#1A7F37]',  bg: 'bg-[#1A7F37]',  icon: <ThumbsUp size={9} className="text-white" /> },
  'director-rejected':  { label: 'Rejected by Director',             color: 'text-[#C03D25]',  bg: 'bg-[#C03D25]',  icon: <ThumbsDown size={9} className="text-white" /> },
  'amd-approved':       { label: 'Approved by Account Management',   color: 'text-[#1A7F37]',  bg: 'bg-[#1A7F37]',  icon: <ThumbsUp size={9} className="text-white" /> },
  'amd-rejected':       { label: 'Rejected by Account Management',   color: 'text-[#C03D25]',  bg: 'bg-[#C03D25]',  icon: <ThumbsDown size={9} className="text-white" /> },
  'dp-verified':        { label: '1st DP Verified by Finance',        color: 'text-[#1A7F37]',  bg: 'bg-[#1A7F37]',  icon: <CheckCircle2 size={9} className="text-white" /> },
};

function ActivityLogRow({ entry }: { entry: ActivityLogEntry }) {
  const cfg = LOG_CONFIG[entry.action] ?? { label: entry.action, color: 'text-[#8E8E93]', bg: 'bg-[#C7C7CC]', icon: null };
  const d = new Date(entry.created_at);
  const ts = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
           + ', ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <div className="px-4 py-3 flex gap-3">
      <div className={`w-5 h-5 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</p>
          <span className="text-[10px] text-[#C7C7CC] shrink-0 mt-0.5">{ts}</span>
        </div>
        {entry.actor_name && (
          <p className="text-[11px] text-[#8E8E93] mt-0.5">{entry.actor_name}</p>
        )}
        {entry.comment && (
          <p className="text-xs text-[#3A3A3C] mt-1.5 bg-[#F2F2F7] rounded-xl px-3 py-2 leading-relaxed">
            &ldquo;{entry.comment}&rdquo;
          </p>
        )}
      </div>
    </div>
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
    status?: string; finance_status?: string | null;
  } | null>(null);
  const [financeStatus,      setFinanceStatus]      = useState<string | null>(null);
  const [reservationStatus,  setReservationStatus]  = useState<string | null>(null);
  const [directorFilled,     setDirectorFilled]     = useState(false);
  const [bookedAt,           setBookedAt]           = useState<string | null>(null);
  const [progress,        setProgress]        = useState<BookingProgress | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [hasCoOwnership,  setHasCoOwnership]  = useState(false);
  const [hasAttyInFact,   setHasAttyInFact]   = useState(false);
  const [savingFlags,     setSavingFlags]     = useState(false);
  const [commissionMissing,    setCommissionMissing]    = useState(false);
  const [generatingCommission, setGeneratingCommission] = useState(false);
  const [submitting,             setSubmitting]             = useState(false);
  const [withdrawing,            setWithdrawing]            = useState(false);
  const [showWithdrawConfirm,    setShowWithdrawConfirm]    = useState(false);
  const [userRoleName,           setUserRoleName]           = useState<string | null>(null);
  const [displayName,            setDisplayName]            = useState<string | null>(null);
  const [showRemoveCoOwnerConfirm, setShowRemoveCoOwnerConfirm] = useState(false);
  const [showRemoveAttyConfirm,    setShowRemoveAttyConfirm]    = useState(false);
  const [activityLog,            setActivityLog]            = useState<ActivityLogEntry[]>([]);
  const [logOpen,                setLogOpen]                = useState(false);
  const [showRejectSheet,        setShowRejectSheet]        = useState(false);
  const [rejectComment,          setRejectComment]          = useState('');
  const [showAMDApproveConfirm,  setShowAMDApproveConfirm]  = useState(false);
  const [showAMDRejectSheet,     setShowAMDRejectSheet]     = useState(false);
  const [amdRejectComment,       setAmdRejectComment]       = useState('');
  const [reviewing,              setReviewing]              = useState(false);

  // Privacy consent
  const [privacyConsent,  setPrivacyConsent]  = useState(false);
  const [signature,       setSignature]       = useState<string | null>(null);
  const [agreed,          setAgreed]          = useState(false);
  const [agreedEsig,      setAgreedEsig]      = useState(false);
  const [savingConsent,   setSavingConsent]   = useState(false);
  useEffect(() => {
    getSession().then(s => {
      setUserRoleName(s?.role_name ?? null);
      setDisplayName(s?.display_name || s?.full_name || null);
    });
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
      getActivityLog(r.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
      // Fetch finance_status, director_filled and check commission schedule if Booked
      supabase
        .from('reservations')
        .select('status, finance_status, director_filled, booked_at')
        .eq('reservation_id', r.reservation_id)
        .single()
        .then(({ data }) => {
          setFinanceStatus((data as any)?.finance_status ?? null);
          setReservationStatus((data as any)?.status ?? null);
          setDirectorFilled((data as any)?.director_filled ?? false);
          setBookedAt((data as any)?.booked_at ?? null);
          const fs = (data as any)?.finance_status ?? null;
          if (['rf-verified', 'dp-verified'].includes(fs) || data?.status === 'Booked') {
            supabase
              .from('commission_schedule')
              .select('id', { count: 'exact', head: true })
              .eq('reservation_id', r.reservation_id)
              .then(({ count }) => setCommissionMissing(!count || count === 0), () => {});
          }
        }, () => {});
    } else {
      setLoading(false);
    }
  }, []);

  async function handleGenerateCommission() {
    if (!reservation?.reservation_id) return;
    setGeneratingCommission(true);
    try {
      const result = await generateCommissionSchedule(reservation.reservation_id);
      if (result.ok) setCommissionMissing(false);
    } catch (e) {
      console.error('[commission] Generate failed:', e);
    } finally {
      setGeneratingCommission(false);
    }
  }

  async function handleSubmit() {
    if (!reservation?.reservation_id) return;
    setSubmitting(true);
    try {
      const prevStatus = progress?.booking_review_status;
      const isResubmit = prevStatus === 'director-rejected' || prevStatus === 'amd-rejected';
      await submitForReview(reservation.reservation_id);
      await addActivityLog(reservation.reservation_id, isResubmit ? 'resubmitted' : 'submitted', displayName).catch(e => console.error('[activity-log]', e));
      triggerEmails('on_docs_submitted', reservation.reservation_id).catch(e => console.error('[email-trigger]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: 'submitted' } : prev);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
    } catch (e) {
      console.error('[submit] Failed:', e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!reservation?.reservation_id) return;
    setWithdrawing(true);
    try {
      await withdrawSubmission(reservation.reservation_id);
      await addActivityLog(reservation.reservation_id, 'withdrawn', displayName).catch(e => console.error('[activity-log]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: null } : prev);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
    } catch (e) {
      console.error('[withdraw] Failed:', e);
    } finally {
      setWithdrawing(false);
      setShowWithdrawConfirm(false);
    }
  }

  async function handleDirectorSubmit() {
    if (!reservation?.reservation_id) return;
    setSubmitting(true);
    try {
      await directorReview(reservation.reservation_id, true);
      await supabase.from('reservations').update({ director_filled: true }).eq('reservation_id', reservation.reservation_id);
      setDirectorFilled(true);
      await addActivityLog(reservation.reservation_id, 'director-approved', displayName).catch(e => console.error('[activity-log]', e));
      triggerEmails('on_docs_submitted', reservation.reservation_id).catch(e => console.error('[email-trigger]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: 'director-approved' } : prev);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
    } catch (e) {
      console.error('[director-submit] Failed:', e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDirectorApprove() {
    if (!reservation?.reservation_id) return;
    setReviewing(true);
    try {
      await directorReview(reservation.reservation_id, true);
      await addActivityLog(reservation.reservation_id, 'director-approved', displayName).catch(e => console.error('[activity-log]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: 'director-approved' } : prev);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
    } catch (e) {
      console.error('[director-approve] Failed:', e);
    } finally {
      setReviewing(false);
    }
  }

  async function handleAMDApprove() {
    if (!reservation?.reservation_id) return;
    setReviewing(true);
    try {
      await amdReview(reservation.reservation_id, true);
      await addActivityLog(reservation.reservation_id, 'amd-approved', displayName).catch(e => console.error('[activity-log]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: 'amd-approved' } : prev);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
      // Refresh status + booked_at so the hero card shows Booked badge immediately
      Promise.resolve(
        supabase
          .from('reservations')
          .select('status, booked_at')
          .eq('reservation_id', reservation.reservation_id)
          .single()
      ).then(({ data }) => {
        if (data) {
          setReservationStatus((data as any).status ?? null);
          setBookedAt((data as any).booked_at ?? null);
        }
      }).catch(e => console.error('[amd-approve] status refresh failed:', e));
    } catch (e) {
      console.error('[amd-approve] Failed:', e);
    } finally {
      setReviewing(false);
      setShowAMDApproveConfirm(false);
    }
  }

  async function handleAMDReject() {
    if (!reservation?.reservation_id || !amdRejectComment.trim()) return;
    setReviewing(true);
    try {
      await amdReview(reservation.reservation_id, false, amdRejectComment.trim());
      await addActivityLog(reservation.reservation_id, 'amd-rejected', displayName, amdRejectComment.trim()).catch(e => console.error('[activity-log]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: 'amd-rejected', amd_notes: amdRejectComment.trim() } : null);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
      setShowAMDRejectSheet(false);
      setAmdRejectComment('');
    } catch (e) {
      console.error('[amd-reject] Failed:', e);
    } finally {
      setReviewing(false);
    }
  }

  async function handleDirectorReject() {
    if (!reservation?.reservation_id || !rejectComment.trim()) return;
    setReviewing(true);
    try {
      await directorReview(reservation.reservation_id, false, rejectComment.trim());
      await addActivityLog(reservation.reservation_id, 'director-rejected', displayName, rejectComment.trim()).catch(e => console.error('[activity-log]', e));
      setProgress(prev => prev ? { ...prev, booking_review_status: 'director-rejected', director_notes: rejectComment.trim() } : prev);
      getActivityLog(reservation.reservation_id).then(setActivityLog).catch(e => console.error('[activity-log]', e));
      setShowRejectSheet(false);
      setRejectComment('');
    } catch (e) {
      console.error('[director-reject] Failed:', e);
    } finally {
      setReviewing(false);
    }
  }

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

  async function toggleCoOwner() {
    const next = !hasCoOwnership;
    // Turning off with saved data → show confirmation first
    if (!next && progress?.co_owner_saved) { setShowRemoveCoOwnerConfirm(true); return; }
    setSavingFlags(true);
    try {
      await saveBookingFlags(reservation?.reservation_id ?? '', next, hasAttyInFact);
      setHasCoOwnership(next);
    } catch (err) { console.error(err); }
    finally { setSavingFlags(false); }
  }

  async function confirmRemoveCoOwner() {
    setShowRemoveCoOwnerConfirm(false);
    setSavingFlags(true);
    try {
      await deleteCoOwner(reservation?.reservation_id ?? '');
      await saveBookingFlags(reservation?.reservation_id ?? '', false, hasAttyInFact);
      await supabase.from('reservations').update({ co_owner_info_saved: false }).eq('reservation_id', reservation?.reservation_id ?? '');
      setHasCoOwnership(false);
      setProgress(prev => prev ? { ...prev, co_owner_saved: false } : prev);
    } catch (err) { console.error(err); }
    finally { setSavingFlags(false); }
  }

  async function toggleAttyInFact() {
    const next = !hasAttyInFact;
    // Turning off with saved data → show confirmation first
    if (!next && progress?.atty_saved) { setShowRemoveAttyConfirm(true); return; }
    setSavingFlags(true);
    try {
      await saveBookingFlags(reservation?.reservation_id ?? '', hasCoOwnership, next);
      setHasAttyInFact(next);
    } catch (err) { console.error(err); }
    finally { setSavingFlags(false); }
  }

  async function confirmRemoveAtty() {
    setShowRemoveAttyConfirm(false);
    setSavingFlags(true);
    try {
      await deleteAttyInFact(reservation?.reservation_id ?? '');
      await saveBookingFlags(reservation?.reservation_id ?? '', hasCoOwnership, false);
      await supabase.from('reservations').update({ atty_info_saved: false }).eq('reservation_id', reservation?.reservation_id ?? '');
      setHasAttyInFact(false);
      setProgress(prev => prev ? { ...prev, atty_saved: false } : prev);
    } catch (err) { console.error(err); }
    finally { setSavingFlags(false); }
  }

  const stage1Complete = progress
    ? progress.buyer_info_saved
      && (!progress.has_spouse  || progress.spouse_saved)
      && (!hasCoOwnership       || progress.co_owner_saved)
      && (!hasAttyInFact        || progress.atty_saved)
    : false;

  const rs           = progress?.booking_review_status ?? null;
  const docsReady    = progress?.documents_saved ?? false;
  const dirApproved  = docsReady && (rs === 'director-approved' || rs === 'amd-approved');
  const amdApproved  = docsReady && rs === 'amd-approved';
  const rfVerified   = financeStatus === 'rf-verified' || financeStatus === 'dp-verified';
  const dpVerified   = financeStatus === 'dp-verified';
  const rfRejected   = financeStatus === 'rf-rejected';
  const proofPending = financeStatus === 'proof-submitted';
  const isBooked     = reservationStatus === 'Booked';
  const isAllAccess    = userRoleName === 'All Access';
  const isDirector     = userRoleName === 'Sales Director' || isAllAccess;
  const isAMD          = userRoleName === 'Account Management';
  // Stage 1 locked for pure AMD role only — All Access can still fill the form
  const stage1Locked   = userRoleName === 'Account Management' || rs === 'submitted' || dirApproved;
  const stage2Complete = docsReady;
  const currentStage   = !stage1Complete ? 1 : !stage2Complete ? 2 : !dirApproved ? 3 : !amdApproved ? 4 : 5;

  function goToBuyerInfo() {
    if (stage1Locked) sessionStorage.setItem('booking_view_only', '1');
    else sessionStorage.removeItem('booking_view_only');
    router.push('/sales/booking/buyer-info');
  }
  function goToSpouse() {
    if (stage1Locked) sessionStorage.setItem('booking_view_only', '1');
    else sessionStorage.removeItem('booking_view_only');
    router.push('/sales/booking/spouse');
  }
  function goToCoOwner() {
    sessionStorage.setItem('coowner_hasAttyInFact', hasAttyInFact ? '1' : '0');
    if (stage1Locked) sessionStorage.setItem('booking_view_only', '1');
    else sessionStorage.removeItem('booking_view_only');
    router.push('/sales/booking/co-owner');
  }
  function goToAttyInFact() {
    sessionStorage.setItem('atty_hasCoOwnership', hasCoOwnership ? '1' : '0');
    if (stage1Locked) sessionStorage.setItem('booking_view_only', '1');
    else sessionStorage.removeItem('booking_view_only');
    router.push('/sales/booking/atty-in-fact');
  }
  function goToDocuments() {
    if (stage1Locked) sessionStorage.setItem('booking_view_only', '1');
    else sessionStorage.removeItem('booking_view_only');
    router.push('/sales/booking/documents');
  }

  return (
    <PageShell title="Booking" backButton onBack={() => router.push('/sales/booking')}>
      <div className="space-y-4 pb-6">

        {/* Reservation hero card */}
        <GlassCard className="overflow-hidden">
          <div className="px-4 py-4 flex items-center gap-4 relative">
            {isBooked && privacyConsent && (
              <div className="absolute top-1 right-2 pointer-events-none select-none" style={{ transform: 'rotate(-8deg)' }}>
                <svg width="72" height="72" viewBox="0 0 72 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Ring */}
                  <circle cx="36" cy="7" r="5" stroke="#e03322" strokeWidth="2.5" fill="none" />
                  {/* Cord left */}
                  <line x1="32" y1="11" x2="16" y2="26" stroke="#e03322" strokeWidth="2" strokeLinecap="round" />
                  {/* Cord right */}
                  <line x1="40" y1="11" x2="56" y2="26" stroke="#e03322" strokeWidth="2" strokeLinecap="round" />
                  {/* Attachment dots */}
                  <circle cx="16" cy="27" r="3" fill="white" />
                  <circle cx="56" cy="27" r="3" fill="white" />
                  {/* Sign body */}
                  <rect x="4" y="22" width="64" height="50" rx="7" fill="#e03322" />
                  {/* BOOKED text */}
                  <text x="36" y="53" textAnchor="middle" fill="white" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="13" letterSpacing="1.5">BOOKED</text>
                </svg>
              </div>
            )}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
            >
              <span className="text-lg font-bold text-white">
                {getInitials(reservation?.client_name ?? '?')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Reservation ID</p>
              <p className="text-lg font-bold text-[#1C1C1E] truncate">{reservation?.reservation_id ?? '—'}</p>
              <p className="text-sm text-[#6C6C70] truncate">{reservation?.client_name ?? '—'}</p>
            </div>
            {progress && !isBooked && !rfVerified && (() => {
              if (amdApproved)  return <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#34C759]/15 text-[#1A7F37]"><CheckCircle2 size={9} /> AMD Approved</span>;
              if (dirApproved)  return <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#007AFF]/12 text-[#0058C9]"><ThumbsUp size={9} /> SD Approved</span>;
              if (rs === 'submitted' || rs === 'resubmitted') return <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF9500]/12 text-[#A05A00]"><Send size={9} /> Submitted</span>;
              return null;
            })()}
          </div>
          <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Building2 size={12} className="text-[#C7C7CC]" />
              <span className="text-xs text-[#6C6C70]">{reservation?.project ?? '—'}</span>
            </div>
            {reservation?.inventory_code && (
              <div className="flex items-center gap-1.5">
                <Tag size={12} className="text-[#C7C7CC]" />
                <span className="text-xs font-medium text-[#6C6C70]">{reservation.inventory_code}</span>
              </div>
            )}
          </div>
          {isBooked && bookedAt && (
            <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center gap-1.5">
              <CalendarCheck size={12} className="text-[#C7C7CC]" />
              <span className="text-xs text-[#6C6C70]">Booked</span>
              <span className="text-xs font-medium text-[#1C1C1E] ml-auto">{new Date(bookedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
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
            {/* Progress stepper */}
            <GlassCard className="px-4 pt-4 pb-3.5">
              {/* Main sequential track */}
              <div className="flex items-center justify-between px-1">
                {[
                  { label: 'Buyer Info', icon: <User size={14} />,         done: stage1Complete },
                  { label: 'Documents',  icon: <FileText size={14} />,     done: stage2Complete },
                  { label: 'Director',   icon: <ShieldCheck size={14} />,  done: dirApproved },
                  { label: 'AMD',        icon: <CheckCircle2 size={14} />, done: amdApproved },
                ].map((s, i, arr) => {
                  const isActive = currentStage === i + 1;
                  return (
                    <div key={i} className="flex flex-col items-center flex-1">
                      <div className="flex items-center w-full">
                        <div className={`flex-1 h-0.5 ${i === 0 ? 'opacity-0' : s.done || isActive ? 'bg-[#C03D25]' : 'bg-[#E5E5EA]'}`} />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-200 ${
                          s.done   ? 'bg-[#C03D25] border-[#C03D25] shadow-[0_2px_8px_rgba(192,61,37,0.35)]'
                          : isActive ? 'bg-white border-[#C03D25] shadow-[0_2px_8px_rgba(192,61,37,0.25)]'
                          :            'bg-white border-[#E5E5EA]'
                        }`}>
                          {s.done
                            ? <Check size={14} className="text-white" />
                            : <span className={isActive ? 'text-[#C03D25]' : 'text-[#C7C7CC]'}>{s.icon}</span>
                          }
                        </div>
                        <div className={`flex-1 h-0.5 ${i === arr.length - 1 ? 'opacity-0' : s.done ? 'bg-[#C03D25]' : 'bg-[#E5E5EA]'}`} />
                      </div>
                      <span className={`text-[10px] mt-1.5 font-semibold text-center leading-tight ${
                        isActive ? 'text-[#C03D25]' : s.done ? 'text-[#6C6C70]' : 'text-[#C7C7CC]'
                      }`}>{s.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Finance parallel track */}
              <div className="mt-3 pt-2.5 border-t border-black/[0.06] flex items-center gap-1.5">
                <div style={{ width: 12, height: 1, background: 'repeating-linear-gradient(to right, #C7C7CC 0, #C7C7CC 2px, transparent 2px, transparent 5px)' }} />
                <ChevronRight size={8} className="text-[#C7C7CC]" style={{ marginLeft: -2 }} />
                <Banknote size={11} className={
                  rfRejected   ? 'text-[#FF3B30]'
                  : dpVerified   ? 'text-[#34C759]'
                  : rfVerified   ? 'text-[#FF9500]'
                  : proofPending ? 'text-[#FF9500]'
                  : 'text-[#C7C7CC]'
                } />
                <span className={`text-[9px] font-medium ${
                  rfRejected   ? 'text-[#FF3B30]'
                  : dpVerified   ? 'text-[#1A7F37]'
                  : rfVerified   ? 'text-[#A05A00]'
                  : proofPending ? 'text-[#A05A00]'
                  : 'text-[#8E8E93]'
                }`}>
                  Finance ·{' '}
                  {dpVerified   ? '1st DP Verified'
                  : rfVerified   ? 'Awaiting 1st DP'
                  : rfRejected   ? 'RF Rejected'
                  : proofPending ? 'Pending RF'
                  : 'Awaiting Proof'}
                </span>
                <span className="ml-auto text-[9px] font-medium uppercase tracking-wider text-[#C7C7CC]">parallel</span>
              </div>

            </GlassCard>

            {/* Stage 1 — Buyer's Information */}
            <StageCard number={1} title="Buyer's Information" icon={<User size={15} />} complete={stage1Complete} viewOnly={stage1Locked}>
              {!isAMD && (
                <>
                  <ToggleRow
                    icon={<UserCheck size={15} />}
                    label="Has Co-Owner?"
                    value={hasCoOwnership}
                    onToggle={toggleCoOwner}
                    locked={stage1Locked}
                    saving={savingFlags}
                  />
                  <ToggleRow
                    icon={<ShieldCheck size={15} />}
                    label="Has Attorney in Fact?"
                    value={hasAttyInFact}
                    onToggle={toggleAttyInFact}
                    locked={stage1Locked}
                    saving={savingFlags}
                  />
                </>
              )}
              <div className="h-px bg-black/[0.06]" />
              <StageRow
                icon={<User size={14} />}
                label="Personal Information"
                done={progress?.buyer_info_saved ?? false}
                viewOnly={stage1Locked}
                onTap={goToBuyerInfo}
              />
              {progress?.has_spouse && (
                <StageRow
                  icon={<Heart size={14} />}
                  label="Spouse Information"
                  done={progress?.spouse_saved ?? false}
                  viewOnly={stage1Locked}
                  onTap={goToSpouse}
                />
              )}
              {hasCoOwnership && (
                <StageRow
                  icon={<UserCheck size={14} />}
                  label="Co-Owner Information"
                  done={progress?.co_owner_saved ?? false}
                  viewOnly={stage1Locked}
                  onTap={goToCoOwner}
                />
              )}
              {hasAttyInFact && (
                <StageRow
                  icon={<ShieldCheck size={14} />}
                  label="Attorney in Fact"
                  done={progress?.atty_saved ?? false}
                  viewOnly={stage1Locked}
                  onTap={goToAttyInFact}
                />
              )}
            </StageCard>

            {/* Connector 1→2 */}
            <div style={{ paddingLeft: 31, marginTop: -2, marginBottom: -2 }}>
              <div style={{ width: 2, height: 14, background: 'repeating-linear-gradient(to bottom, #C7C7CC 0, #C7C7CC 3px, transparent 3px, transparent 6px)' }} />
            </div>

            {/* Stage 2 — Required Documents */}
            <StageCard
              number={2}
              title="Required Documents"
              icon={<FileText size={15} />}
              complete={stage2Complete}
              locked={!stage1Complete && !stage1Locked}
              viewOnly={stage1Complete && stage1Locked}
            >
              <StageRow
                icon={<FileText size={14} />}
                label="Upload Documents"
                done={stage2Complete}
                locked={!stage1Complete && !stage1Locked}
                viewOnly={stage1Complete && stage1Locked}
                onTap={goToDocuments}
              />
            </StageCard>

            {/* ── Review Pipeline (director, AMD & post-approval) ── */}
            {(isDirector || isAMD || isAllAccess || dirApproved) && (
                <>


                  {/* Director approval status — visible to AMD and All Access */}
                  {(isAMD || isAllAccess) && (rs === 'director-approved' || rs === 'amd-approved') && (
                    <GlassCard className="px-4 py-3 flex items-center gap-2.5 border border-green-200 bg-green-50/60">
                      <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-green-700">Approved by Sales Director</p>
                        <p className="text-[10px] text-green-600 mt-0.5">Forwarded for Account Management review</p>
                      </div>
                    </GlassCard>
                  )}

                  {/* Booking complete banner */}
                  {isBooked && (
                    <GlassCard className="px-4 py-4 flex items-center gap-3 bg-green-500/[0.07] border border-green-500/20">
                      <div className="w-10 h-10 rounded-2xl bg-green-500 flex items-center justify-center shrink-0">
                        <Check size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1C1C1E]">Booking Complete</p>
                        <p className="text-xs text-green-700 mt-0.5">All stages verified successfully</p>
                      </div>
                    </GlassCard>
                  )}

                  {/* Commission schedule missing warning */}
                  {commissionMissing && (
                    <GlassCard className="px-4 py-4 flex items-start gap-3 bg-amber-50 border border-amber-200">
                      <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-amber-800">Commission Schedule Not Generated</p>
                        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                          No commission tranching schedule is configured for this project and seller type. Contact admin to set it up, then tap Generate.
                        </p>
                        <button
                          type="button"
                          disabled={generatingCommission}
                          onClick={handleGenerateCommission}
                          className="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold active:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {generatingCommission
                            ? <><Loader2 size={11} className="animate-spin" /> Generating...</>
                            : 'Generate Now'
                          }
                        </button>
                      </div>
                    </GlassCard>
                  )}
                </>
            )}

            {/* ── Activity Log (collapsible) ── */}
            <GlassCard className="overflow-hidden">
              <button
                type="button"
                onClick={() => setLogOpen(o => !o)}
                className="w-full px-4 py-3 flex items-center justify-between bg-[#F2F2F7]/60 active:bg-black/[0.03]"
              >
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Activity Log</p>
                  {activityLog.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C03D25]/10 text-[#C03D25]">
                      {activityLog.length}
                    </span>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  className="text-[#C7C7CC] transition-transform duration-200"
                  style={{ transform: logOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                />
              </button>
              <div
                className="grid transition-all duration-300"
                style={{ gridTemplateRows: logOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  {activityLog.length > 0 ? (
                    <div className="divide-y divide-black/[0.05] border-t border-black/[0.06]">
                      {activityLog.map(entry => (
                        <ActivityLogRow key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-5 flex items-center gap-2.5 border-t border-black/[0.06]">
                      <Clock size={13} className="text-[#C7C7CC] shrink-0" />
                      <p className="text-xs text-[#C7C7CC]">No activity yet — actions will appear here.</p>
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>

            {/* ── Director Review actions ── */}
            {isDirector && rs === 'submitted' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => setShowRejectSheet(true)}
                  className="flex-1 py-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold border border-red-200 active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ThumbsDown size={15} /> Reject
                </button>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={handleDirectorApprove}
                  className="flex-1 py-4 rounded-2xl bg-green-500 text-white text-sm font-bold shadow-[0_4px_16px_rgba(34,197,94,0.3)] active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {reviewing ? <Loader2 size={15} className="animate-spin" /> : <ThumbsUp size={15} />}
                  Approve
                </button>
              </div>
            )}

            {/* ── AMD Review actions ── */}
            {(isAMD || isAllAccess) && rs === 'director-approved' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => setShowAMDRejectSheet(true)}
                  className="flex-1 py-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold border border-red-200 active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ThumbsDown size={15} /> Reject
                </button>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => setShowAMDApproveConfirm(true)}
                  className="flex-1 py-4 rounded-2xl bg-green-500 text-white text-sm font-bold shadow-[0_4px_16px_rgba(34,197,94,0.3)] active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {reviewing ? <Loader2 size={15} className="animate-spin" /> : <ThumbsUp size={15} />}
                  Approve
                </button>
              </div>
            )}

            {/* ── Director submit / resubmit directly to AMD ── */}
            {isDirector && !isAllAccess && docsReady && (rs === null || (rs === 'amd-rejected' && directorFilled)) && (
              <div className="space-y-3">
                {rs === 'amd-rejected' && (
                  <GlassCard className="px-4 py-3 space-y-2 overflow-hidden border border-red-200">
                    <div className="flex items-center gap-2">
                      <XCircle size={13} className="text-red-500" />
                      <p className="text-xs font-semibold text-red-600">Rejected by Account Management</p>
                    </div>
                    {progress?.amd_notes && (
                      <p className="text-xs text-[#3A3A3C] bg-red-50 rounded-xl px-3 py-2 leading-relaxed">
                        {progress.amd_notes}
                      </p>
                    )}
                  </GlassCard>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDirectorSubmit}
                  className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.3)] active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                    : <><Send size={15} /> {rs === 'amd-rejected' ? 'Resubmit to AMD' : 'Submit to AMD'}</>
                  }
                </button>
              </div>
            )}

            {/* ── Submit / Recall area (agents only) ── */}
            {(!isDirector || isAllAccess) && !isAMD && !dirApproved && (
              <div className="space-y-3">
                {rs === 'director-rejected' && (
                  <GlassCard className="px-4 py-3 space-y-2 overflow-hidden border border-red-200">
                    <div className="flex items-center gap-2">
                      <XCircle size={13} className="text-red-500" />
                      <p className="text-xs font-semibold text-red-600">Rejected by Sales Director</p>
                    </div>
                    {progress?.director_notes && (
                      <p className="text-xs text-[#3A3A3C] bg-red-50 rounded-xl px-3 py-2 leading-relaxed">
                        {progress.director_notes}
                      </p>
                    )}
                  </GlassCard>
                )}

                {rs === 'amd-rejected' && (
                  <GlassCard className="px-4 py-3 space-y-2 overflow-hidden border border-red-200">
                    <div className="flex items-center gap-2">
                      <XCircle size={13} className="text-red-500" />
                      <p className="text-xs font-semibold text-red-600">Rejected by Account Management</p>
                    </div>
                    {progress?.amd_notes && (
                      <p className="text-xs text-[#3A3A3C] bg-red-50 rounded-xl px-3 py-2 leading-relaxed">
                        {progress.amd_notes}
                      </p>
                    )}
                  </GlassCard>
                )}

                {(rs === null || rs === 'director-rejected' || rs === 'amd-rejected') && (
                  <button
                    type="button"
                    disabled={!docsReady || submitting}
                    onClick={handleSubmit}
                    className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.3)] active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {submitting
                      ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                      : <><Send size={15} /> Submit for Review</>
                    }
                  </button>
                )}

                {rs === 'submitted' && (
                  <button
                    type="button"
                    disabled={withdrawing}
                    onClick={() => setShowWithdrawConfirm(true)}
                    className="w-full py-4 rounded-2xl bg-amber-500 text-white text-sm font-bold shadow-[0_4px_16px_rgba(245,158,11,0.3)] active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {withdrawing
                      ? <><Loader2 size={15} className="animate-spin" /> Recalling…</>
                      : <><RotateCcw size={15} /> Recall Submission</>
                    }
                  </button>
                )}
              </div>
            )}
          </>
        )}

      </div>

      {/* Remove Co-Owner Confirmation Modal */}
      {showRemoveCoOwnerConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Remove Co-Owner?</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                This will discard all saved co-owner information. This action cannot be undone.
              </p>
            </div>
            <button type="button" onClick={confirmRemoveCoOwner}
              className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80">
              Yes, Remove Co-Owner
            </button>
            <button type="button" onClick={() => setShowRemoveCoOwnerConfirm(false)}
              className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Remove Attorney in Fact Confirmation Modal */}
      {showRemoveAttyConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Remove Attorney in Fact?</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                This will discard all saved attorney in fact information. This action cannot be undone.
              </p>
            </div>
            <button type="button" onClick={confirmRemoveAtty}
              className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80">
              Yes, Remove Attorney in Fact
            </button>
            <button type="button" onClick={() => setShowRemoveAttyConfirm(false)}
              className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Confirmation Modal */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Withdraw Submission?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This will recall the submission from the director's queue. You can then edit buyer information and resubmit.
              </p>
            </div>
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={withdrawing}
                onClick={handleWithdraw}
                className="w-full py-3.5 rounded-2xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80"
              >
                {withdrawing
                  ? <><Loader2 size={15} className="animate-spin" /> Withdrawing...</>
                  : 'Yes, Withdraw'
                }
              </button>
              <button
                type="button"
                disabled={withdrawing}
                onClick={() => setShowWithdrawConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Sheet */}
      {showRejectSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-[#1C1C1E]">Reject Booking</p>
              <button
                onClick={() => { setShowRejectSheet(false); setRejectComment(''); }}
                className="w-8 h-8 rounded-xl bg-[#F2F2F7] flex items-center justify-center active:opacity-70"
              >
                <X size={16} className="text-[#8E8E93]" />
              </button>
            </div>
            <p className="text-sm text-[#8E8E93] leading-relaxed">
              Provide a reason for rejection. The sales agent will see this comment and can then edit and resubmit the booking.
            </p>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="e.g. Buyer's TIN is incorrect, please verify before resubmitting."
              rows={4}
              className="w-full rounded-2xl border border-black/[0.10] bg-[#F2F2F7] px-4 py-3 text-sm text-[#1C1C1E] placeholder:text-[#C7C7CC] resize-none focus:outline-none focus:ring-2 focus:ring-[#C03D25]/30"
            />
            <button
              type="button"
              disabled={reviewing || !rejectComment.trim()}
              onClick={handleDirectorReject}
              className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {reviewing
                ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                : 'Confirm Rejection'
              }
            </button>
          </div>
        </div>
      )}

      {/* AMD Approve Confirmation Modal */}
      {showAMDApproveConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <ThumbsUp size={24} className="text-green-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Approve Booking?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This will AMD-approve the booking and forward it to Finance.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{reservation?.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{reservation?.client_name}</span>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowAMDApproveConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-[#F2F2F7] text-[#3A3A3C] text-sm font-semibold active:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => { setShowAMDApproveConfirm(false); handleAMDApprove(); }}
                className="flex-1 py-3 rounded-2xl bg-green-500 text-white text-sm font-bold shadow-[0_4px_12px_rgba(34,197,94,0.3)] active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {reviewing ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AMD Reject Sheet */}
      {showAMDRejectSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-[#1C1C1E]">Reject Booking</p>
              <button
                onClick={() => { setShowAMDRejectSheet(false); setAmdRejectComment(''); }}
                className="w-8 h-8 rounded-xl bg-[#F2F2F7] flex items-center justify-center active:opacity-70"
              >
                <X size={16} className="text-[#8E8E93]" />
              </button>
            </div>
            <p className="text-sm text-[#8E8E93] leading-relaxed">
              Provide a reason for rejection. The sales agent will see this comment and can then edit and resubmit the booking.
            </p>
            <textarea
              value={amdRejectComment}
              onChange={e => setAmdRejectComment(e.target.value)}
              placeholder="e.g. Supporting documents are incomplete. Please recheck and resubmit."
              rows={4}
              className="w-full rounded-2xl border border-black/[0.10] bg-[#F2F2F7] px-4 py-3 text-sm text-[#1C1C1E] placeholder:text-[#C7C7CC] resize-none focus:outline-none focus:ring-2 focus:ring-[#C03D25]/30"
            />
            <button
              type="button"
              disabled={reviewing || !amdRejectComment.trim()}
              onClick={handleAMDReject}
              className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {reviewing
                ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                : 'Confirm Rejection'
              }
            </button>
          </div>
        </div>
      )}

    </PageShell>
  );
}
