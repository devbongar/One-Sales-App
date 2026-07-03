'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Image from 'next/image';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  fetchAllCommissionScheduleLines,
  fetchAllCollectedByReservation,
  fetchCommissionRecords,
  markPendingTranchesForRelease,
  releaseCommissionTranches,
  CommissionScheduleFullLine,
} from '@/lib/commission';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, BadgeCheck, Ban, Building2, Check, ChevronDown, Clock, Database, Download, Loader2, Search, Send, SlidersHorizontal, Unlock, Wallet, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id:               string;
  name:             string;
  cover_photo_url?: string | null;
  property_type?:   string | null;
}

type EffectiveStatus = 'For Release' | 'Released';

interface ReportLine extends CommissionScheduleFullLine {
  effectiveStatus: EffectiveStatus;
  positionRank:    string | null;
  sellerType:      string | null;
  sellerStatus:    string | null;
  payrollAccount:  string | null;
}

type SellerGroup = 'Inhouse Active' | 'Inhouse Inactive' | 'Broker';

function getSellerGroup(line: ReportLine): SellerGroup {
  // Presence in Salesperson table = in-house (covers chain members not in typeMap)
  if (line.sellerStatus !== null) {
    return line.sellerStatus === 'Active' ? 'Inhouse Active' : 'Inhouse Inactive';
  }
  if (line.sellerType === 'In-house') {
    return 'Inhouse Active';
  }
  return 'Broker';
}

const GROUP_ORDER: SellerGroup[] = ['Inhouse Active', 'Inhouse Inactive', 'Broker'];

const GROUP_META: Record<SellerGroup, { dot: string; bg: string }> = {
  'Inhouse Active':   { dot: '#34C759', bg: 'rgba(52,199,89,0.08)'  },
  'Inhouse Inactive': { dot: '#FF9500', bg: 'rgba(255,149,0,0.08)'  },
  'Broker':           { dot: '#007AFF', bg: 'rgba(0,122,255,0.08)'  },
};

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

