'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  fetchSellerCommissionLines,
  fetchAllCollectedByReservation,
  fetchCommissionRecords,
  releaseCommissionTranches,
  CommissionScheduleFullLine,
} from '@/lib/commission';
import type { SellerPayoutSummary } from '../page';
import { Loader2, CheckCircle2, Clock, Wallet } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function positionLabel(rank: string | null) {
  const map: Record<string, string> = {
    PS: 'Property Specialist', SM: 'Sales Manager', SD: 'Sales Director',
    SDH: 'Sales Division Head', SH: 'Sales Head',
  };
  return map[rank ?? ''] ?? rank ?? '—';
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EffectiveStatus = 'For Release' | 'Released';

interface AnnotatedLine extends CommissionScheduleFullLine {
  effectiveStatus: EffectiveStatus;
}

interface ReservationGroup {
  reservationId: string;
  clientName:    string;
  project:       string;
  lines:         AnnotatedLine[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommissionPayoutDetailPage() {
  const router = useRouter();

  const [seller, setSeller]     = useState<SellerPayoutSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [groups, setGroups]     = useState<ReservationGroup[]>([]);

  // IDs currently being updated (optimistic disable)
  const [releasing, setReleasing] = useState<Set<number>>(new Set());

  // Confirm sheet: null = closed, else the IDs + label to release
  const [confirmSheet, setConfirmSheet] = useState<{
    ids: number[];
    label: string;
    amount: number;
  } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('payoutSeller');
    if (!stored) { router.replace('/finance/commission-payout'); return; }
    const s = JSON.parse(stored) as SellerPayoutSummary;
    setSeller(s);

    async function load() {
      try {
        const [lines, collectionsMap, commRecords] = await Promise.all([
          fetchSellerCommissionLines(s.sellerId ?? ''),
          fetchAllCollectedByReservation(),
          fetchCommissionRecords(),
        ]);

        const nlpMap: Record<string, number> = {};
        commRecords
          .filter(r => r.seller_id === s.sellerId)
          .forEach(r => { nlpMap[r.reservation_id] = r.net_list_price ?? 0; });

        // Group and annotate
        const groupMap: Record<string, ReservationGroup> = {};
        for (const line of lines) {
          const resId = line.reservation_id;
          if (!groupMap[resId]) {
            groupMap[resId] = {
              reservationId: resId,
              clientName:    line.client_name,
              project:       line.project,
              lines:         [],
            };
          }
          const nlp          = nlpMap[resId] ?? 0;
          const collected    = collectionsMap[resId] ?? 0;
          const pctCollected = nlp > 0 ? (collected / nlp) * 100 : 0;

          let effectiveStatus: EffectiveStatus | 'Pending';
          if (line.status === 'Released') {
            effectiveStatus = 'Released';
          } else if (pctCollected >= line.percentage_collection) {
            effectiveStatus = 'For Release';
          } else {
            effectiveStatus = 'Pending';
          }

          if (effectiveStatus !== 'Pending') {
            groupMap[resId].lines.push({ ...line, effectiveStatus } as AnnotatedLine);
          }
        }

        const result = Object.values(groupMap)
          .filter(g => g.lines.length > 0)
          .sort((a, b) => {
            // Groups with "For Release" tranches come first
            const aFR = a.lines.some(l => l.effectiveStatus === 'For Release');
            const bFR = b.lines.some(l => l.effectiveStatus === 'For Release');
            if (aFR !== bFR) return aFR ? -1 : 1;
            return a.reservationId.localeCompare(b.reservationId);
          });

        setGroups(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRelease(ids: number[]) {
    setConfirmSheet(null);
    setReleasing(new Set(ids));
    try {
      await releaseCommissionTranches(ids);
      // Optimistic update
      setGroups(prev => prev.map(g => ({
        ...g,
        lines: g.lines.map(l =>
          ids.includes(l.id)
            ? { ...l, status: 'Released', effectiveStatus: 'Released' as EffectiveStatus }
            : l
        ),
      })));
    } catch (e: any) {
      alert(`Release failed: ${e.message}`);
    } finally {
      setReleasing(new Set());
    }
  }

  const allLines    = useMemo(() => groups.flatMap(g => g.lines), [groups]);
  const totalForRel = useMemo(() => allLines.filter(l => l.effectiveStatus === 'For Release').reduce((s, l) => s + l.gross_commission, 0), [allLines]);
  const totalRel    = useMemo(() => allLines.filter(l => l.effectiveStatus === 'Released').reduce((s, l)    => s + l.gross_commission, 0), [allLines]);

  if (!seller) return null;

  return (
    <PageShell title="Payout Detail" backButton onBack={() => router.back()}>

      {/* ── Seller hero ──────────────────────────────────────── */}
      <GlassCard strong className="overflow-hidden">
        <div className="bg-[#C03D25] px-5 pt-4 pb-5">
          <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 mb-4">
            <Wallet size={11} className="text-white" />
            <span className="text-white text-[11px] font-semibold">Commission Payout</span>
          </div>
          <p className="text-white/70 text-[10px] font-bold tracking-widest uppercase mb-1">
            {positionLabel(seller.positionRank)}
          </p>
          <p className="text-white font-bold text-2xl leading-tight">{seller.sellerName}</p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-px bg-[rgba(0,0,0,0.06)]">
          <div className="bg-white px-5 py-3.5">
            <p className="text-[9px] text-[#8E8E93] font-bold uppercase tracking-wide mb-0.5">For Release</p>
            <p className="text-sm font-bold text-[#C03D25]">{loading ? '—' : fmt(totalForRel)}</p>
          </div>
          <div className="bg-white px-5 py-3.5">
            <p className="text-[9px] text-[#8E8E93] font-bold uppercase tracking-wide mb-0.5">Released</p>
            <p className="text-sm font-bold text-[#34C759]">{loading ? '—' : fmt(totalRel)}</p>
          </div>
        </div>
      </GlassCard>

      {/* ── Body ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-[#C03D25] animate-spin" />
        </div>
      ) : error ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-red-500">{error}</p>
        </GlassCard>
      ) : groups.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Wallet size={28} className="text-[#C7C7CC] mx-auto mb-2" strokeWidth={1.4} />
          <p className="text-sm font-semibold text-[#1C1C1E]">No tranches due for release</p>
          <p className="text-xs text-[#8E8E93] mt-1">Check back when more collections are posted</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const forRelLines = g.lines.filter(l => l.effectiveStatus === 'For Release');
            const releaseAllIds = forRelLines.map(l => l.id).filter(id => !releasing.has(id));
            const releaseAllAmount = forRelLines.filter(l => !releasing.has(l.id)).reduce((s, l) => s + l.gross_commission, 0);

            return (
              <div
                key={g.reservationId}
                className="rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)' }}
              >
                {/* Reservation header */}
                <div className="bg-[#F9F9F9] px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[#1C1C1E] font-bold text-[13px]">{g.reservationId}</p>
                    <p className="text-[#8E8E93] text-[11px] mt-0.5 truncate">
                      {g.clientName} · {g.project}
                    </p>
                  </div>
                  {releaseAllIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setConfirmSheet({
                        ids:    releaseAllIds,
                        label:  `All ${releaseAllIds.length} tranches`,
                        amount: releaseAllAmount,
                      })}
                      className="shrink-0 text-[11px] font-bold text-white bg-[#C03D25] px-3 py-1.5 rounded-xl active:opacity-80"
                    >
                      Release All
                    </button>
                  )}
                </div>

                {/* Tranche header row */}
                <div className="grid grid-cols-[28px_44px_40px_1fr_80px] gap-2 px-4 py-2 bg-[#F2F2F7] border-b border-[rgba(0,0,0,0.06)]">
                  {['Tr', '% Coll', 'Rel%', 'Amount', ''].map((h, i) => (
                    <p key={i} className={`text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide ${i >= 3 ? 'text-right' : ''}`}>{h}</p>
                  ))}
                </div>

                {/* Tranche rows */}
                {g.lines.map(line => {
                  const isForRelease = line.effectiveStatus === 'For Release';
                  const isReleasing  = releasing.has(line.id);

                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-[28px_44px_40px_1fr_80px] gap-2 px-4 py-3 border-t border-[rgba(0,0,0,0.04)] items-center"
                      style={{
                        background: isForRelease ? 'rgba(147,51,234,0.04)' : 'transparent',
                      }}
                    >
                      {/* Tranche badge */}
                      <div className="w-6 h-6 rounded-full bg-[#F2F2F7] flex items-center justify-center">
                        <span className="text-[10px] font-bold text-[#6C6C70]">{line.tranche}</span>
                      </div>

                      <p className="text-[11px] text-[#6C6C70]">{line.percentage_collection}%</p>
                      <p className="text-[11px] text-[#6C6C70]">{line.commission_release_rate}%</p>
                      <p className="text-xs font-bold text-[#C03D25] text-right">{fmt(line.gross_commission)}</p>

                      {/* Action / status */}
                      <div className="flex justify-end">
                        {line.effectiveStatus === 'Released' ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-[#34C759]" />
                            <span className="text-[10px] font-bold text-[#34C759]">Released</span>
                          </div>
                        ) : isReleasing ? (
                          <Loader2 size={14} className="text-[#C03D25] animate-spin" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmSheet({
                              ids:    [line.id],
                              label:  `Tranche ${line.tranche}`,
                              amount: line.gross_commission,
                            })}
                            className="text-[10px] font-bold text-white bg-[#C03D25] px-2.5 py-1 rounded-lg active:opacity-80"
                          >
                            Release
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Total footer */}
          <div
            className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
            style={{ background: 'rgba(192,61,37,0.07)', border: '1px solid rgba(192,61,37,0.15)' }}
          >
            <p className="text-sm font-bold text-[#1C1C1E]">Total For Release</p>
            <p className="text-base font-bold text-[#C03D25]">{fmt(totalForRel)}</p>
          </div>
        </div>
      )}

      {/* ── Confirm sheet backdrop ────────────────────────────── */}
      {confirmSheet && (
        <div
          className="fixed inset-0 z-[45] bg-black/40"
          onClick={() => setConfirmSheet(null)}
        />
      )}

      {/* ── Confirm sheet ─────────────────────────────────────── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${
          confirmSheet ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-3xl shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>

          <div className="px-6 pt-4 pb-2">
            <p className="text-base font-bold text-[#1C1C1E]">Confirm Release</p>
            <p className="text-sm text-[#6C6C70] mt-1">
              You are about to release{' '}
              <span className="font-semibold text-[#1C1C1E]">{confirmSheet?.label}</span>
              {' '}for{' '}
              <span className="font-semibold text-[#C03D25]">{fmt(confirmSheet?.amount ?? 0)}</span>.
            </p>
          </div>

          <div className="px-5 py-4 pb-10 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmSheet(null)}
              className="py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => confirmSheet && handleRelease(confirmSheet.ids)}
              className="py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Confirm Release
            </button>
          </div>
        </div>
      </div>

    </PageShell>
  );
}
