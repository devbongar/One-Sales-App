'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  Receipt, CalendarDays, Upload, Camera, ScanLine,
  ImagePlus, X, AlertTriangle, Loader2, Check, CheckCircle2,
  User, Building2, Tag, LayoutGrid, BadgeCheck, FileText,
  ChevronDown, CreditCard, FileImage, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { uploadPaymentProof, uploadDocumentFile, updateReservationPayment, updateReservationStatus } from '@/lib/reservations';
import { updateInventoryUnitStatus } from '@/lib/inventory';

const MAX_FILES     = 5;
const MAX_DOC_FILES = 3;

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

type UploadTarget = 'payment' | 'billing' | 'income' | 'valid-id';

interface SelectedReservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  status: string;
  seller_name: string | null;
  payment_proof_url: string | null;
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
          <FileText size={22} className="text-[#E8634A]" />
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
  const [billingFiles, setBillingFiles] = useState<UploadedFile[]>([]);
  const [incomeFiles,  setIncomeFiles]  = useState<UploadedFile[]>([]);
  const [validIdFiles, setValidIdFiles] = useState<UploadedFile[]>([]);

  // Existing remote URLs (pre-loaded on edit)
  const [existingPaymentUrls, setExistingPaymentUrls] = useState<string[]>([]);
  const [existingBillingUrls, setExistingBillingUrls] = useState<string[]>([]);
  const [existingIncomeUrls,  setExistingIncomeUrls]  = useState<string[]>([]);
  const [existingValidIdUrls, setExistingValidIdUrls] = useState<string[]>([]);

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
  const [loadingEdit,       setLoadingEdit]       = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [submitting,        setSubmitting]        = useState(false);
  const [cancelling,        setCancelling]        = useState(false);
  const [recalling,         setRecalling]         = useState(false);
  const [actionError,       setActionError]       = useState('');

  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraScanRef  = useRef<HTMLInputElement>(null);
  const galleryRef     = useRef<HTMLInputElement>(null);

  const PAID_STATUSES = ['Reserved-paid', 'Pending Review'];
  const alreadyPaid = PAID_STATUSES.includes(reservation?.status ?? '');

  // Parse stored proof URLs (read-only view — immediate, from sessionStorage)
  const proofUrls: string[] = (() => {
    try { return JSON.parse(reservation?.payment_proof_url ?? '[]'); } catch { return []; }
  })();

  useEffect(() => {
    const id  = sessionStorage.getItem('currentReservationId');
    if (id) setReservationId(id);
    const raw = sessionStorage.getItem('selectedReservation');
    if (raw) { try { setReservation(JSON.parse(raw)); } catch {} }
    setFromList(sessionStorage.getItem('proofEntrySource') === 'list');
  }, []);

  // ── Shared helper: fetch full row and populate all existing-URL + payment states ──
  async function loadExistingData(id: string) {
    const { data, error } = await supabase
      .from('reservations')
      .select('subsequent_mode, ada_bank, payment_proof_url, proof_of_billing_urls, proof_of_income_urls, proof_of_valid_id_urls, payment_date')
      .eq('reservation_id', id)
      .single();
    if (error) throw error;
    if (!data) return;
    const parse = (v: string | null): string[] => {
      try { return JSON.parse(v ?? '[]') ?? []; } catch { return []; }
    };
    setSubsequentMode(data.subsequent_mode ?? '');
    setAdaBank(data.ada_bank ?? '');
    if (data.payment_date) setPaymentDate(data.payment_date);
    setExistingPaymentUrls(parse(data.payment_proof_url));
    setExistingBillingUrls(parse(data.proof_of_billing_urls));
    setExistingIncomeUrls(parse(data.proof_of_income_urls));
    setExistingValidIdUrls(parse(data.proof_of_valid_id_urls));
  }

  // ── Auto-fetch when viewing a paid / pending-review reservation ──
  const reservationStatus = reservation?.status ?? '';
  useEffect(() => {
    if (!reservationId || !PAID_STATUSES.includes(reservationStatus)) return;
    loadExistingData(reservationId).catch(e => console.error('[auto-fetch]', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, reservationStatus]);

  // ── Edit mode: fetch full row from DB and pre-populate ──
  async function handleEnterEditMode() {
    setLoadingEdit(true);
    try {
      const id = reservationId || sessionStorage.getItem('currentReservationId') || '';
      await loadExistingData(id);
      // Clear any leftover new-blob state
      setFiles([]); setBillingFiles([]); setIncomeFiles([]); setValidIdFiles([]);
    } catch (e) {
      console.error('[edit] failed to load reservation data:', e);
    } finally {
      setLoadingEdit(false);
      setEditMode(true);
    }
  }

  async function handleCancelEdit() {
    setEditMode(false);
    setFiles([]); setBillingFiles([]); setIncomeFiles([]); setValidIdFiles([]);
    // Restore existing-URL states so the read-only view is correct after cancel
    const id = reservationId || sessionStorage.getItem('currentReservationId') || '';
    if (id) loadExistingData(id).catch(e => console.error('[cancel-edit]', e));
  }

  // ── File upload handling ──
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;

    const maxAllowed   = activeUploadTarget === 'payment' ? MAX_FILES : MAX_DOC_FILES;
    const existingCount =
      activeUploadTarget === 'payment'   ? existingPaymentUrls.length :
      activeUploadTarget === 'billing'   ? existingBillingUrls.length :
      activeUploadTarget === 'income'    ? existingIncomeUrls.length  :
      existingValidIdUrls.length;
    const newCount =
      activeUploadTarget === 'payment'   ? files.length       :
      activeUploadTarget === 'billing'   ? billingFiles.length :
      activeUploadTarget === 'income'    ? incomeFiles.length  :
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

    if (activeUploadTarget === 'payment')        setFiles(prev => [...prev, ...processed]);
    else if (activeUploadTarget === 'billing')   setBillingFiles(prev => [...prev, ...processed]);
    else if (activeUploadTarget === 'income')    setIncomeFiles(prev => [...prev, ...processed]);
    else if (activeUploadTarget === 'valid-id')  setValidIdFiles(prev => [...prev, ...processed]);

    e.target.value = '';
  }

  function openUpload(target: UploadTarget) {
    setActiveUploadTarget(target);
    setShowOptions(true);
  }

  function removeNewFile(target: UploadTarget, index: number) {
    if (target === 'payment') {
      setFiles(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
    } else {
      const setter = target === 'billing' ? setBillingFiles : target === 'income' ? setIncomeFiles : setValidIdFiles;
      setter(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
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

  // ── Action handlers ──
  async function handleSubmitForVerification() {
    setSubmitting(true);
    setActionError('');
    try {
      await updateReservationStatus(reservationId, 'Pending Review');
      router.push('/sales/reservation');
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  }

  async function handleRecall() {
    setRecalling(true);
    setActionError('');
    try {
      await updateReservationStatus(reservationId, 'Reserved-paid');
      // Update local state so the view switches back immediately (no redirect)
      const updated = { ...reservation!, status: 'Reserved-paid' };
      setReservation(updated);
      sessionStorage.setItem('selectedReservation', JSON.stringify(updated));
    } catch (e: any) {
      setActionError(e.message ?? 'Failed to recall. Please try again.');
    } finally {
      setRecalling(false);
      setShowRecallConfirm(false);
    }
  }

  async function handleCancelReservation() {
    setCancelling(true);
    setActionError('');
    try {
      await updateReservationStatus(reservationId, 'Cancelled');
      const inventoryCode = getInventoryCode();
      if (inventoryCode) await updateInventoryUnitStatus(inventoryCode, 'Available');
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
    if (!totalPayment || !reservationId) return;
    setSaving(true);
    setSaveError('');
    try {
      // Upload only new blobs; existing URLs are kept as-is
      const [newPaymentUrls, newBillingUrls, newIncomeUrls, newValidIdUrls] = await Promise.all([
        Promise.all(files.map((f, i) =>
          uploadPaymentProof(reservationId, f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
        Promise.all(billingFiles.map((f, i) =>
          uploadDocumentFile(reservationId, 'billing', f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
        Promise.all(incomeFiles.map((f, i) =>
          uploadDocumentFile(reservationId, 'income', f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
        Promise.all(validIdFiles.map((f, i) =>
          uploadDocumentFile(reservationId, 'valid-id', f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )),
      ]);

      // Merge kept existing URLs with newly uploaded URLs
      const mergedPayment  = [...existingPaymentUrls, ...newPaymentUrls];
      const mergedBilling  = [...existingBillingUrls, ...newBillingUrls];
      const mergedIncome   = [...existingIncomeUrls,  ...newIncomeUrls];
      const mergedValidId  = [...existingValidIdUrls, ...newValidIdUrls];

      await updateReservationPayment(reservationId, paymentDate, mergedPayment, {
        subsequentMode,
        adaBank: adaBank || undefined,
        billingUrls: mergedBilling,
        incomeUrls:  mergedIncome,
        validIdUrls: mergedValidId,
      });

      const inventoryCode = getInventoryCode();
      if (inventoryCode) await updateInventoryUnitStatus(inventoryCode, 'Reserved');

      if (editMode) {
        setShowConfirm(false);
        setEditMode(false);
        // Refresh reservation in session to reflect new proof URL
        const { data } = await supabase
          .from('reservations')
          .select('reservation_id, client_name, project, inventory_code, unit_type, status, seller_name, payment_proof_url')
          .eq('reservation_id', reservationId)
          .single();
        if (data) {
          setReservation(data as SelectedReservation);
          sessionStorage.setItem('selectedReservation', JSON.stringify(data));
        }
        // Clear edit state
        setExistingPaymentUrls([]); setExistingBillingUrls([]);
        setExistingIncomeUrls([]); setExistingValidIdUrls([]);
        setFiles([]); setBillingFiles([]); setIncomeFiles([]); setValidIdFiles([]);
        return;
      }

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
  const totalBillingFiles = existingBillingUrls.length + billingFiles.length;
  const totalIncomeFiles  = existingIncomeUrls.length  + incomeFiles.length;
  const totalValidIdFiles = existingValidIdUrls.length + validIdFiles.length;

  const canConfirm = totalPaymentFiles > 0 && !!paymentDate
    && !!subsequentMode && (!adaSelected || !!adaBank)
    && totalBillingFiles > 0 && totalIncomeFiles > 0 && totalValidIdFiles > 0;

  // Doc section helper
  const docSections = [
    {
      target: 'billing'  as UploadTarget,
      label: 'Proof of Billing',
      icon: <FileText size={16} />,
      existingUrls: existingBillingUrls,
      setExisting: setExistingBillingUrls,
      newFiles: billingFiles,
    },
    {
      target: 'income'   as UploadTarget,
      label: 'Proof of Income',
      icon: <FileImage size={16} />,
      existingUrls: existingIncomeUrls,
      setExisting: setExistingIncomeUrls,
      newFiles: incomeFiles,
    },
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
          <div className="w-12 h-12 rounded-full bg-[rgba(232,99,74,0.1)] flex items-center justify-center shrink-0">
            {alreadyPaid
              ? <BadgeCheck size={24} className="text-green-600" />
              : <Receipt size={24} className="text-[#E8634A]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#8E8E93] uppercase tracking-wider font-semibold">Reservation ID</p>
            <p className="text-base font-bold text-[#E8634A] tracking-wider">{reservationId || '—'}</p>
          </div>
          {reservation && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
              alreadyPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {reservation.status}
            </span>
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
          </div>
        )}

        <p className="text-xs text-[#8E8E93] leading-relaxed">
          {alreadyPaid && editMode
            ? 'Edit mode — you can remove or add files, then tap Save Changes.'
            : reservation?.status === 'Pending Review'
            ? 'This reservation has been submitted for verification and is currently under review.'
            : alreadyPaid
            ? 'Payment has already been confirmed for this reservation.'
            : 'Please upload your proof of payment for the reservation fee of ₱25,000. This will be reviewed and validated by our team.'
          }
        </p>
      </GlassCard>

      {/* Read-only proof thumbnails — shown only when paid and NOT in edit mode */}
      {alreadyPaid && !editMode && proofUrls.length > 0 && (
        <GlassCard className="px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">
            Payment Proof ({proofUrls.length} file{proofUrls.length > 1 ? 's' : ''})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {proofUrls.map((url, i) => {
              const isPdf = url.toLowerCase().includes('.pdf');
              return isPdf ? (
                <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                  className="aspect-square rounded-xl bg-[#F2F2F7] border border-black/[0.08] flex flex-col items-center justify-center gap-1 active:opacity-70">
                  <FileText size={22} className="text-[#E8634A]" />
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
        </GlassCard>
      )}

      {/* Read-only subsequent mode of payment */}
      {alreadyPaid && !editMode && subsequentMode && (
        <GlassCard className="px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Subsequent Mode of Payment</p>
          <p className="text-sm font-semibold text-[#1C1C1E]">{subsequentMode}</p>
          {adaBank && (
            <p className="text-xs text-[#6C6C70]">Bank / Platform: <span className="font-medium text-[#1C1C1E]">{adaBank}</span></p>
          )}
        </GlassCard>
      )}

      {/* Read-only document files — billing, income, valid-id */}
      {alreadyPaid && !editMode && (existingBillingUrls.length > 0 || existingIncomeUrls.length > 0 || existingValidIdUrls.length > 0) && (
        <GlassCard className="px-4 py-3 space-y-4">
          {[
            { label: 'Proof of Billing',  urls: existingBillingUrls },
            { label: 'Proof of Income',   urls: existingIncomeUrls  },
            { label: 'Proof of Valid ID', urls: existingValidIdUrls },
          ].filter(s => s.urls.length > 0).map(({ label, urls }) => (
            <div key={label} className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">
                {label} ({urls.length} file{urls.length > 1 ? 's' : ''})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {urls.map((url, i) => {
                  const isPdf = url.toLowerCase().includes('.pdf');
                  return isPdf ? (
                    <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                      className="aspect-square rounded-xl bg-[#F2F2F7] border border-black/[0.08] flex flex-col items-center justify-center gap-1 active:opacity-70">
                      <FileText size={22} className="text-[#E8634A]" />
                      <span className="text-[9px] font-semibold text-[#8E8E93]">PDF {i + 1}</span>
                    </button>
                  ) : (
                    <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                      className="aspect-square rounded-xl overflow-hidden border border-black/[0.08] block active:opacity-70">
                      <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </GlassCard>
      )}

      {/* Editable fields — new reservation OR edit mode */}
      {(!alreadyPaid || editMode) && (
        <GlassCard className="px-4 py-1">

          {/* Subsequent Mode of Payment */}
          <div className="border-b border-black/[0.06] py-3 px-1 space-y-2">
            <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
              <CreditCard size={11} className="text-[#8E8E93]" />
              Subsequent Mode of Payment
              <span className="text-[#E8634A] text-xs leading-none">*</span>
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
                        ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold'
                        : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    {mode}
                    {subsequentMode === mode && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ADA Bank */}
          {adaSelected && (
            <div className="border-b border-black/[0.06] py-3 px-1 space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                <Building2 size={11} className="text-[#8E8E93]" />
                ADA Bank / Platform
                <span className="text-[#E8634A] text-xs leading-none">*</span>
              </p>
              <button
                type="button"
                onClick={() => setAdaBankDropdownOpen(p => !p)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7]"
              >
                <span className={`text-sm ${adaBank ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                  {adaBank || 'Select bank or platform'}
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
                          ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold'
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

          {/* Doc sections: billing, income, valid-id */}
          {docSections.map(({ target, label, icon, existingUrls, setExisting, newFiles }) => {
            const total  = existingUrls.length + newFiles.length;
            const canAdd = total < MAX_DOC_FILES;
            return (
              <div key={target} className="border-b border-black/[0.06] last:border-0 py-3 px-1 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#E8634A] shrink-0">{icon}</span>
                  <span className="text-sm font-medium text-[#1C1C1E] flex-1 flex items-center gap-0.5">
                    {label}
                    <span className="text-[#E8634A] text-xs leading-none">*</span>
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
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-[#E8634A]/40 text-[#E8634A] text-xs font-semibold active:bg-[#E8634A]/5">
                    <Upload size={13} />
                    {total === 0 ? `Upload ${label}` : 'Add More'}
                  </button>
                )}
              </div>
            );
          })}

        </GlassCard>
      )}

      {/* Payment date + proof upload */}
      {(!alreadyPaid || editMode) && (
        <GlassCard className="px-4 py-1">
          {/* Payment Date */}
          <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
            <CalendarDays size={16} className="text-[#E8634A] shrink-0" />
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
            <div className="py-3 px-1">
              <button type="button" onClick={() => openUpload('payment')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#E8634A]/40 text-[#E8634A] text-sm font-semibold active:bg-[#E8634A]/5">
                <Upload size={16} />
                {totalPaymentFiles === 0 ? 'Upload Proof of Payment' : `Add More (${totalPaymentFiles}/${MAX_FILES})`}
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-[#8E8E93] py-3">Maximum {MAX_FILES} files uploaded</p>
          )}
        </GlassCard>
      )}

      {/* Save / Confirm button */}
      {(!alreadyPaid || editMode) && (
        <div className="space-y-2.5">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => setShowConfirm(true)}
            className={`w-full py-4 rounded-2xl text-sm font-bold transition-all ${
              canConfirm ? 'bg-[#E8634A] text-white active:opacity-80' : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
            }`}
          >
            {editMode ? 'Save Changes' : 'Confirm Payment'}
          </button>
          {editMode && (
            <button type="button" onClick={handleCancelEdit}
              className="w-full py-4 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-80">
              Cancel Edit
            </button>
          )}
        </div>
      )}

      {/* Action buttons — paid view, not editing */}
      {alreadyPaid && !editMode && reservation?.status === 'Reserved-paid' && (
        <div className="space-y-2.5 pb-2">
          <button
            type="button"
            disabled={loadingEdit}
            onClick={handleEnterEditMode}
            className="w-full py-4 rounded-2xl border-2 border-[#E8634A] text-[#E8634A] text-sm font-bold active:bg-[#E8634A]/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loadingEdit ? <><Loader2 size={15} className="animate-spin" /> Loading...</> : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => { setActionError(''); setShowSubmitConfirm(true); }}
            className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold shadow-[0_4px_16px_rgba(232,99,74,0.35)] active:opacity-80"
          >
            Submit for Verification
          </button>
          <button
            type="button"
            onClick={() => { setActionError(''); setShowCancelConfirm(true); }}
            className="w-full py-4 rounded-2xl bg-[#FFF1F0] text-[#FF3B30] text-sm font-bold active:opacity-80"
          >
            Cancel Reservation
          </button>
        </div>
      )}

      {/* Recall button — shown only when Pending Review */}
      {alreadyPaid && !editMode && reservation?.status === 'Pending Review' && (
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
                  <span className="text-[#E8634A] shrink-0">{icon}</span>
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
                {editMode ? 'Save Changes?' : 'Confirm Payment'}
              </p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                {editMode
                  ? 'Your updated files and payment details will be saved.'
                  : 'Are you sure you want to confirm the payment of the Reservation Fee of ₱25,000?'
                }
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#E8634A]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Payment Date</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{paymentDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Proof Files</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{totalPaymentFiles} file{totalPaymentFiles > 1 ? 's' : ''}</span>
              </div>
            </div>
            {saveError && <p className="text-red-500 text-xs text-center px-6 pt-3">{saveError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={saving} onClick={handleConfirmPayment}
                className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving...</>
                  : <><CheckCircle2 size={15} /> {editMode ? 'Yes, Save Changes' : 'Yes, Confirm Payment'}</>
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

      {/* Submit for Verification Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-[rgba(232,99,74,0.12)] flex items-center justify-center mb-3">
                <CheckCircle2 size={24} className="text-[#E8634A]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Submit for Verification?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This reservation will be submitted for review and will become available in the Buyers Payment page.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#E8634A]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">New Status</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">Pending Review</span>
              </div>
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={submitting} onClick={handleSubmitForVerification}
                className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {submitting
                  ? <><Loader2 size={15} className="animate-spin" /> Submitting...</>
                  : <><CheckCircle2 size={15} /> Yes, Submit for Verification</>
                }
              </button>
              <button type="button" disabled={submitting} onClick={() => setShowSubmitConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Go Back
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
                This action cannot be undone. The reservation will be cancelled and the unit will be returned to Available.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#E8634A]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{reservation?.client_name ?? '—'}</span>
              </div>
            </div>
            {actionError && <p className="text-red-500 text-xs text-center px-6 pt-3">{actionError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={cancelling} onClick={handleCancelReservation}
                className="w-full py-3.5 rounded-2xl bg-[#FF3B30] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {cancelling
                  ? <><Loader2 size={15} className="animate-spin" /> Cancelling...</>
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
                <span className="text-xs font-bold text-[#E8634A]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">New Status</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">Reserved-paid</span>
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
                className="px-6 py-3 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80">
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
