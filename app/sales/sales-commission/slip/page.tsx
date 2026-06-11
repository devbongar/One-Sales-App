'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { SalespersonRecord, fetchSellerTaxInfo, SellerTaxInfo } from '@/lib/salesperson';
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
    case 'approved':    return 'bg-green-100 text-green-700';
    case 'released':
    case 'paid':        return 'bg-blue-100 text-blue-700';
    case 'for release':
    case 'receivable':  return 'bg-purple-100 text-purple-700';
    case 'cancelled':   return 'bg-red-100 text-red-600';
    default:            return 'bg-amber-100 text-amber-700';
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
  const [taxInfo, setTaxInfo]         = useState<SellerTaxInfo | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedSeller');
    if (!stored) { router.replace('/sales/sales-commission'); return; }
    const s = JSON.parse(stored) as SalespersonRecord;
    setSeller(s);

    Promise.all([
      fetchCommissionRecords(),
      fetchSellerTaxInfo(s.seller_name),
    ])
      .then(([all, tax]) => {
        setRecords(all.filter(r => r.seller_name === s.seller_name));
        setTaxInfo(tax);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleCard(reservationId: string) {
    if (expandedId === reservationId) {
      setExpandedId(null);
      // Clear cache on close so fresh status is fetched next open
      setDetailCache(prev => { const next = { ...prev }; delete next[reservationId]; return next; });
      return;
    }
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
        <div className="bg-white/95 px-5 py-4">


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
            <div className="space-y-2.5">
              {records.map(r => {
                const isOpen = expandedId === r.reservation_id;
                const detail = detailCache[r.reservation_id];

                return (
                  <div
                    key={r.reservation_id}
                    className="rounded-2xl overflow-hidden"
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)' }}
                  >
                    {/* ── Card header — tappable ── */}
                    <button
                      onClick={() => toggleCard(r.reservation_id)}
                      className="w-full text-left px-4 py-3.5 active:bg-[rgba(0,0,0,0.04)]"
                      style={{ transition: 'background-color 150ms ease-out' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Left accent bar */}
                        <div
                          className="w-1 h-9 rounded-full shrink-0"
                          style={{ background: isOpen ? '#C03D25' : 'rgba(0,0,0,0.10)' , transition: 'background 220ms ease' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[#1C1C1E] font-bold text-[13px] leading-tight">{r.reservation_id}</p>
                          <p className="text-[#8E8E93] text-[11px] mt-0.5 truncate">
                            {r.client_name}{r.project ? ` · ${r.project}` : ''}
                          </p>
                        </div>
                        {/* Commission preview — hidden when open */}
                        {!isOpen && r.total_commission != null && (
                          <p className="text-xs font-bold text-[#C03D25] shrink-0">
                            {`₱ ${r.total_commission.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </p>
                        )}
                        <ChevronDown
                          size={14}
                          className="text-[#C7C7CC] shrink-0"
                          style={{
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 220ms cubic-bezier(0.23,1,0.32,1)',
                          }}
                        />
                      </div>
                    </button>

                    {/* ── Expanded detail — CSS grid collapse ── */}
                    <div
                      className="grid"
                      style={{
                        gridTemplateRows: isOpen ? '1fr' : '0fr',
                        transition: 'grid-template-rows 260ms cubic-bezier(0.23,1,0.32,1)',
                      }}
                    >
                      <div className="overflow-hidden">
                        <div className="border-t border-[rgba(0,0,0,0.06)]">

                          {/* TCP / Rate / Commission */}
                          <div className="grid grid-cols-3 gap-px bg-[rgba(0,0,0,0.05)] border-b border-[rgba(0,0,0,0.06)]">
                            <div className="bg-white px-3 py-2.5">
                              <p className="text-[9px] text-[#8E8E93] font-semibold uppercase tracking-wide mb-0.5">TCP</p>
                              <p className="text-[11px] font-bold text-[#1C1C1E] truncate">{fmt(r.total_contract_price)}</p>
                            </div>
                            <div className="bg-white px-3 py-2.5">
                              <p className="text-[9px] text-[#8E8E93] font-semibold uppercase tracking-wide mb-0.5">Rate</p>
                              <p className="text-[11px] font-bold text-[#C03D25]">{r.commission_rate != null ? `${r.commission_rate}%` : '—'}</p>
                            </div>
                            <div className="bg-white px-3 py-2.5">
                              <p className="text-[9px] text-[#8E8E93] font-semibold uppercase tracking-wide mb-0.5">Commission</p>
                              <p className="text-[11px] font-bold text-[#1C1C1E] truncate">{fmt(r.total_commission)}</p>
                            </div>
                          </div>

                          {/* NLP / Collected / % Collected / Rate — 4-col horizontal */}
                          <div className="grid grid-cols-4 gap-px bg-[rgba(0,0,0,0.05)] border-b border-[rgba(0,0,0,0.06)]">
                            {[
                              { label: 'NLP',        value: fmt(r.net_list_price) },
                              { label: 'Collected',  value: detail && !detail.loading ? fmt(detail.collected) : '—' },
                              {
                                label: '% Collected',
                                value: detail && !detail.loading && r.net_list_price
                                  ? `${((detail.collected / r.net_list_price) * 100).toFixed(1)}%`
                                  : '—',
                              },
                              { label: 'Comm Rate',  value: r.commission_rate != null ? `${r.commission_rate}%` : '—' },
                            ].map(stat => (
                              <div key={stat.label} className="bg-[#FAFAFA] px-2.5 py-2.5 min-w-0">
                                <p className="text-[8px] text-[#8E8E93] font-bold uppercase tracking-wide mb-0.5 truncate">{stat.label}</p>
                                <p className="text-[11px] font-bold text-[#1C1C1E] truncate">{stat.value}</p>
                              </div>
                            ))}
                          </div>

                          {/* Date row */}
                          <div className="px-4 py-1.5 border-b border-[rgba(0,0,0,0.04)]">
                            <p className="text-[10px] text-[#C7C7CC]">Posted {fmtDate(r.created_at)}</p>
                          </div>

                          {/* Tranche table */}
                          {detail?.loading && (
                            <div className="flex items-center justify-center py-5">
                              <Loader2 size={16} className="text-[#C03D25] animate-spin" />
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
                                effectiveStatus:
                                  line.status === 'Released'    ? 'Released'    :
                                  line.status === 'Paid'        ? 'Paid'        :
                                  line.status === 'For Release' ? 'For Release' :
                                  pctCollected >= line.percentage_collection ? 'For Release' : 'Pending',
                              }))
                              .filter(line => line.effectiveStatus !== 'Pending');

                            if (visibleLines.length === 0) return (
                              <p className="text-center text-xs text-[#8E8E93] py-4 px-4">No receivable tranches yet.</p>
                            );

                            const grossTotal = visibleLines.reduce((s, l) => s + l.gross_commission, 0);
                            const vatAmt     = visibleLines.reduce((s, l) => s + (l.vat_amount  ?? l.gross_commission * (taxInfo?.vat_rate ?? 0)), 0);
                            const ewtAmt     = visibleLines.reduce((s, l) => s + (l.ewt_amount  ?? l.gross_commission * (taxInfo?.ewt_rate ?? 0)), 0);
                            const netAmt     = visibleLines.reduce((s, l) => s + (l.net_commission ?? (l.gross_commission - (l.vat_amount ?? 0) - (l.ewt_amount ?? 0))), 0);

                            return (
                              <>
                                {/* Tranche table header */}
                                <div className="grid grid-cols-[20px_44px_72px_32px_1fr] gap-2 px-4 py-2 bg-[#F2F2F7]">
                                  {['Tr','% Coll','Status','Rel%','Gross Comm'].map((h, i) => (
                                    <p key={h} className={`text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide ${i >= 3 ? 'text-right' : ''}`}>{h}</p>
                                  ))}
                                </div>

                                {/* Tranche rows */}
                                {visibleLines.map(line => (
                                  <div
                                    key={line.id}
                                    className="grid grid-cols-[20px_44px_72px_32px_1fr] gap-2 px-4 py-3 border-t border-[rgba(0,0,0,0.04)] items-center"
                                    style={{ background: line.effectiveStatus === 'For Release' ? 'rgba(147,51,234,0.04)' : 'transparent' }}
                                  >
                                    <p className="text-xs font-bold text-[#1C1C1E]">{line.tranche}</p>
                                    <p className="text-[11px] text-[#6C6C70]">{line.percentage_collection}%</p>
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${statusBadge(line.effectiveStatus)}`}>
                                      {line.effectiveStatus}
                                    </span>
                                    <p className="text-[11px] text-[#6C6C70] text-right">{line.commission_release_rate}%</p>
                                    <p className="text-xs font-bold text-[#C03D25] text-right">{fmt(line.gross_commission)}</p>
                                  </div>
                                ))}

                                {/* VAT / WT / Net breakdown */}
                                <div className="mx-4 mb-3 mt-1 rounded-xl overflow-hidden border border-[rgba(0,0,0,0.07)]">
                                  <div className="flex justify-between px-3 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.05)]">
                                    <p className="text-[11px] text-[#8E8E93]">Gross Commission</p>
                                    <p className="text-[11px] font-semibold text-[#1C1C1E]">{fmt(grossTotal)}</p>
                                  </div>
                                  <div className="flex justify-between px-3 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.05)]">
                                    <p className="text-[11px] text-[#8E8E93]">
                                      VAT
                                      {taxInfo && (
                                        <span className="ml-1 text-[#C7C7CC]">
                                          ({taxInfo.vat_rate > 0 ? `${(taxInfo.vat_rate * 100).toFixed(0)}%` : 'Non-VAT'})
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[11px] font-semibold text-[#1C1C1E]">{vatAmt > 0 ? fmt(vatAmt) : '—'}</p>
                                  </div>
                                  <div className="flex justify-between px-3 py-2 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.05)]">
                                    <p className="text-[11px] text-[#8E8E93]">
                                      Withholding Tax
                                      {taxInfo?.ewt_rate_raw && (
                                        <span className="ml-1 text-[#C7C7CC]">({taxInfo.ewt_rate_raw})</span>
                                      )}
                                    </p>
                                    <p className="text-[11px] font-semibold text-[#1C1C1E]">{ewtAmt > 0 ? fmt(ewtAmt) : '—'}</p>
                                  </div>
                                  <div className="flex justify-between px-3 py-2.5 bg-white">
                                    <p className="text-[12px] font-bold text-[#1C1C1E]">Net Commission</p>
                                    <p className="text-[12px] font-bold text-[#C03D25]">{fmt(netAmt)}</p>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}

              {/* Total breakdown */}
              {(() => {
                const totalVat = taxInfo ? totalCommission * taxInfo.vat_rate : 0;
                const totalEwt = taxInfo ? totalCommission * taxInfo.ewt_rate : 0;
                const totalNet = totalCommission - totalVat - totalEwt;
                return (
                  <div className="mt-1 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(192,61,37,0.15)' }}>
                    <div className="flex justify-between px-4 py-2.5 bg-[rgba(192,61,37,0.04)] border-b border-[rgba(192,61,37,0.08)]">
                      <p className="text-xs text-[#8E8E93]">Total Gross Commission</p>
                      <p className="text-xs font-semibold text-[#1C1C1E]">{fmt(totalCommission)}</p>
                    </div>
                    <div className="flex justify-between px-4 py-2.5 bg-[rgba(192,61,37,0.04)] border-b border-[rgba(192,61,37,0.08)]">
                      <p className="text-xs text-[#8E8E93]">
                        VAT{taxInfo && <span className="text-[#C7C7CC] ml-1">({taxInfo.vat_rate > 0 ? `${(taxInfo.vat_rate * 100).toFixed(0)}%` : 'Non-VAT'})</span>}
                      </p>
                      <p className="text-xs font-semibold text-[#1C1C1E]">{totalVat > 0 ? fmt(totalVat) : '—'}</p>
                    </div>
                    <div className="flex justify-between px-4 py-2.5 bg-[rgba(192,61,37,0.04)] border-b border-[rgba(192,61,37,0.08)]">
                      <p className="text-xs text-[#8E8E93]">
                        Withholding Tax{taxInfo?.ewt_rate_raw && <span className="text-[#C7C7CC] ml-1">({taxInfo.ewt_rate_raw})</span>}
                      </p>
                      <p className="text-xs font-semibold text-[#1C1C1E]">{totalEwt > 0 ? fmt(totalEwt) : '—'}</p>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5 bg-[rgba(192,61,37,0.07)]">
                      <p className="text-sm font-bold text-[#1C1C1E]">Total Net Commission</p>
                      <p className="text-base font-bold text-[#C03D25]">{fmt(totalNet)}</p>
                    </div>
                  </div>
                );
              })()}
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
