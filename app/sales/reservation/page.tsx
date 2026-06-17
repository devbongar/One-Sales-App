'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  FilePlus, ChevronRight, Building2, User,
  CheckCircle2, Clock, ShieldCheck, ListChecks, BookmarkCheck,
} from 'lucide-react';
import { getSession } from '@/lib/auth';

interface RecentReservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  status: string;
  finance_status: string | null;
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

interface StatusCounts {
  reserved: number;
  forVerification: number;
  rfApproved: number;
  total: number;
}

function statusStyle(status: string, financeStatus: string | null): { bg: string; text: string; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> } {
  if (status === 'Pending Proof')                return { bg: 'rgba(255,159,10,0.12)', text: '#A05A00', label: 'Pending Proof',       Icon: Clock };
  if (financeStatus === 'rf-rejected')           return { bg: 'rgba(255,59,48,0.12)',  text: '#C0392B', label: 'RF Rejected',          Icon: Clock };
  if (financeStatus === 'rf-verified')           return { bg: 'rgba(52,199,89,0.12)',  text: '#1A7F37', label: 'RF Approved',          Icon: CheckCircle2 };
  if (financeStatus === 'proof-submitted')       return { bg: 'rgba(48,176,199,0.12)', text: '#0E6E7E', label: 'RF for Verification',  Icon: ShieldCheck };
  return                                                { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: status,                Icon: Clock };
}

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ReservationPage() {
  const router = useRouter();
  const [counts, setCounts]   = useState<StatusCounts>({ reserved: 0, forVerification: 0, rfApproved: 0, total: 0 });
  const [recent, setRecent]   = useState<RecentReservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const session = await getSession();
      const roleName = session?.role_name ?? null;
      const isPrivileged = roleName === 'All Access' || roleName === 'Sales Director' || roleName === 'Account Management';

      let query = supabase
        .from('reservations')
        .select('reservation_id, client_name, project, inventory_code, status, finance_status, created_at')
        .neq('status', 'Booked')
        .neq('status', 'Cancelled')
        .or('finance_status.is.null,finance_status.eq.proof-submitted,finance_status.eq.rf-rejected,finance_status.eq.rf-verified')
        .order('created_at', { ascending: false });

      if (!isPrivileged && session?.id) {
        query = query.eq('created_by_uuid', session.id);
      }

      const { data } = await query;

      if (data) {
        setCounts({
          reserved:        data.filter(r => !r.finance_status).length,
          forVerification: data.filter(r => r.finance_status === 'proof-submitted' || r.finance_status === 'rf-rejected').length,
          rfApproved:      data.filter(r => r.finance_status === 'rf-verified').length,
          total:           data.length,
        });
        setRecent(data.slice(0, 5) as RecentReservation[]);
      }
      setLoading(false);
    }
    load();
  }, []);


  return (
    <PageShell title="Reservation">
      <div className="space-y-4 pb-6">

        {/* ── Primary action ─────────────────────────────── */}
        <button
          type="button"
          onClick={() => router.push('/sales/reservation/new')}
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
              <p className="text-white font-bold text-base leading-tight">New Reservation</p>
              <p className="text-white/70 text-[12px] mt-0.5">Start a client reservation flow</p>
            </div>
            <ChevronRight size={18} className="text-white/60 shrink-0" />
          </div>
        </button>

        {/* ── Status summary ─────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {/* Pending Proof */}
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: '#A05A00' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Pending Proof</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">
              {loading ? '–' : counts.reserved}
            </p>
          </GlassCard>
          {/* For Verification */}
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={12} style={{ color: '#0E6E7E' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">For Verif.</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">
              {loading ? '–' : counts.forVerification}
            </p>
          </GlassCard>
          {/* RF Approved */}
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} style={{ color: '#1A7F37' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">RF Approved</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">
              {loading ? '–' : counts.rfApproved}
            </p>
          </GlassCard>
        </div>

        {/* ── View all button ─────────────────────────────── */}
        <button
          type="button"
          onClick={() => router.push('/sales/reservation/reserved')}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl active:scale-[0.98] transition-transform"
          style={{
            background: 'rgba(255,255,255,0.80)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0,0,0,0.07)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(88,86,214,0.10)' }}>
              <ListChecks size={18} style={{ color: '#5856D6' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1C1C1E]">Reserved Units</p>
              <p className="text-[11px] text-[#8E8E93]">{loading ? '…' : `${counts.total} total reservations`}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[#C7C7CC]" />
        </button>

        {/* ── Saved Quotations shortcut ───────────────────── */}
        <button
          type="button"
          onClick={() => router.push('/sales/quotations')}
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
              <BookmarkCheck size={18} style={{ color: '#C03D25' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1C1C1E]">Saved Quotations</p>
              <p className="text-[11px] text-[#8E8E93]">Proceed quotations to reservation</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[#C7C7CC]" />
        </button>

        {/* ── Recent reservations ─────────────────────────── */}
        {!loading && recent.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">Recent</p>
            {recent.map(r => {
              const s = statusStyle(r.status, r.finance_status);
              return (
                <GlassCard
                  key={r.reservation_id}
                  className="p-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => {
                    sessionStorage.setItem('currentReservationId', r.reservation_id);
                    sessionStorage.setItem('selectedReservation', JSON.stringify(r));
                    sessionStorage.setItem('proofEntrySource', 'list');
                    router.push('/sales/reservation/proof');
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
                  >
                    <span className="text-sm font-bold text-white">{getInitials(r.client_name)}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#1C1C1E] truncate">{r.reservation_id}</p>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: s.bg, color: s.text }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#8E8E93] mt-0.5 truncate">{r.client_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs text-[#6C6C70] truncate">{r.project}</span>
                      {r.inventory_code && (
                        <>
                          <span className="text-[#D1D1D6]">·</span>
                          <span className="text-xs font-medium text-[#6C6C70]">{r.inventory_code}</span>
                        </>
                      )}
                      <span className="text-[#D1D1D6]">·</span>
                      <Clock size={10} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs text-[#8E8E93]">{daysElapsedLabel(r.created_at)}</span>
                    </div>
                  </div>

                  <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                </GlassCard>
              );
            })}

            {/* See all link */}
            <button
              type="button"
              onClick={() => router.push('/sales/reservation/reserved')}
              className="w-full py-3 text-center text-sm font-semibold text-[#C03D25] active:opacity-60"
            >
              See all reservations →
            </button>
          </div>
        )}

      </div>
    </PageShell>
  );
}
