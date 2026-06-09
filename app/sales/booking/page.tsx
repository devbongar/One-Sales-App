'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  Building2, ChevronRight, Loader2, Search,
  SlidersHorizontal, User, X, Check,
} from 'lucide-react';
import { getAllBookingProgress, BookingProgress, BookingStatus, computeBookingStatus } from '@/lib/booking-progress';

interface Reservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  status: string;
  seller_name: string | null;
  payment_proof_url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────
function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const BOOKING_STATUS_MAP: { value: BookingStatus; label: string }[] = [
  { value: 'not-started',       label: 'Not Started' },
  { value: 'in-progress',       label: 'In Progress' },
  { value: 'stage1-complete',   label: 'Docs Pending' },
  { value: 'fully-complete',    label: 'Docs Complete' },
  { value: 'submitted',         label: 'Submitted' },
  { value: 'director-rejected', label: 'Dir. Rejected' },
  { value: 'director-approved', label: 'Dir. Approved' },
  { value: 'finance-verified',  label: 'Finance Verified' },
];

function bookingStatusStyle(status: BookingStatus): React.CSSProperties & { label: string } {
  switch (status) {
    case 'finance-verified':  return { background: 'rgba(52,199,89,0.12)',   color: '#1A7F37', label: 'Finance Verified' } as any;
    case 'director-approved': return { background: 'rgba(48,176,199,0.12)',  color: '#0E6E7E', label: 'Dir. Approved' } as any;
    case 'director-rejected': return { background: 'rgba(255,59,48,0.12)',   color: '#C0392B', label: 'Dir. Rejected' } as any;
    case 'submitted':         return { background: 'rgba(0,122,255,0.12)',   color: '#0055B3', label: 'Submitted' } as any;
    case 'fully-complete':    return { background: 'rgba(175,82,222,0.12)',  color: '#7B2FA8', label: 'Docs Complete' } as any;
    case 'stage1-complete':   return { background: 'rgba(0,122,255,0.10)',   color: '#0055B3', label: 'Docs Pending' } as any;
    case 'in-progress':       return { background: 'rgba(255,159,10,0.12)',  color: '#A05A00', label: 'In Progress' } as any;
    default:                  return { background: 'rgba(142,142,147,0.12)', color: '#6C6C70', label: 'Not Started' } as any;
  }
}

