'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { supabase } from '@/lib/supabase';
import { fetchProjects } from '@/lib/inventory';
import { fetchAllBrokers, BrokerRecord } from '@/lib/broker';
import { getSession } from '@/lib/auth';
import {
  Plus, Trash2, Loader2, X, Search, Check, ChevronDown, AlertTriangle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverrideRow {
  id:              number;
  broker_id:       string;
  broker_name:     string | null;
  project:         string;
  product_type:    string;
  position_rank:   string;
  commission_rate: number;
  status:          string;
  created_at:      string;
  created_by:      string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POSITION_RANKS = ['PS', 'SM', 'SD', 'SDH', 'SH'];
const PRODUCT_TYPES  = ['Residential Unit', 'Parking'];

function EMPTY_FORM() {
  return {
    broker_id:       '',
    broker_name:     '',
    project:         '',
    product_type:    '',
    position_rank:   '',
    commission_rate: '',
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrokerOverridesPage() {
  const router = useRouter();

  const [overrides,    setOverrides]    = useState<OverrideRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [brokers,      setBrokers]      = useState<BrokerRecord[]>([]);
  const [projectList,  setProjectList]  = useState<string[]>([]);
  const [currentUser,  setCurrentUser]  = useState('');

  // Filters
  const [fltBroker,   setFltBroker]   = useState('');
  const [fltProject,  setFltProject]  = useState('');
  const [fltProduct,  setFltProduct]  = useState('');
  const [fltPosition, setFltPosition] = useState('');

  // Sheet
  const [sheet,       setSheet]       = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM());
  const [formErrors,  setFormErrors]  = useState<Record<string, string>>({});

  // Broker picker inside sheet
  const [brokerQuery,    setBrokerQuery]    = useState('');
  const [brokerPickOpen, setBrokerPickOpen] = useState(false);

  // Deactivate
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [deleting,   setDeleting]   = useState<number | null>(null);

  // Sheet animation
  useEffect(() => {
    if (sheet) requestAnimationFrame(() => setSheetVisible(true));
  }, [sheet]);

  // Scroll lock
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

  useEffect(() => {
    loadOverrides();
    fetchProjects().then(setProjectList).catch(console.error);
    fetchAllBrokers().then(setBrokers).catch(console.error);
    getSession().then(s => setCurrentUser(s?.full_name || s?.display_name || s?.email || ''));
  }, []);

  async function loadOverrides() {
    setLoading(true); setError('');
    try {
      const { data, error: err } = await supabase
        .from('broker_commission_overrides')
        .select('*')
        .eq('status', 'Active')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setOverrides((data ?? []) as OverrideRow[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  const brokerOptions = useMemo(
    () => [...new Set(overrides.map(o => o.broker_name || o.broker_id))].sort(),
    [overrides],
  );
  const projectOptions = useMemo(
    () => [...new Set(overrides.map(o => o.project))].sort(),
    [overrides],
  );

  const filtered = useMemo(() => overrides.filter(o =>
    (!fltBroker   || (o.broker_name || o.broker_id) === fltBroker) &&
    (!fltProject  || o.project      === fltProject)  &&
    (!fltProduct  || o.product_type === fltProduct)  &&
    (!fltPosition || o.position_rank === fltPosition)
  ), [overrides, fltBroker, fltProject, fltProduct, fltPosition]);

  const activeFilters = [fltBroker, fltProject, fltProduct, fltPosition].filter(Boolean).length;

  // ── Conflict check ────────────────────────────────────────────────────────
  const conflict = useMemo(() => {
    if (!form.broker_id || !form.project || !form.product_type || !form.position_rank) return null;
    return overrides.find(o =>
      o.broker_id     === form.broker_id &&
      o.project       === form.project   &&
      o.product_type  === form.product_type &&
      o.position_rank === form.position_rank
    ) ?? null;
  }, [overrides, form.broker_id, form.project, form.product_type, form.position_rank]);

  // ── Sheet control ─────────────────────────────────────────────────────────
  function openSheet() {
    setForm(EMPTY_FORM()); setFormErrors({});
    setBrokerQuery(''); setBrokerPickOpen(false);
    setSheet(true);
  }

  function closeSheet() {
    setSheetVisible(false);
    setTimeout(() => {
      setSheet(false); setForm(EMPTY_FORM()); setFormErrors({});
      setBrokerQuery(''); setBrokerPickOpen(false);
    }, 320);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.broker_id)     e.broker   = 'Required';
    if (!form.project)       e.project  = 'Required';
    if (!form.product_type)  e.product  = 'Required';
    if (!form.position_rank) e.position = 'Required';
    if (!form.commission_rate || isNaN(Number(form.commission_rate)))
      e.rate = 'Enter a valid number';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validate() || conflict) return;
    setSaving(true);
    try {
      const { data: projRow } = await supabase
        .from('projects').select('project_id').eq('name', form.project).maybeSingle();
      const project_id = (projRow as any)?.project_id ?? null;

      const { error: e } = await supabase.from('broker_commission_overrides').insert({
        broker_id:       form.broker_id,
        broker_name:     form.broker_name || null,
        project:         form.project,
        project_id,
        product_type:    form.product_type,
        position_rank:   form.position_rank,
        commission_rate: Number(form.commission_rate),
        status:          'Active',
        created_by:      currentUser || null,
      });
      if (e) throw e;
      closeSheet();
      await loadOverrides();
    } catch (e: any) {
      setFormErrors(p => ({ ...p, _save: e.message }));
    } finally {
      setSaving(false);
    }
  }

  // ── Deactivate ────────────────────────────────────────────────────────────
  async function handleDeactivate(id: number) {
    setDeleting(id); setConfirmDel(null);
    try {
      const { error: e } = await supabase
        .from('broker_commission_overrides')
        .update({ status: 'Inactive' })
        .eq('id', id);
      if (e) throw e;
      await loadOverrides();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  // ── Filtered broker list for picker ──────────────────────────────────────
  const filteredBrokers = useMemo(() => {
    const q = brokerQuery.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter(b =>
      b.seller_name.toLowerCase().includes(q) ||
      (b.broker_id ?? '').toLowerCase().includes(q)
    );
  }, [brokers, brokerQuery]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <PageShell title="Broker Rate Overrides" backButton onBack={() => router.back()}>

      {/* Stats strip */}
      <div className="bg-white border border-black/[0.06] rounded-2xl shadow-sm flex overflow-hidden">
        {[
          { label: 'Active Overrides', count: overrides.length,                                        dot: '#C03D25' },
          { label: 'Residential',      count: overrides.filter(o => o.product_type !== 'Parking').length, dot: '#1C1C1E' },
          { label: 'Parking',          count: overrides.filter(o => o.product_type === 'Parking').length,  dot: '#8E8E93' },
        ].map(({ label, count, dot }, i) => (
          <div key={label}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5"
            style={i < 2 ? { borderRight: '1px solid rgba(0,0,0,0.06)' } : undefined}>
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
            <button type="button"
              onClick={() => { setFltBroker(''); setFltProject(''); setFltProduct(''); setFltPosition(''); }}
              className="flex items-center gap-1 text-xs font-semibold text-[#C03D25] active:opacity-70">
              <X size={11} /> Clear {activeFilters}
            </button>
          )}
        </div>
        <div className="px-3 py-3 space-y-2">
          <SearchableSelect value={fltBroker}   onChange={setFltBroker}   options={brokerOptions}  placeholder="All Brokers" />
          <SearchableSelect value={fltProject}  onChange={setFltProject}  options={projectOptions} placeholder="All Projects" />
          <div className="grid grid-cols-2 gap-2">
            <SearchableSelect value={fltProduct}  onChange={setFltProduct}  options={PRODUCT_TYPES}  placeholder="All Products" />
            <SearchableSelect value={fltPosition} onChange={setFltPosition} options={POSITION_RANKS} placeholder="All Positions" />
          </div>
        </div>
      </div>

      {activeFilters > 0 && (
        <p className="text-xs text-[#8E8E93] -mt-1 px-1">
          Showing {filtered.length} of {overrides.length} override{overrides.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Add button */}
      <button type="button" onClick={openSheet}
        className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(192,61,37,0.3)] active:opacity-80">
        <Plus size={16} /> Add Override
      </button>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="text-[#C03D25] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-black/[0.06] rounded-2xl shadow-sm py-10 text-center">
          <p className="text-sm text-[#8E8E93]">
            {overrides.length === 0 ? 'No broker overrides configured yet.' : 'No overrides match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(o => {
            const isConfirm  = confirmDel === o.id;
            const isDeleting = deleting   === o.id;
            return (
              <div key={o.id} className="bg-white border border-black/[0.06] rounded-2xl shadow-sm px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1C1C1E] truncate">{o.broker_name || o.broker_id}</p>
                    <p className="text-[10px] font-mono text-[#8E8E93] mt-0.5">{o.broker_id}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#1C1C1E]">{o.position_rank}</span>
                      <span className="text-[10px] text-[#6C6C70]">{o.product_type === 'Residential Unit' ? 'Residential' : o.product_type}</span>
                    </div>
                    <p className="text-xs text-[#6C6C70] mt-1.5 truncate">{o.project}</p>
                    {o.created_by && (
                      <p className="text-[10px] text-[#8E8E93] mt-1">Added by {o.created_by}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-[#C03D25]">{o.commission_rate}%</p>
                    <p className="text-[10px] text-[#8E8E93]">commission rate</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-black/[0.05] flex items-center gap-2">
                  {isConfirm ? (
                    <>
                      <button type="button" onClick={() => setConfirmDel(null)}
                        className="flex-1 py-2 rounded-xl bg-[#F2F2F7] text-sm font-semibold text-[#6C6C70]">
                        Cancel
                      </button>
                      <button type="button" onClick={() => handleDeactivate(o.id)} disabled={isDeleting}
                        className="flex-1 py-2 rounded-xl bg-red-500 text-sm font-semibold text-white flex items-center justify-center">
                        {isDeleting ? <Loader2 size={13} className="animate-spin" /> : 'Confirm Remove'}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmDel(o.id)} disabled={isDeleting}
                      className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center ml-auto">
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Sheet ─────────────────────────────────────────────────────────── */}
      {sheet && (
        <>
          <div className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)', opacity: sheetVisible ? 1 : 0, transition: 'opacity 300ms ease' }}
            onClick={closeSheet} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[94vh] flex flex-col"
            style={{ transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 350ms cubic-bezier(0.32,0.72,0,1)' }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] shrink-0">
              <p className="text-base font-bold text-[#1C1C1E]">Add Rate Override</p>
              <button type="button" onClick={closeSheet}
                className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center">
                <X size={14} className="text-[#8E8E93]" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* Broker picker */}
              <div>
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Broker *</label>
                <div className="relative">
                  <button type="button" onClick={() => setBrokerPickOpen(v => !v)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: '#F2F2F7', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <span className={`flex-1 text-left truncate ${form.broker_id ? 'text-[#1C1C1E] font-medium' : 'text-[#C7C7CC]'}`}>
                      {form.broker_id
                        ? `${form.broker_name || form.broker_id} (${form.broker_id})`
                        : 'Select broker…'
                      }
                    </span>
                    {form.broker_id ? (
                      <span role="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, broker_id: '', broker_name: '' })); setBrokerQuery(''); }}
                        className="text-[#8E8E93] shrink-0 active:opacity-60">
                        <X size={14} />
                      </span>
                    ) : (
                      <ChevronDown size={14} className="text-[#8E8E93] shrink-0"
                        style={{ transform: brokerPickOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 220ms ease' }} />
                    )}
                  </button>

                  {brokerPickOpen && (
                    <div className="fixed inset-0 z-40" onClick={() => { setBrokerPickOpen(false); setBrokerQuery(''); }} />
                  )}
                  {brokerPickOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-white rounded-2xl border border-black/[0.08] overflow-hidden"
                      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.06]">
                        <Search size={13} className="text-[#8E8E93] shrink-0" />
                        <input autoFocus type="text" value={brokerQuery}
                          onChange={e => setBrokerQuery(e.target.value)}
                          placeholder="Search by name or broker ID…"
                          className="flex-1 text-sm bg-transparent outline-none placeholder:text-[#C7C7CC]" />
                        {brokerQuery && (
                          <button type="button" onClick={() => setBrokerQuery('')}>
                            <X size={12} className="text-[#8E8E93]" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
                        {filteredBrokers.length === 0 ? (
                          <p className="text-xs text-[#8E8E93] text-center py-4">No matches</p>
                        ) : filteredBrokers.map(b => (
                          <button key={b.broker_id ?? b.seller_name} type="button"
                            onClick={() => {
                              setForm(f => ({ ...f, broker_id: b.broker_id ?? '', broker_name: b.seller_name }));
                              setBrokerPickOpen(false); setBrokerQuery('');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] last:border-0 text-left active:bg-[#F2F2F7]"
                            style={{ background: form.broker_id === b.broker_id ? 'rgba(192,61,37,0.05)' : undefined }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#1C1C1E] truncate">{b.seller_name}</p>
                              <p className="text-[10px] text-[#8E8E93]">{b.broker_id} · {b.position_rank ?? '—'}</p>
                            </div>
                            {form.broker_id === b.broker_id && <Check size={14} className="text-[#C03D25] shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {formErrors.broker && <p className="text-red-400 text-[11px] mt-1">{formErrors.broker}</p>}
              </div>

              {/* Project */}
              <div>
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Project *</label>
                <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden">
                  {projectList.map(p => (
                    <button key={p} type="button" onClick={() => setForm(f => ({ ...f, project: p }))}
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
                      <button key={p} type="button" onClick={() => setForm(f => ({ ...f, position_rank: p }))}
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
                      <button key={p} type="button" onClick={() => setForm(f => ({ ...f, product_type: p }))}
                        className="w-full px-3 py-2.5 border-b border-black/[0.05] last:border-0 text-xs text-center transition-colors"
                        style={form.product_type === p ? { background: 'rgba(192,61,37,0.08)', color: '#C03D25', fontWeight: 600 } : { color: '#1C1C1E' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {formErrors.product && <p className="text-red-400 text-[11px] mt-1">{formErrors.product}</p>}
                </div>
              </div>

              {/* Commission Rate */}
              <div>
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wide mb-2 block">Commission Rate (%) *</label>
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#F2F2F7] border-2 border-transparent focus-within:border-[#C03D25] transition-colors">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.commission_rate}
                    onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))}
                    placeholder="e.g. 3.5"
                    className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
                  />
                  <span className="text-sm font-bold text-[#8E8E93]">%</span>
                </div>
                {formErrors.rate && <p className="text-red-400 text-[11px] mt-1">{formErrors.rate}</p>}
              </div>

              {/* Conflict warning */}
              {conflict && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-800">Override already exists</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        This broker already has an active override for this project + product + position ({conflict.commission_rate}%). Remove it first before adding a new one.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {formErrors._save && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{formErrors._save}</p>
                </div>
              )}

              <button type="button" onClick={handleSave} disabled={saving || !!conflict}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Override'}
              </button>

            </div>
          </div>
        </>
      )}

    </PageShell>
  );
}
