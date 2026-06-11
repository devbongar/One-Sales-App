'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  FilePlus, ChevronRight, Building2, Hash, User, Tag,
  Clock, ListChecks, Layers, FileText, GitBranch, AlignLeft, X,
  CircleDot, CheckCircle2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestRecord {
  id:               string;
  reservation_id:   string | null;
  client_id:        string | null;
  client_name:      string | null;
  project_name:     string | null;
  inventory_code:   string | null;
  type_of_request:  string;
  sub_type:         string | null;
  request_category: string;
  turnaround_days:  number;
  description:      string | null;
  status:           string;
  submitted_at:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null) {
  if (!name) return 'RQ';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function categoryStyle(cat: string) {
  if (cat === 'simple')  return { bg: 'rgba(0,122,255,0.10)',  text: '#0055CC', label: 'Simple' };
  if (cat === 'complex') return { bg: 'rgba(255,159,10,0.12)', text: '#A05A00', label: 'Complex' };
  return { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: cat };
}

function statusStyle(status: string) {
  if (status === 'open')   return { bg: 'rgba(52,199,89,0.12)',  text: '#1A7F37', label: 'Open',   Icon: CircleDot };
  if (status === 'closed') return { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: 'Closed', Icon: CheckCircle2 };
  return { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: status, Icon: CircleDot };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return 'Just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Request Card ─────────────────────────────────────────────────────────────

export function RequestCard({ r, onClick }: { r: RequestRecord; onClick: () => void }) {
  const st = statusStyle(r.status);
  return (
    <GlassCard
      className="p-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
      >
        <span className="text-sm font-bold text-white">{getInitials(r.client_name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#1C1C1E] truncate">{r.reservation_id ?? '—'}</p>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: st.bg, color: st.text }}
          >
            {st.label}
          </span>
        </div>
        <p className="text-xs text-[#8E8E93] mt-0.5 truncate">{r.client_name ?? '—'}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
          <span className="text-xs text-[#6C6C70] truncate">{r.type_of_request}</span>
          {r.sub_type && (
            <>
              <span className="text-[#D1D1D6]">·</span>
              <span className="text-xs text-[#6C6C70] truncate">{r.sub_type}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-[#8E8E93]">{timeAgo(r.submitted_at)}</span>
        <span className="text-[10px] text-[#C7C7CC]">{r.turnaround_days}d TAT</span>
      </div>
    </GlassCard>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

export function RequestDetailSheet({ r, onClose }: { r: RequestRecord; onClose: () => void }) {
  const cat = categoryStyle(r.request_category);
  const st  = statusStyle(r.status);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex flex-col items-center pt-3 pb-4 px-5 border-b border-black/[0.06]">
          <div className="w-10 h-1 rounded-full bg-[#D1D1D6] mb-4" />
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
              >
                <span className="text-sm font-bold text-white">{getInitials(r.client_name)}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#1C1C1E]">{r.client_name ?? '—'}</p>
                <p className="text-xs text-[#8E8E93]">{r.reservation_id ?? '—'}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-60">
              <X size={14} className="text-[#6C6C70]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Buyer info */}
          <div>
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Buyer Information</p>
            <div className="bg-[#F2F2F7] rounded-2xl px-3 py-1 space-y-0">
              {([
                [<Hash size={13} key="ci" />,      'Client ID',      r.client_id      ?? '—'],
                [<User size={13} key="cn" />,      'Client Name',    r.client_name    ?? '—'],
                [<Hash size={13} key="ri" />,      'Reservation ID', r.reservation_id ?? '—'],
                [<Building2 size={13} key="pn" />, 'Project',        r.project_name   ?? '—'],
                [<Tag size={13} key="ic" />,       'Inventory Code', r.inventory_code ?? '—'],
              ] as [React.ReactNode, string, string][]).map(([icon, label, value]) => (
                <div key={label} className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] last:border-0">
                  <span className="text-[#C03D25] shrink-0">{icon}</span>
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">{label}</span>
                  <span className="text-xs text-[#6C6C70] text-right max-w-[55%] truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Request details */}
          <div>
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Request Details</p>
            <div className="bg-[#F2F2F7] rounded-2xl px-3 py-1 space-y-0">
              <div className="flex items-start gap-3 py-2.5 border-b border-black/[0.06]">
                <FileText size={13} className="text-[#C03D25] shrink-0 mt-0.5" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Type of Request</span>
                <span className="text-xs text-[#6C6C70] text-right max-w-[55%]">{r.type_of_request}</span>
              </div>
              {r.sub_type && (
                <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                  <GitBranch size={13} className="text-[#C03D25] shrink-0" />
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Sub Type</span>
                  <span className="text-xs text-[#6C6C70] text-right max-w-[55%]">{r.sub_type}</span>
                </div>
              )}
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <Layers size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Category</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: cat.bg, color: cat.text }}
                >
                  {cat.label}
                </span>
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <st.Icon size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Status</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: st.bg, color: st.text }}
                >
                  {st.label}
                </span>
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <Clock size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Turnaround</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{r.turnaround_days} days</span>
              </div>
              <div className="flex items-center gap-3 py-2.5">
                <Clock size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Submitted</span>
                <span className="text-xs text-[#6C6C70]">{formatDate(r.submitted_at)}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {r.description && (
            <div>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Description</p>
              <div className="bg-[#F2F2F7] rounded-2xl px-4 py-3 flex items-start gap-3">
                <AlignLeft size={13} className="text-[#C03D25] shrink-0 mt-0.5" />
                <p className="text-xs text-[#3A3A3C] leading-relaxed">{r.description}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequestInquiryPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<RequestRecord | null>(null);

  useEffect(() => {
    supabase
      .from('requests_and_inquiries')
      .select('id, reservation_id, client_id, client_name, project_name, inventory_code, type_of_request, sub_type, request_category, turnaround_days, description, status, submitted_at')
      .order('submitted_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRequests((data as RequestRecord[]) ?? []);
        setLoading(false);
      });
  }, []);

  const total   = requests.length;
  const open    = requests.filter(r => r.status === 'open').length;
  const closed  = requests.filter(r => r.status === 'closed').length;
  const recent  = requests.slice(0, 5);

  return (
    <PageShell title="Request and Inquiry">
      <div className="space-y-4 pb-6">

        {/* ── New Request CTA ── */}
        <button
          type="button"
          onClick={() => router.push('/account/request-inquiry/new')}
          className="w-full text-left active:scale-[0.98] transition-transform rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)',
            boxShadow: '0 4px 24px rgba(192,61,37,0.30)',
          }}
        >
          <div className="px-5 py-5 flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <FilePlus size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-tight">New Request</p>
              <p className="text-white/70 text-[12px] mt-0.5">Submit a buyer request or inquiry</p>
            </div>
            <ChevronRight size={18} className="text-white/60 shrink-0" />
          </div>
        </button>

        {/* ── Summary tiles ── */}
        <div className="grid grid-cols-3 gap-2">
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <ListChecks size={12} className="text-[#8E8E93]" />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Total</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">{loading ? '–' : total}</p>
          </GlassCard>
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CircleDot size={12} style={{ color: '#1A7F37' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Open</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">{loading ? '–' : open}</p>
          </GlassCard>
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} style={{ color: '#6C6C70' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Closed</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">{loading ? '–' : closed}</p>
          </GlassCard>
        </div>

        {/* ── View all button ── */}
        {!loading && total > 0 && (
          <button
            type="button"
            onClick={() => router.push('/account/request-inquiry/all')}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl active:scale-[0.98] transition-transform"
            style={{
              background: 'rgba(255,255,255,0.80)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(192,61,37,0.10)' }}>
                <ListChecks size={18} style={{ color: '#C03D25' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1C1C1E]">All Requests</p>
                <p className="text-[11px] text-[#8E8E93]">{total} total submitted</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-[#C7C7CC]" />
          </button>
        )}

        {/* ── Recent requests ── */}
        {loading ? (
          <GlassCard className="p-6 flex items-center justify-center">
            <p className="text-sm text-[#8E8E93]">Loading…</p>
          </GlassCard>
        ) : recent.length === 0 ? (
          <GlassCard className="p-8 flex flex-col items-center gap-3">
            <ListChecks size={32} className="text-[#D1D1D6]" />
            <p className="text-sm font-semibold text-[#8E8E93]">No requests yet</p>
            <p className="text-xs text-[#C7C7CC] text-center">Tap "New Request" above to submit one.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">Recent</p>
            {recent.map(r => (
              <RequestCard key={r.id} r={r} onClick={() => setSelected(r)} />
            ))}
            {total > 5 && (
              <button
                type="button"
                onClick={() => router.push('/account/request-inquiry/all')}
                className="w-full py-3 text-center text-sm font-semibold text-[#C03D25] active:opacity-60"
              >
                See all {total} requests →
              </button>
            )}
          </div>
        )}

      </div>

      {selected && <RequestDetailSheet r={selected} onClose={() => setSelected(null)} />}
    </PageShell>
  );
}
