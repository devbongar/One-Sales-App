'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { generateReservationAgreement, generateBuyerInformationForm, generateTermsOfPayment } from '@/lib/pdf-generators';
import {
  Building2, Tag, User, FileText,
  ChevronRight, Loader2, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderReservation {
  reservation_id:                    string;
  client_name:                       string;
  project:                           string;
  inventory_code:                    string | null;
  unit_type:                         string;
  tower:                             string | null;
  floor:                             string | null;
  unit_no:                           string | null;
  seller_name:                       string | null;
  status:                            string;
  has_co_ownership:                  boolean | null;
  has_atty_in_fact:                  boolean | null;
  has_spouse:                        boolean | null;
  proof_of_billing_urls:             string | null;
  proof_of_income_urls:              string | null;
  additional_proof_of_income_urls:   string | null;
  existing_loan_disclosure_urls:     string | null;
  signed_floor_layout_urls:          string | null;
  proof_of_valid_id_urls:            string | null;
  co_owner_id_urls:                  string[] | null;
  atty_in_fact_id_urls:              string[] | null;
  spouse_id_urls:                    string[] | null;
  created_at:                        string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function folderChip(r: FolderReservation): { label: string; cls: string } {
  const count = [
    parseJson(r.proof_of_billing_urls).length > 0,
    parseJson(r.proof_of_income_urls).length > 0,
    parseJson(r.additional_proof_of_income_urls).length > 0,
    parseJson(r.existing_loan_disclosure_urls).length > 0,
    parseJson(r.signed_floor_layout_urls).length > 0,
    parseJson(r.proof_of_valid_id_urls).length > 0,
    (r.co_owner_id_urls ?? []).length > 0,
    (r.atty_in_fact_id_urls ?? []).length > 0,
    (r.spouse_id_urls ?? []).length > 0,
  ].filter(Boolean).length;
  if (count === 9) return { label: 'Complete',        cls: 'bg-green-100 text-green-700' };
  if (count === 0) return { label: 'Empty',           cls: 'bg-gray-100 text-gray-500' };
  return              { label: `${count}/9 docs`,     cls: 'bg-amber-100 text-amber-700' };
}

// ─── File overlay ─────────────────────────────────────────────────────────────

function FileOverlay({ url, title, onClose, isBlob }: { url: string; title: string; onClose: () => void; isBlob?: boolean }) {
  useEffect(() => {
    return () => { if (isBlob) URL.revokeObjectURL(url); };
  }, [url, isBlob]);

  const img = isImage(url);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1C1C1E]">
      <div className="flex items-center justify-between px-4 pb-3 bg-[#1C1C1E] border-b border-white/10 shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
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

// ─── Document preview cards ───────────────────────────────────────────────────

function DocPreviewCard({ label, icon, date, onOpen, generating }: {
  label: string;
  icon: React.ReactElement;
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

function AgreementPreviewCard({ r, onPdf }: { r: FolderReservation; onPdf: (url: string, title: string) => void }) {
  const [generating, setGenerating] = useState(false);
  async function handleOpen() {
    setGenerating(true);
    try {
      const url = await generateReservationAgreement(r.reservation_id, false) as string;
      onPdf(url, 'Reservation Agreement');
    } finally { setGenerating(false); }
  }
  return <DocPreviewCard label="Reservation Agreement" icon={<FileText size={18} className="text-[#C03D25]" />} date={r.created_at} onOpen={handleOpen} generating={generating} />;
}

function TermsPreviewCard({ r, onPdf }: { r: FolderReservation; onPdf: (url: string, title: string) => void }) {
  const [generating, setGenerating] = useState(false);
  async function handleOpen() {
    setGenerating(true);
    try {
      const url = await generateTermsOfPayment(r.reservation_id, false) as string;
      onPdf(url, 'Terms of Payment');
    } finally { setGenerating(false); }
  }
  return <DocPreviewCard label="Terms of Payment" icon={<FileText size={18} className="text-[#C03D25]" />} date={r.created_at} onOpen={handleOpen} generating={generating} />;
}

function BuyerInfoPreviewCard({ r, onPdf }: { r: FolderReservation; onPdf: (url: string, title: string) => void }) {
  const [generating, setGenerating] = useState(false);
  async function handleOpen() {
    setGenerating(true);
    try {
      const url = await generateBuyerInformationForm(r.reservation_id, false) as string;
      onPdf(url, 'Buyer Information Form');
    } finally { setGenerating(false); }
  }
  return <DocPreviewCard label="Buyer Information Form" icon={<User size={18} className="text-[#C03D25]" />} date={r.created_at} onOpen={handleOpen} generating={generating} />;
}

// ─── Upload document cards ────────────────────────────────────────────────────

function FileTile({ url, onOpen }: { url: string; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square active:opacity-70 w-full"
    >
      {isImage(url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={fileName(url)} className="w-full h-full object-cover" />
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersFolderingDetailPage() {
  const router = useRouter();
  const [reservation, setReservation] = useState<FolderReservation | null>(null);
  const [fileUrl,     setFileUrl]     = useState<string | null>(null);
  const [fileTitle,   setFileTitle]   = useState('');
  const [fileIsBlob,  setFileIsBlob]  = useState(false);

  function openFile(url: string, title: string, isBlob = false) { setFileUrl(url); setFileTitle(title); setFileIsBlob(isBlob); }
  function closeFile() { setFileUrl(null); setFileTitle(''); setFileIsBlob(false); }

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { router.replace('/account/buyers-foldering'); return; }
    const stored = JSON.parse(raw) as { reservation_id: string };

    supabase
      .from('reservations')
      .select(`reservation_id, client_name, project, inventory_code, unit_type,
        tower, floor, unit_no, seller_name, status,
        has_co_ownership, has_atty_in_fact, has_spouse,
        proof_of_billing_urls, proof_of_income_urls, additional_proof_of_income_urls,
        existing_loan_disclosure_urls, signed_floor_layout_urls, proof_of_valid_id_urls,
        co_owner_id_urls, atty_in_fact_id_urls, spouse_id_urls, created_at`)
      .eq('reservation_id', stored.reservation_id)
      .maybeSingle()
      .then(({ data }) => { if (data) setReservation(data as FolderReservation); });
  }, []);

  if (!reservation) {
    return (
      <PageShell title="Buyer's Folder" backButton onBack={() => router.push('/account/buyers-foldering')}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-[#C03D25] animate-spin" />
        </div>
      </PageShell>
    );
  }

  const chip = folderChip(reservation);

  return (
    <>
      <PageShell title="Buyer's Folder" backButton onBack={() => router.push('/account/buyers-foldering')}>
        <div className="space-y-3 pb-4">

          {/* Hero card */}
          <GlassCard className="overflow-hidden">
            <div className="px-4 py-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
                <span className="text-lg font-bold text-white">{getInitials(reservation.client_name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Reservation ID</p>
                <p className="text-lg font-bold text-[#1C1C1E] truncate">{reservation.reservation_id}</p>
                <p className="text-sm text-[#6C6C70] truncate">{reservation.client_name}</p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${chip.cls}`}>
                {chip.label}
              </span>
            </div>
            <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Building2 size={12} className="text-[#C7C7CC]" />
                <span className="text-xs text-[#6C6C70]">{reservation.project}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Tag size={12} className="text-[#C7C7CC]" />
                <span className="text-xs font-medium text-[#6C6C70]">
                  {[reservation.tower ? `Tower ${reservation.tower}` : null, reservation.inventory_code].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
            </div>
            {reservation.seller_name && (
              <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center gap-1.5">
                <User size={12} className="text-[#C7C7CC]" />
                <span className="text-xs text-[#6C6C70]">{reservation.seller_name}</span>
              </div>
            )}
          </GlassCard>

          {/* Generated PDFs */}
          <GroupLabel label="Documents" />
          <AgreementPreviewCard r={reservation} onPdf={(url, title) => openFile(url, title, true)} />
          <TermsPreviewCard     r={reservation} onPdf={(url, title) => openFile(url, title, true)} />
          <BuyerInfoPreviewCard r={reservation} onPdf={(url, title) => openFile(url, title, true)} />

          {/* Uploaded documents */}
          <GroupLabel label="Submitted Files" />
          <DocCard label="Proof of Billing"           urls={parseJson(reservation.proof_of_billing_urls)}           onFileOpen={url => openFile(url, fileName(url))} />
          <DocCard label="Proof of Income"            urls={parseJson(reservation.proof_of_income_urls)}            onFileOpen={url => openFile(url, fileName(url))} />
          <DocCard label="Additional Proof of Income" urls={parseJson(reservation.additional_proof_of_income_urls)} onFileOpen={url => openFile(url, fileName(url))} />
          <DocCard label="Existing Loan Disclosure"   urls={parseJson(reservation.existing_loan_disclosure_urls)}   onFileOpen={url => openFile(url, fileName(url))} />
          <DocCard label="Signed Floor Layout"        urls={parseJson(reservation.signed_floor_layout_urls)}        onFileOpen={url => openFile(url, fileName(url))} />
          <DocCard label="Buyer Valid ID"             urls={parseJson(reservation.proof_of_valid_id_urls)}          onFileOpen={url => openFile(url, fileName(url))} />
          {reservation.has_co_ownership  && <DocCard label="Co-Owner Valid ID"         urls={reservation.co_owner_id_urls     ?? []} onFileOpen={url => openFile(url, fileName(url))} />}
          {reservation.has_spouse        && <DocCard label="Spouse Valid ID"           urls={reservation.spouse_id_urls       ?? []} onFileOpen={url => openFile(url, fileName(url))} />}
          {reservation.has_atty_in_fact  && <DocCard label="Attorney in Fact Valid ID" urls={reservation.atty_in_fact_id_urls ?? []} onFileOpen={url => openFile(url, fileName(url))} />}

        </div>
      </PageShell>

      {fileUrl && <FileOverlay url={fileUrl} title={fileTitle} isBlob={fileIsBlob} onClose={closeFile} />}
    </>
  );
}
