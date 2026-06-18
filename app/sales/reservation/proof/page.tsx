'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  Receipt, CalendarDays, Upload, Camera, ScanLine,
  ImagePlus, X, AlertTriangle, Loader2, Check, CheckCircle2,
  User, Building2, Tag, LayoutGrid, BadgeCheck, FileText,
  ChevronDown, CreditCard, ShieldCheck, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateReservationId, saveReservation, uploadPaymentProof, uploadDocumentFile, updateReservationPayment, updateReservationStatus } from '@/lib/reservations';
import { generateReceivableLines } from '@/lib/receivables';
import { updateInventoryUnitStatus } from '@/lib/inventory';
import { markQuotationConverted } from '@/lib/quotations';
import { triggerEmails } from '@/lib/email';

const MAX_FILES     = 5;
const MAX_DOC_FILES = 3;

const RESERVATION_PAYMENT_MODES = [
  'Debit/ Credit Card',
  'Bills Payment',
] as const;

const PAYMENT_MODES = [
  'Post-Dated Checks (PDC)',
  'Straight Cash or Check Payment',
  'Auto-Debit Arrangement (ADA)',
] as const;

const ADA_BANKS = [
  'Aqwire Payment',
  'Bank of the Philippine Islands (BPI)',
  'BDO Unibank Inc. (BDO)',
  'China Banking Corporation (CBC)',
  'Philippine National Bank (PNB)',
] as const;

type UploadTarget = 'payment' | 'valid-id' | 'fdp';

interface SelectedReservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  status: string;
  finance_status: string | null;
  seller_name: string | null;
  payment_proof_url: string | null;
  created_at: string | null;
}

function daysElapsedLabel(createdAt: string | null): string {
  if (!createdAt) return '';
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days === 0) return 'Reserved today';
  if (days === 1) return '1 day reserved';
  if (days < 7)  return `${days} days reserved`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} wk${w > 1 ? 's' : ''} reserved`; }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} mo reserved`; }
  const y = Math.floor(days / 365); return `${y} yr${y > 1 ? 's' : ''} reserved`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function compressImage(file: File, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        blob => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Compression failed')); },
        'image/jpeg', quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

interface UploadedFile { blob: Blob; name: string; preview: string; }
type UploadOption = 'camera-photo' | 'camera-scan' | 'gallery';

// Thumbnail for an already-uploaded URL (no blob, just a remote URL)
function ExistingThumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <div className="relative aspect-square rounded-xl overflow-hidden border border-black/[0.08]">
      {isPdf ? (
        <div className="w-full h-full bg-[#F2F2F7] flex flex-col items-center justify-center gap-1">
          <FileText size={22} className="text-[#C03D25]" />
          <span className="text-[9px] font-semibold text-[#8E8E93]">PDF</span>
        </div>
      ) : (
        <img src={url} alt="uploaded" className="w-full h-full object-cover" />
      )}
      <button type="button" onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
        <X size={10} className="text-white" />
      </button>
    </div>
  );
}