export default function CommissionPayoutPage() {
  // ── Project selection (step 0) ───────────────────────────────────────────────
  const [projects,         setProjects]         = useState<Project[]>([]);
  const [projectsLoading,  setProjectsLoading]  = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [showReport,       setShowReport]        = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: Project[]) => setProjects(data ?? []))
      .catch(console.error)
      .finally(() => setProjectsLoading(false));
  }, []);

  function toggleProject(name: string) {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const allSelected = projects.length > 0 && projects.every(p => selectedProjects.has(p.name));

  function toggleAll() {
    if (allSelected) setSelectedProjects(new Set());
    else setSelectedProjects(new Set(projects.map(p => p.name)));
  }

  // ── Report state (step 1) ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [lines, setLines]     = useState<ReportLine[]>([]);

  // Filter state
  const [search, setSearch]                 = useState('');
  const [filterOpen, setFilterOpen]         = useState(false);

  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (!main) return;
    if (filterOpen) {
      main.style.setProperty('touch-action', 'none', 'important');
      main.style.setProperty('overflow-y', 'hidden', 'important');
      return () => {
        main.style.removeProperty('touch-action');
        main.style.removeProperty('overflow-y');
      };
    }
  }, [filterOpen]);
  const [statusFilter, setStatusFilter]           = useState<EffectiveStatus | ''>('');
  const [sellerStatusFilter, setSellerStatusFilter] = useState('');
  const [sellerFilter, setSellerFilter]           = useState('');
  const [positionFilter, setPositionFilter]       = useState('');

  const [collapsedGroups, setCollapsedGroups] = useState<Set<SellerGroup>>(
    new Set<SellerGroup>(['Inhouse Active', 'Inhouse Inactive', 'Broker'])
  );

  function toggleGroup(group: SellerGroup) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  // Selection + post state
  const [selectedTranches, setSelectedTranches] = useState<Set<number>>(new Set());
  const [confirmPost, setConfirmPost]           = useState(false);
  const [posting, setPosting]                   = useState(false);

  useEffect(() => {
    if (!showReport) return;
    async function load() {
      setLoading(true);
      setError('');
      setLines([]);
      try {
        const [allLines, collectionsMap, commRecords, { data: spRows }, { data: resRows }] = await Promise.all([
          fetchAllCommissionScheduleLines(),
          fetchAllCollectedByReservation(),
          fetchCommissionRecords(),
          supabase.from('Salesperson').select('"Seller Name", "Seller Status", "Payroll Account Number"'),
          supabase.from('reservations').select('reservation_id').eq('status', 'Booked').limit(5000),
        ]);
        const reservationStatusMap: Record<string, string> = {};
        (resRows ?? []).forEach((r: any) => { if (r.reservation_id) reservationStatusMap[r.reservation_id] = 'Booked'; });

        const nlpMap: Record<string, number>    = {};
        const rankMap: Record<string, string>   = {};
        const typeMap: Record<string, string>   = {};
        const statusMap: Record<string, string> = {};
        const accountMap: Record<string, string | null> = {};
        commRecords.forEach(r => {
          nlpMap[r.reservation_id] = r.net_list_price ?? 0;
          if (r.seller_name && r.position_rank) rankMap[r.seller_name] = r.position_rank;
          if (r.seller_name && r.seller_type)   typeMap[r.seller_name]  = r.seller_type;
        });
        (spRows ?? []).forEach((s: any) => {
          if (s['Seller Name']) {
            statusMap[s['Seller Name']]  = s['Seller Status'] ?? '';
            accountMap[s['Seller Name']] = s['Payroll Account Number'] ?? null;
          }
        });

        setNlpMap(nlpMap);
        setRankMap(rankMap);
        markPendingTranchesForRelease(allLines, collectionsMap, nlpMap, reservationStatusMap).catch(console.error);

        const result: ReportLine[] = [];

        for (const line of allLines) {
          if (selectedProjects.size > 0 && line.project && !selectedProjects.has(line.project)) continue;
          let effectiveStatus: EffectiveStatus | 'Pending';
          if (line.status === 'Released') {
            effectiveStatus = 'Released';
          } else {
            const nlp          = nlpMap[line.reservation_id] ?? 0;
            const collected    = collectionsMap[line.reservation_id] ?? 0;
            const pctCollected = nlp > 0 ? (collected / nlp) * 100 : 0;
            const isBooked     = (reservationStatusMap[line.reservation_id] ?? '') === 'Booked';
            effectiveStatus    = isBooked && (pctCollected >= line.percentage_collection || line.status === 'For Release')
              ? 'For Release'
              : 'Pending';
          }

          if (effectiveStatus === 'Pending') continue;

          result.push({
            ...line,
            effectiveStatus,
            positionRank:   line.seller_name ? (rankMap[line.seller_name]    ?? null) : null,
            sellerType:     line.seller_name ? (typeMap[line.seller_name]     ?? null) : null,
            sellerStatus:   line.seller_name ? (statusMap[line.seller_name]   ?? null) : null,
            payrollAccount: line.seller_name ? (accountMap[line.seller_name]  ?? null) : null,
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
  }, [showReport]);

  // ── Filter options (cascading) ──────────────────────────────────────────────
  const sellerOptions = useMemo(() => {
    const source = positionFilter ? lines.filter(l => l.positionRank === positionFilter) : lines;
    return [...new Set(source.map(l => l.seller_name).filter(Boolean))].sort() as string[];
  }, [lines, positionFilter]);

  const positionOptions = useMemo(() => {
    const source = sellerFilter ? lines.filter(l => l.seller_name === sellerFilter) : lines;
    return [...new Set(source.map(l => l.positionRank).filter(Boolean))].sort() as string[];
  }, [lines, sellerFilter]);
  const activeFilterCount = [statusFilter, sellerStatusFilter, sellerFilter, positionFilter].filter(Boolean).length;

  // ── Filtered lines ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return lines.filter(l => {
      if (statusFilter       && l.effectiveStatus !== statusFilter) return false;
      if (sellerStatusFilter && (l.sellerStatus ?? '') !== sellerStatusFilter) return false;
      if (sellerFilter       && l.seller_name     !== sellerFilter) return false;
      if (positionFilter     && l.positionRank    !== positionFilter) return false;
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
  }, [lines, statusFilter, sellerStatusFilter, sellerFilter, positionFilter, search]);

  // ── Summary totals (full unfiltered) ───────────────────────────────────────
  const totalForRelease = useMemo(() => lines.filter(l => l.effectiveStatus === 'For Release').reduce((s, l) => s + l.gross_commission, 0), [lines]);
  const totalReleased   = useMemo(() => lines.filter(l => l.effectiveStatus === 'Released').reduce((s, l)   => s + l.gross_commission, 0), [lines]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  function toggleTranche(id: number) {
    setSelectedTranches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedCount = selectedTranches.size;
  const selectedTotal = useMemo(
    () => lines.filter(l => selectedTranches.has(l.id)).reduce((s, l) => s + l.gross_commission, 0),
    [lines, selectedTranches],
  );

  // ── NLP + rank maps (for Excel export) ──────────────────────────────────────
  const [nlpMap,  setNlpMap]  = useState<Record<string, number>>({});
  const [rankMap, setRankMap] = useState<Record<string, string>>({});
  const [xlsxLoading, setXlsxLoading] = useState(false);

  // ── Download menu ────────────────────────────────────────────────────────────
  const [dlMenuOpen, setDlMenuOpen] = useState(false);
  const dlMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dlMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (dlMenuRef.current && !dlMenuRef.current.contains(e.target as Node)) {
        setDlMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [dlMenuOpen]);

  // ── DAT download ────────────────────────────────────────────────────────────
  const [datWarning, setDatWarning] = useState<string[]>([]);

  function buildDat(includeAll: boolean) {
    const inhouse = filtered.filter(l =>
      l.effectiveStatus === 'For Release' && l.sellerStatus !== null
    );
    const totals: Record<string, { account: string | null; amount: number }> = {};
    for (const l of inhouse) {
      const name = l.seller_name ?? '';
      if (!totals[name]) totals[name] = { account: l.payrollAccount, amount: 0 };
      totals[name].amount += l.gross_commission;
    }
    const missing = Object.entries(totals).filter(([, v]) => !v.account).map(([name]) => name);
    if (missing.length > 0 && !includeAll) { setDatWarning(missing); return; }
    const rows = Object.entries(totals)
      .filter(([, v]) => includeAll ? true : !!v.account)
      .map(([, v]) => `${v.account} ${v.amount.toFixed(2)}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `commission_payout_${new Date().toISOString().slice(0, 10)}.dat`;
    a.click();
    URL.revokeObjectURL(url);
    setDatWarning([]);
  }

  // ── Excel download ────────────────────────────────────────────────────────────
  async function buildFilteredExcel(statuses: string[] | null, filename: string, sheetName: string) {
    setXlsxLoading(true);
    try {
      const PAGE = 1000;
      let from = 0;
      const allRows: any[] = [];
      while (true) {
        let q = supabase
          .from('commission_schedule')
          .select('reservation_id, seller_name, client_name, project, inventory_code, tranche, commission_rate, gross_commission, status')
          .order('project',        { ascending: true })
          .order('seller_name',    { ascending: true })
          .order('reservation_id', { ascending: true })
          .order('tranche',        { ascending: true })
          .range(from, from + PAGE - 1);

        if (selectedProjects.size > 0) q = q.in('project', [...selectedProjects]);
        if (statuses)                  q = q.in('status',  statuses);

        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const rows = allRows.map((l: any) => ({
        Project:        l.project        ?? '—',
        Unit:           l.inventory_code ?? '—',
        'Buyer Name':   l.client_name    ?? '—',
        'Seller Name':  l.seller_name    ?? '—',
        Position:       positionLabel(rankMap[l.seller_name] ?? null),
        Status:         l.status         ?? '—',
        Tranche:        l.tranche,
        Price:          nlpMap[l.reservation_id] ?? 0,
        'Comm. Rate':   l.commission_rate,
        'Est. Comm.':   l.gross_commission,
        'Release Date': '—',
      }));

      if (rows.length === 0) { alert('No records found for this export.'); return; }

      const ws = XLSX.utils.json_to_sheet(rows);
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        for (const col of ['H', 'J']) {
          const cell = ws[`${col}${R + 1}`];
          if (cell) cell.z = '#,##0.00';
        }
        const rateCell = ws[`I${R + 1}`];
        if (rateCell) rateCell.z = '0.00"%"';
      }

      ws['!cols'] = [
        { wch: 28 }, { wch: 12 }, { wch: 28 }, { wch: 24 }, { wch: 22 },
        { wch: 14 }, { wch: 8  }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setXlsxLoading(false);
    }
  }

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

  // ── Project selection screen ─────────────────────────────────────────────────
  if (!showReport) {
    return (
      <PageShell title="Commission Payout">
        <div className="space-y-4 pb-32">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-[#1C1C1E]">Select Projects</p>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-semibold text-[#C03D25] active:opacity-60"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {projects.map(project => {
                const isSelected = selectedProjects.has(project.name);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => toggleProject(project.name)}
                    className="relative rounded-2xl overflow-hidden aspect-[3/2] active:scale-[0.97] transition-transform"
                    style={{
                      background: '#1C1C1E',
                      outline: isSelected ? '2.5px solid #C03D25' : '2.5px solid transparent',
                      outlineOffset: '2px',
                    }}
                  >
                    {project.cover_photo_url ? (
                      <Image
                        src={project.cover_photo_url}
                        alt={project.name}
                        fill
                        className="object-cover opacity-70"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Building2 size={28} className="text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                      <p className="text-white text-xs font-bold leading-tight line-clamp-2">{project.name}</p>
                      {project.property_type && (
                        <p className="text-white/60 text-[10px] mt-0.5">{project.property_type}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#C03D25] flex items-center justify-center shadow">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Show Report button */}
        <div
          className="fixed bottom-0 inset-x-0 z-40 px-4 pb-8 pt-4 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.96) 60%, transparent)' }}
        >
          <button
            type="button"
            disabled={selectedProjects.size === 0}
            onClick={() => setShowReport(true)}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white pointer-events-auto active:opacity-80 transition-opacity disabled:opacity-40"
            style={{ background: '#C03D25', boxShadow: '0 4px 24px rgba(192,61,37,0.35)' }}
          >
            {selectedProjects.size === 0
              ? 'Select at least one project'
              : `Show Report · ${selectedProjects.size} project${selectedProjects.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell
        title="Commission Payout"
        backButton
        onBack={() => { setShowReport(false); setLines([]); setError(''); }}
      >
        <div className="space-y-3 pb-32">

          {/* ── Summary stats ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[#8E8E93] text-xs font-semibold">For Release</p>
                {!loading && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(192,61,37,0.1)', color: '#C03D25' }}>
                    {lines.filter(l => l.effectiveStatus === 'For Release').length} tranches
                  </span>
                )}
              </div>
              <p className="text-[#C03D25] font-bold text-lg leading-tight">
                {loading ? '—' : fmt(totalForRelease)}
              </p>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[#8E8E93] text-xs font-semibold">Released</p>
                {!loading && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,199,89,0.1)', color: '#1A7F37' }}>
                    {lines.filter(l => l.effectiveStatus === 'Released').length} tranches
                  </span>
                )}
              </div>
              <p className="text-[#34C759] font-bold text-lg leading-tight">
                {loading ? '—' : fmt(totalReleased)}
              </p>
            </GlassCard>
          </div>

          {/* ── Search + Filter + Download ──────────────────────── */}
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
            {/* Download dropdown */}
            <div ref={dlMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => !loading && setDlMenuOpen(prev => !prev)}
                disabled={loading}
                className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70] disabled:opacity-40 active:opacity-60 transition-opacity"
                title="Download"
              >
                <Download size={18} />
              </button>
              {dlMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-black/[0.06] overflow-hidden z-30">

                  {/* DAT */}
                  <button
                    type="button"
                    disabled={filtered.filter(l => l.effectiveStatus === 'For Release' && l.sellerStatus !== null).length === 0}
                    onClick={() => { setDlMenuOpen(false); buildDat(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:opacity-40 transition-colors"
                  >
                    <Download size={15} className="text-[#6C6C70] shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight text-[13px]">Download DAT</p>
                      <p className="text-[11px] text-[#8E8E93]">Payroll transfer file</p>
                    </div>
                  </button>

                  <div className="h-px bg-black/[0.06] mx-4" />

                  {/* All Commission Database */}
                  <button
                    type="button"
                    disabled={xlsxLoading}
                    onClick={() => { setDlMenuOpen(false); buildFilteredExcel(null, 'commission_database', 'Commission Database'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:opacity-40 transition-colors"
                  >
                    {xlsxLoading ? <Loader2 size={15} className="text-[#007AFF] shrink-0 animate-spin" /> : <Database size={15} className="text-[#007AFF] shrink-0" />}
                    <div>
                      <p className="font-semibold leading-tight text-[13px]">All Commission Database</p>
                      <p className="text-[11px] text-[#8E8E93]">All statuses · Excel</p>
                    </div>
                  </button>

                  <div className="h-px bg-black/[0.06] mx-4" />

                  {/* Awaiting Milestone */}
                  <button
                    type="button"
                    disabled={xlsxLoading}
                    onClick={() => { setDlMenuOpen(false); buildFilteredExcel(['Pending'], 'commission_awaiting_milestone', 'Awaiting Milestone'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:opacity-40 transition-colors"
                  >
                    <Clock size={15} className="text-[#FF9500] shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight text-[13px]">Awaiting Milestone</p>
                      <p className="text-[11px] text-[#8E8E93]">Pending only · Excel</p>
                    </div>
                  </button>

                  {/* For Release */}
                  <button
                    type="button"
                    disabled={xlsxLoading}
                    onClick={() => { setDlMenuOpen(false); buildFilteredExcel(['For Release'], 'commission_for_release', 'For Release'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:opacity-40 transition-colors"
                  >
                    <Unlock size={15} className="text-[#6D28D9] shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight text-[13px]">For Release</p>
                      <p className="text-[11px] text-[#8E8E93]">For Release only · Excel</p>
                    </div>
                  </button>

                  {/* Released */}
                  <button
                    type="button"
                    disabled={xlsxLoading}
                    onClick={() => { setDlMenuOpen(false); buildFilteredExcel(['Released'], 'commission_released', 'Released'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:opacity-40 transition-colors"
                  >
                    <BadgeCheck size={15} className="text-[#34C759] shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight text-[13px]">Released</p>
                      <p className="text-[11px] text-[#8E8E93]">Released only · Excel</p>
                    </div>
                  </button>

                  {/* Cancelled / Superseded */}
                  <button
                    type="button"
                    disabled={xlsxLoading}
                    onClick={() => { setDlMenuOpen(false); buildFilteredExcel(['Cancelled', 'Superseded'], 'commission_cancelled', 'Cancelled & Voided'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] active:bg-[#E5E5EA] disabled:opacity-40 transition-colors"
                  >
                    <Ban size={15} className="text-[#FF3B30] shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight text-[13px]">Cancelled</p>
                      <p className="text-[11px] text-[#8E8E93]">Cancelled + Superseded · Excel</p>
                    </div>
                  </button>

                </div>
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
              {/* Record count */}
              <p className="text-xs text-[#8E8E93] px-1">
                {filtered.length} tranche{filtered.length !== 1 ? 's' : ''}
                {activeFilterCount > 0 || search ? ' (filtered)' : ''}
              </p>

              <div className="space-y-3">
                {GROUP_ORDER.map(group => {
                  const groupLines    = filtered.filter(l => getSellerGroup(l) === group);
                  if (groupLines.length === 0) return null;
                  const isCollapsed   = collapsedGroups.has(group);
                  const meta          = GROUP_META[group];
                  const groupForRel   = groupLines.filter(l => l.effectiveStatus === 'For Release');
                  const groupSubtotal = groupLines.reduce((s, l) => s + l.gross_commission, 0);
                  const allGroupSelected = groupForRel.length > 0 && groupForRel.every(l => selectedTranches.has(l.id));

                  function toggleGroupSelect() {
                    setSelectedTranches(prev => {
                      const next = new Set(prev);
                      if (allGroupSelected) groupForRel.forEach(l => next.delete(l.id));
                      else groupForRel.forEach(l => next.add(l.id));
                      return next;
                    });
                  }

                  return (
                    <div key={group}>
                      {/* Group header */}
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-2xl mb-2"
                        style={{ background: meta.bg }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className="flex items-center gap-2 flex-1 min-w-0 active:opacity-60"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
                          <span className="text-[12px] font-bold text-[#1C1C1E]">{group}</span>
                          <span className="text-[11px] text-[#8E8E93]">· {groupLines.length}</span>
                          <span className="text-[11px] font-semibold text-[#1C1C1E] ml-auto">{fmt(groupSubtotal)}</span>
                          <ChevronDown
                            size={13}
                            className="text-[#8E8E93] shrink-0 transition-transform duration-200"
                            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                          />
                        </button>
                        {!isCollapsed && groupForRel.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleGroupSelect}
                            className="shrink-0 text-[11px] font-semibold active:opacity-60 pl-2 border-l border-black/[0.1]"
                            style={{ color: meta.dot }}
                          >
                            {allGroupSelected ? 'Deselect' : 'Select all'}
                          </button>
                        )}
                      </div>

                      {!isCollapsed && (
                        <div className="space-y-2">
                          {groupLines.map(line => {
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
                                  {/* Row 1: Checkbox + Seller name + commission amount */}
                                  <div className="flex items-center gap-2.5 mb-1">
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
                                    <p className="text-[#1C1C1E] font-bold text-sm flex-1 min-w-0 truncate">
                                      {line.seller_name ?? '—'}
                                    </p>
                                    <p className="text-sm font-bold text-[#C03D25] shrink-0">{fmt(line.gross_commission)}</p>
                                  </div>

                                  {/* Row 2: Position */}
                                  {line.positionRank && (
                                    <p className="text-[11px] text-[#8E8E93] pl-7 mb-1.5">{positionLabel(line.positionRank)}</p>
                                  )}

                                  {/* Row 3: Reservation ID + Tranche + Status */}
                                  <div className="flex items-center gap-2 pl-7 mb-1">
                                    <p className="text-xs text-[#6C6C70] font-medium flex-1 min-w-0 truncate">{line.reservation_id}</p>
                                    <span className="text-[10px] font-bold text-[#8E8E93] shrink-0">TR. {line.tranche}</span>
                                    <span
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                                      style={STATUS_STYLE[line.effectiveStatus]}
                                    >
                                      {line.effectiveStatus}
                                    </span>
                                  </div>

                                  {/* Row 4: Project · Unit | Commission ID */}
                                  <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-black/[0.05] pl-7">
                                    <p className="text-[10px] text-[#C7C7CC] truncate flex-1">
                                      {line.project}
                                      {line.inventory_code && <> · <span className="font-medium">{line.inventory_code}</span></>}
                                    </p>
                                    <p className="text-[10px] text-[#C7C7CC] font-mono shrink-0">{commissionId(line.id)}</p>
                                  </div>

                                </GlassCard>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
        <div
          className="fixed inset-0 z-[45] bg-black/40"
          style={{ touchAction: 'none' }}
          onClick={() => setFilterOpen(false)}
        />
      )}

      {/* ── Filter sheet ─────────────────────────────────────── */}
      <div data-filter-sheet className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
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
          <div className="px-5 pb-4 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Status</p>
              <SearchableSelect
                options={['For Release', 'Released']}
                value={statusFilter}
                onChange={v => setStatusFilter(v as EffectiveStatus | '')}
                placeholder="All Statuses"
                dropUp
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller Status</p>
              <SearchableSelect
                options={['Active', 'Inactive']}
                value={sellerStatusFilter}
                onChange={v => setSellerStatusFilter(v)}
                placeholder="All"
                dropUp
              />
            </div>
            {sellerOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
                <SearchableSelect
                  options={sellerOptions}
                  value={sellerFilter}
                  onChange={v => {
                    setSellerFilter(v);
                    if (positionFilter) {
                      const valid = [...new Set(lines.filter(l => l.seller_name === v).map(l => l.positionRank).filter(Boolean))];
                      if (!valid.includes(positionFilter)) setPositionFilter('');
                    }
                  }}
                  placeholder="All Sellers"
                  dropUp
                />
              </div>
            )}
            {positionOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Position</p>
                <SearchableSelect
                  options={positionOptions.map(p => positionLabel(p))}
                  value={positionFilter ? positionLabel(positionFilter) : ''}
                  onChange={v => {
                    const rank = positionOptions.find(p => positionLabel(p) === v) ?? '';
                    setPositionFilter(rank);
                    if (sellerFilter) {
                      const valid = [...new Set(lines.filter(l => l.positionRank === rank).map(l => l.seller_name).filter(Boolean))];
                      if (!valid.includes(sellerFilter)) setSellerFilter('');
                    }
                  }}
                  placeholder="All Positions"
                  dropUp
                />
              </div>
            )}
          </div>
          <div className="px-5 pb-10 pt-3 flex gap-3 shrink-0 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setSellerStatusFilter(''); setSellerFilter(''); setPositionFilter(''); }}
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

      {/* ── DAT warning modal ─────────────────────────────────────────────────── */}
      {datWarning.length > 0 && (
        <>
          <div className="fixed inset-0 z-[49] bg-black/40" onClick={() => setDatWarning([])} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[50] bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1C1C1E]">Missing Payroll Accounts</p>
                  <p className="text-xs text-[#6C6C70] mt-0.5 leading-relaxed">
                    The following in-house sellers have no payroll account number on file and will be skipped in the DAT file:
                  </p>
                </div>
              </div>
              <div className="bg-[#F2F2F7] rounded-2xl px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                {datWarning.map(name => (
                  <p key={name} className="text-xs font-semibold text-[#1C1C1E]">· {name}</p>
                ))}
              </div>
            </div>
            <div className="px-5 pb-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDatWarning([])}
                className="py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => buildDat(true)}
                className="py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
              >
                Download Anyway
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
