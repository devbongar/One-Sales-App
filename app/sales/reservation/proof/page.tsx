'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  Receipt, CalendarDays, Upload, Camera, ScanLine,
  ImagePlus, X, AlertTriangle, Loader2, CheckCircle2,
  User, Building2, Tag, LayoutGrid, BadgeCheck, FileText,
} from 'lucide-react';
import { uploadPaymentProof, updateReservationPayment } from '@/lib/reservations';
import { updateInventoryUnitStatus } from '@/lib/inventory';

const MAX_FILES = 5;

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

export default function ProofOfPaymentPage() {
  const router = useRouter();
  const [reservationId, setReservationId] = useState('');
  const [reservation, setReservation] = useState<SelectedReservation | null>(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraScanRef  = useRef<HTMLInputElement>(null);
  const galleryRef     = useRef<HTMLInputElement>(null);

  const alreadyPaid = reservation?.status === 'Reserved-paid';

  // Parse stored proof URLs (saved as JSON array string)
  const proofUrls: string[] = (() => {
    try { return JSON.parse(reservation?.payment_proof_url ?? '[]'); } catch { return []; }
  })();

  useEffect(() => {
    const id = sessionStorage.getItem('currentReservationId');
    if (id) setReservationId(id);
    const raw = sessionStorage.getItem('selectedReservation');
    if (raw) {
      try { setReservation(JSON.parse(raw)); } catch {}
    }
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    setShowOptions(false);

    const remaining = MAX_FILES - files.length;
    const toProcess = selected.slice(0, remaining);

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

    setFiles(prev => [...prev, ...processed]);
    e.target.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function triggerOption(option: UploadOption) {
    setShowOptions(false);
    setTimeout(() => {
      if (option === 'camera-photo') cameraPhotoRef.current?.click();
      else if (option === 'camera-scan') cameraScanRef.current?.click();
      else galleryRef.current?.click();
    }, 100);
  }

  // Resolve inventory code from selected reservation (list flow) or reservationData (new flow)
  function getInventoryCode(): string | null {
    if (reservation?.inventory_code) return reservation.inventory_code;
    try {
      const raw = sessionStorage.getItem('reservationData');
      if (raw) return JSON.parse(raw).inventoryCode ?? null;
    } catch {}
    return null;
  }

  async function handleConfirmPayment() {
    if (!files.length || !reservationId) return;
    setSaving(true);
    setSaveError('');
    try {
      const urls = await Promise.all(
        files.map((f, i) => uploadPaymentProof(reservationId, f.blob, `${i + 1}_${f.name}`))
      );
      await updateReservationPayment(reservationId, paymentDate, urls);

      // Update inventory unit status to Reserved
      const inventoryCode = getInventoryCode();
      if (inventoryCode) {
        await updateInventoryUnitStatus(inventoryCode, 'Reserved');
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

  const canConfirm = files.length > 0 && !!paymentDate;
  const canAddMore = files.length < MAX_FILES;

  return (
    <PageShell title="Proof of Reservation Payment" backButton onBack={() => router.back()}>

      {/* Hero card */}
      <GlassCard className="p-5 space-y-4">
        {/* Icon + ID + status */}
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

        {/* Reservation details */}
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

        {/* Prompt text */}
        <p className="text-xs text-[#8E8E93] leading-relaxed">
          {alreadyPaid
            ? 'Payment has already been confirmed for this reservation.'
            : 'Please upload your proof of payment for the reservation fee of ₱25,000. This will be reviewed and validated by our team.'
          }
        </p>
      </GlassCard>

      {/* Uploaded proof images — shown only for paid reservations */}
      {alreadyPaid && proofUrls.length > 0 && (
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

      {/* Payment details + upload — hidden for already-paid reservations */}
      {!alreadyPaid && <GlassCard className="px-4 py-1">
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

        {/* Previews grid */}
        {files.length > 0 && (
          <div className="px-1 pt-3 pb-2 grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-black/[0.08]">
                <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        {canAddMore && (
          <div className="py-3 px-1">
            <button
              type="button"
              onClick={() => setShowOptions(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#E8634A]/40 text-[#E8634A] text-sm font-semibold active:bg-[#E8634A]/5"
            >
              <Upload size={16} />
              {files.length === 0 ? 'Upload Proof of Payment' : `Add More (${files.length}/${MAX_FILES})`}
            </button>
          </div>
        )}
        {!canAddMore && (
          <p className="text-center text-xs text-[#8E8E93] py-3">Maximum {MAX_FILES} files uploaded</p>
        )}
      </GlassCard>}

      {/* Confirm button — hidden for already-paid */}
      {!alreadyPaid && (
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => setShowConfirm(true)}
          className={`w-full py-4 rounded-2xl text-sm font-bold transition-all ${
            canConfirm ? 'bg-[#E8634A] text-white active:opacity-80' : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
          }`}
        >
          Confirm Payment
        </button>
      )}

      {/* Hidden file inputs */}
      <input ref={cameraPhotoRef} type="file" accept="image/*"       capture="environment" className="hidden" onChange={handleFileChange} />
      <input ref={cameraScanRef}  type="file" accept="image/*"       capture="environment" className="hidden" onChange={handleFileChange} />
      <input ref={galleryRef}     type="file" accept="image/*,.pdf"  multiple              className="hidden" onChange={handleFileChange} />

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

      {/* Confirm Payment Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Confirm Payment</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                Are you sure you want to confirm the payment of the Reservation Fee of ₱25,000?
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
                <span className="text-xs text-[#8E8E93]">Documents</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{files.length} file{files.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            {saveError && <p className="text-red-500 text-xs text-center px-6 pt-3">{saveError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={saving} onClick={handleConfirmPayment}
                className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving...</>
                  : <><CheckCircle2 size={15} /> Yes, Confirm Payment</>
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

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-14 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center"
          >
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
            <img
              src={lightboxUrl}
              alt="Payment proof"
              className="max-w-full max-h-full object-contain"
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      )}

    </PageShell>
  );
}
