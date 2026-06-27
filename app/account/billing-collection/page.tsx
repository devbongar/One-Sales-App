'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AlertTriangle, Building2, ChevronLeft, ChevronRight,
  Loader2, Search, SlidersHorizontal, X,
} from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { supabase } from '@/lib/supabase';
import { fetchTurnoverDate } from '@/lib/admin';
import {
  fetchCollections,
  fetchCollectionApplicationsByIds,
  CollectionRecord,
  CollectionApplication,
} from '@/lib/collections';
import {
  fetchReceivableSummaries,
  fetchReceivableLines,
  ReservationReceivableSummary,
  ReceivableLine,
} from '@/lib/receivables';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeso(n: number | null | undefined) {
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function schemeLabel(s: string) {
  const map: Record<string, string> = {
    spot_cash:     'Spot Cash',
    deferred_cash: 'Deferred Cash',
    spot_dp:       'Spot DP',
    stretched_dp:  'Stretched DP',
  };
  return map[s] ?? s;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  Complete: { background: 'rgba(52,199,89,0.12)',  color: '#1A7F37' },
  Overdue:  { background: 'rgba(255,59,48,0.12)',  color: '#C0001E' },
  Unpaid:   { background: 'rgba(255,159,10,0.12)', color: '#A05A00' },
};

// ─── Section Divider ──────────────────────────────────────────────────────────

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
      <span className="text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
    </div>
  );
}

// ─── Lines Detail Overlay (read-only) ─────────────────────────────────────────

