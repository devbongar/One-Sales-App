'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { fetchProjects } from '@/lib/inventory';
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2, X, Calendar, AlertTriangle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranchingRow {
  id?:                     number;
  tranche:                 string;
  percentage_collection:   string;
  commission_release_rate: string;
  commission_rate:         string;
}

interface SpecialGroup {
  project:       string;
  position_rank: string;
  product_type:  string;
  seller_type:   string;
  start:         string;
  end:           string;
  rows:          TranchingRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITION_RANKS = ['PS', 'SM', 'SD', 'SDH', 'SH'];
const PRODUCT_TYPES  = ['Residential Unit', 'Parking'];
const SELLER_TYPES   = ['In-house', 'Broker'];

function statusBadge(start: string, end: string) {
  const today = new Date().toISOString().split('T')[0];
  if (today < start) return { label: 'Upcoming', cls: 'bg-blue-50 text-blue-700' };
  if (today > end)   return { label: 'Expired',  cls: 'bg-[#F2F2F7] text-[#8E8E93]' };
  return { label: 'Active', cls: 'bg-green-50 text-green-700' };
}

function groupKey(g: SpecialGroup) {
  return `${g.project}|${g.position_rank}|${g.product_type}|${g.seller_type}|${g.start}|${g.end}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommissionRatesPage() {
  const router = useRouter();
  const [groups,        setGroups]        = useState<SpecialGroup[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [showSheet,     setShowSheet]     = useState(false);
  const [projects,      setProjects]      = useState<string[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error,         setError]         = useState('');
  const [formErrors,    setFormErrors]    = useState<Record<string, string>>({});

  // Form state
  const [fProject,  setFProject]  = useState('');
  const [fPosition, setFPosition] = useState('');
  const [fProduct,  setFProduct]  = useState('');
  const [fSeller,   setFSeller]   = useState('');
  const [fStart,    setFStart]    = useState('');
  const [fEnd,      setFEnd]      = useState('');
  const [fTranches, setFTranches] = useState<TranchingRow[]>([
    { tranche: '1', percentage_collection: '', commission_release_rate: '', commission_rate: '' },
  ]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(console.error);
    loadGroups();
  }, []);

  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (!main) return;
    if (showSheet) {
      const scrollY = main.scrollTop;
      main.dataset.scrollY = String(scrollY);
      main.style.overflow = 'hidden';
      main.style.position = 'fixed';
      main.style.top = `-${scrollY}px`;
      main.style.width = '100%';
    } else {
      const scrollY = parseInt(main.dataset.scrollY ?? '0', 10);
      main.style.overflow = '';
      main.style.position = '';
      main.style.top = '';
      main.style.width = '';
      main.scrollTop = scrollY;
      delete main.dataset.scrollY;
    }
    return () => {
      main.style.overflow = '';
      main.style.position = '';
      main.style.top = '';
      main.style.width = '';
    };
  }, [showSheet]);

  async function loadGroups() {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('Commission_Tranching')
        .select('*')
        .eq('commission_type', 'Special')
        .order('effectivity_start', { ascending: false });
      if (err) throw err;

      const map: Record<string, SpecialGroup> = {};
      for (const row of (data ?? []) as any[]) {
        const key = `${row.Project}|${row['Position Rank']}|${row['Product Type']}|${row['Seller Type']}|${row.effectivity_start}|${row.effectivity_end}`;
        if (!map[key]) {
          map[key] = {
            project:       row.Project,
            position_rank: row['Position Rank'],
            product_type:  row['Product Type'],
            seller_type:   row['Seller Type'],
            start:         row.effectivity_start,
            end:           row.effectivity_end,
            rows:          [],
          };
        }
        map[key].rows.push({
          id:                     row.id,
          tranche:                String(row.Tranche),
          percentage_collection:  String(row['Percentage Collection']),
          commission_release_rate: String(row['Commission Release Rate']),
          commission_rate:        String(row['Commission Rate']),
        });
      }
      setGroups(Object.values(map));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function resetForm() {
    setFProject(''); setFPosition(''); setFProduct(''); setFSeller('');
    setFStart(''); setFEnd('');
    setFTranches([{ tranche: '1', percentage_collection: '', commission_release_rate: '', commission_rate: '' }]);
    setFormErrors({});
  }

  function addTranche() {
    setFTranches(prev => [
      ...prev,
      { tranche: String(prev.length + 1), percentage_collection: '', commission_release_rate: '', commission_rate: '' },
    ]);
  }

  function removeTranche(i: number) {
    setFTranches(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateTranche(i: number, field: keyof TranchingRow, val: string) {
    setFTranches(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!fProject)  e.project  = 'Required';
    if (!fPosition) e.position = 'Required';
    if (!fProduct)  e.product  = 'Required';
    if (!fSeller)   e.seller   = 'Required';
    if (!fStart)    e.start    = 'Required';
    if (!fEnd)      e.end      = 'Required';
    if (fStart && fEnd && fEnd <= fStart) e.end = 'End must be after start';
    fTranches.forEach((t, i) => {
      if (!t.percentage_collection)   e[`t_col_${i}`]  = 'Required';
      if (!t.commission_release_rate) e[`t_rel_${i}`]  = 'Required';
      if (!t.commission_rate)         e[`t_rate_${i}`] = 'Required';
    });
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const rows = fTranches.map((t, i) => ({
        'Project':                  fProject,
        'Position Rank':            fPosition,
        'Product Type':             fProduct,
        'Seller Type':              fSeller,
        'Tranche':                  t.tranche || String(i + 1),
        'Percentage Collection':    t.percentage_collection,
        'Commission Release Rate':  t.commission_release_rate,
        'Commission Rate':          t.commission_rate,
        'Status':                   'Active',
        commission_type:            'Special',
        effectivity_start:          fStart,
        effectivity_end:            fEnd,
      }));
      const { error: err } = await supabase.from('Commission_Tranching').insert(rows);
      if (err) throw err;
      setShowSheet(false);
      resetForm();
      await loadGroups();
    } catch (e: any) {
      setFormErrors(prev => ({ ...prev, _save: e.message }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: SpecialGroup) {
    const key = groupKey(g);
    setDeleting(key);
    setConfirmDelete(null);
    try {
      const { error: err } = await supabase
        .from('Commission_Tranching')
        .delete()
        .eq('Project', g.project)
        .eq('Position Rank', g.position_rank)
        .eq('Product Type', g.product_type)
        .eq('Seller Type', g.seller_type)
        .eq('commission_type', 'Special')
        .eq('effectivity_start', g.start)
        .eq('effectivity_end', g.end);
      if (err) throw err;
      await loadGroups();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <PageShell title="Special Commission Rates" backButton onBack={() => router.back()}>

      {/* Header card */}
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center shrink-0">
          <Calendar size={22} className="text-[#C03D25]" />
        </div>
        <div className="min-w-0">
          <p className="text-[#1C1C1E] font-semibold">Special Commission Rates</p>
          <p className="text-[#6C6C70] text-sm mt-0.5 leading-snug">Time-bound overrides applied over regular rates for specific projects and positions</p>
        </div>
      </GlassCard>

      {/* Add button */}
      <button
        type="button"
        onClick={() => { resetForm(); setShowSheet(true); }}
        className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(192,61,37,0.3)] active:opacity-80"
      >
        <Plus size={16} />
        Add Special Rate
      </button>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="text-[#C03D25] animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <GlassCard className="py-10 text-center">
          <p className="text-sm text-[#8E8E93]">No special commission rates configured yet.</p>
        </GlassCard>
      ) : (
        groups.map(g => {
          const key        = groupKey(g);
          const open       = expanded.has(key);
          const badge      = statusBadge(g.start, g.end);
          const isDeleting = deleting === key;
          const isConfirming = confirmDelete === key;
          return (
            <GlassCard key={key} className="overflow-hidden">
              {/* Header row */}
              <div className="px-4 py-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[#1C1C1E]">{g.project}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <p className="text-xs text-[#6C6C70] mt-0.5">{g.position_rank} · {g.product_type} · {g.seller_type}</p>
                  <p className="text-[11px] text-[#8E8E93] mt-0.5">{g.start} → {g.end}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isConfirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="px-2.5 py-1 rounded-full bg-[#F2F2F7] text-[11px] font-semibold text-[#6C6C70] active:opacity-70"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(g)}
                        disabled={isDeleting}
                        className="px-2.5 py-1 rounded-full bg-red-500 text-[11px] font-semibold text-white active:opacity-70"
                      >
                        {isDeleting ? <Loader2 size={11} className="animate-spin" /> : 'Delete'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(key)}
                      disabled={isDeleting}
                      className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center active:opacity-70"
                    >
                      {isDeleting
                        ? <Loader2 size={12} className="text-red-500 animate-spin" />
                        : <Trash2 size={12} className="text-red-500" />
                      }
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-70"
                  >
                    {open
                      ? <ChevronUp   size={14} className="text-[#6C6C70]" />
                      : <ChevronDown size={14} className="text-[#6C6C70]" />
                    }
                  </button>
                </div>
              </div>

              {/* Tranche rows */}
              {open && (
                <>
                  <div className="grid grid-cols-4 gap-1 px-4 py-2 bg-[#F2F2F7] border-t border-black/[0.06]">
                    {['Tr.', '% Coll.', 'Release %', 'Commission %'].map(h => (
                      <p key={h} className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">{h}</p>
                    ))}
                  </div>
                  {[...g.rows].sort((a, b) => Number(a.tranche) - Number(b.tranche)).map((t, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-4 gap-1 px-4 py-2.5 border-t border-black/[0.04] items-center"
                      style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white' }}
                    >
                      <div className="w-6 h-6 rounded-full bg-[#F2F2F7] flex items-center justify-center">
                        <span className="text-[10px] font-bold text-[#1C1C1E]">{t.tranche}</span>
                      </div>
                      <p className="text-xs text-[#6C6C70]">{t.percentage_collection}%</p>
                      <p className="text-xs text-[#6C6C70]">{t.commission_release_rate}%</p>
                      <p className="text-xs font-bold text-[#C03D25]">{t.commission_rate}%</p>
                    </div>
                  ))}
                </>
              )}
            </GlassCard>
          );
        })
      )}

      {/* ── Add Sheet ── */}
      {showSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => { setShowSheet(false); resetForm(); }} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] shrink-0">
              <p className="text-base font-bold text-[#1C1C1E]">Add Special Rate</p>
              <button type="button" onClick={() => { setShowSheet(false); resetForm(); }}
                className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
                <X size={14} className="text-[#8E8E93]" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Project */}
              <div>
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">Project *</label>
                <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                  {projects.map(p => (
                    <button key={p} type="button"
                      onClick={() => setFProject(p)}
                      className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.05] last:border-0 text-sm transition-colors ${fProject === p ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {formErrors.project && <p className="text-red-400 text-[11px] mt-1">{formErrors.project}</p>}
              </div>

              {/* Position Rank + Product Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">Position *</label>
                  <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                    {POSITION_RANKS.map(p => (
                      <button key={p} type="button"
                        onClick={() => setFPosition(p)}
                        className={`w-full px-3 py-2.5 border-b border-black/[0.05] last:border-0 text-sm text-center transition-colors ${fPosition === p ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}
                      >{p}</button>
                    ))}
                  </div>
                  {formErrors.position && <p className="text-red-400 text-[11px] mt-1">{formErrors.position}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">Product Type *</label>
                  <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                    {PRODUCT_TYPES.map(p => (
                      <button key={p} type="button"
                        onClick={() => setFProduct(p)}
                        className={`w-full px-3 py-2.5 border-b border-black/[0.05] last:border-0 text-xs text-center transition-colors ${fProduct === p ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}
                      >{p}</button>
                    ))}
                  </div>
                  {formErrors.product && <p className="text-red-400 text-[11px] mt-1">{formErrors.product}</p>}
                </div>
              </div>

              {/* Seller Type */}
              <div>
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">Seller Type *</label>
                <div className="flex gap-2">
                  {SELLER_TYPES.map(s => (
                    <button key={s} type="button"
                      onClick={() => setFSeller(s)}
                      className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-colors ${fSeller === s ? 'bg-[#C03D25] border-[#C03D25] text-white' : 'bg-[#F2F2F7] border-transparent text-[#1C1C1E]'}`}
                    >{s}</button>
                  ))}
                </div>
                {formErrors.seller && <p className="text-red-400 text-[11px] mt-1">{formErrors.seller}</p>}
              </div>

              {/* Effectivity Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">Start Date *</label>
                  <input type="date" value={fStart} onChange={e => setFStart(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none border-2 border-transparent focus:border-[#C03D25]" />
                  {formErrors.start && <p className="text-red-400 text-[11px] mt-1">{formErrors.start}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">End Date *</label>
                  <input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none border-2 border-transparent focus:border-[#C03D25]" />
                  {formErrors.end && <p className="text-red-400 text-[11px] mt-1">{formErrors.end}</p>}
                </div>
              </div>

              {/* Tranche rows */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide">Tranche Schedule *</label>
                  <button type="button" onClick={addTranche}
                    className="flex items-center gap-1 text-xs font-semibold text-[#C03D25] active:opacity-70">
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-1.5 px-2 mb-1">
                  {['Tr.', '% Coll.', 'Release %', 'Comm. %', ''].map((h, i) => (
                    <p key={i} className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-center">{h}</p>
                  ))}
                </div>

                <div className="space-y-1.5">
                  {fTranches.map((t, i) => (
                    <div key={i} className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-1.5 items-center">
                      <div className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-[#1C1C1E]">{i + 1}</span>
                      </div>
                      {(['percentage_collection', 'commission_release_rate', 'commission_rate'] as const).map(field => (
                        <div key={field} className="relative">
                          <input
                            type="number"
                            value={t[field]}
                            onChange={e => updateTranche(i, field, e.target.value)}
                            placeholder="0"
                            className={`w-full pl-2 pr-5 py-2 rounded-xl bg-[#F2F2F7] text-sm text-center outline-none border-2 ${
                              formErrors[`t_${field === 'percentage_collection' ? 'col' : field === 'commission_release_rate' ? 'rel' : 'rate'}_${i}`]
                                ? 'border-red-300' : 'border-transparent focus:border-[#C03D25]'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8E8E93] pointer-events-none">%</span>
                        </div>
                      ))}
                      <button type="button" onClick={() => removeTranche(i)} disabled={fTranches.length === 1}
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

              {/* Save button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Special Rate'}
              </button>

              <div className="h-4" />
            </div>
          </div>
        </>
      )}

    </PageShell>
  );
}