// ── Page ──────────────────────────────────────────────────────
export default function BookingPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [progressMap, setProgressMap]   = useState<Record<string, BookingProgress>>({});
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterOpen, setFilterOpen]     = useState(false);

  // Filter options (from DB)
  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  // Active filters
  const [sellerFilter,  setSellerFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState<BookingStatus | ''>('');

  const activeFilterCount = [sellerFilter, projectFilter, statusFilter].filter(Boolean).length;

  // ── Load dropdown options once ─────────────────────────────
  useEffect(() => {
    supabase
      .from('reservations')
      .select('seller_name, project')
      .eq('status', 'Reserved-paid')
      .then(({ data }) => {
        if (!data) return;
        setSellerOptions([...new Set(data.map(r => r.seller_name).filter(Boolean))] as string[]);
        setProjectOptions([...new Set(data.map(r => r.project).filter(Boolean))] as string[]);
      });
  }, []);

  // ── Load reservations when DB filters change ───────────────
  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('reservation_id, client_name, project, inventory_code, unit_type, status, seller_name, payment_proof_url')
      .eq('status', 'Reserved-paid')
      .order('created_at', { ascending: false });

    if (sellerFilter)  query = query.eq('seller_name', sellerFilter);
    if (projectFilter) query = query.eq('project', projectFilter);

    Promise.all([
      query,
      getAllBookingProgress().catch(() => ({}) as Record<string, BookingProgress>),
    ]).then(([{ data }, progress]) => {
      setReservations((data ?? []) as Reservation[]);
      setProgressMap(progress);
      setLoading(false);
    });
  }, [sellerFilter, projectFilter]);

  // ── Client-side search + status filter ────────────────────
  const filtered = reservations.filter(r => {
    if (statusFilter) {
      const bs = computeBookingStatus(progressMap[r.reservation_id]);
      if (bs !== statusFilter) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !r.client_name.toLowerCase().includes(q) &&
        !r.reservation_id.toLowerCase().includes(q) &&
        !(r.inventory_code ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  function clearAllFilters() {
    setSellerFilter(''); setProjectFilter(''); setStatusFilter('');
  }

  return (
    <PageShell title="Booking">
      <div className="space-y-3 pb-6">

        {/* ── Search + Filter row ─────────────────────────── */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm">
            <Search size={15} className="text-[#8E8E93] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by client, ID or unit…"
              className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}>
                <X size={13} className="text-[#8E8E93]" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
              activeFilterCount > 0
                ? 'bg-[#C03D25] text-white shadow-md'
                : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
            }`}
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[#C03D25] text-[9px] font-bold flex items-center justify-center shadow">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── List ───────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <User size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No bookings found</p>
            <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const bs    = computeBookingStatus(progressMap[r.reservation_id]);
              const style = bookingStatusStyle(bs);
              const { label, ...badgeStyle } = style as any;

              return (
                <GlassCard
                  key={r.reservation_id}
                  className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => {
                    sessionStorage.setItem('currentReservationId', r.reservation_id);
                    sessionStorage.setItem('selectedReservation', JSON.stringify(r));
                    router.push('/sales/booking/detail');
                  }}
                >
                  <div className="flex items-center gap-3">

                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
                    >
                      <span className="text-sm font-bold text-white">
                        {getInitials(r.client_name)}
                      </span>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Client name + booking status */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#1C1C1E] truncate">{r.client_name}</p>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={badgeStyle}
                        >
                          {label}
                        </span>
                      </div>

                      {/* Project + unit */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#6C6C70] truncate">{r.project}</span>
                        {r.inventory_code && (
                          <>
                            <span className="text-[#D1D1D6]">·</span>
                            <span className="text-xs text-[#6C6C70] font-medium">{r.inventory_code}</span>
                          </>
                        )}
                      </div>

                      {/* Seller + reservation ID */}
                      <div className="flex items-center justify-between mt-0.5">
                        {r.seller_name ? (
                          <div className="flex items-center gap-1">
                            <User size={10} className="text-[#C7C7CC] shrink-0" />
                            <span className="text-[11px] text-[#8E8E93] truncate">{r.seller_name}</span>
                          </div>
                        ) : <span />}
                        <span className="text-[10px] font-semibold text-[#C03D25] tracking-wider shrink-0">
                          #{r.reservation_id}
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Filter sheet backdrop ──────────────────────────── */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/40"
          onClick={() => setFilterOpen(false)}
        />
      )}

      {/* ── Filter bottom sheet ────────────────────────────── */}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl">

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center"
            >
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>

          <div className="px-5 space-y-5 pb-4 max-h-[60vh] overflow-y-auto">

            {/* Booking Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Booking Status</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  key="all"
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    statusFilter === ''
                      ? 'bg-[#C03D25] border-[#C03D25] text-white'
                      : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                  }`}
                >
                  All
                </button>
                {BOOKING_STATUS_MAP.map(({ value, label }) => {
                  const s = bookingStatusStyle(value) as any;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusFilter(value)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5"
                      style={
                        statusFilter === value
                          ? { background: s.background, color: s.color, borderColor: s.color + '40' }
                          : { background: '#F2F2F7', color: '#6C6C70', borderColor: 'transparent' }
                      }
                    >
                      {statusFilter === value && <Check size={11} />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Project */}
            {projectOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
                <div className="flex gap-2 flex-wrap">
                  {(['', ...projectOptions]).map(p => (
                    <button key={p} type="button" onClick={() => setProjectFilter(p)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                        projectFilter === p
                          ? 'bg-[#C03D25] border-[#C03D25] text-white'
                          : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                      }`}>
                      {projectFilter === p && p && <Check size={11} />}
                      {p || 'All'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seller */}
            {sellerOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
                <div className="flex gap-2 flex-wrap">
                  {(['', ...sellerOptions]).map(s => (
                    <button key={s} type="button" onClick={() => setSellerFilter(s)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                        sellerFilter === s
                          ? 'bg-[#C03D25] border-[#C03D25] text-white'
                          : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                      }`}>
                      {sellerFilter === s && s && <Check size={11} />}
                      {s || 'All'}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Actions */}
          <div className="px-5 pb-10 pt-2 flex gap-3">
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Done
            </button>
          </div>
        </div>
      </div>

    </PageShell>
  );
}