function LinesOverlay({
  summary,
  onClose,
}: {
  summary: ReservationReceivableSummary;
  onClose: () => void;
}) {
  const [lines,              setLines]              = useState<ReceivableLine[]>([]);
  const [collections,        setCollections]        = useState<CollectionRecord[]>([]);
  const [applications,       setApplications]       = useState<CollectionApplication[]>([]);
  const [loading,            setLoading]            = useState(true);
  const [turnoverDateOk,     setTurnoverDateOk]     = useState<boolean | null>(null);
  const [actualTotalPaid,    setActualTotalPaid]    = useState<number | null>(null);
  const [latestBrfRequestId, setLatestBrfRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linesData, collData] = await Promise.all([
        fetchReceivableLines(summary.reservation_id),
        fetchCollections(summary.reservation_id),
      ]);
      const appData = collData.length > 0
        ? await fetchCollectionApplicationsByIds(collData.map(c => c.id))
        : [];
      setLines(linesData);
      setCollections(collData);
      setApplications(appData);

      const collTotal = collData.reduce((sum, c) => sum + Number(c.amount_received), 0);
      const legacyTotal = linesData
        .filter(l => l.payment_status === 'Paid' && !appData.some(a => String(a.receivable_line_id) === String(l.id)))
        .reduce((sum, l) => sum + Number(l.total_amount_due || 0), 0);
      setActualTotalPaid(collTotal + legacyTotal);

      const { data: latestBrf } = await supabase
        .from('requests_and_inquiries')
        .select('id')
        .eq('reservation_id', summary.reservation_id)
        .eq('approval_status', 'Resolved')
        .in('type_of_request', ['Payment Schedule Restructuring', 'Change of Unit'])
        .order('date_approved', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestBrfRequestId((latestBrf as any)?.id ?? null);

      const { data: resRow } = await supabase
        .from('reservations')
        .select('tower')
        .eq('reservation_id', summary.reservation_id)
        .maybeSingle();
      if (resRow?.tower) {
        const td = await fetchTurnoverDate(summary.project, resRow.tower);
        setTurnoverDateOk(td !== null);
      } else {
        setTurnoverDateOk(null);
      }
    } finally {
      setLoading(false);
    }
  }, [summary.reservation_id, summary.project]);

  useEffect(() => { load(); }, [load]);

  const today           = localToday();
  const activeLines     = lines.filter(l => l.payment_status !== 'Superseded');
  const unpaidLines     = activeLines.filter(l => l.payment_status !== 'Paid');

  function lineStatusStyle(line: ReceivableLine): React.CSSProperties {
    if (line.payment_status === 'Paid')    return { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' };
    if (line.payment_status === 'Partial') {
      return line.due_date < today
        ? { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }
        : { background: 'rgba(0,122,255,0.10)', color: '#0058C9' };
    }
    return line.due_date < today
      ? { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }
      : { background: 'rgba(255,159,10,0.12)', color: '#A05A00' };
  }

  function lineStatusLabel(line: ReceivableLine): string {
    if (line.payment_status === 'Paid')    return 'Paid';
    if (line.payment_status === 'Partial') return line.due_date < today ? 'Partial · Overdue' : 'Partial';
    return line.due_date < today ? 'Overdue' : 'Unpaid';
  }

  function getLineCollections(lineId: string) {
    return applications
      .filter(a => String(a.receivable_line_id) === String(lineId))
      .map(a => ({ app: a, coll: collections.find(c => String(c.id) === String(a.collection_id)) }))
      .filter(x => x.coll) as { app: CollectionApplication; coll: CollectionRecord }[];
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]"
      style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}
    >
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button
          onClick={onClose}
          className="p-2.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] active:scale-[0.92]"
          style={{ transition: 'transform 100ms ease-out' }}
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center min-w-0 px-3">
          <p className="text-[#1C1C1E] font-bold text-sm truncate">{summary.client_name}</p>
          <p className="text-[#8E8E93] text-xs">{summary.inventory_code} · {schemeLabel(summary.payment_scheme)}</p>
        </div>
        <div className="w-[60px]" />
      </div>

      {/* Hero card */}
      <div className="px-4 pt-3 pb-4 bg-white border-b border-black/[0.06] shrink-0 space-y-3">
        {/* Reservation ID */}
        <p className="text-xs font-bold text-[#C03D25]">{summary.reservation_id}</p>

        {/* TCP + lines count */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Total Contract Price</p>
            <p className="text-xl font-bold text-[#1C1C1E]">{fmtPeso(summary.total_contract_price)}</p>
          </div>
          <p className="text-xs text-[#8E8E93] mb-0.5">{summary.paid_lines}/{summary.total_lines} lines paid</p>
        </div>

        {/* Progress bar */}
        {(() => {
          const paid = actualTotalPaid ?? summary.total_paid;
          const pct  = summary.total_contract_price > 0
            ? Math.min(100, (paid / summary.total_contract_price) * 100)
            : 0;
          return (
            <div>
              <div className="h-2 bg-[#E5E5EA] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: pct >= 100 ? '#34C759' : '#C03D25' }}
                />
              </div>
              <p className="text-[10px] text-[#8E8E93] mt-1 text-right">{pct.toFixed(1)}% collected</p>
            </div>
          );
        })()}

        {/* Paid / Outstanding tiles */}
        <div className="flex gap-3">
          <div className="flex-1 bg-[#F2F2F7] rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Total Paid</p>
            <p className="text-sm font-bold text-[#34C759]">{fmtPeso(actualTotalPaid ?? summary.total_paid)}</p>
          </div>
          <div className="flex-1 bg-[#F2F2F7] rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Outstanding</p>
            <p className="text-sm font-bold text-[#C03D25]">{fmtPeso(summary.outstanding)}</p>
          </div>
        </div>
      </div>

      {/* Turnover date warning */}
      {turnoverDateOk === false && (
        <div className="flex items-start gap-3 px-4 py-3 bg-[#FFF3CD] border-b border-[#FFCA28]/50 shrink-0">
          <AlertTriangle size={16} className="text-[#A05A00] shrink-0 mt-0.5" />
          <p className="text-xs text-[#7A4400] leading-snug">
            <span className="font-bold">Turnover date not set</span> for this project — retention payment timing may be incorrect.
          </p>
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-10">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        ) : lines.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm font-semibold text-[#1C1C1E]">No payment lines found</p>
          </div>
        ) : (
          <>
            {/* Grouped schedule lines */}
            {(() => {
              const overdueLines  = activeLines.filter(l => l.payment_status !== 'Paid' && l.due_date < today)
                .sort((a, b) => a.due_date.localeCompare(b.due_date));
              const upcomingLines = activeLines.filter(l => l.payment_status !== 'Paid' && l.due_date >= today)
                .sort((a, b) => a.due_date.localeCompare(b.due_date));
              const paidLines     = activeLines.filter(l => l.payment_status === 'Paid')
                .sort((a, b) => a.due_date.localeCompare(b.due_date));
              function LineCard({ line }: { line: ReceivableLine }) {
                const isPaid    = line.payment_status === 'Paid';
                const isPartial = line.payment_status === 'Partial';
                const balance   = Math.max(0, line.total_amount_due - (line.amount_paid ?? 0));
                const paidPct   = line.total_amount_due > 0
                  ? Math.min(100, ((line.amount_paid ?? 0) / line.total_amount_due) * 100)
                  : 0;
                const lineCols  = getLineCollections(line.id);
                const hasDirectPayment = isPaid && lineCols.length === 0 &&
                  (line.mode_of_payment || line.acknowledgement_receipt_no || line.posting_date);
                const paidDate = line.posting_date || lineCols[0]?.coll.posting_date || null;

                return (
                  <div
                    className="rounded-3xl bg-white overflow-hidden"
                    style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                  >
                    {/* Line header */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1C1C1E] truncate">{line.type_of_payment}</p>
                        <p className="text-xs text-[#8E8E93] mt-0.5">Due {fmtDate(line.due_date)}</p>
                        {isPaid && paidDate && (
                          <p className="text-[11px] text-[#34C759] mt-0.5 font-medium">Paid {fmtDate(paidDate)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <p className="text-sm font-bold text-[#1C1C1E]">{fmtPeso(line.total_amount_due)}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={lineStatusStyle(line)}>
                          {lineStatusLabel(line)}
                        </span>
                      </div>
                    </div>

                    {/* Partial progress bar */}
                    {isPartial && (
                      <div className="px-4 pb-3 space-y-1.5 border-t border-black/[0.06] pt-2.5">
                        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${paidPct}%`, background: '#0058C9' }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span style={{ color: '#0058C9', fontWeight: 600 }}>{fmtPeso(line.amount_paid ?? 0)} paid</span>
                          <span className="text-[#8E8E93]">{fmtPeso(balance)} remaining</span>
                        </div>
                      </div>
                    )}

                    {/* Payment receipts */}
                    {(isPaid || isPartial) && lineCols.length > 0 && (
                      <div className="border-t border-black/[0.06] px-4 py-2.5 space-y-2 bg-[#FAFAFA]">
                        {lineCols.map(({ app, coll }) => (
                          <div key={app.id} className="flex items-start justify-between gap-2">
                            <p className="text-[11px] text-[#8E8E93] min-w-0">
                              {[
                                fmtDate(coll.posting_date),
                                coll.mode_of_payment,
                                coll.acknowledgement_receipt_no ? `OR# ${coll.acknowledgement_receipt_no}` : null,
                                coll.sales_invoice_number ? `SI# ${coll.sales_invoice_number}` : null,
                                coll.mode_of_payment === 'Check' && coll.check_no
                                  ? `Chk# ${coll.check_no}${coll.check_date ? ` · ${fmtDate(coll.check_date)}` : ''}`
                                  : null,
                              ].filter(Boolean).join(' · ')}
                            </p>
                            <span className="text-[11px] font-semibold text-[#1C1C1E] shrink-0">{fmtPeso(app.applied_amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Direct payment info */}
                    {hasDirectPayment && (
                      <div className="border-t border-black/[0.06] px-4 py-2.5 bg-[#FAFAFA]">
                        <p className="text-[11px] text-[#8E8E93]">
                          {[
                            line.posting_date ? fmtDate(line.posting_date) : null,
                            line.mode_of_payment,
                            line.acknowledgement_receipt_no ? `OR# ${line.acknowledgement_receipt_no}` : null,
                            line.sales_invoice_number ? `SI# ${line.sales_invoice_number}` : null,
                            line.mode_of_payment === 'Check' && line.check_no
                              ? `Chk# ${line.check_no}${line.check_date ? ` · ${fmtDate(line.check_date)}` : ''}`
                              : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    )}

                    {/* Pro-rated breakdown */}
                    {(isPaid || isPartial) && (() => {
                      const paidAmt = isPaid
                        ? (Number(line.amount_paid) > 0 ? Number(line.amount_paid) : line.total_amount_due)
                        : Number(line.amount_paid) || 0;
                      const ratio = line.total_amount_due > 0 ? paidAmt / line.total_amount_due : 0;
                      const bp = Math.round((Number(line.principal)     || 0) * ratio);
                      const bh = line.hic != null ? Math.round(Number(line.hic) * ratio) : null;
                      const bv = Math.round((Number(line.vat)           || 0) * ratio);
                      const bo = Math.round((Number(line.other_charges) || 0) * ratio);
                      const items = [
                        { label: 'Principal', value: bp },
                        bh != null && bh > 0 ? { label: 'HIC',     value: bh } : null,
                        bv > 0               ? { label: 'VAT',     value: bv } : null,
                        bo > 0               ? { label: 'Charges', value: bo } : null,
                      ].filter(Boolean) as { label: string; value: number }[];
                      if (items.length <= 1) return null;
                      return (
                        <div className="border-t border-black/[0.06] px-4 py-2.5 bg-[#FAFAFA]">
                          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                            {items.map(item => (
                              <div key={item.label}>
                                <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wider">{item.label}</p>
                                <p className="text-[11px] font-semibold text-[#3C3C43]">{fmtPeso(item.value)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              }

              return (
                <>
                  {paidLines.length > 0 && (
                    <div className="space-y-2">
                      <SectionDivider label={`Paid · ${paidLines.length}`} color="#1A7F37" />
                      {paidLines.map(l => <LineCard key={l.id} line={l} />)}
                    </div>
                  )}
                  {overdueLines.length > 0 && (
                    <div className="space-y-2">
                      <SectionDivider label={`Overdue · ${overdueLines.length}`} color="#C0001E" />
                      {overdueLines.map(l => <LineCard key={l.id} line={l} />)}
                    </div>
                  )}
                  {upcomingLines.length > 0 && (
                    <div className="space-y-2">
                      <SectionDivider label={`Upcoming · ${upcomingLines.length}`} color="#A05A00" />
                      {upcomingLines.map(l => <LineCard key={l.id} line={l} />)}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Payment History */}
            {(() => {
              const activeLineIds = new Set(
                lines.filter(l => l.payment_status !== 'Superseded').map(l => String(l.id))
              );
              const postedCollections = collections.filter(c =>
                applications.some(a => a.collection_id === c.id && activeLineIds.has(String(a.receivable_line_id)))
              ).sort((a, b) => (a.posting_date < b.posting_date ? 1 : -1));

              const legacyLines = lines.filter(l =>
                l.payment_status === 'Paid' &&
                (l.acknowledgement_receipt_no || l.posting_date) &&
                !applications.some(a => String(a.receivable_line_id) === String(l.id))
              ).sort((a, b) => ((a.posting_date ?? '') < (b.posting_date ?? '') ? 1 : -1));

              if (postedCollections.length === 0 && legacyLines.length === 0) return null;

              return (
                <div className="space-y-2 pt-2">
                  <SectionDivider
                    label={`Payment History · ${postedCollections.length + legacyLines.length}`}
                    color="#3C3C43"
                  />

                  {postedCollections.map(c => {
                    const apps  = applications.filter(a => a.collection_id === c.id && activeLineIds.has(String(a.receivable_line_id)));
                    const total = apps.reduce((sum, a) => sum + Number(a.applied_amount), 0);
                    return (
                      <div
                        key={`coll-${c.id}`}
                        className="rounded-3xl bg-white overflow-hidden"
                        style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                      >
                        <div className="flex items-start justify-between px-4 py-3">
                          <div>
                            <p className="text-base font-bold text-[#1C1C1E]">{fmtPeso(c.amount_received)}</p>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              {fmtDate(c.posting_date)}
                              {c.mode_of_payment ? ` · ${c.mode_of_payment}` : ''}
                            </p>
                          </div>
                          <div className="text-right space-y-0.5">
                            {c.acknowledgement_receipt_no && (
                              <p className="text-[11px] font-semibold text-[#1C1C1E]">AR# {c.acknowledgement_receipt_no}</p>
                            )}
                            {c.sales_invoice_number && (
                              <p className="text-[11px] text-[#8E8E93]">SI# {c.sales_invoice_number}</p>
                            )}
                          </div>
                        </div>
                        <div className="border-t border-black/[0.06] px-4 py-2.5 bg-[#FAFAFA] space-y-2">
                          {apps.map(app => {
                            const covLine = lines.find(l => String(l.id) === String(app.receivable_line_id));
                            const linePaid = covLine?.payment_status === 'Paid';
                            return (
                              <div key={app.id} className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-[#6C6C70] truncate flex-1">
                                  {covLine?.type_of_payment ?? '—'}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] font-semibold text-[#1C1C1E]">
                                    {fmtPeso(Number(app.applied_amount))}
                                  </span>
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={linePaid
                                      ? { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }
                                      : { background: 'rgba(0,122,255,0.10)', color: '#0058C9' }}
                                  >
                                    {linePaid ? 'Paid' : 'Partial'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {c.amount_received > total + 0.005 && (
                            <p className="text-[11px]" style={{ color: '#A05A00' }}>
                              {fmtPeso(c.amount_received - total)} excess — all outstanding lines covered
                            </p>
                          )}
                        </div>
                        {c.mode_of_payment === 'Check' && (c.check_no || c.check_date) && (
                          <div className="border-t border-black/[0.06] px-4 py-2 bg-[#FAFAFA]">
                            <p className="text-[11px] text-[#8E8E93]">
                              {['Chk#', c.check_no, c.check_date ? fmtDate(c.check_date) : null]
                                .filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {legacyLines.map(l => (
                    <div
                      key={`leg-${l.id}`}
                      className="rounded-3xl bg-white overflow-hidden"
                      style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                    >
                      <div className="flex items-start justify-between px-4 py-3">
                        <div>
                          <p className="text-base font-bold text-[#1C1C1E]">{fmtPeso(l.total_amount_due)}</p>
                          <p className="text-[11px] text-[#8E8E93] mt-0.5">
                            {[l.posting_date ? fmtDate(l.posting_date) : null, l.mode_of_payment].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="text-right space-y-0.5">
                          {l.acknowledgement_receipt_no && (
                            <p className="text-[11px] font-semibold text-[#1C1C1E]">AR# {l.acknowledgement_receipt_no}</p>
                          )}
                          {l.sales_invoice_number && (
                            <p className="text-[11px] text-[#8E8E93]">SI# {l.sales_invoice_number}</p>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-black/[0.06] px-4 py-2.5 bg-[#FAFAFA]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#6C6C70] flex-1">{l.type_of_payment}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-semibold text-[#1C1C1E]">{fmtPeso(l.total_amount_due)}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }}>
                              Paid
                            </span>
                          </div>
                        </div>
                        {l.mode_of_payment === 'Check' && l.check_no && (
                          <p className="text-[11px] text-[#8E8E93] mt-1">
                            {['Chk#', l.check_no, l.check_date ? fmtDate(l.check_date) : null]
                              .filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingCollectionPage() {
  const [summaries,    setSummaries]    = useState<ReservationReceivableSummary[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter,setProjectFilter]= useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [selected,     setSelected]     = useState<ReservationReceivableSummary | null>(null);

  const activeFilterCount = [statusFilter, projectFilter, clientFilter].filter(Boolean).length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummaries(await fetchReceivableSummaries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return summaries.filter(s => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (projectFilter && s.project !== projectFilter) return false;
      if (clientFilter && s.client_name !== clientFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !s.client_name.toLowerCase().includes(q) &&
          !s.reservation_id.toLowerCase().includes(q) &&
          !s.inventory_code.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [summaries, statusFilter, projectFilter, clientFilter, search]);

  const sorted = useMemo(() => {
    const order: Record<string, number> = { Overdue: 0, Unpaid: 1, Complete: 2 };
    return [...filtered].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  }, [filtered]);

  return (
    <>
      <PageShell title="Billing and Collection">
        <div className="space-y-3 pb-6">

          {/* Search + Filter */}
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

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <Building2 size={28} className="text-[#C7C7CC] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
              <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
            </GlassCard>
          ) : (
            <div className="space-y-2">
              {sorted.map(s => (
                <GlassCard
                  key={s.reservation_id}
                  className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => setSelected(s)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
                    >
                      <span className="text-sm font-bold text-white">{getInitials(s.client_name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#1C1C1E] truncate">{s.reservation_id}</p>
                        {s.status !== 'Unpaid' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={STATUS_STYLE[s.status]}>
                            {s.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-[#6C6C70] truncate">{s.client_name}</span>
                        <span className="text-[#D1D1D6]">·</span>
                        <span className="text-xs text-[#6C6C70] truncate">{s.inventory_code}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-[#8E8E93]">
                          {s.next_due_date ? `Next due ${fmtDate(s.next_due_date)}` : 'All paid'}
                          {' · '}{s.paid_lines}/{s.total_lines} paid
                        </p>
                        {s.outstanding > 0 && (
                          <p className="text-xs font-bold text-[#C03D25] shrink-0">{fmtPeso(s.outstanding)}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </PageShell>

      {/* Filter sheet */}
      {filterOpen && (
        <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setFilterOpen(false)} />
      )}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col">
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
          <div className="px-5 pb-4 space-y-5 overflow-visible">

            {/* Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Status</p>
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={['Overdue', 'Unpaid', 'Complete']}
                placeholder="All statuses"
                dropUp
              />
            </div>

            {/* Project */}
            {(() => {
              const projects = [...new Set(summaries.map(s => s.project).filter(Boolean))].sort();
              if (projects.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
                  <SearchableSelect
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={projects}
                    placeholder="All projects"
                    dropUp
                  />
                </div>
              );
            })()}

            {/* Client Name */}
            {(() => {
              const clients = [...new Set(summaries.map(s => s.client_name).filter(Boolean))].sort();
              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Client Name</p>
                  <SearchableSelect
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={clients}
                    placeholder="All clients"
                    dropUp
                  />
                </div>
              );
            })()}

          </div>
          <div className="px-5 pb-10 pt-3 flex gap-3 shrink-0 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setProjectFilter(''); setClientFilter(''); }}
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

      {/* Lines Detail Overlay */}
      {selected && (
        <LinesOverlay
          summary={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
