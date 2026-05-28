'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { getBookingProgress } from '@/lib/booking-progress';
import {
  fetchBookingDocuments, saveBookingDocuments,
  uploadDocumentFile, removeDocumentFile,
} from '@/lib/booking-documents';
import { Plus, X, FileText, CheckCircle2, Upload } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocFile { url: string; name: string; }

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}

// ─── File card ────────────────────────────────────────────────────────────────

function FileCard({ file, onRemove, disabled }: {
  file: DocFile; onRemove: () => void; disabled?: boolean;
}) {
  const img = isImage(file.url);
  return (
    <div className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square">
      {img ? (
        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
          <FileText size={28} className="text-[#E8634A]" />
          <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">
            {file.name}
          </span>
        </div>
      )}
      {!disabled && (
        <button type="button" onClick={onRemove}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center active:opacity-70">
          <X size={12} className="text-white" />
        </button>
      )}
    </div>
  );
}

// ─── Document section card ────────────────────────────────────────────────────

function DocSection({ label, files, onAdd, onRemove, uploading, disabled }: {
  label: string; files: DocFile[];
  onAdd: () => void; onRemove: (idx: number) => void;
  uploading: boolean; disabled?: boolean;
}) {
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">{label}</p>
        {!disabled && (
          <button type="button" onClick={onAdd} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E8634A]/10 text-[#E8634A] text-xs font-semibold active:opacity-70 disabled:opacity-50">
            {uploading
              ? <div className="w-3 h-3 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
              : <Plus size={13} />}
            {uploading ? 'Uploading…' : 'Add File'}
          </button>
        )}
      </div>

      {files.length === 0 ? (
        <button type="button" onClick={disabled ? undefined : onAdd}
          disabled={uploading || disabled}
          className={`w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-2 transition-colors ${
            disabled
              ? 'border-black/[0.08] cursor-default'
              : 'border-[#E8634A]/30 active:border-[#E8634A]/60'
          }`}>
          <Upload size={24} className={disabled ? 'text-[#C7C7CC]' : 'text-[#E8634A]/50'} />
          <span className={`text-xs font-medium ${disabled ? 'text-[#C7C7CC]' : 'text-[#8E8E93]'}`}>
            {disabled ? 'No files uploaded' : 'Tap to upload a file'}
          </span>
          {!disabled && <span className="text-[10px] text-[#C7C7CC]">Images or PDF accepted</span>}
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <FileCard key={f.url} file={f} onRemove={() => onRemove(i)} disabled={disabled} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookingDocumentsPage() {
  const router = useRouter();

  const [reservation, setReservation] = useState<{
    reservation_id?: string;
  } | null>(null);

  const [hasCoOwnership,   setHasCoOwnership]   = useState(false);
  const [hasAttyInFact,    setHasAttyInFact]    = useState(false);
  const [hasSpouse,        setHasSpouse]        = useState(false);
  const [coOwnerIsSpouse,  setCoOwnerIsSpouse]  = useState(false);
  const [isSaved,          setIsSaved]          = useState(false);
  const [loading,          setLoading]          = useState(true);

  const [coOwnerFiles,  setCoOwnerFiles]  = useState<DocFile[]>([]);
  const [attyFiles,     setAttyFiles]     = useState<DocFile[]>([]);
  const [spouseFiles,   setSpouseFiles]   = useState<DocFile[]>([]);
  const [uploadingCo,   setUploadingCo]   = useState(false);
  const [uploadingAtty, setUploadingAtty] = useState(false);
  const [uploadingSpouse, setUploadingSpouse] = useState(false);

  const [isSaving,         setIsSaving]         = useState(false);
  const [showConfirmModal, setShowConfirmModal]  = useState(false);
  const [showDoneModal,    setShowDoneModal]     = useState(false);

  const coInputRef     = useRef<HTMLInputElement>(null);
  const attyInputRef   = useRef<HTMLInputElement>(null);
  const spouseInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { router.replace('/sales/booking'); return; }
    const r = JSON.parse(raw);
    setReservation(r);

    if (r.reservation_id) {
      getBookingProgress(r.reservation_id)
        .then(async p => {
          setHasCoOwnership(p.has_co_ownership);
          setHasAttyInFact(p.has_atty_in_fact);
          setHasSpouse(p.has_spouse);
          setCoOwnerIsSpouse(p.co_owner_is_spouse);
          setIsSaved(p.documents_saved);

          const docs = await fetchBookingDocuments(r.reservation_id);
          const toDocFile = (url: string): DocFile => ({
            url,
            name: decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file'),
          });
          setCoOwnerFiles((docs.co_owner_id_urls ?? []).map(toDocFile));
          setAttyFiles((docs.atty_in_fact_id_urls ?? []).map(toDocFile));
          setSpouseFiles((docs.spouse_id_urls ?? []).map(toDocFile));
        })
        .catch(err => console.error('[documents] load error:', err))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function handleFileUpload(
    file: File,
    docType: string,
    setFiles: React.Dispatch<React.SetStateAction<DocFile[]>>,
    setUploading: (v: boolean) => void,
  ) {
    setUploading(true);
    try {
      const url = await uploadDocumentFile(reservation?.reservation_id ?? '', docType, file);
      setFiles(prev => [...prev, { url, name: file.name }]);
    } catch (err) {
      alert('Upload failed. Please try again.');
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(
    idx: number,
    files: DocFile[],
    setFiles: React.Dispatch<React.SetStateAction<DocFile[]>>,
  ) {
    const file = files[idx];
    setFiles(prev => prev.filter((_, i) => i !== idx));
    await removeDocumentFile(file.url);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveBookingDocuments(
        reservation?.reservation_id ?? '',
        coOwnerFiles.map(f => f.url),
        attyFiles.map(f => f.url),
        spouseFiles.map(f => f.url),
      );
      setIsSaved(true);
      setShowDoneModal(true);
    } catch (err) {
      alert('Failed to save. Please try again.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  const needsSpouseId  = hasSpouse && !coOwnerIsSpouse;
  const noDocsRequired = !hasCoOwnership && !hasAttyInFact && !needsSpouseId;
  const canSave = !noDocsRequired
    && (!hasCoOwnership || coOwnerFiles.length > 0)
    && (!hasAttyInFact  || attyFiles.length > 0)
    && (!needsSpouseId  || spouseFiles.length > 0);

  return (
    <PageShell title="Required Documents" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="space-y-4 pb-6">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
          </div>
        ) : noDocsRequired ? (
          <GlassCard className="p-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={32} className="text-[#C7C7CC]" />
            <p className="text-sm font-semibold text-[#6C6C70]">No documents required</p>
            <p className="text-xs text-[#C7C7CC] leading-relaxed">
              This booking has no co-owner or attorney in fact.
            </p>
          </GlassCard>
        ) : (
          <>
            {hasCoOwnership && (
              <>
                <DocSection
                  label="Co-Owner Valid ID"
                  files={coOwnerFiles}
                  onAdd={() => coInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, coOwnerFiles, setCoOwnerFiles)}
                  uploading={uploadingCo}
                  disabled={isSaved}
                />
                <input ref={coInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'co-owner-id', setCoOwnerFiles, setUploadingCo);
                    e.target.value = '';
                  }} />
              </>
            )}

            {hasAttyInFact && (
              <>
                <DocSection
                  label="Attorney in Fact Valid ID"
                  files={attyFiles}
                  onAdd={() => attyInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, attyFiles, setAttyFiles)}
                  uploading={uploadingAtty}
                  disabled={isSaved}
                />
                <input ref={attyInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'atty-in-fact-id', setAttyFiles, setUploadingAtty);
                    e.target.value = '';
                  }} />
              </>
            )}

            {needsSpouseId && (
              <>
                <DocSection
                  label="Spouse Valid ID"
                  files={spouseFiles}
                  onAdd={() => spouseInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, spouseFiles, setSpouseFiles)}
                  uploading={uploadingSpouse}
                  disabled={isSaved}
                />
                <input ref={spouseInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'spouse-id', setSpouseFiles, setUploadingSpouse);
                    e.target.value = '';
                  }} />
              </>
            )}

            <button type="button"
              onClick={() => {
                if (isSaved) { router.push('/sales/booking/detail'); return; }
                setShowConfirmModal(true);
              }}
              disabled={isSaving || (!isSaved && !canSave)}
              className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold shadow-[0_4px_16px_rgba(232,99,74,0.35)] active:opacity-80 transition-opacity disabled:opacity-40">
              {isSaving ? 'Saving…' : isSaved ? 'Done' : 'Save'}
            </button>
          </>
        )}

      </div>

      {/* ── Confirm modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5 animate-slide-up">
            <button type="button" onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-70">
              <X size={16} className="text-[#6C6C70]" />
            </button>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center">
                <CheckCircle2 size={24} className="text-[#E8634A]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Confirm Documents</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                Make sure all uploaded documents are correct and complete before saving.
              </p>
            </div>
            <div className="space-y-2">
              <button type="button"
                onClick={() => { setShowConfirmModal(false); handleSave(); }}
                className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80">
                Confirm &amp; Save
              </button>
              <button type="button" onClick={() => setShowConfirmModal(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-80">
                Review Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Done modal ── */}
      {showDoneModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5 animate-slide-up">
            <button type="button" onClick={() => router.push('/sales/booking/detail')}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-70">
              <X size={16} className="text-[#6C6C70]" />
            </button>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center">
                <CheckCircle2 size={24} className="text-[#E8634A]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Documents Submitted!</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                All required documents have been uploaded and saved successfully.
              </p>
            </div>
            <button type="button" onClick={() => router.push('/sales/booking/detail')}
              className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80">
              Done
            </button>
          </div>
        </div>
      )}

    </PageShell>
  );
}
