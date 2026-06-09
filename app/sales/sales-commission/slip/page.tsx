'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { SalespersonRecord } from '@/lib/salesperson';
import {
  fetchCommissionRecords, CommissionRecord,
  fetchCommissionScheduleLines, CommissionScheduleLine,
  fetchReservationCollected,
} from '@/lib/commission';
import { Loader2, User, FileText, ChevronDown } from 'lucide-react';

function positionLabel(rank: string | null) {
  const map: Record<string, string> = {
    PS: 'Property Specialist',
    SM: 'Sales Manager',
    SD: 'Sales Director',
    SDH: 'Sales Division Head',
    SH: 'Sales Head',
  };
  return map[rank ?? ''] ?? rank ?? '—';
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'approved':  return 'bg-green-100 text-green-700';
    case 'released':
    case 'paid':      return 'bg-blue-100 text-blue-700';
    case 'cancelled': return 'bg-red-100 text-red-600';
    default:          return 'bg-amber-100 text-amber-700';
  }
}

interface DetailData {
  loading: boolean;
  error: string;
  collected: number;
  lines: CommissionScheduleLine[];
}

export default function CommissionSlipPage() {
  const router = useRouter();
  const [seller, setSeller]   = useState<SalespersonRecord | null>(null);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailData>>({});

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedSeller');
    if (!stored) { router.replace('/sales/sales-commission'); return; }
    const s = JSON.parse(stored) as SalespersonRecord;
    setSeller(s);

    fetchCommissionRecords()
      .then(all => setRecords(all.filter(r => r.seller_name === s.seller_name)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleCard(reservationId: string) {
    if (expandedId === reservationId) { setExpandedId(null); return; }
    setExpandedId(reservationId);
    if (detailCache[reservationId]) return;

    setDetailCache(prev => ({ ...prev, [reservationId]: { loading: true, error: '', collected: 0, lines: [] } }));
    try {
      const [lines, collected] = await Promise.all([
        fetchCommissionScheduleLines(reservationId),
        fetchReservationCollected(reservationId),
      ]);
      setDetailCache(prev => ({ ...prev, [reservationId]: { loading: false, error: '', collected, lines } }));
    } catch (e: any) {
      setDetailCache(prev => ({ ...prev, [reservationId]: { loading: false, error: e.message, collected: 0, lines: [] } }));
    }
  }

  if (!seller) return null;

  const today = new Date().toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const totalCommission = records.reduce((s, r) => s + (r.total_commission ?? 0), 0);

  return (
    <PageShell title="Commission Payout Slip" backButton onBack={() => router.back()}>

      {/* Coral hero */}
      <GlassCard strong className="overflow-hidden">
        <div className="bg-[#C03D25] px-5 pt-4 pb-6">
          <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 mb-4">
            <FileText size={11} className="text-white" />
            <span className="text-white text-[11px] font-semibold">Commission Payout Slip</span>
          </div>

          <p className="text-white/70 text-[10px] font-bold tracking-widest uppercase mb-1">
            {positionLabel(seller.position_rank)}
          </p>
          <p className="text-white font-bold text-2xl leading-tight mb-5">{seller.seller_name}</p>

          <div className="flex flex-wrap gap-2">
            {seller.seller_group && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Seller Group</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.seller_group}</p>
                </div>
              </div>
            )}
            {seller.sales_manager && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Manager</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.sales_manager}</p>
                </div>
              </div>
            )}
            {seller.sales_director && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Director</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.sales_director}</p>
                </div>
              </div>
            )}
            {seller.sales_division_head && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Division Head</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.sales_division_head}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="bg-white/95 px-5 py-4 min-h-[220px]">
          <p className="text-[#6C6C70] text-xs font-bold tracking-widest uppercase mb-4">
            For Release ({records.length})
          </p>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          )}

          {error && <p className="text-center text-sm text-red-500 py-6">{error}</p>}

          {!loading && !error && records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <FileText size={40} className="text-[#C7C7CC]" strokeWidth={1.2} />
              <p className="text-sm text-[#8E8E93] text-center">
                No commission records found for this property specialist
              </p>
            </div>
          )}

          {!loading && !error && records.length > 0 && (
            <div className="space-y-3">
              {records.map(r => {
                const isOpen = expandedId === r.reservation_id;
                const detail = detailCache[r.reservation_id];

                return (
                  <div key={r.reservation_id} className="border border-[rgba(0,0,0,0.07)] rounded-2xl overflow-hidden">

                    {/* ── Card header — tappable ── */}
                    <button
                      onClick={() => toggleCard(r.reservation_id)}
                      className="w-full text-left p-4 active:bg-[rgba(0,0,0,0.02)]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[#1C1C1E] font-bold text-sm">{r.client_name}</p>
                          <p className="text-[#8E8E93] text-xs mt-0.5">
                            {r.project}{r.unit_no ? ` · ${r.unit_no}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                            {r.status}
                          </span>
                          <ChevronDown
                            size={15}
                            className="text-[#C7C7CC]"
                            style={{
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 220ms cubic-bezier(0.23,1,0.32,1)',
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 pt-2 border-t border-[rgba(0,0,0,0.06)]">
                        <div>
                          <p className="text-[10px] text-[#8E8E93]">TCP</p>
                          <p className="text-xs font-semibold text-[#1C1C1E]">{fmt(r.total_contract_price)}</p>
                        </div>
                        <div className="w-px h-7 bg-[rgba(0,0,0,0.08)]" />
                        <div>
                          <p className="text-[10px] text-[#8E8E93]">Rate</p>
                          <p className="text-xs font-semibold text-[#C03D25]">
                            {r.commission_rate != null ? `${r.commission_rate}%` : '—'}
                          </p>
                        </div>
                        <div className="w-px h-7 bg-[rgba(0,0,0,0.08)]" />
                        <div>
                          <p className="text-[10px] text-[#8E8E93]">Commission</p>
                          <p className="text-xs font-bold text-[#1C1C1E]">{fmt(r.total_commission)}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#C7C7CC] mt-2">{fmtDate(r.created_at)}</p>
                    </button>

                    {/* ── Expanded detail ── */}
                    {isOpen && (
                      <div className="border-t border-[rgba(0,0,0,0.07)]">

                        {/* Summary strip */}
                        <div className="grid grid-cols-2 gap-px bg-[rgba(0,0,0,0.06)] border-b border-[rgba(0,0,0,0.06)]">
                          {[
                            { label: 'Net List Price',  value: fmt(r.net_list_price) },
                            { label: 'Collected',       value: detail && !detail.loading ? fmt(detail.collected) : '—' },
                            {
                              label: '% Collected',
                              value: detail && !detail.loading && r.net_list_price
                                ? `${((detail.collected / r.net_list_price) * 100).toFixed(1)}%`
                                : '—',
                            },
                            { label: 'Comm Rate',       value: r.commission_rate != null ? `${r.commission_rate}%` : '—' },
                          ].map(stat => (
                            <div key={stat.label} className="bg-[#FAFAFA] px-4 py-3">
                              <p className="text-[9px] text-[#8E8E93] font-bold uppercase tracking-wide mb-0.5">{stat.label}</p>
                              <p className="text-sm font-bold text-[#1C1C1E]">{stat.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Tranche table */}
                        {detail?.loading && (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 size={18} className="text-[#C03D25] animate-spin" />
                          </div>
                        )}
                        {detail?.error && (
                          <p className="text-center text-xs text-red-500 py-4 px-4">{detail.error}</p>
                        )}
                        {detail && !detail.loading && !detail.error && detail.lines.length === 0 && (
                          <p className="text-center text-xs text-[#8E8E93] py-4 px-4">No tranche schedule generated yet.</p>
                        )}
                        {detail && !detail.loading && !detail.error && detail.lines.length > 0 && (() => {
                            const pctCollected = r.net_list_price ? (detail.collected / r.net_list_price) * 100 : 0;
                            const visibleLines = detail.lines
                              .map(line => ({
                                ...line,
                                effectiveStatus: line.percentage_collection < pctCollected ? 'Receivable' : line.status,
                              }))
                              .filter(line => line.effectiveStatus !== 'Pending');
                            return visibleLines.length === 0 ? (
                              <p className="text-center text-xs text-[#8E8E93] py-4 px-4">No receivable tranches yet.</p>
                            ) : (
                          <>
                            {/* Header row */}
                            <div className="grid grid-cols-[32px_44px_1fr_44px_80px] gap-1 px-4 py-2 bg-[#F2F2F7] border-b border-[rgba(0,0,0,0.05)]">
                              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">Tr.</p>
                              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">% Coll</p>
                              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">Status</p>
                              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Rel%</p>
                              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Gross Comm</p>
                            </div>
                            {visibleLines.map(line => (
                              <div
                                key={line.id}
                                className="grid grid-cols-[32px_44px_1fr_44px_80px] gap-1 px-4 py-2.5 border-b border-[rgba(0,0,0,0.04)] last:border-0 items-center"
                              >
                                <p className="text-xs font-bold text-[#1C1C1E]">{line.tranche}</p>
                                <p className="text-xs text-[#6C6C70]">{line.percentage_collection}%</p>
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${statusBadge(line.effectiveStatus)}`}>
                                  {line.effectiveStatus}
                                </span>
                                <p className="text-xs text-[#6C6C70] text-right">{line.commission_release_rate}%</p>
                                <p className="text-xs font-semibold text-[#1C1C1E] text-right">
                                  {fmt(line.gross_commission)}
                                </p>
                              </div>
                            ))}
                          </>
                            );
                        })()}
                      </div>
                    )}

                  </div>
                );
              })}

              {/* Total */}
              <div className="flex items-center justify-between pt-1 px-1">
                <p className="text-sm font-bold text-[#1C1C1E]">Total Commission</p>
                <p className="text-sm font-bold text-[#C03D25]">{fmt(totalCommission)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#F9F9F9] border-t border-[rgba(0,0,0,0.06)] px-5 py-3 flex items-center justify-between">
          <p className="text-[11px] text-[#8E8E93]">
            Generated on <span className="text-[#C03D25] font-semibold">{today}</span>
          </p>
          <p className="text-[11px] text-[#8E8E93] font-semibold">
            Total Units: {records.length}
          </p>
        </div>
      </GlassCard>

    </PageShell>
  );
}
