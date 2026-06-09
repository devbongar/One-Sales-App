'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChevronLeft, Search, ArrowUpDown, X, Check, Loader2,
} from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import {
  fetchReceivableSummaries,
  fetchReceivableLines,
  ReservationReceivableSummary,
  ReceivableLine,
} from '@/lib/receivables';
import { postCollection } from '@/lib/collections';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmtPeso(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function schemeLabel(scheme: string): string {
  const map: Record<string, string> = {
    spot_cash:    'Spot Cash',
    deferred_cash:'Deferred Cash',
    spot_dp:      'Spot DP',
    stretched_dp: 'Stretched DP',
  };
  return map[scheme] ?? scheme;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Complete: { bg: '#DCFCE7',                  color: '#166534' },
  Overdue:  { bg: 'rgba(255,59,48,0.12)',      color: '#FF3B30' },
  Unpaid:   { bg: 'rgba(255,149,0,0.12)',      color: '#FF9500' },
};

const PROGRESS_COLOR: Record<string, string> = {
  Complete: '#34C759',
  Overdue:  '#FF3B30',
  Unpaid:   '#FF9500',
};

type FilterType = 'All' | 'Overdue' | 'Unpaid' | 'Complete';
type SortType   = 'due-asc' | 'due-desc' | 'client-az' | 'outstanding-desc';

const SORT_OPTIONS: { value: SortType; label: string }[] = [
  { value: 'due-asc',          label: 'Due Date (Earliest)' },
  { value: 'due-desc',         label: 'Due Date (Latest)'   },
  { value: 'client-az',        label: 'Client A–Z'          },
  { value: 'outstanding-desc', label: 'Outstanding (High–Low)' },
];

const MODES_OF_PAYMENT = ['Cash', 'Check', 'Online Transfer', 'PDC'];

/* ─── Post Payment Sheet ──────────────────────────────────────────────────── */
function PostPaymentSheet({
  line,
  onClose,
  onPosted,
}: {
  line: ReceivableLine;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [mop, setMop]                       = useState('');
  const [orNo, setOrNo]                     = useState('');
  const [salesInvoiceNo, setSalesInvoiceNo] = useState('');
  const [postingDate, setPostingDate]       = useState(localToday());
  const [checkNo, setCheckNo]               = useState('');
  const [checkDate, setCheckDate]           = useState('');
  const [posting, setPosting]               = useState(false);

  const isCheck   = mop === 'Check';
  const canSubmit = mop && postingDate && (!isCheck || (checkNo.trim() && checkDate));

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 focus:ring-1 focus:ring-[#C03D25]/20 transition-colors placeholder:text-[#C7C7CC]';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPosting(true);
    try {
      await postCollection(line.reservation_id, {
        amount_received:            Math.max(0, line.total_amount_due - (line.amount_paid ?? 0)),
        mode_of_payment:            mop,
        acknowledgement_receipt_no: orNo   || undefined,
        sales_invoice_number:       salesInvoiceNo || undefined,
        posting_date:               postingDate,
        check_no:                   isCheck ? checkNo.trim() : undefined,
        check_date:                 isCheck ? checkDate      : undefined,
      });
      onPosted();
    } catch (e) {
      console.error(e);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-5 pt-5 pb-10 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[#1C1C1E] font-bold text-base">{line.type_of_payment}</p>
            <p className="text-[#8E8E93] text-sm mt-0.5">
              {fmtPeso(line.total_amount_due)} · Due {fmtDate(line.due_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode of Payment */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">Mode of Payment</p>
          <div className="grid grid-cols-2 gap-2">
            {MODES_OF_PAYMENT.map((m) => (
              <button
                key={m}
                onClick={() => setMop(m)}
                className="py-2.5 rounded-2xl text-sm font-semibold transition-all border-2"
                style={
                  mop === m
                    ? { background: '#C03D25', color: '#fff', borderColor: '#C03D25' }
                    : { background: '#F2F2F7', color: '#1C1C1E', borderColor: 'transparent' }
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* OR No. */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">OR / Acknowledgement No.</p>
          <input
            type="text"
            value={orNo}
            onChange={(e) => setOrNo(e.target.value)}
            placeholder="e.g. 0001234"
            className={inputCls}
          />
        </div>

        {/* Sales Invoice No. */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">Sales Invoice No.</p>
          <input
            type="text"
            value={salesInvoiceNo}
            onChange={(e) => setSalesInvoiceNo(e.target.value)}
            placeholder="e.g. SI-00001"
            className={inputCls}
          />
        </div>

        {/* Posting Date */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">Posting Date</p>
          <input
            type="date"
            value={postingDate}
            onChange={(e) => setPostingDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Check Details — shown only when MOP is Check */}
        {isCheck && (
          <div className="rounded-2xl bg-[#F2F2F7] p-3 space-y-3">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-widest">Check Details</p>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#6C6C70]">
                Check No. <span className="text-[#C03D25]">*</span>
              </p>
              <input
                type="text"
                value={checkNo}
                onChange={(e) => setCheckNo(e.target.value)}
                placeholder="e.g. 0012345"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#6C6C70]">
                Check Date <span className="text-[#C03D25]">*</span>
              </p>
              <input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={posting || !canSubmit}
          className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white font-bold text-sm shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          {posting ? 'Posting…' : 'Confirm Payment'}
        </button>
      </div>
    </div>
  );
}

/* ─── Reservation Detail Overlay ──────────────────────────────────────────── */
function ReservationDetailOverlay({
  summary,
  onClose,
}: {
  summary: ReservationReceivableSummary;
  onClose: () => void;
}) {
  const [lines, setLines]           = useState<ReceivableLine[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedLine, setSelectedLine] = useState<ReceivableLine | null>(null);
  const today = localToday();

  const loadLines = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReceivableLines(summary.reservation_id);
      setLines(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [summary.reservation_id]);

  useEffect(() => { loadLines(); }, [loadLines]);

  const handlePosted = async () => {
    setSelectedLine(null);
    await loadLines();
  };

  const st = STATUS_STYLE[summary.status];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]">
      {/* Nav */}
      <div className="shrink-0 bg-white border-b border-black/[0.06] px-4 pt-14 pb-4 space-y-1">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[#1C1C1E] font-bold text-base truncate">{summary.client_name}</h1>
            <p className="text-[#8E8E93] text-xs truncate">
              {summary.inventory_code} · {schemeLabel(summary.payment_scheme)}
            </p>
          </div>
          <span
            className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={st}
          >
            {summary.status}
          </span>
        </div>
        <p className="text-[#C7C7CC] text-[11px] px-1">Res. {summary.reservation_id}</p>
      </div>

      {/* Lines list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : lines.length === 0 ? (
          <p className="text-center text-sm text-[#8E8E93] py-12">No receivable lines found.</p>
        ) : (
          lines.map((line) => {
            const isPaid    = line.payment_status === 'Paid';
            const isOverdue = !isPaid && line.due_date < today;

            return (
              <button
                key={line.id}
                onClick={!isPaid ? () => setSelectedLine(line) : undefined}
                disabled={isPaid}
                className="w-full text-left rounded-3xl overflow-hidden transition-all active:scale-[0.98] disabled:active:scale-100"
                style={{
                  background:  '#FFFFFF',
                  border:      '1px solid rgba(0,0,0,0.08)',
                  boxShadow:   '0 2px 12px rgba(0,0,0,0.06)',
                }}
              >
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E] truncate">
                      {line.type_of_payment}
                    </p>
                    <p className={`text-xs mt-0.5 ${isOverdue ? 'text-[#FF3B30] font-medium' : 'text-[#8E8E93]'}`}>
                      Due {fmtDate(line.due_date)}{isOverdue ? ' · Overdue' : ''}
                    </p>
                    {isPaid && (
                      <p className="text-xs text-[#8E8E93] mt-0.5">
                        {line.posting_date && `Posted ${fmtDate(line.posting_date)}`}
                        {line.mode_of_payment && ` · ${line.mode_of_payment}`}
                        {line.acknowledgement_receipt_no && ` · OR# ${line.acknowledgement_receipt_no}`}
                        {line.sales_invoice_number && ` · SI# ${line.sales_invoice_number}`}
                        {line.mode_of_payment === 'Check' && line.check_no && ` · Chk# ${line.check_no}`}
                        {line.mode_of_payment === 'Check' && line.check_date && ` · ${fmtDate(line.check_date)}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <p className="text-sm font-bold text-[#1C1C1E]">
                      {fmtPeso(line.total_amount_due)}
                    </p>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={
                        isPaid
                          ? { background: '#DCFCE7', color: '#166534' }
                          : isOverdue
                            ? { background: 'rgba(255,59,48,0.12)', color: '#FF3B30' }
                            : { background: 'rgba(255,149,0,0.12)', color: '#FF9500' }
                      }
                    >
                      {isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Post Payment Sheet */}
      {selectedLine && (
        <PostPaymentSheet
          line={selectedLine}
          onClose={() => setSelectedLine(null)}
          onPosted={handlePosted}
        />
      )}
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function ReceivableDatabasePage() {
  const [summaries, setSummaries]   = useState<ReservationReceivableSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<FilterType>('All');
  const [sort, setSort]             = useState<SortType>('due-asc');
  const [showSort, setShowSort]     = useState(false);
  const [selected, setSelected]     = useState<ReservationReceivableSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReceivableSummaries();
      setSummaries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const FILTERS: FilterType[] = ['All', 'Overdue', 'Unpaid', 'Complete'];

  const filterCount = (f: FilterType) =>
    f === 'All' ? summaries.length : summaries.filter((s) => s.status === f).length;

  const filtered = useMemo(() => {
    let list = summaries;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.client_name.toLowerCase().includes(q) ||
          s.reservation_id.toLowerCase().includes(q),
      );
    }

    if (filter !== 'All') list = list.filter((s) => s.status === filter);

    switch (sort) {
      case 'due-asc':
        list = [...list].sort((a, b) =>
          (a.next_due_date ?? '9999') < (b.next_due_date ?? '9999') ? -1 : 1
        );
        break;
      case 'due-desc':
        list = [...list].sort((a, b) =>
          (a.next_due_date ?? '') > (b.next_due_date ?? '') ? -1 : 1
        );
        break;
      case 'client-az':
        list = [...list].sort((a, b) => a.client_name.localeCompare(b.client_name));
        break;
      case 'outstanding-desc':
        list = [...list].sort((a, b) => b.outstanding - a.outstanding);
        break;
    }

    return list;
  }, [summaries, search, filter, sort]);

  return (
    <>
      <PageShell title="Collection Posting">
        <div className="flex flex-col">
          {/* Search + Sort */}
          <div className="px-4 pt-4 space-y-3 shrink-0">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white border border-black/[0.08] shadow-sm">
                <Search size={16} className="text-[#C7C7CC] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search client or reservation ID…"
                  className="flex-1 text-sm text-[#1C1C1E] bg-transparent outline-none placeholder:text-[#C7C7CC]"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="text-[#C7C7CC] active:opacity-60">
                    <X size={15} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowSort(true)}
                className="p-2.5 rounded-2xl bg-white border border-black/[0.08] shadow-sm text-[#1C1C1E] active:opacity-70 transition-opacity"
              >
                <ArrowUpDown size={18} />
              </button>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {FILTERS.map((f) => {
                const active = filter === f;
                const count  = filterCount(f);
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all"
                    style={
                      active
                        ? { background: '#C03D25', color: '#fff' }
                        : { background: '#F2F2F7', color: '#8E8E93' }
                    }
                  >
                    {f}
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={
                        active
                          ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                          : { background: 'rgba(0,0,0,0.07)',       color: '#8E8E93' }
                      }
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reservation cards */}
          <div className="px-4 py-4 pb-24 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={32} className="text-[#C03D25] animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48">
                <p className="text-[#8E8E93] text-sm">No reservations found.</p>
              </div>
            ) : (
              filtered.map((s) => {
                const st       = STATUS_STYLE[s.status];
                const barColor = PROGRESS_COLOR[s.status];
                const progress = s.total_lines > 0 ? s.paid_lines / s.total_lines : 0;

                return (
                  <button
                    key={s.reservation_id}
                    onClick={() => setSelected(s)}
                    className="w-full text-left rounded-3xl overflow-hidden active:scale-[0.98] transition-all"
                    style={{
                      background: '#FFFFFF',
                      border:     '1px solid rgba(0,0,0,0.08)',
                      boxShadow:  '0 2px 12px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div className="px-4 pt-4 pb-3 space-y-3">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#1C1C1E] truncate">{s.client_name}</p>
                          <p className="text-xs text-[#8E8E93] mt-0.5 truncate">
                            {s.inventory_code} · {schemeLabel(s.payment_scheme)}
                          </p>
                          <p className="text-[10px] text-[#C7C7CC] mt-0.5">{s.reservation_id}</p>
                        </div>
                        <span
                          className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold"
                          style={st}
                        >
                          {s.status}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-[#8E8E93]">
                            {s.paid_lines} / {s.total_lines} paid
                          </span>
                          <span className="text-[10px] text-[#8E8E93]">
                            {Math.round(progress * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-[#F2F2F7] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${progress * 100}%`, background: barColor }}
                          />
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex justify-between items-end pt-1 border-t border-black/[0.05]">
                        <div>
                          <p className="text-[10px] text-[#8E8E93] uppercase tracking-widest mb-0.5">
                            Next Due
                          </p>
                          {s.next_due_date ? (
                            <>
                              <p className="text-xs font-semibold text-[#1C1C1E]">
                                {fmtDate(s.next_due_date)}
                              </p>
                              <p className="text-xs text-[#8E8E93]">
                                {s.next_due_amount ? fmtPeso(s.next_due_amount) : '—'}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs font-semibold text-[#34C759]">All settled</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[#8E8E93] uppercase tracking-widest mb-0.5">
                            Outstanding
                          </p>
                          <p className="text-sm font-bold text-[#C03D25]">
                            {fmtPeso(s.outstanding)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PageShell>

      {/* Sort sheet */}
      {showSort && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSort(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#1C1C1E] font-bold text-base">Sort By</p>
              <button
                onClick={() => setShowSort(false)}
                className="p-2 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setSort(opt.value); setShowSort(false); }}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all"
                  style={
                    sort === opt.value
                      ? { background: 'rgba(192,61,37,0.08)', color: '#C03D25' }
                      : { background: '#F2F2F7',              color: '#1C1C1E' }
                  }
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  {sort === opt.value && (
                    <div className="w-5 h-5 rounded-full bg-[#C03D25] flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detail overlay */}
      {selected && (
        <ReservationDetailOverlay
          summary={selected}
          onClose={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}