export default function ProofOfPaymentPage() {
  const router = useRouter();
  const [reservationId, setReservationId] = useState('');
  const [reservation,   setReservation]   = useState<SelectedReservation | null>(null);
  const [fromList,      setFromList]      = useState(false);
  const [paymentDate,   setPaymentDate]   = useState(today());

  // New-blob uploads
  const [files,       setFiles]       = useState<UploadedFile[]>([]);
  const [validIdFiles, setValidIdFiles] = useState<UploadedFile[]>([]);
  const [fdpFiles,     setFdpFiles]    = useState<UploadedFile[]>([]);

  // Existing remote URLs (pre-loaded on edit)
  const [existingPaymentUrls, setExistingPaymentUrls] = useState<string[]>([]);
  const [existingValidIdUrls, setExistingValidIdUrls] = useState<string[]>([]);
  const [existingFdpUrls,     setExistingFdpUrls]     = useState<string[]>([]);

  // First payment agreed flag (loaded from DB)
  const [firstPaymentAgreed, setFirstPaymentAgreed] = useState(false);
  // Preserved (not displayed — managed by booking documents page)
  const [preservedBillingUrls, setPreservedBillingUrls] = useState<string[]>([]);
  const [preservedIncomeUrls,  setPreservedIncomeUrls]  = useState<string[]>([]);

  const [financeRejectionReason, setFinanceRejectionReason] = useState('');
  const [reservationPaymentMode,   setReservationPaymentMode]   = useState('');
  const [rfModeDropdownOpen,       setRfModeDropdownOpen]       = useState(false);
  const [subsequentMode,      setSubsequentMode]      = useState('');
  const [adaBank,             setAdaBank]             = useState('');
  const [modeDropdownOpen,    setModeDropdownOpen]    = useState(false);
  const [adaBankDropdownOpen, setAdaBankDropdownOpen] = useState(false);
  const [showOptions,         setShowOptions]         = useState(false);
  const [activeUploadTarget,  setActiveUploadTarget]  = useState<UploadTarget>('payment');
  const [showConfirm,         setShowConfirm]         = useState(false);
  const [saving,              setSaving]              = useState(false);
  const [saveError,           setSaveError]           = useState('');
  const [lightboxUrl,         setLightboxUrl]         = useState<string | null>(null);

  // Paid-view actions
  const [editMode,          setEditMode]          = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [recalling,         setRecalling]         = useState(false);
  const [cancelling,        setCancelling]        = useState(false);
  const [resubmitting,      setResubmitting]      = useState(false);
  const [actionError,       setActionError]       = useState('');

  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraScanRef  = useRef<HTMLInputElement>(null);
  const galleryRef     = useRef<HTMLInputElement>(null);

  const alreadyPaid = reservation?.status === 'Reserved' || reservation?.status === 'Booked';
  const isBooked    = reservation?.status === 'Booked';
  const isApproved  = reservation?.finance_status === 'rf-verified' || reservation?.finance_status === 'dp-verified';

  useEffect(() => {
    const id  = sessionStorage.getItem('currentReservationId');
    if (id) setReservationId(id);
    const raw = sessionStorage.getItem('selectedReservation');
    if (raw) { try { setReservation(JSON.parse(raw)); } catch {} }
    setFromList(sessionStorage.getItem('proofEntrySource') === 'list');

    // Always fetch fresh status from DB to avoid stale sessionStorage
    if (id) {
      supabase.from('reservations')
        .select('status, finance_status, first_payment_agreed, created_at')
        .eq('reservation_id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            setReservation(prev => prev ? { ...prev, status: data.status, finance_status: data.finance_status, created_at: data.created_at ?? null } : prev);
            setFirstPaymentAgreed(data.first_payment_agreed ?? false);
          }
        });
    }
  }, []);

  // ── Shared helper: fetch full row and populate all existing-URL + payment states ──
  async function loadExistingData(id: string) {
    const { data, error } = await supabase
      .from('reservations')
      .select('subsequent_mode, ada_bank, payment_proof_url, proof_of_billing_urls, proof_of_income_urls, proof_of_valid_id_urls, payment_date, rf_payment_mode, proof_of_fdp_urls, finance_rejection_reason')
      .eq('reservation_id', id)
      .single();
    if (error) throw error;
    if (!data) return;
    const parse = (v: string | null): string[] => {
      try { return JSON.parse(v ?? '[]') ?? []; } catch { return []; }
    };
    setFinanceRejectionReason(data.finance_rejection_reason ?? '');
    setReservationPaymentMode(data.rf_payment_mode ?? '');
    setSubsequentMode(data.subsequent_mode ?? '');
    setAdaBank(data.ada_bank ?? '');
    if (data.payment_date) setPaymentDate(data.payment_date);
    setExistingPaymentUrls(parse(data.payment_proof_url));
    setPreservedBillingUrls(parse(data.proof_of_billing_urls));
    setPreservedIncomeUrls(parse(data.proof_of_income_urls));
    setExistingValidIdUrls(parse(data.proof_of_valid_id_urls));
    setExistingFdpUrls(parse(data.proof_of_fdp_urls));
  }

  // ── Auto-fetch when viewing a paid / pending-review / booked reservation ──
  useEffect(() => {
    if (!reservationId || (reservation?.status !== 'Reserved' && reservation?.status !== 'Booked')) return;
    loadExistingData(reservationId).catch(e => console.error('[auto-fetch]', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, reservation?.status]);

  // ── File upload handling ──
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;

    const maxAllowed   = activeUploadTarget === 'payment' ? MAX_FILES : MAX_DOC_FILES;
    const existingCount =
      activeUploadTarget === 'payment' ? existingPaymentUrls.length :
      activeUploadTarget === 'fdp'     ? existingFdpUrls.length :
      existingValidIdUrls.length;
    const newCount =
      activeUploadTarget === 'payment' ? files.length :
      activeUploadTarget === 'fdp'     ? fdpFiles.length :
      validIdFiles.length;

    const remaining  = maxAllowed - existingCount - newCount;
    const toProcess  = selected.slice(0, remaining);

    const processed: UploadedFile[] = await Promise.all(
      toProcess.map(async file => {
        let blob: Blob = file;
        let name = file.name;
        if (file.type.startsWith('image/')) {
          blob = await compressImage(file, 0.8);
          name = name.replace(/\.[^.]+$/, '.jpg');
        }
        return { blob, name, preview: URL.createObjectURL(blob) };
      })
    );

    if (activeUploadTarget === 'payment')       setFiles(prev => [...prev, ...processed]);
    else if (activeUploadTarget === 'valid-id') setValidIdFiles(prev => [...prev, ...processed]);
    else if (activeUploadTarget === 'fdp')      setFdpFiles(prev => [...prev, ...processed]);

    e.target.value = '';
  }

  function openUpload(target: UploadTarget) {
    setActiveUploadTarget(target);
    setShowOptions(true);
  }

  function removeNewFile(target: UploadTarget, index: number) {
    if (target === 'payment') {
      setFiles(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
    } else if (target === 'fdp') {
      setFdpFiles(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
    } else {
      setValidIdFiles(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
    }
  }

  function triggerOption(option: UploadOption) {
    setShowOptions(false);
    setTimeout(() => {
      if (option === 'camera-photo')     cameraPhotoRef.current?.click();
      else if (option === 'camera-scan') cameraScanRef.current?.click();
      else                               galleryRef.current?.click();
    }, 100);
  }

  function getInventoryCode(): string | null {
    if (reservation?.inventory_code) return reservation.inventory_code;
    try {
      const raw = sessionStorage.getItem('reservationData');
      if (raw) return JSON.parse(raw).inventoryCode ?? null;
    } catch {}
    return null;
  }

  async function handleRecall() {
    setRecalling(true);
    setActionError('');
    try {
      await supabase.from('reservations').update({ finance_status: null }).eq('reservation_id', reservationId);
      const updated = { ...reservation!, finance_status: null };
      setReservation(updated);
      sessionStorage.setItem('selectedReservation', JSON.stringify(updated));
      setEditMode(true);
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to recall. Please try again.');
    } finally {
      setRecalling(false);
      setShowRecallConfirm(false);
    }
  }

  async function handleResubmit() {
    setResubmitting(true);
    setActionError('');
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ finance_status: 'proof-submitted' })
        .eq('reservation_id', reservationId);
      if (error) throw error;
      sessionStorage.removeItem('currentReservationId');
      router.push('/sales/reservation');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to resubmit. Please try again.');
    } finally {
      setResubmitting(false);
    }
  }

  async function handleCancelReservation() {
    setCancelling(true);
    setActionError('');
    try {
      await supabase.from('reservations')
        .update({ status: 'Cancelled', finance_status: null })
        .eq('reservation_id', reservationId);

      const inventoryCode = getInventoryCode();
      if (inventoryCode) await updateInventoryUnitStatus(inventoryCode, 'Available');

      sessionStorage.removeItem('currentReservationId');
      sessionStorage.removeItem('selectedReservation');
      router.push('/sales/reservation');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to cancel. Please try again.');
    } finally {
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  }

  async function handleConfirmPayment() {
    const totalPayment = existingPaymentUrls.length + files.length;
    const hasPending = !!sessionStorage.getItem('pendingReservationPayload');
    if (!totalPayment || (!reservationId && !hasPending)) return;
    setSaving(true);
    setSaveError('');
    try {
      // Generate ID and write reservation to DB on first submit (deferred from agreement page)
      let activeId = reservationId;
      const pendingPayload = sessionStorage.getItem('pendingReservationPayload');
      if (pendingPayload) {
        activeId = await generateReservationId();
        const payload = { ...JSON.parse(pendingPayload), reservation_id: activeId };
        await saveReservation(payload);
        sessionStorage.removeItem('pendingReservationPayload');
        sessionStorage.setItem('currentReservationId', activeId);
        setReservationId(activeId);
        const quotationId = sessionStorage.getItem('pendingQuotationId');
        if (quotationId) {
          try { await markQuotationConverted(quotationId); } catch {}
          sessionStorage.removeItem('pendingQuotationId');
        }
      }

      // Upload only new blobs; existing URLs are kept as-is
      const [newPaymentUrls, newValidIdUrls, newFdpUrls] = await Promise.all([
        Promise.all(files.map((f, i) =>
          uploadPaymentProof(activeId, f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
        Promise.all(validIdFiles.map((f, i) =>
          uploadDocumentFile(activeId, 'valid-id', f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
        Promise.all(fdpFiles.map((f, i) =>
          uploadDocumentFile(activeId, 'fdp', f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
      ]);

      // Merge kept existing URLs with newly uploaded URLs
      const mergedPayment = [...existingPaymentUrls, ...newPaymentUrls];
      const mergedValidId = [...existingValidIdUrls, ...newValidIdUrls];
      const mergedFdp     = [...existingFdpUrls, ...newFdpUrls];

      await updateReservationPayment(activeId, paymentDate, mergedPayment, {
        subsequentMode,
        adaBank: adaBank || undefined,
        billingUrls: preservedBillingUrls.length > 0 ? preservedBillingUrls : undefined,
        incomeUrls:  preservedIncomeUrls.length  > 0 ? preservedIncomeUrls  : undefined,
        validIdUrls: mergedValidId,
      });

      await supabase.from('reservations')
        .update({
          rf_payment_mode:   reservationPaymentMode || null,
          proof_of_fdp_urls: firstPaymentAgreed ? JSON.stringify(mergedFdp) : null,
        })
        .eq('reservation_id', activeId);

      const inventoryCode = getInventoryCode();
      if (inventoryCode) await updateInventoryUnitStatus(inventoryCode, 'Reserved');

      // Generate receivable lines (non-fatal)
      try {
        await generateReceivableLines(activeId, paymentDate);
      } catch (e) {
        console.error('[receivables] Failed to generate lines:', e);
      }

      triggerEmails('on_reservation', activeId).catch(e => console.error('[email-trigger]', e));

      sessionStorage.removeItem('currentReservationId');
      sessionStorage.removeItem('reservationData');
      router.push('/sales/reservation');
    } catch (e: any) {
      setSaveError(e.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const adaSelected = subsequentMode === 'Auto-Debit Arrangement (ADA)';

  // canConfirm: in edit mode relax the "must have new files" — existing counts too
  const totalPaymentFiles = existingPaymentUrls.length + files.length;
  const totalValidIdFiles = existingValidIdUrls.length + validIdFiles.length;

  const canConfirm = totalPaymentFiles > 0 && !!paymentDate
    && !!subsequentMode && (!adaSelected || !!adaBank)
    && totalValidIdFiles > 0;

  // Doc section helper
  const docSections = [
    {
      target: 'valid-id' as UploadTarget,
      label: 'Proof of Valid ID',
      icon: <ShieldCheck size={16} />,
      existingUrls: existingValidIdUrls,
      setExisting: setExistingValidIdUrls,
      newFiles: validIdFiles,
    },
  ];

  return (
    <PageShell title="Proof of Reservation Payment" backButton={fromList} onBack={fromList ? () => router.back() : undefined}>

      {/* Hero card */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[rgba(192,61,37,0.1)] flex items-center justify-center shrink-0">
            {alreadyPaid
              ? <BadgeCheck size={24} className="text-green-600" />
              : <Receipt size={24} className="text-[#C03D25]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#8E8E93] uppercase tracking-wider font-semibold">Reservation ID</p>
            <p className="text-base font-bold text-[#C03D25] tracking-wider">{reservationId || '—'}</p>
          </div>
          {reservation && (
            isApproved ? (
              <img src="/approved-stamp.png" alt="Approved" className="w-20 h-20 object-contain shrink-0" />
            ) : (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                isBooked ? 'bg-green-100 text-green-700'
                : reservation.finance_status === 'rf-rejected' ? 'bg-red-100 text-red-700'
                : alreadyPaid ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {isBooked ? 'Booked'
                 : reservation.finance_status === 'rf-rejected' ? 'RF Rejected'
                 : alreadyPaid ? 'Reserved'
                 : 'Pending Proof'}
              </span>
            )
          )}
        </div>

        {reservation && (
          <div className="space-y-1.5 pt-1 border-t border-black/[0.06]">
            <div className="flex items-center gap-2">
              <User size={11} className="text-[#C7C7CC] shrink-0" />
              <span className="text-sm font-semibold text-[#1C1C1E]">{reservation.client_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={11} className="text-[#C7C7CC] shrink-0" />
              <span className="text-xs text-[#6C6C70]">{reservation.project}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Tag size={11} className="text-[#C7C7CC] shrink-0" />
                <span className="text-xs text-[#6C6C70]">{reservation.inventory_code ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <LayoutGrid size={11} className="text-[#C7C7CC] shrink-0" />
                <span className="text-xs text-[#6C6C70]">{reservation.unit_type}</span>
              </div>
            </div>
            {reservation.seller_name && (
              <div className="flex items-center gap-2">
                <User size={11} className="text-[#C7C7CC] shrink-0" />
                <span className="text-xs text-[#6C6C70]">{reservation.seller_name}</span>
              </div>
            )}
            {reservation.created_at && (
              <div className="flex items-center gap-2">
                <Clock size={11} className="text-[#C7C7CC] shrink-0" />
                <span className="text-xs text-[#8E8E93]">{daysElapsedLabel(reservation.created_at)}</span>
              </div>
            )}
          </div>
        )}

        {!isBooked && (
          <p className="text-xs text-[#8E8E93] leading-relaxed">
            {isApproved
              ? 'This reservation has been approved. All details are read-only.'
              : reservation?.finance_status === 'rf-rejected' && !editMode
              ? 'This submission was returned. You may edit and resubmit, or cancel the reservation.'
              : reservation?.finance_status === 'rf-rejected' && editMode
              ? 'Update the payment details below and resubmit for verification.'
              : reservation?.finance_status === 'proof-submitted'
              ? 'This reservation has been submitted for verification and is currently under review.'
              : 'Upload your proof of payment and valid ID, then tap Submit for Verification. Your reservation will be sent for review immediately.'
            }
          </p>
        )}
        {reservation?.finance_status === 'rf-rejected' && financeRejectionReason && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl px-3 py-2.5">
            <AlertTriangle size={14} className="text-[#FF3B30] shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-[#FF3B30] uppercase tracking-wider mb-0.5">Rejection Reason</p>
              <p className="text-xs text-[#3C3C43] leading-relaxed">{financeRejectionReason}</p>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Read-only view: mirrors edit form layout ── */}
      {alreadyPaid && !editMode && !!reservation?.finance_status && (
        <>
          {/* Card 1: RF Mode + Valid ID + Payment Date + Proof + FDP */}
          <GlassCard className="px-4 py-1">

            {/* Reservation Mode of Payment */}
            <div className="border-b border-black/[0.06] py-3 px-1 space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                <CreditCard size={11} className="text-[#8E8E93]" />
                Reservation Mode of Payment
              </p>
              <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.06] bg-white">
                <span className={`text-sm ${reservationPaymentMode ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                  {reservationPaymentMode || '—'}
                </span>
              </div>
            </div>

            {/* Valid ID */}
            <div className="border-b border-black/[0.06] py-3 px-1 space-y-2">
              <div className="flex items-center gap-3">
                <ShieldCheck size={16} className="text-[#C03D25] shrink-0" />
                <span className="text-sm font-medium text-[#1C1C1E] flex-1">Proof of Valid ID</span>
                {existingValidIdUrls.length > 0 && (
                  <span className="text-xs text-[#8E8E93]">{existingValidIdUrls.length} file{existingValidIdUrls.length > 1 ? 's' : ''}</span>
                )}
              </div>
              {existingValidIdUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {existingValidIdUrls.map((url, i) => {
                    const isPdf = url.toLowerCase().includes('.pdf');
                    return isPdf ? (
                      <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                        className="aspect-square rounded-xl bg-[#F2F2F7] border border-black/[0.08] flex flex-col items-center justify-center gap-1 active:opacity-70">
                        <FileText size={22} className="text-[#C03D25]" />
                        <span className="text-[9px] font-semibold text-[#8E8E93]">PDF {i + 1}</span>
                      </button>
                    ) : (
                      <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                        className="aspect-square rounded-xl overflow-hidden border border-black/[0.08] block active:opacity-70">
                        <img src={url} alt={`Valid ID ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#C7C7CC] px-1">No files uploaded</p>
              )}
            </div>

            {/* Payment Date */}
            <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
              <CalendarDays size={16} className="text-[#C03D25] shrink-0" />
              <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Payment Date</span>
              <span className="text-sm text-[#6C6C70]">{paymentDate || '—'}</span>
            </div>

            {/* Proof of Payment */}
            <div className={`py-3 px-1 space-y-2 ${firstPaymentAgreed ? 'border-b border-black/[0.06]' : ''}`}>
              <div className="flex items-center gap-3">
                <Receipt size={16} className="text-[#C03D25] shrink-0" />
                <span className="text-sm font-medium text-[#1C1C1E] flex-1">Proof of Payment</span>
                {existingPaymentUrls.length > 0 && (
                  <span className="text-xs text-[#8E8E93]">{existingPaymentUrls.length} file{existingPaymentUrls.length > 1 ? 's' : ''}</span>
                )}
              </div>
              {existingPaymentUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {existingPaymentUrls.map((url, i) => {
                    const isPdf = url.toLowerCase().includes('.pdf');
                    return isPdf ? (
                      <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                        className="aspect-square rounded-xl bg-[#F2F2F7] border border-black/[0.08] flex flex-col items-center justify-center gap-1 active:opacity-70">
                        <FileText size={22} className="text-[#C03D25]" />
                        <span className="text-[9px] font-semibold text-[#8E8E93]">PDF {i + 1}</span>
                      </button>
                    ) : (
                      <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                        className="aspect-square rounded-xl overflow-hidden border border-black/[0.08] block active:opacity-70">
                        <img src={url} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#C7C7CC] px-1">No files uploaded</p>
              )}
            </div>

            {/* Proof of First Downpayment */}
            {firstPaymentAgreed && (
              <div className="py-3 px-1 space-y-2">
                <div className="flex items-center gap-3">
                  <Receipt size={16} className="text-[#C03D25] shrink-0" />
                  <span className="text-sm font-medium text-[#1C1C1E] flex-1">Proof of First Downpayment</span>
                  {existingFdpUrls.length > 0 && (
                    <span className="text-xs text-[#8E8E93]">{existingFdpUrls.length} file{existingFdpUrls.length > 1 ? 's' : ''}</span>
                  )}
                </div>
                {existingFdpUrls.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {existingFdpUrls.map((url, i) => {
                      const isPdf = url.toLowerCase().includes('.pdf');
                      return isPdf ? (
                        <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                          className="aspect-square rounded-xl bg-[#F2F2F7] border border-black/[0.08] flex flex-col items-center justify-center gap-1 active:opacity-70">
                          <FileText size={22} className="text-[#C03D25]" />
                          <span className="text-[9px] font-semibold text-[#8E8E93]">PDF {i + 1}</span>
                        </button>
                      ) : (
                        <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                          className="aspect-square rounded-xl overflow-hidden border border-black/[0.08] block active:opacity-70">
                          <img src={url} alt={`FDP ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#C7C7CC] px-1">No files uploaded</p>
                )}
              </div>
            )}

          </GlassCard>

          {/* Card 2: Subsequent Mode + ADA Bank */}
          {subsequentMode && (
            <GlassCard className="px-4 py-1">
              <div className={`py-3 px-1 space-y-2 ${adaBank ? 'border-b border-black/[0.06]' : ''}`}>
                <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                  <CreditCard size={11} className="text-[#8E8E93]" />
                  Subsequent Mode of Payment
                </p>
                <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.06] bg-white">
                  <span className="text-sm text-[#1C1C1E]">{subsequentMode}</span>
                </div>
                {subsequentMode === 'Straight Cash or Check Payment' && (
                  <p className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] rounded-xl px-3 py-2">
                    Please make a check payable to the company.
                  </p>
                )}
                {subsequentMode === 'Post-Dated Checks (PDC)' && (
                  <p className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] rounded-xl px-3 py-2">
                    Please submit all the PDC payable to the company.
                  </p>
                )}
              </div>
              {adaBank && (
                <div className="py-3 px-1 space-y-2">
                  <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                    <Building2 size={11} className="text-[#8E8E93]" />
                    Preferred Bank
                  </p>
                  <div className="w-full flex items-center px-3 py-2.5 rounded-xl border border-black/[0.06] bg-white">
                    <span className="text-sm text-[#1C1C1E]">{adaBank}</span>
                  </div>
                </div>
              )}
            </GlassCard>
          )}
        </>
      )}

      {/* Editable fields — new reservation OR edit mode */}
      {(!alreadyPaid || editMode || (alreadyPaid && !reservation?.finance_status)) && !isApproved && (
        <GlassCard className="px-4 py-1">

          {/* Reservation Mode of Payment */}
          <div className="border-b border-black/[0.06] py-3 px-1 space-y-2">
            <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
              <CreditCard size={11} className="text-[#8E8E93]" />
              Reservation Mode of Payment
            </p>
            <button
              type="button"
              onClick={() => setRfModeDropdownOpen(p => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7]"
            >
              <span className={`text-sm ${reservationPaymentMode ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                {reservationPaymentMode || 'Select mode of payment'}
              </span>
              <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${rfModeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {rfModeDropdownOpen && (
              <div className="space-y-0.5">
                {RESERVATION_PAYMENT_MODES.map(mode => (
                  <button key={mode} type="button"
                    onClick={() => { setReservationPaymentMode(mode); setRfModeDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                      reservationPaymentMode === mode
                        ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold'
                        : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    {mode}
                    {reservationPaymentMode === mode && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
              </div>
            )}
            {reservationPaymentMode === 'Debit/ Credit Card' && (
              <div className="bg-[#F2F2F7] rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-[#1C1C1E]">How to pay via your Debit/Credit Card thru POS Terminal</p>
                <ol className="space-y-1.5 list-none">
                  {[
                    'Please proceed to the cashier\'s counter.',
                    'Present your preferred debit or credit card.',
                    'The cashier will enter your payment details in the POS system.',
                    'Swipe, insert, or tap your card on the POS Terminal when prompted.',
                    'Enter your PIN or provide your signature if required and wait for the system to process your transaction.',
                    'Once approved, the cashier will provide you with the Acknowledgement Receipt.',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2 text-[11px] text-[#3C3C43] leading-relaxed">
                      <span className="font-bold text-[#C03D25] shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-[#8E8E93] italic">Note: Please keep your receipt for confirmation of your payment.</p>
              </div>
            )}
            {reservationPaymentMode === 'Bills Payment' && (
              <div className="bg-[#F2F2F7] rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-[#1C1C1E]">How to pay via Bank Bills Payment</p>
                <ol className="space-y-1.5 list-none">
                  {(['Log in to your bank\'s mobile app or online banking portal.', 'From the main menu, go to Pay Bills or Bills Payment.', 'Select Biller/Company'] as string[]).map((step, i) => (
                    <li key={i} className="flex gap-2 text-[11px] text-[#3C3C43] leading-relaxed">
                      <span className="font-bold text-[#C03D25] shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                  <li className="flex gap-2 text-[11px] text-[#3C3C43] leading-relaxed">
                    <span className="font-bold text-[#C03D25] shrink-0">4.</span>
                    <div className="space-y-0.5">
                      <p>Enter the following details:</p>
                      <div className="pl-2 space-y-0.5 text-[#6C6C70]">
                        <p>Subscriber/Account Number: <span className="font-semibold text-[#1C1C1E]">Unit/Inventory Code</span></p>
                        <p>Subscriber/Account Name: <span className="font-semibold text-[#1C1C1E]">Full Name</span></p>
                        <p>Amount to Pay: <span className="font-semibold text-[#1C1C1E]">Exact amount due</span></p>
                      </div>
                    </div>
                  </li>
                  {(['Review all details carefully before confirming.', 'Complete the payment and wait for the transaction confirmation screen.', 'Take a screenshot or download the receipt as proof of payment.', 'Send the proof of payment to your company\'s email / upload portal for validation and posting.'] as string[]).map((step, i) => (
                    <li key={i + 4} className="flex gap-2 text-[11px] text-[#3C3C43] leading-relaxed">
                      <span className="font-bold text-[#C03D25] shrink-0">{i + 5}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-[#8E8E93] italic">Note: Make sure to input the correct Client ID/Unit No. so payment is posted correctly. Keep the receipt until payment is confirmed.</p>
              </div>
            )}
          </div>

          {/* Doc section: valid-id */}
          {docSections.map(({ target, label, icon, existingUrls, setExisting, newFiles }) => {
            const total  = existingUrls.length + newFiles.length;
            const canAdd = total < MAX_DOC_FILES;
            return (
              <div key={target} className="border-b border-black/[0.06] last:border-0 py-3 px-1 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#C03D25] shrink-0">{icon}</span>
                  <span className="text-sm font-medium text-[#1C1C1E] flex-1 flex items-center gap-0.5">
                    {label}
                    <span className="text-[#C03D25] text-xs leading-none">*</span>
                  </span>
                  {total > 0 && <span className="text-xs text-[#8E8E93]">{total}/{MAX_DOC_FILES}</span>}
                </div>
                {total > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {existingUrls.map((url, i) => (
                      <ExistingThumb key={`ex-${i}`} url={url}
                        onRemove={() => setExisting(prev => prev.filter((_, j) => j !== i))} />
                    ))}
                    {newFiles.map((f, i) => (
                      <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-black/[0.08]">
                        <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeNewFile(target, i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                          <X size={10} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {canAdd && (
                  <button type="button" onClick={() => openUpload(target)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-[#C03D25]/40 text-[#C03D25] text-xs font-semibold active:bg-[#C03D25]/5">
                    <Upload size={13} />
                    {total === 0 ? `Upload ${label}` : 'Add More'}
                  </button>
                )}
              </div>
            );
          })}

          {/* Payment Date */}
          <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
            <CalendarDays size={16} className="text-[#C03D25] shrink-0" />
            <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Payment Date</span>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="text-sm text-[#1C1C1E] bg-transparent outline-none text-right"
            />
          </div>

          {/* Existing + new proof thumbnails */}
          {(existingPaymentUrls.length > 0 || files.length > 0) && (
            <div className="px-1 pt-3 pb-2 grid grid-cols-3 gap-2">
              {existingPaymentUrls.map((url, i) => (
                <ExistingThumb key={`ex-${i}`} url={url}
                  onRemove={() => setExistingPaymentUrls(prev => prev.filter((_, j) => j !== i))} />
              ))}
              {files.map((f, i) => (
                <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-black/[0.08]">
                  <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeNewFile('payment', i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          {totalPaymentFiles < MAX_FILES ? (
            <div className="py-3 px-1 border-b border-black/[0.06]">
              <button type="button" onClick={() => openUpload('payment')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#C03D25]/40 text-[#C03D25] text-sm font-semibold active:bg-[#C03D25]/5">
                <Upload size={16} />
                {totalPaymentFiles === 0 ? 'Upload Proof of Payment' : `Add More (${totalPaymentFiles}/${MAX_FILES})`}
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-[#8E8E93] py-3 border-b border-black/[0.06]">Maximum {MAX_FILES} files uploaded</p>
          )}

          {/* Proof of First Downpayment — only if first_payment_agreed */}
          {firstPaymentAgreed && (() => {
            const totalFdp = existingFdpUrls.length + fdpFiles.length;
            const canAddFdp = totalFdp < MAX_FILES;
            return (
              <div className="py-3 px-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Receipt size={13} className="text-[#C03D25] shrink-0" />
                  <span className="text-xs font-semibold text-[#8E8E93] flex-1">Proof of First Downpayment</span>
                  {totalFdp > 0 && <span className="text-xs text-[#8E8E93]">{totalFdp}/{MAX_FILES}</span>}
                </div>
                {totalFdp > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {existingFdpUrls.map((url, i) => (
                      <ExistingThumb key={`ex-fdp-${i}`} url={url}
                        onRemove={() => setExistingFdpUrls(prev => prev.filter((_, j) => j !== i))} />
                    ))}
                    {fdpFiles.map((f, i) => (
                      <div key={`new-fdp-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-black/[0.08]">
                        <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeNewFile('fdp', i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                          <X size={10} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {canAddFdp && (
                  <button type="button" onClick={() => openUpload('fdp')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#C03D25]/40 text-[#C03D25] text-sm font-semibold active:bg-[#C03D25]/5">
                    <Upload size={16} />
                    {totalFdp === 0 ? 'Upload Proof of First Downpayment' : `Add More (${totalFdp}/${MAX_FILES})`}
                  </button>
                )}
              </div>
            );
          })()}
        </GlassCard>
      )}

      {/* Subsequent Mode of Payment + ADA Bank */}
      {(!alreadyPaid || editMode || (alreadyPaid && !reservation?.finance_status)) && !isApproved && (
        <GlassCard className="px-4 py-1">
          <div className="border-b border-black/[0.06] py-3 px-1 space-y-2">
            <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
              <CreditCard size={11} className="text-[#8E8E93]" />
              Subsequent Mode of Payment
              <span className="text-[#C03D25] text-xs leading-none">*</span>
            </p>
            <button
              type="button"
              onClick={() => setModeDropdownOpen(p => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7]"
            >
              <span className={`text-sm ${subsequentMode ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                {subsequentMode || 'Select mode of payment'}
              </span>
              <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${modeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {modeDropdownOpen && (
              <div className="space-y-0.5">
                {PAYMENT_MODES.map(mode => (
                  <button key={mode} type="button"
                    onClick={() => {
                      setSubsequentMode(mode);
                      if (mode !== 'Auto-Debit Arrangement (ADA)') setAdaBank('');
                      setModeDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                      subsequentMode === mode
                        ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold'
                        : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    {mode}
                    {subsequentMode === mode && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
              </div>
            )}
            {subsequentMode === 'Straight Cash or Check Payment' && (
              <p className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] rounded-xl px-3 py-2">
                Please make a check payable to the company.
              </p>
            )}
            {subsequentMode === 'Post-Dated Checks (PDC)' && (
              <p className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] rounded-xl px-3 py-2">
                Please submit all the PDC payable to the company.
              </p>
            )}
          </div>
          {adaSelected && (
            <div className="py-3 px-1 space-y-2">
              <p className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] rounded-xl px-3 py-2">
                Please accomplish the ADA Form.
              </p>
              <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                <Building2 size={11} className="text-[#8E8E93]" />
                Preferred Bank
                <span className="text-[#C03D25] text-xs leading-none">*</span>
              </p>
              <button
                type="button"
                onClick={() => setAdaBankDropdownOpen(p => !p)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7]"
              >
                <span className={`text-sm ${adaBank ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                  {adaBank || 'Select preferred bank'}
                </span>
                <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${adaBankDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {adaBankDropdownOpen && (
                <div className="space-y-0.5">
                  {ADA_BANKS.map(bank => (
                    <button key={bank} type="button"
                      onClick={() => { setAdaBank(bank); setAdaBankDropdownOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                        adaBank === bank
                          ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold'
                          : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
                      }`}
                    >
                      {bank}
                      {adaBank === bank && <Check size={14} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </GlassCard>
      )}

      {/* Save / Confirm button */}
      {(!alreadyPaid || editMode || (alreadyPaid && !reservation?.finance_status)) && !isApproved && (
        <div className="space-y-2.5">
          <p className="text-[11px] text-[#8E8E93] leading-relaxed text-center px-2">
            Please ensure that you have selected the correct mode of payment for the reservation and subsequent payments, including the corresponding preferred bank of the client. All required documents must be uploaded before proceeding with the payment.
          </p>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => setShowConfirm(true)}
            className={`w-full py-4 rounded-2xl text-sm font-bold transition-all ${
              canConfirm ? 'bg-[#C03D25] text-white active:opacity-80' : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
            }`}
          >
            {editMode ? 'Resubmit for Verification' : 'Submit for Verification'}
          </button>
          {editMode && !!reservation?.finance_status && (
            <button type="button" onClick={() => setEditMode(false)}
              className="w-full py-4 rounded-2xl border-2 border-black/10 text-[#6C6C70] text-sm font-semibold active:opacity-70">
              Cancel Edit
            </button>
          )}
        </div>
      )}


      {/* Edit / Resubmit / Cancel — shown when returned (RF Rejected) */}
      {reservation?.finance_status === 'rf-rejected' && !editMode && (
        <div className="space-y-2.5 pb-2">
          {actionError && <p className="text-red-500 text-xs text-center">{actionError}</p>}
          <button
            type="button"
            onClick={() => { setActionError(''); setEditMode(true); }}
            className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={resubmitting}
            onClick={() => { setActionError(''); handleResubmit(); }}
            className="w-full py-4 rounded-2xl bg-[#34C759] text-white text-sm font-bold active:opacity-80 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            {resubmitting ? <><Loader2 size={15} className="animate-spin" /> Resubmitting…</> : 'Resubmit for Verification'}
          </button>
          <button
            type="button"
            disabled={cancelling}
            onClick={() => { setActionError(''); setShowCancelConfirm(true); }}
            className="w-full py-4 rounded-2xl border-2 border-[#FF3B30] text-[#FF3B30] text-sm font-bold active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            Cancel Reservation
          </button>
        </div>
      )}

      {/* Recall button — shown only when proof is pending RF verification */}
      {alreadyPaid && !isApproved && reservation?.finance_status === 'proof-submitted' && (
        <div className="space-y-2.5 pb-2">
          {actionError ? <p className="text-red-500 text-xs text-center">{actionError}</p> : null}
          <button
            type="button"
            disabled={recalling}
            onClick={() => { setActionError(''); setShowRecallConfirm(true); }}
            className="w-full py-4 rounded-2xl border-2 border-[#5856D6] text-[#5856D6] text-sm font-bold active:bg-[#5856D6]/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {recalling ? <><Loader2 size={15} className="animate-spin" /> Recalling...</> : 'Recall Submission'}
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={cameraPhotoRef} type="file" accept="image/*"      capture="environment" className="hidden" onChange={handleFileChange} />
      <input ref={cameraScanRef}  type="file" accept="image/*"      capture="environment" className="hidden" onChange={handleFileChange} />
      <input ref={galleryRef}     type="file" accept="image/*,.pdf" multiple              className="hidden" onChange={handleFileChange} />

      {/* Upload Options Sheet */}
      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowOptions(false)}>
          <div className="w-full max-w-sm space-y-2" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
              <p className="text-center text-xs font-semibold text-[#8E8E93] uppercase tracking-wider pt-4 pb-2 px-4 border-b border-black/[0.06]">
                Choose Upload Method
              </p>
              {[
                { option: 'camera-photo' as UploadOption, icon: <Camera size={20} />,    label: 'Take a Photo',            desc: 'Use camera to capture payment proof' },
                { option: 'camera-scan'  as UploadOption, icon: <ScanLine size={20} />,  label: 'Scan Document',           desc: 'Scan a physical receipt or document' },
                { option: 'gallery'      as UploadOption, icon: <ImagePlus size={20} />, label: 'Upload Photo or Document', desc: 'Choose from gallery or files' },
              ].map(({ option, icon, label, desc }) => (
                <button key={option} type="button" onClick={() => triggerOption(option)}
                  className="w-full flex items-center gap-4 px-5 py-4 border-b border-black/[0.06] last:border-0 active:bg-gray-50 text-left">
                  <span className="text-[#C03D25] shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-[#1C1C1E]">{label}</p>
                    <p className="text-xs text-[#8E8E93]">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowOptions(false)}
              className="w-full py-4 bg-white rounded-2xl text-sm font-bold text-[#1C1C1E] shadow active:opacity-80">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirm Payment / Save Changes Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">
                Submit for Verification
              </p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                Your proof of payment will be saved and submitted for review immediately.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              {reservationId && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                  <span className="text-xs font-bold text-[#C03D25]">{reservationId}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Payment Date</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{paymentDate}</span>
              </div>
            </div>
            {saveError && <p className="text-red-500 text-xs text-center px-6 pt-3">{saveError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={saving} onClick={handleConfirmPayment}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Submitting...</>
                  : <><CheckCircle2 size={15} /> Yes, Submit for Verification</>
                }
              </button>
              <button type="button" disabled={saving} onClick={() => setShowConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reservation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-[#FF3B30]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Cancel Reservation?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This will permanently cancel the reservation. This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{reservation?.client_name}</span>
              </div>
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={cancelling} onClick={handleCancelReservation}
                className="w-full py-3.5 rounded-2xl bg-[#FF3B30] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {cancelling
                  ? <><Loader2 size={15} className="animate-spin" /> Cancelling…</>
                  : 'Yes, Cancel Reservation'
                }
              </button>
              <button type="button" disabled={cancelling} onClick={() => setShowCancelConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recall Submission Modal */}
      {showRecallConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-[#5856D6]/10 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-[#5856D6]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Recall Submission?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This will withdraw the reservation from verification. Your uploaded files and payment details will be kept.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Action</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">Withdrawn from verification</span>
              </div>
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={recalling} onClick={handleRecall}
                className="w-full py-3.5 rounded-2xl bg-[#5856D6] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {recalling
                  ? <><Loader2 size={15} className="animate-spin" /> Recalling...</>
                  : 'Yes, Recall Submission'
                }
              </button>
              <button type="button" disabled={recalling} onClick={() => setShowRecallConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightboxUrl(null)}>
          <button type="button" onClick={() => setLightboxUrl(null)}
            className="absolute top-14 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <X size={18} className="text-white" />
          </button>
          {lightboxUrl.toLowerCase().includes('.pdf') ? (
            <div className="flex flex-col items-center gap-4 px-6" onClick={e => e.stopPropagation()}>
              <FileText size={64} className="text-white/60" />
              <p className="text-white text-sm font-semibold">PDF Document</p>
              <a href={lightboxUrl} target="_blank" rel="noopener noreferrer"
                className="px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
                Open PDF
              </a>
            </div>
          ) : (
            <img src={lightboxUrl} alt="Payment proof"
              className="max-w-full max-h-full object-contain"
              onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}

    </PageShell>
  );
}
