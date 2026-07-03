'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { supabase } from '@/lib/supabase';
import { fetchProjects } from '@/lib/inventory';
import { getSession } from '@/lib/auth';
import {
  Plus, Trash2, Loader2, X, Pencil, ChevronDown, AlertTriangle, Copy, Search, Check,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranchingRow {
  tranche:                 string;
  percentage_collection:   string;
  commission_release_rate: string;
  commission_rate:         string;
}

interface SchemeCard {
  commission_id:     string;
  project_id:        string | null;
  project:           string;
  position_rank:     string;
  product_type:      string;
  seller_type:       string;
  commission_type:   string;
  effectivity_start: string | null;
  effectivity_end:   string | null;
  tranches:          TranchingRow[];
}

interface HistoryEntry {
  id:               number;
  commission_id:    string;
  changed_at:       string;
  changed_by:       string | null;
  project:          string | null;
  position_rank:    string | null;
  product_type:     string | null;
  seller_type:      string | null;
  commission_type:  string | null;
  effectivity_start: string | null;
  effectivity_end:   string | null;
  tranches:         TranchingRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITION_RANKS = ['PS', 'SM', 'SD', 'SDH', 'SH'];
const PRODUCT_TYPES  = ['Residential Unit', 'Parking'];
const SELLER_TYPES   = ['In-house', 'Broker'];
const COMM_TYPES     = ['Regular', 'Special'];

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SpecialStatus { label: string; color: string; bg: string; }

function specialStatus(start: string | null, end: string | null): SpecialStatus | null {
  if (!start || !end) return null;
  const today = new Date().toISOString().split('T')[0];
  if (today < start) return { label: 'Upcoming', color: '#007AFF', bg: 'rgba(0,122,255,0.08)' };
  if (today > end)   return { label: 'Expired',  color: '#8E8E93', bg: 'rgba(142,142,147,0.10)' };
  return { label: 'Active', color: '#34C759', bg: 'rgba(52,199,89,0.10)' };
}


function EMPTY_FORM() {
  return {
    project:           '',
    position_rank:     '',
    product_type:      '',
    seller_type:       '',
    commission_type:   'Regular' as string,
    effectivity_start: '',
    effectivity_end:   '',
    tranches: [
      { tranche: '1', percentage_collection: '', commission_release_rate: '', commission_rate: '' },
    ] as TranchingRow[],
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommissionRatesPage() {
  const router = useRouter();

  const [schemes,     setSchemes]     = useState<SchemeCard[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [projectList, setProjectList] = useState<string[]>([]);

  // Filters
  const [fltProject,  setFltProject]  = useState('');
  const [fltPosition, setFltPosition] = useState('');
  const [fltProduct,  setFltProduct]  = useState('');
  const [fltSeller,   setFltSeller]   = useState('');
  const [fltType,     setFltType]     = useState('');

  // Sheet
  const [sheet,      setSheet]      = useState<'add' | 'edit' | null>(null);
  const [editScheme, setEditScheme] = useState<SchemeCard | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form
  const [form, setForm] = useState(EMPTY_FORM());

  // Copy-from
  const [copyFromId,    setCopyFromId]    = useState('');
  const [showCopyList,  setShowCopyList]  = useState(false);
  const [copyFromQuery, setCopyFromQuery] = useState('');

  // Sheet animation
  const [sheetVisible, setSheetVisible] = useState(false);
  useEffect(() => {
    if (sheet) requestAnimationFrame(() => setSheetVisible(true));
  }, [sheet]);

  // Portal mount guard (document not available during SSR)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // History
  const [currentUser,     setCurrentUser]     = useState('');
  const [schemeHistory,   setSchemeHistory]   = useState<Record<string, HistoryEntry[]>>({});
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [histExpanded,    setHistExpanded]    = useState(false);
  const [expandedHistIdx, setExpandedHistIdx] = useState<number | null>(null);

  // ── Scroll lock ──────────────────────────────────────────────────────────
  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (!main) return;
    if (sheet) {
      const sy = main.scrollTop;
      main.dataset.scrollY = String(sy);
      main.style.cssText += ';overflow:hidden;position:fixed;top:-' + sy + 'px;width:100%';
    } else {
      const sy = parseInt(main.dataset.scrollY ?? '0', 10);
      main.style.overflow = main.style.position = main.style.top = main.style.width = '';
      main.scrollTop = sy;
      delete main.dataset.scrollY;
    }
    return () => { main.style.overflow = main.style.position = main.style.top = main.style.width = ''; };
  }, [sheet]);

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchProjects().then(setProjectList).catch(console.error);
    loadSchemes();
    getSession().then(s => setCurrentUser(s?.full_name || s?.display_name || s?.email || ''));
  }, []);

  // Load history whenever the overlay opens for a different scheme
  useEffect(() => {
    setHistExpanded(false);
    setExpandedHistIdx(null);
    if (!expandedId) { setHistoryLoading(false); return; }
    setHistoryLoading(true);
    supabase
      .from('commission_tranching_history')
      .select('*')
      .eq('commission_id', expandedId)
      .order('changed_at', { ascending: false })
      .then(({ data }) => {
        setSchemeHistory(prev => ({ ...prev, [expandedId]: (data ?? []) as HistoryEntry[] }));
        setHistoryLoading(false);
      });
  }, [expandedId]);

  async function loadSchemes() {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('Commission_Tranching')
        .select('*')
        .eq('Status', 'Active')
        .order('commission_id', { ascending: true });
      if (err) throw err;

      const map: Record<string, SchemeCard> = {};
      for (const row of (data ?? []) as any[]) {
        const cid = row.commission_id
          ?? `${row.Project}|${row['Position Rank']}|${row['Product Type']}|${row['Seller Type']}|${row.commission_type}|${row.effectivity_start}|${row.effectivity_end}`;
        if (!map[cid]) {
          map[cid] = {
            commission_id:     cid,
            project_id:        row.project_id ?? null,
            project:           row.Project,
            position_rank:     row['Position Rank'],
            product_type:      row['Product Type'],
            seller_type:       row['Seller Type'],
            commission_type:   row.commission_type ?? 'Regular',
            effectivity_start: row.effectivity_start ?? null,
            effectivity_end:   row.effectivity_end   ?? null,
            tranches:          [],
          };
        }
        map[cid].tranches.push({
          tranche:                 String(row.Tranche),
          percentage_collection:   String(row['Percentage Collection']),
          commission_release_rate: String(row['Commission Release Rate']),
          commission_rate:         String(row['Commission Rate']),
        });
      }
      setSchemes(Object.values(map).map(s => ({
        ...s,
        tranches: [...s.tranches].sort((a, b) => Number(a.tranche) - Number(b.tranche)),
      })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Add conflict detection ────────────────────────────────────────────────
  const addConflict = useMemo(() => {
    if (sheet !== 'add') return null;
    if (!form.project || !form.position_rank || !form.product_type || !form.seller_type) return null;
    if (form.commission_type === 'Special' && (!form.effectivity_start || !form.effectivity_end)) return null;
    return schemes.find(s =>
      s.project       === form.project &&
      s.position_rank === form.position_rank &&
      s.product_type  === form.product_type &&
      s.seller_type   === form.seller_type &&
      s.commission_type === form.commission_type &&
      (form.commission_type !== 'Special' || (
        s.effectivity_start === form.effectivity_start &&
        s.effectivity_end   === form.effectivity_end
      ))
    ) ?? null;
  }, [sheet, schemes, form.project, form.position_rank, form.product_type, form.seller_type, form.commission_type, form.effectivity_start, form.effectivity_end]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => schemes.filter(s =>
    (!fltProject  || s.project       === fltProject)  &&
    (!fltPosition || s.position_rank === fltPosition) &&
    (!fltProduct  || s.product_type  === fltProduct)  &&
    (!fltSeller   || s.seller_type   === fltSeller)   &&
    (!fltType     || s.commission_type === fltType)
  ), [schemes, fltProject, fltPosition, fltProduct, fltSeller, fltType]);

  const projectOptions = useMemo(
    () => [...new Set(schemes.map(s => s.project))].sort(),
    [schemes]
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function nextCmrId(): Promise<string> {
    const { data } = await supabase
      .from('Commission_Tranching')
      .select('commission_id')
      .not('commission_id', 'is', null)
      .order('commission_id', { ascending: false })
      .limit(1);
    const last = (data?.[0] as any)?.commission_id as string | null;
    const num = last ? (parseInt(last.replace('CMR-', ''), 10) + 1) : 1;
    return 'CMR-' + String(num).padStart(6, '0');
  }

  async function lookupProjectId(name: string): Promise<string | null> {
    const { data } = await supabase.from('projects').select('project_id').eq('name', name).maybeSingle();
    return (data as any)?.project_id ?? null;
  }

  // ── Sheet control ─────────────────────────────────────────────────────────
  function openAdd() {
    setForm(EMPTY_FORM());
    setCopyFromId(''); setShowCopyList(false); setFormErrors({});
    setEditScheme(null); setSheet('add');
  }

  function openEdit(s: SchemeCard) {
    setForm({
      project: s.project, position_rank: s.position_rank,
      product_type: s.product_type, seller_type: s.seller_type,
      commission_type: s.commission_type,
      effectivity_start: s.effectivity_start ?? '',
      effectivity_end: s.effectivity_end ?? '',
      tranches: s.tranches.map(t => ({ ...t })),
    });
    setCopyFromId(''); setShowCopyList(false); setFormErrors({});
    setEditScheme(s); setSheet('edit');
  }

  function closeSheet() {
    setSheetVisible(false);
    setTimeout(() => {
      setSheet(null); setEditScheme(null); setForm(EMPTY_FORM());
      setFormErrors({}); setCopyFromId(''); setShowCopyList(false); setCopyFromQuery('');
    }, 320);
  }

  function applyCopyFrom(id: string) {
    const src = schemes.find(s => s.commission_id === id);
    if (src) setForm(f => ({ ...f, tranches: src.tranches.map(t => ({ ...t })) }));
    setCopyFromId(id); setShowCopyList(false); setCopyFromQuery('');
  }

  // ── Tranche helpers ───────────────────────────────────────────────────────
  function addTranche() {
    setForm(f => ({ ...f, tranches: [...f.tranches, { tranche: String(f.tranches.length + 1), percentage_collection: '', commission_release_rate: '', commission_rate: '' }] }));
  }
  function removeTranche(i: number) {
    setForm(f => ({ ...f, tranches: f.tranches.filter((_, idx) => idx !== i) }));
  }
  function setTranche(i: number, field: keyof TranchingRow, val: string) {
    setForm(f => ({ ...f, tranches: f.tranches.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.project)       e.project  = 'Required';
    if (!form.position_rank) e.position = 'Required';
    if (!form.product_type)  e.product  = 'Required';
    if (!form.seller_type)   e.seller   = 'Required';
    if (form.commission_type === 'Special') {
      if (!form.effectivity_start) e.start = 'Required';
      if (!form.effectivity_end)   e.end   = 'Required';
      if (form.effectivity_start && form.effectivity_end && form.effectivity_end <= form.effectivity_start)
        e.end = 'End must be after start';
    }
    form.tranches.forEach((t, i) => {
      if (!t.percentage_collection)   e[`col${i}`]  = 'Required';
      if (!t.commission_release_rate) e[`rel${i}`]  = 'Required';
      if (!t.commission_rate)         e[`rate${i}`] = 'Required';
    });
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const projId = await lookupProjectId(form.project);

      function buildRows(cmrId: string) {
        return form.tranches.map((t, i) => ({
          'Project':                 form.project,
          'Position Rank':           form.position_rank,
          'Product Type':            form.product_type,
          'Seller Type':             form.seller_type,
          'Tranche':                 t.tranche || String(i + 1),
          'Percentage Collection':   t.percentage_collection,
          'Commission Release Rate': t.commission_release_rate,
          'Commission Rate':         t.commission_rate,
          'Status':                  'Active',
          commission_type:           form.commission_type,
          effectivity_start:         form.commission_type === 'Special' ? form.effectivity_start : null,
          effectivity_end:           form.commission_type === 'Special' ? form.effectivity_end   : null,
          commission_id:             cmrId,
          project_id:                projId,
        }));
      }

      async function snapshotAndReplace(cmrId: string, snap: SchemeCard | { project: string; position_rank: string; product_type: string; seller_type: string; commission_type: string; effectivity_start: string | null; effectivity_end: string | null; tranches: TranchingRow[] }) {
        const { error: histErr } = await supabase.from('commission_tranching_history').insert({
          commission_id:     cmrId,
          project:           snap.project,
          project_id:        'project_id' in snap ? snap.project_id : null,
          position_rank:     snap.position_rank,
          product_type:      snap.product_type,
          seller_type:       snap.seller_type,
          commission_type:   snap.commission_type,
          effectivity_start: snap.effectivity_start,
          effectivity_end:   snap.effectivity_end,
          tranches:          snap.tranches,
          changed_by:        currentUser || null,
        });
        if (histErr) throw histErr;
        const { error: delErr } = await supabase.from('Commission_Tranching').delete().eq('commission_id', cmrId);
        if (delErr) throw delErr;
      }

      if (sheet === 'edit' && editScheme) {
        // Snapshot old values → delete old rows → insert new rows with SAME commission_id
        await snapshotAndReplace(editScheme.commission_id, editScheme);
        const { error: e } = await supabase.from('Commission_Tranching').insert(buildRows(editScheme.commission_id));
        if (e) throw e;
      } else {
        // Add: UI already blocks saves when a conflict exists, but guard here too
        if (addConflict) throw new Error('A scheme already exists for this configuration.');
        const targetCmrId = await nextCmrId();
        const { error: e } = await supabase.from('Commission_Tranching').insert(buildRows(targetCmrId));
        if (e) throw e;
      }

      closeSheet();
      await loadSchemes();
    } catch (e: any) {
      setFormErrors(p => ({ ...p, _save: e.message }));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(s: SchemeCard) {
    setDeleting(s.commission_id); setConfirmDel(null);
    try {
      const { error: e } = await supabase.from('Commission_Tranching').update({ Status: 'Inactive' }).eq('commission_id', s.commission_id);
      if (e) throw e;
      await loadSchemes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const activeFilters = [fltProject, fltPosition, fltProduct, fltSeller, fltType].filter(Boolean).length;

  return (
    <PageShell title="Commission Rates" backButton onBack={() => router.back()}>

      {/* Stats strip */}
      <div className="bg-white border border-black/[0.06] rounded-2xl shadow-sm flex overflow-hidden">
        {[
          { label: 'Total',   count: schemes.length,                                                    dot: '#1C1C1E' },
          { label: 'Regular', count: schemes.filter(s => s.commission_type === 'Regular').length,       dot: '#C03D25' },
          { label: 'Special', count: schemes.filter(s => s.commission_type === 'Special').length,       dot: '#FF9500' },
        ].map(({ label, count, dot }, i) => (
          <div
            key={label}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5"
            style={i < 2 ? { borderRight: '1px solid rgba(0,0,0,0.06)' } : undefined}
          >
            <p className="text-xl font-bold" style={{ color: dot }}>{count}</p>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
              <p className="text-[10px] text-[#8E8E93] font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-black/[0.06] rounded-2xl shadow-sm overflow-visible">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
          <p className="text-xs font-bold text-[#1C1C1E] uppercase tracking-wide">Filters</p>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => { setFltProject(''); setFltPosition(''); setFltProduct(''); setFltSeller(''); setFltType(''); }}
              className="flex items-center gap-1 text-xs font-semibold text-[#C03D25] active:opacity-70"
            >
              <X size={11} />
              Clear {activeFilters}
            </button>
          )}
        </div>
        <div className="px-3 py-3 space-y-2">
          <SearchableSelect
            value={fltProject}
            onChange={setFltProject}
            options={projectOptions}
            placeholder="All Projects"
          />
          <div className="grid grid-cols-2 gap-2">
            <SearchableSelect value={fltPosition} onChange={setFltPosition} options={POSITION_RANKS} placeholder="All Positions" />
            <SearchableSelect value={fltSeller}   onChange={setFltSeller}   options={SELLER_TYPES}   placeholder="All Seller Types" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SearchableSelect value={fltProduct} onChange={setFltProduct} options={PRODUCT_TYPES} placeholder="All Products" />
            <SearchableSelect value={fltType}    onChange={setFltType}    options={COMM_TYPES}    placeholder="All Types" />
          </div>
        </div>
      </div>

      {/* Result count (only when filters active) */}
      {activeFilters > 0 && (
        <p className="text-xs text-[#8E8E93] -mt-1 px-1">
          Showing {filtered.length} of {schemes.length} scheme{schemes.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Add button */}
      <button
        type="button"
        onClick={openAdd}
        className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(192,61,37,0.3)] active:opacity-80"
      >
        <Plus size={16} />
        Add Commission Scheme
      </button>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ── Tranche detail overlay (portaled to body to escape overflow-y-auto) ── */}
      {mounted && expandedId && createPortal((() => {
        const s = schemes.find(x => x.commission_id === expandedId);
        if (!s) return null;
        const spStatus   = specialStatus(s.effectivity_start, s.effectivity_end);
        const isDeleting = deleting === s.commission_id;
        const isConfirm  = confirmDel === s.commission_id;
        const histEntries = schemeHistory[expandedId] ?? [];
        return (
          <>
            <style>{`@keyframes cardPop{from{transform:scale(0.88);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
            {/* Full-screen blur backdrop */}
            <div
              className="fixed inset-0 z-30"
              style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
              onClick={() => { setExpandedId(null); setConfirmDel(null); }}
            />
            {/* Centering wrapper — pointer-events-none so taps outside the card reach the backdrop */}
            <div className="fixed inset-0 z-40 flex items-center justify-center px-5 pointer-events-none">
            {/* Floating card */}
            <div
              className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col w-full pointer-events-auto"
              style={{
                maxHeight: '80vh',
                animation: 'cardPop 220ms cubic-bezier(0.34,1.4,0.64,1) both',
              }}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-black/[0.06]">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold text-[#8E8E93] font-mono">{s.commission_id}</span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {s.commission_type === 'Special' && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,149,0,0.12)', color: '#FF9500' }}>Special</span>
                    )}
                    {spStatus && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: spStatus.bg, color: spStatus.color }}>{spStatus.label}</span>
                    )}
                  </div>
                </div>
                <p className="text-base font-bold text-[#1C1C1E] leading-snug">{s.project}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F2F2F7] text-[#1C1C1E]">{s.position_rank}</span>
                  <span className="text-[11px] text-[#6C6C70]">{s.product_type === 'Residential Unit' ? 'Residential Unit' : s.product_type}</span>
                  <span className="text-[11px] text-[#8E8E93]">· {s.seller_type}</span>
                </div>
                {s.commission_type === 'Special' && s.effectivity_start && (
                  <p className="text-[11px] text-[#8E8E93] mt-1.5">{s.effectivity_start} → {s.effectivity_end}</p>
                )}
              </div>

              {/* Tranche table + Version History */}
              <div className="overflow-y-auto flex-1">
                {/* Tranche header */}
                <div className="grid grid-cols-4 px-5 py-2.5 bg-[#F2F2F7] border-b border-black/[0.06]">
                  {['Tranche', 'Coll %', 'Release %', 'Comm %'].map(h => (
                    <p key={h} className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide text-center">{h}</p>
                  ))}
                </div>
                {/* Tranche rows */}
                {s.tranches.map((t, i) => (
                  <div key={i} className="grid grid-cols-4 px-5 py-3 border-b border-black/[0.04]"
                    style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white' }}>
                    <div className="flex justify-center">
                      <span className="w-6 h-6 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[10px] font-bold text-[#1C1C1E]">{t.tranche}</span>
                    </div>
                    <p className="text-xs text-[#6C6C70] text-center">{t.percentage_collection}%</p>
                    <p className="text-xs text-[#6C6C70] text-center">{t.commission_release_rate}%</p>
                    <p className="text-xs font-bold text-center text-[#C03D25]">{t.commission_rate}%</p>
                  </div>
                ))}

                {/* Version History */}
                <div className="border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={() => setHistExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-5 py-3.5"
                  >
                    <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wide">Version History</p>
                    <div className="flex items-center gap-2">
                      {historyLoading && <Loader2 size={12} className="animate-spin text-[#8E8E93]" />}
                      {!historyLoading && histEntries.length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E5E5EA] text-[#6C6C70]">
                          {histEntries.length}
                        </span>
                      )}
                      <ChevronDown
                        size={13}
                        className="text-[#8E8E93]"
                        style={{ transform: histExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 220ms ease' }}
                      />
                    </div>
                  </button>

                  {histExpanded && (
                    <div className="px-4 pb-4 space-y-2.5">
                      {historyLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 size={16} className="animate-spin text-[#8E8E93]" />
                        </div>
                      ) : histEntries.length === 0 ? (
                        <p className="text-xs text-[#8E8E93] text-center py-3">No previous versions</p>
                      ) : histEntries.map((h, i) => (
                        <div key={h.id} className="rounded-2xl border border-black/[0.06] overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedHistIdx(v => v === i ? null : i)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-[#FAFAFA]"
                          >
                            <div className="text-left">
                              <p className="text-[11px] font-semibold text-[#1C1C1E]">
                                {new Date(h.changed_at).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                              {h.changed_by && (
                                <p className="text-[10px] text-[#8E8E93] mt-0.5">by {h.changed_by}</p>
                              )}
                            </div>
                            <ChevronDown
                              size={12}
                              className="text-[#8E8E93]"
                              style={{ transform: expandedHistIdx === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}
                            />
                          </button>
                          {expandedHistIdx === i && (
                            <div className="border-t border-black/[0.05]">
                              <div className="grid grid-cols-4 px-4 py-2 bg-[#F2F2F7]">
                                {['T', 'Coll%', 'Rel%', 'Comm%'].map(lbl => (
                                  <p key={lbl} className="text-[9px] font-bold text-[#8E8E93] uppercase text-center">{lbl}</p>
                                ))}
                              </div>
                              {(h.tranches as TranchingRow[]).map((t, ti) => (
                                <div key={ti} className="grid grid-cols-4 px-4 py-2.5 border-t border-black/[0.04]"
                                  style={{ background: ti % 2 === 1 ? '#FAFAFA' : 'white' }}>
                                  <p className="text-[10px] text-center text-[#8E8E93]">{t.tranche}</p>
                                  <p className="text-[10px] text-center text-[#8E8E93]">{t.percentage_collection}%</p>
                                  <p className="text-[10px] text-center text-[#8E8E93]">{t.commission_release_rate}%</p>
                                  <p className="text-[10px] text-center font-semibold text-[#8E8E93]">{t.commission_rate}%</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-black/[0.06] px-5 py-3 flex items-center gap-2">
                {isConfirm ? (
                  <>
                    <button type="button" onClick={() => setConfirmDel(null)}
                      className="flex-1 py-2.5 rounded-2xl bg-[#F2F2F7] text-sm font-semibold text-[#6C6C70]">
                      Cancel
                    </button>
                    <button type="button" onClick={() => handleDelete(s)} disabled={isDeleting}
                      className="flex-1 py-2.5 rounded-2xl bg-red-500 text-sm font-semibold text-white flex items-center justify-center">
                      {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Delete'}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setExpandedId(null); openEdit(s); }}
                      className="flex-1 py-2.5 rounded-2xl bg-[#F2F2F7] text-sm font-semibold text-[#1C1C1E] flex items-center justify-center gap-1.5">
                      <Pencil size={13} /> Edit
                    </button>
                    <button type="button" onClick={() => setConfirmDel(s.commission_id)} disabled={isDeleting}
                      className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center shrink-0">
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </>
                )}
              </div>
            </div>
            </div>
          </>
        );
      })(), document.body)}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="text-[#C03D25] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard className="py-10 text-center">
          <p className="text-sm text-[#8E8E93]">
            {schemes.length === 0 ? 'No commission schemes configured yet.' : 'No schemes match the current filters.'}
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(s => {
            const spStatus = specialStatus(s.effectivity_start, s.effectivity_end);

            return (
              <button
                key={s.commission_id}
                type="button"
                onClick={() => setExpandedId(s.commission_id)}
                className="bg-white rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden flex flex-col text-left active:scale-[0.97] transition-transform duration-150"
              >
                {/* Card body */}
                <div className="px-3 pt-3 pb-3 flex-1 w-full">
                  {/* ID row */}
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <span className="text-[9px] font-bold text-[#8E8E93] font-mono leading-none mt-0.5">
                      {s.commission_id}
                    </span>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {s.commission_type === 'Special' && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,149,0,0.12)', color: '#FF9500' }}>
                          Special
                        </span>
                      )}
                      {spStatus && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: spStatus.bg, color: spStatus.color }}>
                          {spStatus.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Project */}
                  <p className="text-sm font-bold text-[#1C1C1E] leading-tight mb-1.5 line-clamp-2">{s.project}</p>

                  {/* Position chip */}
                  <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 bg-[#F2F2F7] text-[#1C1C1E]">
                    {s.position_rank}
                  </span>

                  {/* Product · Seller */}
                  <p className="text-[10px] text-[#6C6C70] leading-snug">
                    {s.product_type === 'Residential Unit' ? 'Residential' : s.product_type}
                  </p>
                  <p className="text-[10px] text-[#8E8E93]">{s.seller_type}</p>

                  {/* Date range */}
                  {s.commission_type === 'Special' && s.effectivity_start && (
                    <p className="text-[9px] text-[#8E8E93] mt-1 leading-tight">
                      {s.effectivity_start}<br />{s.effectivity_end}
                    </p>
                  )}

                  {/* Tranche count */}
                  <p className="text-[11px] font-semibold text-[#C03D25] mt-2">
                    {s.tranches.length} tranche{s.tranches.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Sheet ────────────────────────────────────────────────── */}
      {sheet && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(0,0,0,0.4)',
              opacity: sheetVisible ? 1 : 0,
              transition: 'opacity 300ms ease',
            }}
            onClick={closeSheet}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[94vh] flex flex-col"
            style={{
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 350ms cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] shrink-0">
              <div>
                <p className="text-base font-bold text-[#1C1C1E]">
                  {sheet === 'edit' ? 'Edit Scheme' : 'Add Scheme'}
                </p>
                {sheet === 'edit' && editScheme && (
                  <p className="text-xs text-[#8E8E93] font-mono mt-0.5">{editScheme.commission_id}</p>
                )}
              </div>
              <button type="button" onClick={closeSheet}
                className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center">
                <X size={14} className="text-[#8E8E93]" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* Copy From (Add only) */}
              {sheet === 'add' && (
                <div>
                  <div className="mb-2">
                    <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide">Copy From</label>
                  </div>

                  {/* Trigger */}
                  <div className="relative">
                    <button type="button" onClick={() => setShowCopyList(v => !v)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                      style={{ background: '#F2F2F7', border: '1px solid rgba(0,0,0,0.08)' }}>
                      <Copy size={14} className="text-[#8E8E93] shrink-0" />
                      <span className={`flex-1 text-left truncate text-sm ${copyFromId ? 'text-[#1C1C1E] font-medium' : 'text-[#C7C7CC]'}`}>
                        {copyFromId
                          ? (() => { const s = schemes.find(x => x.commission_id === copyFromId); return s ? `${s.commission_id} · ${s.position_rank} · ${s.product_type === 'Residential Unit' ? 'Residential' : s.product_type} · ${s.commission_type}` : copyFromId; })()
                          : 'Select a scheme to copy tranches…'
                        }
                      </span>
                      {copyFromId ? (
                        <span role="button" onClick={e => { e.stopPropagation(); setCopyFromId(''); setCopyFromQuery(''); setForm(f => ({ ...f, tranches: EMPTY_FORM().tranches })); }}
                          className="text-[#8E8E93] active:opacity-60 shrink-0">
                          <X size={14} />
                        </span>
                      ) : (
                        <ChevronDown size={14} className="text-[#8E8E93] shrink-0"
                          style={{ transform: showCopyList ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 220ms ease' }} />
                      )}
                    </button>

                    {/* Backdrop */}
                    {showCopyList && (
                      <div className="fixed inset-0 z-40" onClick={() => { setShowCopyList(false); setCopyFromQuery(''); }} />
                    )}

                    {/* Dropdown panel */}
                    {showCopyList && (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-white rounded-2xl border border-black/[0.08] overflow-hidden"
                        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                        {/* Search input */}
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.06]">
                          <Search size={13} className="text-[#8E8E93] shrink-0" />
                          <input
                            autoFocus
                            type="text"
                            value={copyFromQuery}
                            onChange={e => setCopyFromQuery(e.target.value)}
                            placeholder="Search by project, position, type…"
                            className="flex-1 text-sm text-[#1C1C1E] bg-transparent outline-none placeholder:text-[#C7C7CC]"
                          />
                          {copyFromQuery && (
                            <button type="button" onClick={() => setCopyFromQuery('')}>
                              <X size={12} className="text-[#8E8E93]" />
                            </button>
                          )}
                        </div>
                        {/* Options */}
                        <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                          {(() => {
                            const q = copyFromQuery.trim().toLowerCase();
                            const filtered = q
                              ? schemes.filter(s =>
                                  s.commission_id.toLowerCase().includes(q) ||
                                  s.project.toLowerCase().includes(q) ||
                                  s.position_rank.toLowerCase().includes(q) ||
                                  s.product_type.toLowerCase().includes(q) ||
                                  s.seller_type.toLowerCase().includes(q) ||
                                  s.commission_type.toLowerCase().includes(q)
                                )
                              : schemes;
                            if (filtered.length === 0) return (
                              <p className="text-xs text-[#8E8E93] text-center py-4">No matches</p>
                            );
                            return filtered.map(s => (
                              <button key={s.commission_id} type="button"
                                onClick={() => applyCopyFrom(s.commission_id)}
                                className="w-full flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] last:border-0 text-left active:bg-[#F2F2F7]"
                                style={{ background: copyFromId === s.commission_id ? 'rgba(192,61,37,0.05)' : undefined }}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <p className="text-[9px] font-bold text-[#8E8E93] font-mono">{s.commission_id}</p>
                                    {s.commission_type === 'Special' && (
                                      <span className="text-[8px] font-bold px-1.5 py-px rounded-full" style={{ background: 'rgba(255,149,0,0.12)', color: '#FF9500' }}>Special</span>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium text-[#1C1C1E] truncate">{s.project}</p>
                                  <p className="text-[10px] text-[#6C6C70]">{s.position_rank} · {s.product_type === 'Residential Unit' ? 'Residential' : s.product_type} · {s.seller_type}</p>
                                  <p className="text-[10px] text-[#8E8E93]">{s.tranches.length} tranche{s.tranches.length !== 1 ? 's' : ''}</p>
                                </div>
                                {copyFromId === s.commission_id && (
                                  <Check size={14} className="text-[#C03D25] shrink-0" />
                                )}
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Identity fields: read-only in edit mode, interactive in add mode */}
              {sheet === 'edit' ? (
                <div className="bg-[#F2F2F7] rounded-2xl px-4 py-3.5 space-y-3">
                  <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide">Scheme Identity</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-[#8E8E93] mb-0.5">Type</p>
                      <p className="text-sm font-semibold text-[#1C1C1E]">{form.commission_type}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#8E8E93] mb-0.5">Position</p>
                      <p className="text-sm font-semibold text-[#1C1C1E]">{form.position_rank}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#8E8E93] mb-0.5">Product</p>
                      <p className="text-sm font-semibold text-[#1C1C1E]">{form.product_type}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#8E8E93] mb-0.5">Seller</p>
                      <p className="text-sm font-semibold text-[#1C1C1E]">{form.seller_type}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#8E8E93] mb-0.5">Project</p>
                    <p className="text-sm font-semibold text-[#1C1C1E]">{form.project}</p>
                  </div>
                  {form.commission_type === 'Special' && form.effectivity_start && (
                    <div>
                      <p className="text-[10px] text-[#8E8E93] mb-0.5">Dates</p>
                      <p className="text-sm font-semibold text-[#1C1C1E]">{form.effectivity_start} → {form.effectivity_end}</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Commission Type */}
                  <div>
                    <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Type *</label>
                    <div className="flex gap-2">
                      {COMM_TYPES.map(ct => (
                        <button key={ct} type="button"
                          onClick={() => setForm(f => ({ ...f, commission_type: ct, effectivity_start: '', effectivity_end: '' }))}
                          className="flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-colors"
                          style={form.commission_type === ct
                            ? { background: '#C03D25', borderColor: '#C03D25', color: 'white' }
                            : { background: '#F2F2F7', borderColor: 'transparent', color: '#1C1C1E' }}>
                          {ct}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Project */}
                  <div>
                    <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Project *</label>
                    <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                      {projectList.map(p => (
                        <button key={p} type="button"
                          onClick={() => setForm(f => ({ ...f, project: p }))}
                          className="w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.05] last:border-0 text-sm transition-colors"
                          style={form.project === p ? { background: 'rgba(192,61,37,0.08)', color: '#C03D25', fontWeight: 600 } : { color: '#1C1C1E' }}>
                          {p}
                        </button>
                      ))}
                    </div>
                    {formErrors.project && <p className="text-red-400 text-[11px] mt-1">{formErrors.project}</p>}
                  </div>

                  {/* Position + Product */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Position *</label>
                      <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                        {POSITION_RANKS.map(p => (
                          <button key={p} type="button"
                            onClick={() => setForm(f => ({ ...f, position_rank: p }))}
                            className="w-full px-3 py-2.5 border-b border-black/[0.05] last:border-0 text-sm text-center transition-colors"
                            style={form.position_rank === p ? { background: 'rgba(192,61,37,0.08)', color: '#C03D25', fontWeight: 600 } : { color: '#1C1C1E' }}>
                            {p}
                          </button>
                        ))}
                      </div>
                      {formErrors.position && <p className="text-red-400 text-[11px] mt-1">{formErrors.position}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Product *</label>
                      <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                        {PRODUCT_TYPES.map(p => (
                          <button key={p} type="button"
                            onClick={() => setForm(f => ({ ...f, product_type: p }))}
                            className="w-full px-3 py-2.5 border-b border-black/[0.05] last:border-0 text-xs text-center transition-colors"
                            style={form.product_type === p ? { background: 'rgba(192,61,37,0.08)', color: '#C03D25', fontWeight: 600 } : { color: '#1C1C1E' }}>
                            {p}
                          </button>
                        ))}
                      </div>
                      {formErrors.product && <p className="text-red-400 text-[11px] mt-1">{formErrors.product}</p>}
                    </div>
                  </div>

                  {/* Seller Type */}
                  <div>
                    <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Seller Type *</label>
                    <div className="flex gap-2">
                      {SELLER_TYPES.map(s => (
                        <button key={s} type="button"
                          onClick={() => setForm(f => ({ ...f, seller_type: s }))}
                          className="flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-colors"
                          style={form.seller_type === s
                            ? { background: '#C03D25', borderColor: '#C03D25', color: 'white' }
                            : { background: '#F2F2F7', borderColor: 'transparent', color: '#1C1C1E' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                    {formErrors.seller && <p className="text-red-400 text-[11px] mt-1">{formErrors.seller}</p>}
                  </div>

                  {/* Dates (Special only) */}
                  {form.commission_type === 'Special' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Start *</label>
                        <input type="date" value={form.effectivity_start}
                          onChange={e => setForm(f => ({ ...f, effectivity_start: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-2xl bg-[#F2F2F7] text-sm outline-none border-2 border-transparent focus:border-[#C03D25]" />
                        {formErrors.start && <p className="text-red-400 text-[11px] mt-1">{formErrors.start}</p>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">End *</label>
                        <input type="date" value={form.effectivity_end}
                          onChange={e => setForm(f => ({ ...f, effectivity_end: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-2xl bg-[#F2F2F7] text-sm outline-none border-2 border-transparent focus:border-[#C03D25]" />
                        {formErrors.end && <p className="text-red-400 text-[11px] mt-1">{formErrors.end}</p>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Tranches */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide">Tranches *</label>
                  <button type="button" onClick={addTranche}
                    className="flex items-center gap-1 text-xs font-semibold text-[#C03D25] active:opacity-70">
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-1.5 px-1 mb-2">
                  {['#', '% Coll.', 'Release %', 'Comm. %', ''].map((h, i) => (
                    <p key={i} className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-center">{h}</p>
                  ))}
                </div>

                <div className="space-y-1.5">
                  {form.tranches.map((t, i) => (
                    <div key={i} className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-1.5 items-center">
                      <div className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-[#1C1C1E]">{i + 1}</span>
                      </div>
                      {(['percentage_collection', 'commission_release_rate', 'commission_rate'] as const).map(field => (
                        <div key={field} className="relative">
                          <input
                            type="number"
                            value={t[field]}
                            onChange={e => setTranche(i, field, e.target.value)}
                            placeholder="0"
                            className={`w-full pl-2 pr-5 py-2 rounded-xl bg-[#F2F2F7] text-sm text-center outline-none border-2 ${
                              formErrors[`${field === 'percentage_collection' ? 'col' : field === 'commission_release_rate' ? 'rel' : 'rate'}${i}`]
                                ? 'border-red-300' : 'border-transparent focus:border-[#C03D25]'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8E8E93] pointer-events-none">%</span>
                        </div>
                      ))}
                      <button type="button" onClick={() => removeTranche(i)} disabled={form.tranches.length === 1}
                        className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center active:opacity-70 disabled:opacity-30">
                        <X size={11} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {formErrors._save && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{formErrors._save}</p>
                </div>
              )}

              {/* Conflict warning (Add mode only) */}
              {addConflict && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-800">Scheme already exists</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        <span className="font-mono font-bold">{addConflict.commission_id}</span> is already active for this configuration. Adding is unavailable — use Edit to update the existing rates.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { closeSheet(); setTimeout(() => openEdit(addConflict), 360); }}
                    className="w-full py-2.5 rounded-xl bg-amber-100 text-xs font-bold text-amber-800 active:opacity-70"
                  >
                    Edit {addConflict.commission_id} instead
                  </button>
                </div>
              )}

              <button type="button" onClick={handleSave} disabled={saving || !!addConflict}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : (sheet === 'edit' ? 'Save Changes' : 'Add Scheme')}
              </button>

              {sheet === 'edit' && editScheme && (
                <p className="text-[11px] text-[#8E8E93] text-center -mt-2">
                  Changes to {editScheme.commission_id} will be saved to history
                </p>
              )}

              <div className="h-4" />
            </div>
          </div>
        </>
      )}

    </PageShell>
  );
}
