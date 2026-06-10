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

function statusLabel(status: string) {
  if (status === 'Reserved-paid')   return 'Paid';
  if (status === 'Reserved-unpaid') return 'Unpaid';
  if (status === 'Approved')        return 'Approved';
  return status;
}

function statusStyle(status: string): React.CSSProperties {
  if (status === 'Reserved-paid')   return { background: 'rgba(52,199,89,0.12)',  color: '#1A7F37' };
  if (status === 'Reserved-unpaid') return { background: 'rgba(255,159,10,0.12)', color: '#A05A00' };
  if (status === 'Approved')        return { background: 'rgba(48,176,199,0.12)', color: '#0E6E7E' };
  return { background: 'rgba(142,142,147,0.12)', color: '#6C6C70' };
}

// ── Page ──────────────────────────────────────────────────────
export default function ReservedUnitsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterOpen, setFilterOpen]     = useState(false);

  // Filter options (from DB)
  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const statusOptions = ['Reserved-unpaid', 'Reserved-paid', 'Approved'];

  // Active filters
  const [sellerFilter,  setSellerFilter]  = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const activeFilterCount = [sellerFilter, statusFilter, projectFilter].filter(Boolean).length;

  // ── Load dropdown options once ─────────────────────────────
  useEffect(() => {
    supabase.from('reservations').select('seller_name, project').limit(5000).then(({ data }) => {
      if (!data) return;
      setSellerOptions([...new Set(data.map(r => r.seller_name).filter(Boolean))] as string[]);
      setProjectOptions([...new Set(data.map(r => r.project).filter(Boolean))] as string[]);
    });
  }, []);

  // ── Load reservations when filters change ──────────────────
  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('reservation_id, client_name, project, inventory_code, unit_type, status, seller_name, payment_proof_url')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (sellerFilter)  query = query.eq('seller_name', sellerFilter);
    if (statusFilter)  query = query.eq('status', statusFilter);
    if (projectFilter) query = query.eq('project', projectFilter);

    query.then(({ data }) => {
      setReservations((data ?? []) as Reservation[]);
      setLoading(false);
    });
  }, [sellerFilter, statusFilter, projectFilter]);

  // ── Client-side search filter ──────────────────────────────
  const filtered = search.trim()
    ? reservations.filter(r =>
        r.client_name.toLowerCase().includes(search.toLowerCase()) ||
        r.reservation_id.toLowerCase().includes(search.toLowerCase()) ||
        (r.inventory_code ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : reservations;

  function clearAllFilters() {
    setSellerFilter(''); setStatusFilter(''); setProjectFilter('');
  }

  return (
    <PageShell title="Reserved Units" backButton onBack={() => router.push('/sales/reservation')}>
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
            <p className="text-sm font-semibold text-[#1C1C1E]">No reservations found</p>
            <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <GlassCard
                key={r.reservation_id}
                className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                onClick={() => {
                  sessionStorage.setItem('currentReservationId', r.reservation_id);
                  sessionStorage.setItem('selectedReservation', JSON.stringify(r));
                  sessionStorage.setItem('proofEntrySource', 'list');
                  router.push('/sales/reservation/proof');
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
                    {/* Reservation ID + status */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#1C1C1E] truncate">{r.reservation_id}</p>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={statusStyle(r.status)}
                      >
                        {statusLabel(r.status)}
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
            ))}
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

            {/* Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Status</p>
              <div className="flex gap-2 flex-wrap">
                {(['', ...statusOptions] as string[]).map(s => (
                  <button key={s} type="button" onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      statusFilter === s
                        ? 'bg-[#C03D25] border-[#C03D25] text-white'
                        : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                    }`}>
                    {s ? statusLabel(s) : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Project */}
            {projectOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
                <select
                  value={projectFilter}
                  onChange={e => setProjectFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 appearance-none"
                >
                  <option value="">All Projects</option>
                  {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}

            {/* Seller */}
            {sellerOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
                <select
                  value={sellerFilter}
                  onChange={e => setSellerFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 appearance-none"
                >
                  <option value="">All Sellers</option>
                  {sellerOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
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
