'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import FilterSelect from '@/components/ui/FilterSelect';
import { SalespersonRecord } from '@/lib/salesperson';
import { fetchCommissionRecords, fetchCommissionTranches, CommissionRecord, CommissionTranche } from '@/lib/commission';
import { Search, Building2, FileText, Hash, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ScheduleEntry {
  record: CommissionRecord;
  tranches: CommissionTranche[];
  loading: boolean;
  error: string;
}

export default function CommissionSchedulePage() {
  const router = useRouter();
  const [seller, setSeller] = useState<SalespersonRecord | null>(null);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [reservationIdFilter, setReservationIdFilter] = useState('');
  const [inventoryCodeFilter, setInventoryCodeFilter] = useState('');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Generated schedule
  const [scheduleMap, setScheduleMap] = useState<Record<string, ScheduleEntry>>({});
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);

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

  const projectOptions = useMemo(
    () => [...new Set(records.map(r => r.project))].filter(Boolean).sort(),
    [records]
  );
  const reservationIdOptions = useMemo(
    () => records.map(r => r.reservation_id).sort(),
    [records]
  );
  const inventoryCodeOptions = useMemo(
    () => [...new Set(records.map(r => r.inventory_code ?? ''))].filter(Boolean).sort(),
    [records]
  );

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (projectFilter && r.project !== projectFilter) return false;
      if (reservationIdFilter && r.reservation_id !== reservationIdFilter) return false;
      if (inventoryCodeFilter && (r.inventory_code ?? '') !== inventoryCodeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.reservation_id.toLowerCase().includes(q) &&
          !r.client_name.toLowerCase().includes(q) &&
          !(r.inventory_code ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [records, search, projectFilter, reservationIdFilter, inventoryCodeFilter]);

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setGenerated(false);
  }

  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(r => r.reservation_id)));
    setGenerated(false);
  }

  async function handleGenerate() {
    if (selected.size === 0) return;
    setGenerating(true);
    setGenerated(false);

    const selectedRecords = records.filter(r => selected.has(r.reservation_id));
    const init: Record<string, ScheduleEntry> = {};
    selectedRecords.forEach(r => {
      init[r.reservation_id] = { record: r, tranches: [], loading: true, error: '' };
    });
    setScheduleMap(init);

    await Promise.all(
      selectedRecords.map(async r => {
        try {
          const tranches = r.position_rank && r.product_type && r.seller_type
            ? await fetchCommissionTranches(r.project, r.position_rank, r.product_type, r.seller_type)
            : [];
          setScheduleMap(prev => ({
            ...prev,
            [r.reservation_id]: { record: r, tranches, loading: false, error: '' },
          }));
        } catch (e: any) {
          setScheduleMap(prev => ({
            ...prev,
            [r.reservation_id]: { record: r, tranches: [], loading: false, error: e.message ?? 'Failed' },
          }));
        }
      })
    );

    setExpanded(new Set(selectedRecords.map(r => r.reservation_id)));
    setGenerated(true);
    setGenerating(false);
  }

  if (!seller) return null;

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const selectedScheduleEntries = Object.values(scheduleMap);

  return (
    <PageShell title="Commission Schedule" backButton onBack={() => router.back()}>

      {/* Search */}
      <GlassCard className="px-4 py-3">
        <div className="flex items-center gap-2 bg-[#F2F2F7] rounded-xl px-3 py-2.5">
          <Search size={14} className="text-[#C7C7CC] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reservation, client, inventory code…"
            className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          )}
        </div>
      </GlassCard>

      {/* Filters */}
      <GlassCard className="px-4 py-1">
        <FilterSelect
          label="Project"
          value={projectFilter}
          options={projectOptions}
          onChange={setProjectFilter}
          icon={<Building2 size={16} />}
          searchable
        />
        <FilterSelect
          label="Reservation ID"
          value={reservationIdFilter}
          options={reservationIdOptions}
          onChange={setReservationIdFilter}
          icon={<Hash size={16} />}
          searchable
        />
        <FilterSelect
          label="Inventory Code"
          value={inventoryCodeFilter}
          options={inventoryCodeOptions}
          onChange={setInventoryCodeFilter}
          icon={<FileText size={16} />}
          searchable
        />
      </GlassCard>

      {/* Reservations list */}
      <GlassCard className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
          <div>
            <p className="text-[#1C1C1E] font-bold text-sm">Reservations</p>
            <p className="text-[#8E8E93] text-xs mt-0.5">Select to view commission schedule</p>
          </div>
          <p className="text-lg font-bold text-[#1C1C1E]">{records.length}</p>
        </div>

        {/* Select all + Generate bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAFAFA] border-b border-[rgba(0,0,0,0.04)]">
          <button onClick={toggleAll} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              allSelected ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C7C7CC] bg-white'
            }`}>
              {allSelected && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-xs font-semibold text-[#6C6C70]">Select ({filtered.length})</span>
          </button>

          <button
            onClick={handleGenerate}
            disabled={selected.size === 0 || generating}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selected.size > 0 && !generating
                ? 'bg-[#C03D25] text-white active:opacity-80'
                : 'bg-[#F2F2F7] text-[#C7C7CC]'
            }`}
          >
            {generating
              ? <Loader2 size={12} className="text-white animate-spin" />
              : <FileText size={12} />
            }
            Generate
          </button>
        </div>

        {/* List */}
        <div className="divide-y divide-[rgba(0,0,0,0.04)]">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          )}
          {error && <p className="text-center text-sm text-red-500 py-6 px-4">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-center text-sm text-[#8E8E93] py-8 px-4">No reservations found</p>
          )}

          {!loading && !error && filtered.map(r => {
            const isSelected = selected.has(r.reservation_id);
            const entry = scheduleMap[r.reservation_id];
            const isExpanded = expanded.has(r.reservation_id);

            return (
              <div key={r.reservation_id}>
                {/* Card row */}
                <div
                  className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[rgba(192,61,37,0.04)]' : ''
                  }`}
                  onClick={() => {
                    sessionStorage.setItem('selectedCommissionRecord', JSON.stringify(r));
                    router.push('/sales/sales-commission/schedule/detail');
                  }}
                >
                  {/* Checkbox — tap stops propagation to toggle without navigating */}
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C7C7CC] bg-white'
                    }`}
                    onClick={e => { e.stopPropagation(); toggleOne(r.reservation_id); }}
                  >
                    {isSelected && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[#C03D25] font-bold text-sm mb-1.5">{r.reservation_id}</p>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Building2 size={12} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs text-[#1C1C1E] font-medium truncate">{r.project}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs text-[#6C6C70]">{r.inventory_code ?? r.unit_no ?? '—'}</span>
                    </div>
                  </div>

                  {/* Expand toggle (only after Generate) */}
                  {entry && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setExpanded(prev => {
                          const next = new Set(prev);
                          if (next.has(r.reservation_id)) next.delete(r.reservation_id);
                          else next.add(r.reservation_id);
                          return next;
                        });
                      }}
                      className="p-1 text-[#C7C7CC] shrink-0"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>

                {/* Tranche schedule (expanded) */}
                {entry && isExpanded && (
                  <div className="mx-4 mb-3 rounded-2xl bg-[#F9F9F9] border border-[rgba(0,0,0,0.06)] overflow-hidden">
                    <div className="px-4 py-3 bg-[#F2F2F7] border-b border-[rgba(0,0,0,0.06)]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-[#1C1C1E]">{r.client_name}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approved</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[9px] text-[#8E8E93] uppercase tracking-wide">TCP</p>
                          <p className="text-xs font-bold text-[#1C1C1E]">{fmt(r.total_contract_price)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#8E8E93] uppercase tracking-wide">Rate</p>
                          <p className="text-xs font-bold text-[#C03D25]">{r.commission_rate != null ? `${r.commission_rate}%` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#8E8E93] uppercase tracking-wide">Total Commission</p>
                          <p className="text-xs font-bold text-[#1C1C1E]">{fmt(r.total_commission)}</p>
                        </div>
                      </div>
                    </div>

                    {entry.loading && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={20} className="text-[#C03D25] animate-spin" />
                      </div>
                    )}
                    {entry.error && <p className="text-center text-xs text-red-500 py-4 px-3">{entry.error}</p>}
                    {!entry.loading && !entry.error && entry.tranches.length === 0 && (
                      <p className="text-center text-xs text-[#8E8E93] py-4 px-3">No tranche schedule found.</p>
                    )}
                    {!entry.loading && !entry.error && entry.tranches.length > 0 && (
                      <div>
                        <div className="grid grid-cols-4 gap-1 px-4 py-2 border-b border-[rgba(0,0,0,0.06)]">
                          <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">Tranche</p>
                          <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Coll. %</p>
                          <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Rel. %</p>
                          <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Amount</p>
                        </div>
                        {entry.tranches.map((t, i) => (
                          <div key={`${t.tranche}-${i}`} className="grid grid-cols-4 gap-1 px-4 py-2 border-b border-[rgba(0,0,0,0.03)] last:border-0">
                            <p className="text-xs font-semibold text-[#1C1C1E]">{t.tranche}</p>
                            <p className="text-xs text-[#6C6C70] text-right">{t.percentage_collection}%</p>
                            <p className="text-xs text-[#6C6C70] text-right">{t.commission_release_rate}%</p>
                            <p className="text-xs font-semibold text-[#1C1C1E] text-right">
                              {fmt((r.total_commission ?? 0) * (t.commission_release_rate / 100))}
                            </p>
                          </div>
                        ))}
                        <div className="grid grid-cols-4 gap-1 px-4 py-2 bg-[#F2F2F7] border-t border-[rgba(0,0,0,0.06)]">
                          <p className="text-xs font-bold text-[#1C1C1E] col-span-3">Total</p>
                          <p className="text-xs font-bold text-[#C03D25] text-right">{fmt(r.total_commission)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom summary after Generate */}
        {generated && selectedScheduleEntries.length > 0 && (
          <div className="px-4 py-3 bg-[#F9F9F9] border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <p className="text-xs text-[#6C6C70]">
              {selectedScheduleEntries.length} unit{selectedScheduleEntries.length !== 1 ? 's' : ''} selected
            </p>
            <p className="text-xs font-bold text-[#1C1C1E]">
              Total: {fmt(selectedScheduleEntries.reduce((s, e) => s + (e.record.total_commission ?? 0), 0))}
            </p>
          </div>
        )}
      </GlassCard>

    </PageShell>
  );
}
