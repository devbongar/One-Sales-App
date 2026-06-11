'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  FilePlus, ChevronRight, Building2, User,
  CheckCircle2, Clock, ShieldCheck, ListChecks,
} from 'lucide-react';

interface RecentReservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  status: string;
}

interface StatusCounts {
  paid: number;
  unpaid: number;
  approved: number;
}

function statusStyle(status: string): { bg: string; text: string; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> } {
  if (status === 'Reserved-paid')   return { bg: 'rgba(52,199,89,0.12)',  text: '#1A7F37', label: 'Paid',     Icon: CheckCircle2 };
  if (status === 'Reserved-unpaid') return { bg: 'rgba(255,159,10,0.12)', text: '#A05A00', label: 'Unpaid',   Icon: Clock };
  if (status === 'Reserved')        return { bg: 'rgba(48,176,199,0.12)', text: '#0E6E7E', label: 'Reserved', Icon: ShieldCheck };
  return                                   { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: status,    Icon: Clock };
}

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ReservationPage() {
  const router = useRouter();
  const [counts, setCounts]   = useState<StatusCounts>({ paid: 0, unpaid: 0, approved: 0 });
  const [recent, setRecent]   = useState<RecentReservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('reservations')
        .select('reservation_id, client_name, project, inventory_code, status')
        .order('created_at', { ascending: false });

      if (data) {
        setCounts({
          paid:     data.filter(r => r.status === 'Reserved-paid').length,
          unpaid:   data.filter(r => r.status === 'Reserved-unpaid').length,
          approved: data.filter(r => r.status === 'Reserved').length,
        });
        setRecent(data.slice(0, 5) as RecentReservation[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const total = counts.paid + counts.unpaid + counts.approved;

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
          {/* Unpaid */}
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: '#A05A00' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Unpaid</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">
              {loading ? '–' : counts.unpaid}
            </p>
          </GlassCard>
          {/* Paid */}
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} style={{ color: '#1A7F37' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Paid</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">
              {loading ? '–' : counts.paid}
            </p>
          </GlassCard>
          {/* Approved */}
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={12} style={{ color: '#0E6E7E' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Reserved</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">
              {loading ? '–' : counts.approved}
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
              <p className="text-[11px] text-[#8E8E93]">{loading ? '…' : `${total} total reservations`}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[#C7C7CC]" />
        </button>

        {/* ── Recent reservations ─────────────────────────── */}
        {!loading && recent.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">Recent</p>
            {recent.map(r => {
              const s = statusStyle(r.status);
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
