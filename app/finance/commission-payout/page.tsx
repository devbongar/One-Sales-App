'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  fetchAllCommissionScheduleLines,
  fetchAllCollectedByReservation,
  fetchCommissionRecords,
  markPendingTranchesForRelease,
} from '@/lib/commission';
import { Building2, Check, FileText, Loader2, Search, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SellerPayoutSummary {
  sellerName:      string;
  positionRank:    string | null;
  forRelease:      number;
  released:        number;
  forReleaseCount: number;
}

interface ProjectSummary {
  project:         string;
  forRelease:      number;
  released:        number;
  forReleaseCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommissionPayoutPage() {
  const router = useRouter();

  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [projects, setProjects]               = useState<ProjectSummary[]>([]);
  const [totalForRelease, setTotalForRelease] = useState(0);
  const [totalReleased, setTotalReleased]     = useState(0);
  const [search, setSearch]                   = useState('');
  const [selected, setSelected]               = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const [lines, collectionsMap, commRecords] = await Promise.all([
          fetchAllCommissionScheduleLines(),
          fetchAllCollectedByReservation(),
          fetchCommissionRecords(),
        ]);

        const nlpMap: Record<string, number> = {};
        commRecords.forEach(r => { nlpMap[r.reservation_id] = r.net_list_price ?? 0; });

        // Persist newly-eligible tranches as For Release in DB (background)
        markPendingTranchesForRelease(lines, collectionsMap, nlpMap).catch(console.error);

        const projMap: Record<string, ProjectSummary> = {};
        let tForRelease = 0;
        let tReleased   = 0;

        for (const line of lines) {
          const proj = line.project ?? '—';
          if (!projMap[proj]) {
            projMap[proj] = { project: proj, forRelease: 0, released: 0, forReleaseCount: 0 };
          }

          if (line.status === 'Released') {
            projMap[proj].released += line.gross_commission;
            tReleased              += line.gross_commission;
          } else {
            const nlp          = nlpMap[line.reservation_id] ?? 0;
            const collected    = collectionsMap[line.reservation_id] ?? 0;
            const pctCollected = nlp > 0 ? (collected / nlp) * 100 : 0;
            if (pctCollected >= line.percentage_collection || line.status === 'For Release') {
              projMap[proj].forRelease      += line.gross_commission;
              projMap[proj].forReleaseCount += 1;
              tForRelease                   += line.gross_commission;
            }
          }
        }

        const sorted = Object.values(projMap)
          .filter(p => p.forRelease > 0 || p.released > 0)
          .sort((a, b) => b.forRelease - a.forRelease);

        setProjects(sorted);
        setTotalForRelease(tForRelease);
        setTotalReleased(tReleased);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(p => p.project.toLowerCase().includes(q));
  }, [projects, search]);

  function toggleSelect(project: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project); else next.add(project);
      return next;
    });
  }

  const selectedCount = selected.size;
  const selectedTotal = useMemo(
    () => projects.filter(p => selected.has(p.project)).reduce((s, p) => s + p.forRelease, 0),
    [projects, selected],
  );

  return (
    <PageShell title="Commission Payout">

      <div className="space-y-3 pb-28">

        {/* ── Summary stats ─────────────────────────────────────── */}
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

        {/* ── Project search ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm">
          <Search size={15} className="text-[#8E8E93] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project…"
            className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}>
              <X size={13} className="text-[#8E8E93]" />
            </button>
          )}
        </div>

        {/* ── Project cards ──────────────────────────────────────── */}
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
            <Building2 size={28} className="text-[#C7C7CC] mx-auto mb-2" strokeWidth={1.4} />
            <p className="text-sm font-semibold text-[#1C1C1E]">No projects found</p>
            <p className="text-xs text-[#8E8E93] mt-1">
              {search ? 'Try a different search term' : 'No commissions are currently due for release'}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => {
              const isSelected = selected.has(p.project);
              return (
                <button
                  key={p.project}
                  type="button"
                  onClick={() => toggleSelect(p.project)}
                  className="w-full text-left active:scale-[0.98] transition-transform"
                >
                  <GlassCard
                    className="p-4 transition-all"
                    style={isSelected ? { outline: '2px solid rgba(192,61,37,0.55)', outlineOffset: '-2px' } : undefined}
                  >
                    <div className="flex items-center gap-3">

                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all"
                        style={isSelected
                          ? { background: '#C03D25', borderColor: '#C03D25' }
                          : { background: '#fff',    borderColor: '#C7C7CC' }}
                      >
                        {isSelected && <Check size={11} className="text-white" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1C1C1E] truncate">{p.project}</p>
                        {p.forReleaseCount > 0 && (
                          <p className="text-xs text-[#8E8E93] mt-0.5">
                            {p.forReleaseCount} tranche{p.forReleaseCount !== 1 ? 's' : ''} for release
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[#C03D25]">{fmt(p.forRelease)}</p>
                        {p.released > 0 && (
                          <p className="text-[10px] font-semibold text-[#34C759] mt-0.5">
                            {fmt(p.released)} released
                          </p>
                        )}
                      </div>

                    </div>
                  </GlassCard>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Floating "View Report" button ─────────────────────────────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 px-4 pb-8 pt-4 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.96) 60%, transparent)' }}
      >
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => {
            sessionStorage.setItem('payoutReportProjects', JSON.stringify([...selected]));
            router.push('/finance/commission-payout/report');
          }}
          className="w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 pointer-events-auto transition-all"
          style={{
            background:  selectedCount > 0 ? '#C03D25' : 'rgba(199,199,204,0.6)',
            boxShadow:   selectedCount > 0 ? '0 4px 24px rgba(192,61,37,0.35)' : 'none',
            color:       selectedCount > 0 ? '#fff' : 'rgba(60,60,67,0.4)',
            transition:  'background 200ms ease, box-shadow 200ms ease, color 200ms ease',
          }}
        >
          <FileText size={16} />
          {selectedCount === 0
            ? 'Select projects to view report'
            : `View Report · ${selectedCount} project${selectedCount !== 1 ? 's' : ''}`}
          {selectedCount > 0 && (
            <span className="ml-1 text-white/70 text-xs font-semibold">
              · {fmt(selectedTotal)}
            </span>
          )}
        </button>
      </div>

    </PageShell>
  );
}
