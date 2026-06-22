'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { getBookingProgress } from '@/lib/booking-progress';
import {
  fetchBookingDocuments, saveBookingDocuments,
  uploadDocumentFile, removeDocumentFile,
} from '@/lib/booking-documents';
import { Plus, X, FileText, CheckCircle2, Loader2, Upload } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocFile { url: string; name: string; }

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}

// ─── File overlay ─────────────────────────────────────────────────────────────

function FileOverlay({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const img = isImage(url);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1C1C1E]">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] border-b border-white/10 shrink-0">
        <p className="text-white text-[13px] font-semibold truncate">{title}</p>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
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

// ─── File card ────────────────────────────────────────────────────────────────

function FileCard({ file, onRemove, onPreview, disabled }: {
  file: DocFile; onRemove: () => void; onPreview: () => void; disabled?: boolean;
}) {
  const img = isImage(file.url);
  return (
    <div className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square">
      <button type="button" onClick={onPreview} className="w-full h-full active:opacity-70">
        {img ? (
          <img src={file.url} alt={file.name} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
            <FileText size={28} className="text-[#C03D25]" />
            <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">
              {file.name}
            </span>
          </div>
        )}
      </button>
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

function DocSection({ label, files, onAdd, onRemove, onPreview, uploading, disabled }: {
  label: string; files: DocFile[];
  onAdd: () => void; onRemove: (idx: number) => void; onPreview: (idx: number) => void;
  uploading: boolean; disabled?: boolean;
}) {
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">{label}</p>
        {!disabled && (
          <button type="button" onClick={onAdd} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C03D25]/10 text-[#C03D25] text-xs font-semibold active:opacity-70 disabled:opacity-50">
            {uploading
              ? <Loader2 size={12} className="text-[#C03D25] animate-spin" />
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
              : 'border-[#C03D25]/30 active:border-[#C03D25]/60'
          }`}>
          <Upload size={24} className={disabled ? 'text-[#C7C7CC]' : 'text-[#C03D25]/50'} />
          <span className={`text-xs font-medium ${disabled ? 'text-[#C7C7CC]' : 'text-[#8E8E93]'}`}>
            {disabled ? 'No files uploaded' : 'Tap to upload a file'}
          </span>
          {!disabled && <span className="text-[10px] text-[#C7C7CC]">Images or PDF accepted</span>}
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <FileCard key={f.url} file={f} onRemove={() => onRemove(i)} onPreview={() => onPreview(i)} disabled={disabled} />
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

  // Billing & income — always required
  const [billingFiles,     setBillingFiles]     = useState<DocFile[]>([]);
  const [incomeFiles,      setIncomeFiles]      = useState<DocFile[]>([]);
  const [uploadingBilling, setUploadingBilling] = useState(false);
  const [uploadingIncome,  setUploadingIncome]  = useState(false);

  // Optional docs
  const [loanDisclosureFiles,       setLoanDisclosureFiles]       = useState<DocFile[]>([]);
  const [addlIncomeFiles,           setAddlIncomeFiles]           = useState<DocFile[]>([]);
  const [floorLayoutFiles,          setFloorLayoutFiles]          = useState<DocFile[]>([]);
  const [uploadingLoanDisclosure,   setUploadingLoanDisclosure]   = useState(false);
  const [uploadingAddlIncome,       setUploadingAddlIncome]       = useState(false);
  const [uploadingFloorLayout,      setUploadingFloorLayout]      = useState(false);

  // Conditional ID docs
  const [coOwnerFiles,    setCoOwnerFiles]    = useState<DocFile[]>([]);
  const [attyFiles,       setAttyFiles]       = useState<DocFile[]>([]);
  const [spouseFiles,     setSpouseFiles]     = useState<DocFile[]>([]);
  const [uploadingCo,     setUploadingCo]     = useState(false);
  const [uploadingAtty,   setUploadingAtty]   = useState(false);
  const [uploadingSpouse, setUploadingSpouse] = useState(false);

  const [isSaving,         setIsSaving]         = useState(false);
  const [showDoneModal,    setShowDoneModal]     = useState(false);
  const [fileUrl,          setFileUrl]           = useState<string | null>(null);
  const [fileTitle,        setFileTitle]         = useState('');

  function openPreview(files: DocFile[], idx: number) { setFileUrl(files[idx].url); setFileTitle(files[idx].name); }
  function closePreview() { setFileUrl(null); setFileTitle(''); }

  const billingInputRef       = useRef<HTMLInputElement>(null);
  const incomeInputRef        = useRef<HTMLInputElement>(null);
  const loanDisclosureInputRef = useRef<HTMLInputElement>(null);
  const addlIncomeInputRef    = useRef<HTMLInputElement>(null);
  const floorLayoutInputRef   = useRef<HTMLInputElement>(null);
  const coInputRef            = useRef<HTMLInputElement>(null);
  const attyInputRef          = useRef<HTMLInputElement>(null);
  const spouseInputRef        = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { router.replace('/sales/booking'); return; }
    const r = JSON.parse(raw);
    setReservation(r);

    if (r.reservation_id) {
      (async () => {
        try {
          const p = await getBookingProgress(r.reservation_id);
          setHasCoOwnership(p.has_co_ownership);
          setHasAttyInFact(p.has_atty_in_fact);
          setHasSpouse(p.has_spouse);
          setCoOwnerIsSpouse(p.co_owner_is_spouse);
          const lockedStatuses = ['submitted', 'director-approved', 'amd-approved'];
          setIsSaved(p.documents_saved && lockedStatuses.includes(p.booking_review_status ?? ''));

          const docs = await fetchBookingDocuments(r.reservation_id);
          const toDocFile = (url: string): DocFile => ({
            url,
            name: decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file'),
          });
          setCoOwnerFiles((docs.co_owner_id_urls ?? []).map(toDocFile));
          setAttyFiles((docs.atty_in_fact_id_urls ?? []).map(toDocFile));
          setSpouseFiles((docs.spouse_id_urls ?? []).map(toDocFile));

          // Load billing, income, and optional docs from reservations table
          const { data: resData } = await supabase
            .from('reservations')
            .select('proof_of_billing_urls, proof_of_income_urls, existing_loan_disclosure_urls, additional_proof_of_income_urls, signed_floor_layout_urls')
            .eq('reservation_id', r.reservation_id)
            .single();
          if (resData) {
            const parse = (v: string | null): string[] => {
              try { return JSON.parse(v ?? '[]') ?? []; } catch { return []; }
            };
            setBillingFiles(parse(resData.proof_of_billing_urls).map(toDocFile));
            setIncomeFiles(parse(resData.proof_of_income_urls).map(toDocFile));
            setLoanDisclosureFiles(parse(resData.existing_loan_disclosure_urls).map(toDocFile));
            setAddlIncomeFiles(parse(resData.additional_proof_of_income_urls).map(toDocFile));
            setFloorLayoutFiles(parse(resData.signed_floor_layout_urls).map(toDocFile));
          }
        } catch (err) {
          console.error('[documents] load error:', err);
        } finally {
          setLoading(false);
        }
      })();
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
      await supabase
        .from('reservations')
        .update({
          proof_of_billing_urls:             JSON.stringify(billingFiles.map(f => f.url)),
          proof_of_income_urls:              JSON.stringify(incomeFiles.map(f => f.url)),
          existing_loan_disclosure_urls:     JSON.stringify(loanDisclosureFiles.map(f => f.url)),
          additional_proof_of_income_urls:   JSON.stringify(addlIncomeFiles.map(f => f.url)),
          signed_floor_layout_urls:          JSON.stringify(floorLayoutFiles.map(f => f.url)),
        })
        .eq('reservation_id', reservation?.reservation_id ?? '');
      setIsSaved(true);
      setShowDoneModal(true);
    } catch (err) {
      alert('Failed to save. Please try again.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  const needsSpouseId     = hasSpouse && !coOwnerIsSpouse;
  const hasAnyConditional = hasCoOwnership || hasAttyInFact || needsSpouseId;

  const canSave = billingFiles.length > 0 && incomeFiles.length > 0
    && (!hasCoOwnership || coOwnerFiles.length > 0)
    && (!hasAttyInFact  || attyFiles.length > 0)
    && (!needsSpouseId  || spouseFiles.length > 0);

  return (
    <>
    <PageShell title="Required Documents" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="space-y-4 pb-6">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="text-[#C03D25] animate-spin" />
          </div>
        ) : (
          <>
            {isSaved && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#F2F2F7] border border-black/[0.06]">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E5E5EA] text-[#6C6C70]">View Only</span>
                <p className="text-xs text-[#8E8E93]">Submitted for review — documents locked</p>
              </div>
            )}

            {/* Proof of Billing — always required */}
            <DocSection
              label="Proof of Billing"
              files={billingFiles}
              onAdd={() => billingInputRef.current?.click()}
              onRemove={idx => handleRemove(idx, billingFiles, setBillingFiles)}
              onPreview={idx => openPreview(billingFiles, idx)}
              uploading={uploadingBilling}
              disabled={isSaved}
            />
            <input ref={billingInputRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file, 'billing', setBillingFiles, setUploadingBilling);
                e.target.value = '';
              }} />

            {/* Proof of Income — always required */}
            <DocSection
              label="Proof of Income"
              files={incomeFiles}
              onAdd={() => incomeInputRef.current?.click()}
              onRemove={idx => handleRemove(idx, incomeFiles, setIncomeFiles)}
              onPreview={idx => openPreview(incomeFiles, idx)}
              uploading={uploadingIncome}
              disabled={isSaved}
            />
            <input ref={incomeInputRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file, 'income', setIncomeFiles, setUploadingIncome);
                e.target.value = '';
              }} />

            {/* Conditional ID documents */}
            {hasCoOwnership && (
              <>
                <DocSection
                  label="Co-Owner Valid ID"
                  files={coOwnerFiles}
                  onAdd={() => coInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, coOwnerFiles, setCoOwnerFiles)}
                  onPreview={idx => openPreview(coOwnerFiles, idx)}
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
                  onPreview={idx => openPreview(attyFiles, idx)}
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
                  onPreview={idx => openPreview(spouseFiles, idx)}
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

            {/* Optional documents */}
            <div className="pt-1">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider px-1 mb-3">Optional Documents</p>

              <div className="space-y-4">
                <DocSection
                  label="Existing Loan Disclosure"
                  files={loanDisclosureFiles}
                  onAdd={() => loanDisclosureInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, loanDisclosureFiles, setLoanDisclosureFiles)}
                  onPreview={idx => openPreview(loanDisclosureFiles, idx)}
                  uploading={uploadingLoanDisclosure}
                  disabled={isSaved}
                />
                <input ref={loanDisclosureInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'loan-disclosure', setLoanDisclosureFiles, setUploadingLoanDisclosure);
                    e.target.value = '';
                  }} />

                <DocSection
                  label="Additional Proof of Income"
                  files={addlIncomeFiles}
                  onAdd={() => addlIncomeInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, addlIncomeFiles, setAddlIncomeFiles)}
                  onPreview={idx => openPreview(addlIncomeFiles, idx)}
                  uploading={uploadingAddlIncome}
                  disabled={isSaved}
                />
                <input ref={addlIncomeInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'addl-income', setAddlIncomeFiles, setUploadingAddlIncome);
                    e.target.value = '';
                  }} />

                <DocSection
                  label="Signed Floor Layout"
                  files={floorLayoutFiles}
                  onAdd={() => floorLayoutInputRef.current?.click()}
                  onRemove={idx => handleRemove(idx, floorLayoutFiles, setFloorLayoutFiles)}
                  onPreview={idx => openPreview(floorLayoutFiles, idx)}
                  uploading={uploadingFloorLayout}
                  disabled={isSaved}
                />
                <input ref={floorLayoutInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'floor-layout', setFloorLayoutFiles, setUploadingFloorLayout);
                    e.target.value = '';
                  }} />
              </div>
            </div>

            {!hasAnyConditional && isSaved && (
              <GlassCard className="p-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-600 shrink-0" />
                <p className="text-sm text-[#6C6C70]">All documents have been saved.</p>
              </GlassCard>
            )}

            <button type="button"
              onClick={() => { if (isSaved) { router.push('/sales/booking/detail'); return; } handleSave(); }}
              disabled={isSaving || (!isSaved && !canSave)}
              className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity disabled:opacity-40">
              {isSaving ? 'Saving…' : isSaved ? 'Done' : 'Save'}
            </button>
          </>
        )}

      </div>

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
              <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center">
                <CheckCircle2 size={24} className="text-[#C03D25]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Documents Saved!</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                All required documents have been uploaded and saved successfully.
              </p>
            </div>
            <button type="button" onClick={() => router.push('/sales/booking/detail')}
              className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
              Done
            </button>
          </div>
        </div>
      )}

    </PageShell>

    {fileUrl && <FileOverlay url={fileUrl} title={fileTitle} onClose={closePreview} />}
    </>
  );
}
