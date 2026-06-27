'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  Building2, ChevronRight, Loader2, Search,
  SlidersHorizontal, User, X,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { getAllBookingProgress, BookingProgress, BookingStatus, computeBookingStatus } from '@/lib/booking-progress';
import { getSession } from '@/lib/auth';

interface Reservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  status: string;
  finance_status: string | null;
  director_filled: boolean;
  created_by_uuid: string | null;
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
  { value: 'submitted',         label: 'For Dir. Review' },
  { value: 'director-rejected', label: 'Dir. Rejected' },
  { value: 'director-approved', label: 'Dir. Approved' },
  { value: 'amd-approved',      label: 'AMD Approved' },
  { value: 'Booked',            label: 'Booked' },
];

const BOOKING_STATUS_LABELS = BOOKING_STATUS_MAP.map(s => s.label);
const STATUS_BY_LABEL = Object.fromEntries(BOOKING_STATUS_MAP.map(({ value, label }) => [label, value])) as Record<string, BookingStatus>;

function bookingStatusStyle(status: BookingStatus): React.CSSProperties & { label: string } {
  switch (status) {
    case 'Booked':            return { background: 'rgba(52,199,89,0.18)',   color: '#1A7F37', label: 'Booked' } as any;
    case 'amd-approved':      return { background: 'rgba(52,199,89,0.12)',   color: '#1A7F37', label: 'AMD Approved' } as any;
    case 'director-approved': return { background: 'rgba(48,176,199,0.12)',  color: '#0E6E7E', label: 'Dir. Approved' } as any;
    case 'director-rejected': return { background: 'rgba(255,59,48,0.12)',   color: '#C0392B', label: 'Dir. Rejected' } as any;
    case 'submitted':         return { background: 'rgba(0,122,255,0.12)',   color: '#0055B3', label: 'For Dir. Review' } as any;
    case 'fully-complete':    return { background: 'rgba(175,82,222,0.12)',  color: '#7B2FA8', label: 'Docs Complete' } as any;
    case 'stage1-complete':   return { background: 'rgba(0,122,255,0.10)',   color: '#0055B3', label: 'Docs Pending' } as any;
    case 'in-progress':       return { background: 'rgba(255,159,10,0.12)',  color: '#A05A00', label: 'In Progress' } as any;
    default:                  return { background: 'rgba(142,142,147,0.12)', color: '#6C6C70', label: 'Not Started' } as any;
  }
}

// Review track badge — document/AMD progression only
function reviewBadge(bs: BookingStatus): { bg: string; color: string; label: string } {
  switch (bs) {
    case 'Booked':
    case 'amd-approved':      return { bg: 'rgba(52,199,89,0.18)',   color: '#1A7F37', label: 'AMD Approved' };
    case 'director-approved': return { bg: 'rgba(48,176,199,0.12)',  color: '#0E6E7E', label: 'Dir. Approved' };
    case 'director-rejected': return { bg: 'rgba(255,59,48,0.12)',   color: '#C0392B', label: 'Dir. Rejected' };
    case 'amd-rejected':      return { bg: 'rgba(255,59,48,0.12)',   color: '#C0392B', label: 'AMD Rejected' };
    case 'submitted':         return { bg: 'rgba(0,122,255,0.12)',   color: '#0055B3', label: 'For Dir. Review' };
    case 'fully-complete':    return { bg: 'rgba(175,82,222,0.12)',  color: '#7B2FA8', label: 'Docs Complete' };
    case 'stage1-complete':   return { bg: 'rgba(0,122,255,0.10)',   color: '#0055B3', label: 'Docs Pending' };
    case 'in-progress':       return { bg: 'rgba(255,159,10,0.12)',  color: '#A05A00', label: 'In Progress' };
    default:                  return { bg: 'rgba(142,142,147,0.18)', color: '#6C6C70', label: 'Not Started' };
  }
}

// Finance track badge — parallel, independent of review track
function financeBadge(financeStatus: string | null): { bg: string; color: string; label: string } {
  if (financeStatus === 'dp-verified')  return { bg: 'rgba(52,199,89,0.20)', color: '#1A7F37', label: '1st DP Verified' };
  if (financeStatus === 'rf-verified')  return { bg: 'rgba(48,176,199,0.15)', color: '#0E6E7E', label: 'RF Verified' };
  if (financeStatus === 'rf-rejected')  return { bg: 'rgba(255,59,48,0.12)',  color: '#C0392B', label: 'RF Rejected' };
  if (financeStatus === 'proof-submitted') return { bg: 'rgba(0,122,255,0.12)', color: '#0055B3', label: 'For RF Verification' };
  return { bg: 'rgba(255,159,10,0.15)', color: '#A05A00', label: 'Pending' };
}

