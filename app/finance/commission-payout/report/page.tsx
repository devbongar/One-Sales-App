'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  fetchAllCommissionScheduleLines,
  fetchAllCollectedByReservation,
  fetchCommissionRecords,
  releaseCommissionTranches,
  CommissionScheduleFullLine,
} from '@/lib/commission';
import { Check, Loader2, Search, Send, SlidersHorizontal, Wallet, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type EffectiveStatus = 'For Release' | 'Released';

interface ReportLine extends CommissionScheduleFullLine {
  effectiveStatus: EffectiveStatus;
  positionRank:    string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function positionLabel(rank: string | null) {
  const map: Record<string, string> = {
    PS: 'Property Specialist', SM: 'Sales Manager', SD: 'Sales Director',
    SDH: 'Sales Division Head', SH: 'Sales Head',
  };
  return map[rank ?? ''] ?? rank ?? '—';
}

function commissionId(id: number) {
  return `CS-${String(id).padStart(5, '0')}`;
}

const STATUS_STYLE: Record<EffectiveStatus, React.CSSProperties> = {
  'For Release': { background: 'rgba(147,51,234,0.12)', color: '#6D28D9' },
  'Released':    { background: 'rgba(52,199,89,0.12)',  color: '#1A7F37' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommissionPayoutReportPage() {
  const router = useRouter();

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [lines, setLines]       = useState<ReportLine[]>([]);

  // Filter state
  const [search, setSearch]                     = useState('');
  const [filterOpen, setFilterOpen]             = useState(false);
  const [statusFilter, setStatusFilter]         = useState<EffectiveStatus | ''>('');
  const [sellerFilter, setSellerFilter]         = useState('');
  const [positionFilter, setPositionFilter]     = useState('');

  // Selection + post state
  const [selectedTranches, setSelectedTranches] = useState<Set<number>>(new Set());
  const [confirmPost, setConfirmPost]           = useState(false);
  const [posting, setPosting]                   = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('payoutReportProjects');
    if (!stored) { router.replace('/finance/commission-payout'); return; }
    const selectedProjects = JSON.parse(stored) as string[];

    async function load() {
      try {
        const [allLines, collectionsMap, commRecords] = await Promise.all([
          fetchAllCommissionScheduleLines(),
          fetchAllCollectedByReservation(),
          fetchCommissionRecords(),
        ]);

        const nlpMap: Record<string, number>  = {};
        const rankMap: Record<string, string> = {};
        commRecords.forEach(r => {
          nlpMap[r.reservation_id] = r.net_list_price ?? 0;
          if (r.seller_name && r.position_rank) rankMap[r.seller_name] = r.position_rank;
        });

        const projectSet = new Set(selectedProjects);
        const result: ReportLine[] = [];

        for (const line of allLines) {
          if (!projectSet.has(line.project)) continue;

          let effectiveStatus: EffectiveStatus | 'Pending';
          if (line.status === 'Released') {
            effectiveStatus = 'Released';
          } else {
            const nlp          = nlpMap[line.reservation_id] ?? 0;
            const collected    = collectionsMap[line.reservation_id] ?? 0;
            const pctCollected = nlp > 0 ? (collected / nlp) * 100 : 0;
            effectiveStatus    = (pctCollected >= line.percentage_collection || line.status === 'For Release')
              ? 'For Release'
              : 'Pending';
          }

          if (effectiveStatus === 'Pending') continue;

          result.push({
            ...line,
            effectiveStatus,
            positionRank: line.seller_name ? (rankMap[line.seller_name] ?? null) : null,
          });
        }

        setLines(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Filter options ──────────────────────────────────────────────────────────
  const sellerOptions   = useMemo(() => [...new Set(lines.map(l => l.seller_name).filter(Boolean))].sort() as string[], [lines]);
  const positionOptions = useMemo(() => [...new Set(lines.map(l => l.positionRank).filter(Boolean))].sort() as string[], [lines]);
  const activeFilterCount = [statusFilter, sellerFilter, positionFilter].filter(Boolean).length;

  // ── Filtered lines ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return lines.filter(l => {
      if (statusFilter   && l.effectiveStatus !== statusFilter) return false;
      if (sellerFilter   && l.seller_name     !== sellerFilter) return false;
      if (positionFilter && l.positionRank    !== positionFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.reservation_id.toLowerCase().includes(q) &&
          !(l.seller_name   ?? '').toLowerCase().includes(q) &&
          !(l.inventory_code ?? '').toLowerCase().includes(q) &&
          !commissionId(l.id).toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [lines, statusFilter, sellerFilter, positionFilter, search]);

  // ── Summary totals (full unfiltered) ───────────────────────────────────────
  const totalForRelease = useMemo(() => lines.filter(l => l.effectiveStatus === 'For Release').reduce((s, l) => s + l.gross_commission, 0), [lines]);
  const totalReleased   = useMemo(() => lines.filter(l => l.effectiveStatus === 'Released').reduce((s, l)   => s + l.gross_commission, 0), [lines]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const visibleForRelease = useMemo(() => filtered.filter(l => l.effectiveStatus === 'For Release'), [filtered]);

  function toggleTranche(id: number) {
    setSelectedTranches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedTranches(new Set(visibleForRelease.map(l => l.id)));
  }

  function clearSelection() {
    setSelectedTranches(new Set());
  }

  const selectedCount = selectedTranches.size;
  const selectedTotal = useMemo(
    () => lines.filter(l => selectedTranches.has(l.id)).reduce((s, l) => s + l.gross_commission, 0),
    [lines, selectedTranches],
  );
  const allVisibleSelected = visibleForRelease.length > 0 && visibleForRelease.every(l => selectedTranches.has(l.id));

  // ── Post action ─────────────────────────────────────────────────────────────
  async function handlePost() {
    setPosting(true);
    setConfirmPost(false);
    try {
      const ids = [...selectedTranches];
      await releaseCommissionTranches(ids);
      const idSet = new Set(ids);
      setLines(prev => prev.map(l =>
        idSet.has(l.id)
          ? { ...l, status: 'Released', effectiveStatus: 'Released' as EffectiveStatus }
          : l
      ));
      setSelectedTranches(new Set());
    } catch (e: any) {
      alert(`Failed to post commission: ${e.message}`);
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <PageShell title="Payout Report" backButton onBack={() => router.back()}>
        <div className="space-y-3 pb-32">

          {/* ── Summary stats ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="p-4">
              <p className="text-[#8E8E93] text-xs font-semibold">For Release</p>
              <p className="text-[#C7C7CC] text-[10px] mb-1">Gross Commission</p>
              <p className="text-[#C03D25] font-bold text-lg leading-tight">
                {loading ? '—' : fmt(totalForRelease)}
              </p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-[#8E8E93] text-xs font-semibold">Released</p>
              <p className="text-[#C7C7CC] text-[10px] mb-1">Gross Commission</p>
              <p className="text-[#34C759] font-bold text-lg leading-tight">
                {loading ? '—' : fmt(totalReleased)}
              </p>
            </GlassCard>
          </div>

          {/* ── Search + Filter ─────────────────────────────────── */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm">
              <Search size={15} className="text-[#8E8E93] shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by ID, seller, unit…"
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
              className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
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

          {/* ── Tranche cards ───────────────────────────────────── */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          ) : error ? (
            <GlassCard className="p-8 text-center">
              <p className="text-sm text-red-500">{error}</p>
            </GlassCard>
          ) : filtered.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <Wallet size={28} className="text-[#C7C7CC] mx-auto mb-2" strokeWidth={1.4} />
              <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
              <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
            </GlassCard>
          ) : (
            <>
              {/* Record count + select-all row */}
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-[#8E8E93]">
                  {filtered.length} tranche{filtered.length !== 1 ? 's' : ''}
                  {activeFilterCount > 0 || search ? ' (filtered)' : ''}
                </p>
                {visibleForRelease.length > 0 && (
                  <button
                    type="button"
                    onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                    className="text-xs font-semibold text-[#C03D25] active:opacity-60"
                  >
                    {allVisibleSelected ? 'Deselect all' : `Select all for release (${visibleForRelease.length})`}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {filtered.map(line => {
                  const isForRel  = line.effectiveStatus === 'For Release';
                  const isChecked = selectedTranches.has(line.id);

                  return (
                    <button
                      key={line.id}
                      type="button"
                      disabled={!isForRel}
                      onClick={() => isForRel && toggleTranche(line.id)}
                      className="w-full text-left active:scale-[0.99] transition-transform disabled:active:scale-100"
                    >
                      <GlassCard
                        className="p-4 transition-all"
                        style={isChecked ? { outline: '2px solid rgba(192,61,37,0.55)', outlineOffset: '-2px' } : undefined}
                      >

                        {/* Row 1: Checkbox + Reservation ID + tranche badge + status badge */}
                        <div className="flex items-center gap-2 mb-1.5">
                          {isForRel ? (
                            <div
                              className="w-5 h-5 rounded-full shrink-0 border-2 flex items-center justify-center transition-all"
                              style={isChecked
                                ? { background: '#C03D25', borderColor: '#C03D25' }
                                : { background: '#fff',    borderColor: '#C7C7CC' }}
                            >
                              {isChecked && <Check size={11} className="text-white" />}
                            </div>
                          ) : (
                            <div className="w-5 h-5 shrink-0" />
                          )}
                          <p className="text-[#1C1C1E] font-bold text-sm flex-1 min-w-0 truncate">{line.reservation_id}</p>
                          <span className="text-[11px] font-bold text-[#8E8E93] shrink-0">TR. {line.tranche}</span>
                          <span
                            className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
                            style={STATUS_STYLE[line.effectiveStatus]}
                          >
                            {line.effectiveStatus}
                          </span>
                        </div>

                        {/* Row 2: Project · Inventory code */}
                        <p className="text-xs text-[#6C6C70] mb-1 truncate pl-7">
                          {line.project}
                          {line.inventory_code && (
                            <><span className="text-[#C7C7CC]"> · </span><span className="font-medium">{line.inventory_code}</span></>
                          )}
                        </p>

                        {/* Row 3: Seller + position | Commission amount */}
                        <div className="flex items-center justify-between gap-2 pl-7">
                          <p className="text-xs text-[#8E8E93] truncate flex-1">
                            {line.seller_name ?? '—'}
                            {line.positionRank && (
                              <span className="text-[#C7C7CC]"> · {positionLabel(line.positionRank)}</span>
                            )}
                          </p>
                          <p className="text-sm font-bold text-[#C03D25] shrink-0">{fmt(line.gross_commission)}</p>
                        </div>

                        {/* Row 4: Commission ID + release rate */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/[0.05] pl-7">
                          <p className="text-[10px] text-[#C7C7CC] font-mono">{commissionId(line.id)}</p>
                          <p className="text-[10px] text-[#C7C7CC]">{line.commission_release_rate}% release</p>
                        </div>

                      </GlassCard>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </PageShell>

      {/* ── Floating Post button ──────────────────────────────────────────────── */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 px-4 pb-8 pt-4 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.96) 60%, transparent)' }}
        >
          <button
            type="button"
            disabled={posting}
            onClick={() => setConfirmPost(true)}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 pointer-events-auto active:opacity-80 transition-opacity"
            style={{ background: '#C03D25', boxShadow: '0 4px 24px rgba(192,61,37,0.35)' }}
          >
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {posting
              ? 'Posting…'
              : `Post ${selectedCount} tranche${selectedCount !== 1 ? 's' : ''}`
            }
            {!posting && (
              <span className="ml-1 text-white/70 text-xs font-semibold">· {fmt(selectedTotal)}</span>
            )}
          </button>
        </div>
      )}

      {/* ── Filter sheet backdrop ─────────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setFilterOpen(false)} />
      )}

      {/* ── Filter sheet ─────────────────────────────────────── */}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 shrink-0">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center"
            >
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5 min-h-0">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Status</p>
              <div className="flex gap-2 flex-wrap">
                {(['', 'For Release', 'Released'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      statusFilter === s
                        ? 'bg-[#C03D25] border-[#C03D25] text-white'
                        : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                    }`}
                  >
                    {statusFilter === s && s && <Check size={11} />}
                    {s || 'All'}
                  </button>
                ))}
              </div>
            </div>
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
            {positionOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Position</p>
                <select
                  value={positionFilter}
                  onChange={e => setPositionFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 appearance-none"
                >
                  <option value="">All Positions</option>
                  {positionOptions.map(p => <option key={p} value={p}>{positionLabel(p)}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="px-5 pb-10 pt-3 flex gap-3 shrink-0 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setSellerFilter(''); setPositionFilter(''); }}
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

      {/* ── Confirm post backdrop ─────────────────────────────────────────────── */}
      {confirmPost && (
        <div className="fixed inset-0 z-[47] bg-black/40" onClick={() => setConfirmPost(false)} />
      )}

      {/* ── Confirm post sheet ────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[48] transition-transform duration-300 ease-out ${
          confirmPost ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-3xl shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="px-6 pt-4 pb-2">
            <p className="text-base font-bold text-[#1C1C1E]">Post Commission</p>
            <p className="text-sm text-[#6C6C70] mt-1.5 leading-relaxed">
              You are about to release{' '}
              <span className="font-semibold text-[#1C1C1E]">
                {selectedCount} tranche{selectedCount !== 1 ? 's' : ''}
              </span>{' '}
              totalling{' '}
              <span className="font-semibold text-[#C03D25]">{fmt(selectedTotal)}</span>.
            </p>
            <p className="text-xs text-[#8E8E93] mt-2">This action cannot be undone.</p>
          </div>
          <div className="px-5 py-4 pb-10 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmPost(false)}
              className="py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePost}
              className="py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Confirm Post
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
