'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { uploadDocumentFile } from '@/lib/reservations';
import {
  Receipt, CalendarDays, Upload, Camera, ScanLine,
  ImagePlus, X, AlertTriangle, Loader2, CheckCircle2,
  User, Building2, Tag, LayoutGrid, FileText,
} from 'lucide-react';

function today() { return new Date().toISOString().split('T')[0]; }

function compressImage(file: File, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
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

export default function DpProofPage() {
  const router = useRouter();

  const [reservation, setReservation] = useState<{
    reservation_id?: string; client_name?: string;
    project?: string; inventory_code?: string; unit_type?: string;
  } | null>(null);

  const [paymentDate,      setPaymentDate]      = useState(today());
  const [existingUrls,     setExistingUrls]     = useState<string[]>([]);
  const [files,            setFiles]            = useState<UploadedFile[]>([]);
  const [showOptions,      setShowOptions]      = useState(false);
  const [showConfirm,      setShowConfirm]      = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [saveError,        setSaveError]        = useState('');
  const [lightboxUrl,      setLightboxUrl]      = useState<string | null>(null);

  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraScanRef  = useRef<HTMLInputElement>(null);
  const galleryRef     = useRef<HTMLInputElement>(null);

  const MAX_FILES = 5;

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { router.replace('/sales/booking/detail'); return; }
    const r = JSON.parse(raw);
    setReservation(r);
    if (r.reservation_id) {
      supabase
        .from('reservations')
        .select('proof_of_1st_dp_urls, date_of_1st_dp')
        .eq('reservation_id', r.reservation_id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          const parse = (v: string | null): string[] => {
            try { return JSON.parse(v ?? '[]') ?? []; } catch { return []; }
          };
          setExistingUrls(parse(data.proof_of_1st_dp_urls));
          if (data.date_of_1st_dp) setPaymentDate(data.date_of_1st_dp);
        });
    }
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const remaining = MAX_FILES - existingUrls.length - files.length;
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

  function triggerOption(option: UploadOption) {
    setShowOptions(false);
    setTimeout(() => {
      if (option === 'camera-photo')     cameraPhotoRef.current?.click();
      else if (option === 'camera-scan') cameraScanRef.current?.click();
      else                               galleryRef.current?.click();
    }, 100);
  }

  async function handleSave() {
    const reservationId = reservation?.reservation_id ?? '';
    if (!reservationId) return;
    setSaving(true);
    setSaveError('');
    try {
      const newUrls = await Promise.all(
        files.map((f, i) =>
          uploadDocumentFile(reservationId, '1st-dp', f.blob, `${Date.now()}_${i + 1}_${f.name}`)
        )
      );
      const merged = [...existingUrls, ...newUrls];
      const { error } = await supabase
        .from('reservations')
        .update({
          proof_of_1st_dp_urls: JSON.stringify(merged),
          date_of_1st_dp:       paymentDate,
        })
        .eq('reservation_id', reservationId);
      if (error) throw error;
      router.push('/sales/booking/detail');
    } catch (e: any) {
      setSaveError(e.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const totalFiles = existingUrls.length + files.length;
  const canSave    = totalFiles > 0 && !!paymentDate;

  return (
    <PageShell title="1st Down Payment Proof" backButton onBack={() => router.push('/sales/booking/detail')}>

      {/* Hero card */}
      <GlassCard className="p-5 space-y-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[rgba(192,61,37,0.1)] flex items-center justify-center shrink-0">
            <Receipt size={24} className="text-[#C03D25]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#8E8E93] uppercase tracking-wider font-semibold">Reservation ID</p>
            <p className="text-base font-bold text-[#C03D25] tracking-wider">{reservation?.reservation_id ?? '—'}</p>
          </div>
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
              {reservation.unit_type && (
                <div className="flex items-center gap-2">
                  <LayoutGrid size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-xs text-[#6C6C70]">{reservation.unit_type}</span>
                </div>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-[#8E8E93] leading-relaxed">
          Upload proof of your 1st down payment. This will be reviewed by Finance for verification.
        </p>
      </GlassCard>

      {/* Upload card */}
      <GlassCard className="px-4 py-1 mb-4">
        {/* Payment Date */}
        <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
          <CalendarDays size={16} className="text-[#C03D25] shrink-0" />
          <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Payment Date <span className="text-[#C03D25]">*</span></span>
          <input
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className="text-sm text-[#1C1C1E] bg-transparent outline-none text-right"
          />
        </div>

        {/* Thumbnails */}
        {totalFiles > 0 && (
          <div className="px-1 pt-3 pb-2 grid grid-cols-3 gap-2">
            {existingUrls.map((url, i) => (
              <ExistingThumb key={`ex-${i}`} url={url}
                onRemove={() => setExistingUrls(prev => prev.filter((_, j) => j !== i))} />
            ))}
            {files.map((f, i) => (
              <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-black/[0.08]">
                {f.blob.type.startsWith('image/') ? (
                  <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#F2F2F7] flex flex-col items-center justify-center gap-1">
                    <FileText size={22} className="text-[#C03D25]" />
                    <span className="text-[9px] font-semibold text-[#8E8E93]">PDF</span>
                  </div>
                )}
                <button type="button"
                  onClick={() => setFiles(prev => { URL.revokeObjectURL(prev[i].preview); return prev.filter((_, j) => j !== i); })}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        {totalFiles < MAX_FILES ? (
          <div className="py-3 px-1">
            <button type="button" onClick={() => setShowOptions(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#C03D25]/40 text-[#C03D25] text-sm font-semibold active:bg-[#C03D25]/5">
              <Upload size={16} />
              {totalFiles === 0 ? 'Upload Proof of 1st DP' : `Add More (${totalFiles}/${MAX_FILES})`}
            </button>
          </div>
        ) : (
          <p className="text-center text-xs text-[#8E8E93] py-3">Maximum {MAX_FILES} files uploaded</p>
        )}
      </GlassCard>

      {/* Save button */}
      <button
        type="button"
        disabled={!canSave}
        onClick={() => setShowConfirm(true)}
        className={`w-full py-4 rounded-2xl text-sm font-bold transition-all mb-6 ${
          canSave ? 'bg-[#C03D25] text-white active:opacity-80' : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
        }`}
      >
        Save
      </button>

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

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Save 1st DP Proof?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                Your proof of 1st down payment will be saved and sent to Finance for verification.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{reservation?.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Payment Date</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{paymentDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Proof Files</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{totalFiles} file{totalFiles > 1 ? 's' : ''}</span>
              </div>
            </div>
            {saveError && <p className="text-red-500 text-xs text-center px-6 pt-3">{saveError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={saving} onClick={handleSave}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving...</>
                  : <><CheckCircle2 size={15} /> Yes, Save</>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightboxUrl(null)}>
          <button type="button" onClick={() => setLightboxUrl(null)}
            className="absolute top-14 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <X size={18} className="text-white" />
          </button>
          <img src={lightboxUrl} alt="DP proof"
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

    </PageShell>
  );
}