async function paginateQuery(baseQuery: any): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];
  while (true) {
    const { data, error } = await baseQuery.range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
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
  const [statusFilter,  setStatusFilter]  = useState('');

  const activeFilterCount = [sellerFilter, projectFilter, statusFilter].filter(Boolean).length;
  const [userRoleName,   setUserRoleName]   = useState<string | null>(null);
  const [sellerUuid, setSellerUuid] = useState<string | null>(null);
  const isDirector  = userRoleName === 'Sales Director';
  const isAMD       = userRoleName === 'Account Management';
  const isAllAccess = userRoleName === 'All Access';
  const isSeller    = !isDirector && !isAMD && !isAllAccess && userRoleName !== null;

  type DirectorTab = 'for-review' | 'to-fill' | 'approved' | 'all';
  const [directorTab, setDirectorTab] = useState<DirectorTab>('for-review');
  const [dirForReviewCount, setDirForReviewCount] = useState(0);
  const [dirToFillCount,    setDirToFillCount]    = useState(0);
  type AMDTab = 'for-review' | 'approved' | 'rejected' | 'all';
  const [amdTab, setAMDTab] = useState<AMDTab>('for-review');
  const [amdForReviewCount, setAmdForReviewCount] = useState(0);
  const [amdRejectedCount,  setAmdRejectedCount]  = useState(0);

  type SellerTab = 'to-submit' | 'submitted' | 'rejected' | 'approved' | 'all';
  const [sellerTab, setSellerTab] = useState<SellerTab>('to-submit');
  const [sellerRejectedCount, setSellerRejectedCount] = useState(0);

  type AllAccessTab = 'reserved' | 'for-booking' | 'booked' | 'all';
  const [allAccessTab, setAllAccessTab] = useState<AllAccessTab>('all');

  useEffect(() => {
    getSession().then(s => {
      setUserRoleName(s?.role_name ?? null);
      setSellerUuid(s?.id ?? null);
    });
  }, []);

  // ── Seller tab counts ──────────────────────────────────────
  useEffect(() => {
    if (!isSeller || !sellerUuid) return;
    supabase.from('reservations').select('*', { count: 'exact', head: true }).in('status', ['Reserved', 'Booked']).eq('created_by_uuid', sellerUuid).eq('booking_review_status', 'director-rejected')
      .then(({ count }) => setSellerRejectedCount(count ?? 0));
  }, [isSeller, sellerUuid]);

  // ── Director tab counts ────────────────────────────────────
  useEffect(() => {
    if (!isDirector || !sellerUuid) return;
    supabase.from('reservations').select('*', { count: 'exact', head: true }).in('status', ['Reserved', 'Booked']).eq('booking_review_status', 'submitted')
      .then(({ count }) => setDirForReviewCount(count ?? 0));
    supabase.from('reservations').select('*', { count: 'exact', head: true }).in('status', ['Reserved', 'Booked']).or(`director_filled.eq.true,created_by_uuid.eq.${sellerUuid}`).or('booking_review_status.is.null,booking_review_status.eq.amd-rejected')
      .then(({ count }) => setDirToFillCount(count ?? 0));
  }, [isDirector, sellerUuid]);

  // ── AMD tab counts ─────────────────────────────────────────
  useEffect(() => {
    if (!isAMD) return;
    supabase.from('reservations').select('*', { count: 'exact', head: true }).in('status', ['Reserved', 'Booked']).eq('booking_review_status', 'director-approved')
      .then(({ count }) => setAmdForReviewCount(count ?? 0));
    supabase.from('reservations').select('*', { count: 'exact', head: true }).in('status', ['Reserved', 'Booked']).eq('booking_review_status', 'amd-rejected')
      .then(({ count }) => setAmdRejectedCount(count ?? 0));
  }, [isAMD]);

  // ── Load dropdown options once ─────────────────────────────
  useEffect(() => {
    (async () => {
      const rows = await paginateQuery(
        supabase.from('reservations').select('seller_name, project').in('status', ['Reserved', 'Booked'])
      );
      setSellerOptions([...new Set(rows.map((r: any) => r.seller_name).filter(Boolean))] as string[]);
      setProjectOptions([...new Set(rows.map((r: any) => r.project).filter(Boolean))] as string[]);
    })();
  }, []);

  // ── Load reservations when DB filters or role change ──────
  useEffect(() => {
    if (userRoleName === null) return; // wait for role to load
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('reservation_id, client_name, project, inventory_code, unit_type, status, finance_status, director_filled, created_by_uuid, seller_name, payment_proof_url')
      .in('status', ['Reserved', 'Booked'])
      .order('created_at', { ascending: false });

    if (isDirector) {
      if (directorTab === 'for-review') {
        query = query.eq('booking_review_status', 'submitted');
      } else if (directorTab === 'to-fill') {
        query = query
          .or(`director_filled.eq.true,created_by_uuid.eq.${sellerUuid}`)
          .or('booking_review_status.is.null,booking_review_status.eq.amd-rejected');
      } else if (directorTab === 'approved') {
        query = query.in('booking_review_status', ['director-approved', 'amd-approved']);
      }
      // 'all' — no booking_review_status filter
    } else if (isAMD) {
      if (amdTab === 'for-review') {
        query = query.eq('booking_review_status', 'director-approved');
      } else if (amdTab === 'approved') {
        query = query.eq('booking_review_status', 'amd-approved');
      } else if (amdTab === 'rejected') {
        query = query.eq('booking_review_status', 'amd-rejected');
      }
      // 'all' — no booking_review_status filter
    } else if (isSeller && sellerUuid) {
      query = query.eq('created_by_uuid', sellerUuid);
      if (sellerTab === 'to-submit') {
        query = query.or('booking_review_status.is.null,booking_review_status.eq.director-rejected');
      } else if (sellerTab === 'submitted') {
        query = query.eq('booking_review_status', 'submitted');
      } else if (sellerTab === 'rejected') {
        query = query.eq('booking_review_status', 'director-rejected');
      } else if (sellerTab === 'approved') {
        query = query.in('booking_review_status', ['director-approved', 'amd-approved']);
      }
      // 'all' — no booking_review_status filter
    }
    // All Access sees everything — no additional filter

    if (!isSeller && sellerFilter) query = query.eq('seller_name', sellerFilter);
    if (projectFilter) query = query.eq('project', projectFilter);

    (async () => {
      const [data, progress] = await Promise.all([
        paginateQuery(query),
        getAllBookingProgress().catch(() => ({}) as Record<string, BookingProgress>),
      ]);
      setReservations(data as Reservation[]);
      setProgressMap(progress);
      setLoading(false);
    })();
  }, [sellerFilter, projectFilter, userRoleName, isDirector, isAMD, isAllAccess, isSeller, sellerUuid, directorTab, amdTab, sellerTab]);

  // ── Client-side search + status filter ────────────────────
  const filtered = reservations.filter(r => {
    if (isAllAccess && allAccessTab !== 'all') {
      const isBooked     = r.status === 'Booked';
      const isForBooking = !isBooked && (
        progressMap[r.reservation_id]?.booking_review_status === 'amd-approved' ||
        r.finance_status === 'dp-verified'
      );
      const badgeKey = isBooked ? 'booked' : isForBooking ? 'for-booking' : 'reserved';
      if (badgeKey !== allAccessTab) return false;
    }
    if (statusFilter) {
      const bs = computeBookingStatus(progressMap[r.reservation_id]);
      if (bs !== STATUS_BY_LABEL[statusFilter]) return false;
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

        {/* ── AMD tab filter ─────────────────────────────── */}
        {isAMD && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {([
              { key: 'for-review', label: 'For Review', warn: amdForReviewCount > 0 },
              { key: 'approved',   label: 'Approved',   warn: false },
              { key: 'rejected',   label: 'Rejected',   warn: amdRejectedCount > 0 },
              { key: 'all',        label: 'All',         warn: false },
            ] as { key: AMDTab; label: string; warn: boolean }[]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAMDTab(tab.key)}
                className={`relative px-4 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                  amdTab === tab.key
                    ? 'bg-[#C03D25] text-white shadow-sm'
                    : 'bg-white/80 border border-black/[0.08] text-[#6C6C70]'
                }`}
              >
                {tab.label}
                {tab.warn && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 ${
                    amdTab === tab.key ? 'border-[#C03D25] bg-yellow-400' : 'border-white bg-yellow-400'
                  }`} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Director tab filter ────────────────────────── */}
        {isDirector && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {([
              { key: 'for-review', label: 'For Review', warn: dirForReviewCount > 0 },
              { key: 'to-fill',    label: 'To Fill',    warn: dirToFillCount > 0 },
              { key: 'approved',   label: 'Approved',   warn: false },
              { key: 'all',        label: 'All',         warn: false },
            ] as { key: DirectorTab; label: string; warn: boolean }[]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setDirectorTab(tab.key)}
                className={`relative px-4 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                  directorTab === tab.key
                    ? 'bg-[#C03D25] text-white shadow-sm'
                    : 'bg-white/80 border border-black/[0.08] text-[#6C6C70]'
                }`}
              >
                {tab.label}
                {tab.warn && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 ${
                    directorTab === tab.key ? 'border-[#C03D25] bg-yellow-400' : 'border-white bg-yellow-400'
                  }`} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Seller tab filter ──────────────────────────── */}
        {isSeller && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {([
              { key: 'to-submit', label: 'To Submit', warn: false },
              { key: 'submitted', label: 'Submitted',  warn: false },
              { key: 'rejected',  label: 'Rejected',   warn: sellerRejectedCount > 0 },
              { key: 'approved',  label: 'Approved',   warn: false },
              { key: 'all',       label: 'All',        warn: false },
            ] as { key: SellerTab; label: string; warn: boolean }[]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSellerTab(tab.key)}
                className={`relative px-4 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                  sellerTab === tab.key
                    ? 'bg-[#C03D25] text-white shadow-sm'
                    : 'bg-white/80 border border-black/[0.08] text-[#6C6C70]'
                }`}
              >
                {tab.label}
                {tab.warn && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 ${
                    sellerTab === tab.key ? 'border-[#C03D25] bg-yellow-400' : 'border-white bg-yellow-400'
                  }`} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── All Access tab filter ─────────────────────── */}
        {isAllAccess && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {([
              { key: 'all',         label: 'All' },
              { key: 'reserved',    label: 'Reserved' },
              { key: 'for-booking', label: 'For Booking' },
              { key: 'booked',      label: 'Booked' },
            ] as { key: AllAccessTab; label: string }[]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAllAccessTab(tab.key)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                  allAccessTab === tab.key
                    ? 'bg-[#C03D25] text-white shadow-sm'
                    : 'bg-white/80 border border-black/[0.08] text-[#6C6C70]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

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
              const isBooked     = r.status === 'Booked';
              const isForBooking = !isBooked && (
                progressMap[r.reservation_id]?.booking_review_status === 'amd-approved' ||
                r.finance_status === 'dp-verified'
              );
              const badge = isBooked
                ? { label: 'Booked',      bg: 'rgba(52,199,89,0.18)',   color: '#1A7F37' }
                : isForBooking
                ? { label: 'For Booking', bg: 'rgba(48,176,199,0.12)',  color: '#0E6E7E' }
                : { label: 'Reserved',    bg: 'rgba(142,142,147,0.12)', color: '#6C6C70' };

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
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#1C1C1E] truncate">{r.reservation_id}</p>
                        <span
                          className="text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-[#8E8E93] mt-0.5 truncate">{r.client_name}</p>

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

                      {/* Seller */}
                      {r.seller_name && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <User size={10} className="text-[#C7C7CC] shrink-0" />
                          <span className="text-[11px] text-[#8E8E93] truncate">{r.seller_name}</span>
                        </div>
                      )}
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

          <div className="px-5 space-y-4 pb-4 max-h-[60vh] overflow-y-auto">

            {/* Booking Status */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Booking Status</p>
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={BOOKING_STATUS_LABELS}
                placeholder="All Statuses"
              />
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
              <SearchableSelect
                value={projectFilter}
                onChange={setProjectFilter}
                options={projectOptions}
                placeholder="All Projects"
              />
            </div>

            {/* Seller */}
            {!isSeller && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
                <SearchableSelect
                  value={sellerFilter}
                  onChange={setSellerFilter}
                  options={sellerOptions}
                  placeholder="All Sellers"
                />
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
