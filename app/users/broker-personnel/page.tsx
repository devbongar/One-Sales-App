'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchInput from '@/components/ui/SearchInput';
import {
  Loader2, Users, Plus, ChevronLeft, Check, X, Briefcase, Mail, Calendar,
  Tag, User, ChevronDown, SlidersHorizontal, KeyRound, UserCheck, UserX,
} from 'lucide-react';
import { fetchAllSalespersons, fetchAccessRoles, SalespersonRecord, AccessRole } from '@/lib/salesperson';
import { fetchProjects } from '@/lib/inventory';
import { supabase } from '@/lib/supabase';
import SavingOverlay from '@/components/ui/SavingOverlay';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BrokerPersonnelRecord {
  id?:                    number;
  personnel_id:           string | null;
  full_name:              string;
  first_name:             string | null;
  middle_name:            string | null;
  last_name:              string | null;
  position_code:          string | null;
  position_rank:          string | null;
  personnel_status:       string | null;
  email_address:          string | null;
  joined_date:            string | null;
  focus_project:          string | null;
  bno_name:               string | null;
  sales_director:         string | null;
  sales_director_id:      string | null;
  sales_division_head:    string | null;
  sales_division_head_id: string | null;
  sales_head:             string | null;
  sales_head_id:          string | null;
  app_role_id:            number | null;
}

const EMPTY_RECORD: BrokerPersonnelRecord = {
  personnel_id: null, full_name: '', first_name: null, middle_name: null,
  last_name: null, position_code: null, position_rank: null,
  personnel_status: null, email_address: null, joined_date: null,
  focus_project: null, bno_name: null, sales_director: null,
  sales_director_id: null, sales_division_head: null, sales_division_head_id: null,
  sales_head: null, sales_head_id: null, app_role_id: null,
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const POSITION_CODE_OPTIONS = ['Broker Network Associate', 'Broker Network Officer'];
const POSITION_RANK_MAP: Record<string, string> = {
  'Broker Network Associate': 'BNA',
  'Broker Network Officer':   'BNO',
};
const PERSONNEL_STATUS_OPTIONS = ['Active', 'Inactive'];
const PAGE_GRADIENT = 'linear-gradient(to bottom, #FFFFFF 0%, #8E8E93 50%, #3A3A3C 100%)';

const POSITION_RANK_BADGE_STYLE: Record<string, React.CSSProperties> = {
  BNA: { background: 'rgba(88,86,214,0.12)',  color: '#3634A3' },
  BNO: { background: 'rgba(255,149,0,0.12)', color: '#A05A00' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | null) { return val?.trim() ? val : '—'; }

function fmtDate(val: string | null) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function nameInitials(name: string) {
  return name.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

async function fetchProfileEmails(): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('email');
  return (data ?? []).map((p: any) => (p.email as string | null)?.toLowerCase()).filter(Boolean) as string[];
}

async function fetchAllBrokerPersonnel(): Promise<BrokerPersonnelRecord[]> {
  const PAGE = 1000;
  const rows: BrokerPersonnelRecord[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('broker_personnel')
      .select('*')
      .range(from, from + PAGE - 1)
      .order('full_name');
    if (error) throw error;
    rows.push(...((data ?? []) as BrokerPersonnelRecord[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function generatePersonnelId(existing: BrokerPersonnelRecord[]): string {
  const nums = existing
    .map(p => p.personnel_id)
    .filter(id => id && /^BKP-\d{6}$/.test(id))
    .map(id => parseInt(id!.replace('BKP-', ''), 10));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `BKP-${String(max + 1).padStart(6, '0')}`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white/90 transition-colors placeholder:text-[#C7C7CC]';
const readCls  = 'w-full px-3 py-2.5 rounded-xl bg-white/60 text-sm text-[#1C1C1E]';

function PositionBadge({ rank }: { rank: string | null }) {
  if (!rank) return null;
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={POSITION_RANK_BADGE_STYLE[rank] ?? { background: 'rgba(142,142,147,0.12)', color: '#6C6C70' }}>
      {rank}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-4 space-y-4"
      style={{
        background: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 2px 16px rgba(0, 0, 0, 0.08)',
      }}>
      <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function ERow({ label, icon, required, children }: { label: string; icon?: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-[#6C6C70] uppercase tracking-wider flex items-center gap-1">
        {icon}{label}{required && <span style={{ color: '#C03D25' }}>*</span>}
      </p>
      {children}
    </div>
  );
}

function ESelect({ value, options, onChange, disabled }: {
  value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (disabled) return <div className={readCls}>{value || '—'}</div>;
  return (
    <div>
      <div className="relative">
        <button type="button" onClick={() => setOpen(p => !p)}
          className={`${inputCls} w-full flex items-center justify-between ${value ? 'pr-8' : ''} ${open ? '!rounded-b-none' : ''}`}>
          <span className={value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}>{value || 'Select…'}</span>
          {!value && <ChevronDown size={12} className={`text-[#8E8E93] transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} />}
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/[0.06] active:bg-black/[0.10]">
            <X size={12} className="text-[#8E8E93]" />
          </button>
        )}
      </div>
      {open && (
        <div className="border border-t-0 border-black/[0.10] rounded-b-xl overflow-hidden bg-white/80">
          <div className="overflow-y-auto max-h-48">
            {options.length === 0
              ? <p className="text-xs text-[#8E8E93] text-center py-3">No options</p>
              : options.map(o => (
                <button key={o} type="button"
                  onClick={() => { onChange(o === value ? '' : o); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-black/[0.04]"
                  style={{
                    background: o === value ? 'rgba(192,61,37,0.06)' : undefined,
                    color:      o === value ? '#C03D25' : '#1C1C1E',
                    fontWeight: o === value ? 600 : 400,
                  }}>
                  {o}
                  {o === value && <Check size={12} className="shrink-0" style={{ color: '#C03D25' }} />}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

function EMultiSelect({ value, options, onChange, disabled }: {
  value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.split(' | ').map(s => s.trim()).filter(Boolean) : [];
  function toggle(o: string) {
    const next = selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o];
    onChange(next.join(' | '));
  }
  if (disabled) return <div className={readCls}>{value || '—'}</div>;
  return (
    <div>
      <div role="button" tabIndex={0}
        onClick={() => setOpen(p => !p)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(p => !p); }}
        className={`${inputCls} w-full flex items-start justify-between gap-2 min-h-[34px] cursor-pointer ${open ? '!rounded-b-none' : ''}`}>
        {selected.length === 0
          ? <span className="text-[#C7C7CC] mt-0.5">Select…</span>
          : <div className="flex flex-wrap gap-1">
              {selected.map(s => (
                <span key={s} className="inline-flex items-center gap-1 bg-[rgba(192,61,37,0.10)] text-[#C03D25] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  {s}
                  <button type="button" onClick={e => { e.stopPropagation(); toggle(s); }}><X size={10} /></button>
                </span>
              ))}
            </div>
        }
        <ChevronDown size={12} className={`text-[#8E8E93] shrink-0 mt-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="border border-t-0 border-black/[0.10] rounded-b-xl overflow-hidden bg-white/80">
          <div className="overflow-y-auto max-h-40">
            {options.map(o => {
              const isSel = selected.includes(o);
              return (
                <button key={o} type="button" onClick={() => toggle(o)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-black/[0.04]"
                  style={{ background: isSel ? 'rgba(192,61,37,0.06)' : undefined, color: isSel ? '#C03D25' : '#1C1C1E', fontWeight: isSel ? 600 : 400 }}>
                  {o}
                  {isSel && <Check size={12} className="shrink-0" style={{ color: '#C03D25' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Sheet ──────────────────────────────────────────────────────────────

function DetailSheet({ record, hasAccount, onClose, onSaved }: {
  record:      BrokerPersonnelRecord;
  hasAccount:  boolean;
  onClose:     () => void;
  onSaved:     (updated: BrokerPersonnelRecord) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [form,     setForm]     = useState<BrokerPersonnelRecord>(record);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [resending,   setResending]   = useState(false);
  const [resendDone,  setResendDone]  = useState(false);
  const [resendError, setResendError] = useState('');

  const [allPeople,   setAllPeople]   = useState<SalespersonRecord[]>([]);
  const [bnoList,     setBnoList]     = useState<BrokerPersonnelRecord[]>([]);
  const [projects,    setProjects]    = useState<string[]>([]);
  const [roles,       setRoles]       = useState<AccessRole[]>([]);
  const [sdOptions,   setSdOptions]   = useState<string[]>([]);
  const [sdhOptions,  setSdhOptions]  = useState<string[]>([]);
  const [shOptions,   setShOptions]   = useState<string[]>([]);
  const [bnoOptions,  setBnoOptions]  = useState<string[]>([]);
  const [cascadeSource, setCascadeSource] = useState<null | 'bno' | 'sd'>(() =>
    record.bno_name ? 'bno' : record.sales_director ? 'sd' : null
  );

  useEffect(() => {
    Promise.all([
      fetchProjects(),
      fetchAccessRoles(),
      fetchAllSalespersons(),
      fetchAllBrokerPersonnel(),
    ]).then(([proj, r, people, bno]) => {
      setProjects(proj);
      setRoles(r);
      setAllPeople(people);
      setSdOptions( people.filter(p => p.position_rank === 'SD' ).map(p => p.seller_name));
      setSdhOptions(people.filter(p => p.position_rank === 'SDH').map(p => p.seller_name));
      setShOptions( people.filter(p => p.position_rank === 'SH' ).map(p => p.seller_name));
      const bnos = bno.filter(p => p.position_rank === 'BNO' && p.full_name !== record.full_name);
      setBnoList(bnos);
      setBnoOptions(bnos.map(p => p.full_name));
    }).catch(() => {});
  }, [record.full_name]);

  const set = (key: keyof BrokerPersonnelRecord) => (val: string) =>
    setForm(f => ({ ...f, [key]: val || null }));

  function setNameField(key: 'first_name' | 'middle_name' | 'last_name', val: string) {
    setForm(f => {
      const updated = { ...f, [key]: val || null };
      const composed = [updated.first_name, updated.middle_name, updated.last_name].filter(Boolean).join(' ');
      return { ...updated, full_name: composed };
    });
  }

  function onBnoChange(name: string) {
    const rec = name ? bnoList.find(p => p.full_name === name) : null;
    setForm(f => ({
      ...f,
      bno_name:               name || null,
      sales_director:         rec?.sales_director         ?? null,
      sales_director_id:      rec?.sales_director_id      ?? null,
      sales_division_head:    rec?.sales_division_head    ?? null,
      sales_division_head_id: rec?.sales_division_head_id ?? null,
      sales_head:             rec?.sales_head             ?? null,
      sales_head_id:          rec?.sales_head_id          ?? null,
    }));
    setCascadeSource(name ? 'bno' : null);
  }

  function onSdChange(name: string) {
    const rec = name ? allPeople.find(p => p.seller_name === name && p.position_rank === 'SD') : null;
    setForm(f => ({
      ...f,
      sales_director:         name || null,
      sales_director_id:      rec?.seller_id              ?? null,
      sales_division_head:    rec?.sales_division_head    ?? null,
      sales_division_head_id: rec?.sales_division_head_id ?? null,
      sales_head:             rec?.sales_head             ?? null,
      sales_head_id:          rec?.sales_head_id          ?? null,
    }));
    setCascadeSource(name ? 'sd' : null);
  }

  function cancelEdit() {
    setForm(record);
    setEditMode(false);
    setError('');
    setCascadeSource(record.bno_name ? 'bno' : record.sales_director ? 'sd' : null);
  }

  async function handleSave() {
    const missing: string[] = [];
    if (!form.first_name?.trim() && !form.last_name?.trim()) missing.push('First & Last Name');
    if (!form.email_address?.trim())  missing.push('Email Address');
    if (!form.joined_date)            missing.push('Joined Date');
    if (!form.personnel_status)       missing.push('Status');
    if (!form.position_code)          missing.push('Position');
    if (missing.length > 0) { setError(`Required: ${missing.join(', ')}`); return; }
    setSaving(true);
    setError('');
    const saveStart = Date.now();
    try {
      if (form.email_address?.trim()) {
        const { data: dup } = await supabase
          .from('broker_personnel')
          .select('full_name')
          .ilike('email_address', form.email_address.trim())
          .neq('id', record.id!)
          .limit(1);
        if (dup && dup.length > 0) {
          setError(`Email is already used by ${(dup[0] as any).full_name}.`);
          return;
        }
      }
      const { error: updErr } = await supabase
        .from('broker_personnel')
        .update({
          full_name:              form.full_name,
          first_name:             form.first_name,
          middle_name:            form.middle_name,
          last_name:              form.last_name,
          position_code:          form.position_code,
          position_rank:          form.position_rank,
          personnel_status:       form.personnel_status,
          email_address:          form.email_address,
          joined_date:            form.joined_date,
          focus_project:          form.focus_project,
          bno_name:               form.position_rank === 'BNA' ? form.bno_name : null,
          sales_director:         form.sales_director,
          sales_director_id:      form.sales_director_id,
          sales_division_head:    form.sales_division_head,
          sales_division_head_id: form.sales_division_head_id,
          sales_head:             form.sales_head,
          sales_head_id:          form.sales_head_id,
          app_role_id:            form.app_role_id,
        })
        .eq('id', record.id!);
      if (updErr) throw updErr;
      onSaved(form);
      setEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      const elapsed = Date.now() - saveStart;
      if (elapsed < 2800) await new Promise(r => setTimeout(r, 2800 - elapsed));
      setSaving(false);
    }
  }

  async function handleResend() {
    if (!record.email_address) return;
    setResending(true); setResendDone(false); setResendError('');
    try {
      const res = await fetch('/api/admin/users/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:      record.email_address,
          full_name:  record.full_name,
          redirectTo: '/seller-onboarding',
        }),
      });
      const d = await res.json();
      if (!res.ok) { setResendError(d.error ?? 'Failed to send invitation'); return; }
      setResendDone(true);
      setTimeout(() => setResendDone(false), 4000);
    } catch (e: any) {
      setResendError(e.message ?? 'Server error');
    } finally {
      setResending(false);
    }
  }

  const ini = nameInitials(form.full_name);

  return (
    <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <SavingOverlay visible={saving} />

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
        <button type="button" onClick={editMode ? cancelEdit : onClose}
          className="w-9 h-9 rounded-full bg-black/10 backdrop-blur-sm border border-black/10 flex items-center justify-center active:opacity-60">
          {editMode ? <X size={18} className="text-[#1C1C1E]" /> : <ChevronLeft size={18} className="text-[#1C1C1E]" />}
        </button>
        {editMode ? (
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 h-9 rounded-full bg-[#1C1C1E] text-sm font-semibold text-white flex items-center gap-1.5 active:opacity-70 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save
          </button>
        ) : (
          <button type="button" onClick={() => setEditMode(true)}
            className="px-4 h-9 rounded-full bg-black/10 backdrop-blur-sm border border-black/10 text-sm font-semibold text-[#1C1C1E] active:opacity-70">
            Edit
          </button>
        )}
      </div>

      <div className="absolute inset-0 overflow-y-auto">
        <div className="px-4 pt-[88px] pb-12 max-w-lg mx-auto w-full">

          <div className="flex flex-col items-center pt-4 pb-8 gap-2">
            <div className="w-24 h-24 rounded-full bg-[#3A3A3C] border-[3px] border-white/30 shadow-2xl flex items-center justify-center mb-1">
              <span className="text-[32px] font-bold text-white tracking-tight">{ini || <User size={32} className="text-white/60" />}</span>
            </div>
            {form.personnel_id && (
              <p className="text-[#6C6C70] text-[10px] font-semibold uppercase tracking-[0.16em]">{form.personnel_id}</p>
            )}
            <p className="text-[#1C1C1E] text-[26px] font-bold text-center leading-tight">{form.full_name}</p>
            {form.personnel_status && (
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full mt-0.5"
                style={form.personnel_status === 'Active'
                  ? { background: 'rgba(52,199,89,0.15)', color: '#1A7F37' }
                  : { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }}>
                {form.personnel_status}
              </span>
            )}
          </div>

          {error && <p className="text-xs text-red-300 bg-red-500/20 border border-red-400/20 px-3 py-2 rounded-xl mb-4">{error}</p>}

          <div className="space-y-4">

            <SectionCard title="Personnel Information">
              <ERow label="Personnel ID" icon={<Tag size={10} />}>
                <div className={readCls}>{fmt(form.personnel_id)}</div>
              </ERow>
              <ERow label="Status" icon={<User size={10} />} required>
                <ESelect value={form.personnel_status ?? ''} options={PERSONNEL_STATUS_OPTIONS} onChange={set('personnel_status')} disabled={!editMode} />
              </ERow>
              <ERow label="First Name" icon={<User size={10} />} required>
                {editMode
                  ? <input className={inputCls} value={form.first_name ?? ''} onChange={e => setNameField('first_name', e.target.value)} />
                  : <div className={readCls}>{fmt(form.first_name)}</div>}
              </ERow>
              <ERow label="Middle Name" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.middle_name ?? ''} onChange={e => setNameField('middle_name', e.target.value)} />
                  : <div className={readCls}>{fmt(form.middle_name)}</div>}
              </ERow>
              <ERow label="Last Name" icon={<User size={10} />} required>
                {editMode
                  ? <input className={inputCls} value={form.last_name ?? ''} onChange={e => setNameField('last_name', e.target.value)} />
                  : <div className={readCls}>{fmt(form.last_name)}</div>}
              </ERow>
              <ERow label="Email Address" icon={<Mail size={10} />} required>
                {editMode
                  ? <input className={inputCls} type="email" inputMode="email" value={form.email_address ?? ''} onChange={e => set('email_address')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.email_address)}</div>}
              </ERow>
              <ERow label="Joined Date" icon={<Calendar size={10} />} required>
                {editMode
                  ? <input className={inputCls} type="date" max={new Date().toISOString().split('T')[0]} value={form.joined_date ?? ''} onChange={e => set('joined_date')(e.target.value)} />
                  : <div className={readCls}>{fmtDate(form.joined_date)}</div>}
              </ERow>
              <ERow label="Focus Project" icon={<Briefcase size={10} />}>
                <EMultiSelect value={form.focus_project ?? ''} options={projects} onChange={set('focus_project')} disabled={!editMode} />
              </ERow>
            </SectionCard>

            <SectionCard title="Network Hierarchy">
              <ERow label="Position" icon={<Briefcase size={10} />} required>
                <ESelect
                  value={form.position_code ?? ''}
                  options={POSITION_CODE_OPTIONS}
                  onChange={v => {
                    const rank = POSITION_RANK_MAP[v] ?? null;
                    setForm(f => ({
                      ...f,
                      position_code: v || null,
                      position_rank: rank,
                      bno_name: rank === 'BNA' ? f.bno_name : null,
                    }));
                  }}
                  disabled={!editMode}
                />
              </ERow>
              {form.position_rank === 'BNA' && (
                <ERow label="Broker Network Officer" icon={<User size={10} />}>
                  <ESelect
                    value={form.bno_name ?? ''}
                    options={bnoOptions}
                    onChange={onBnoChange}
                    disabled={!editMode}
                  />
                </ERow>
              )}
              <ERow label="Sales Director" icon={<User size={10} />}>
                <ESelect
                  value={form.sales_director ?? ''}
                  options={sdOptions}
                  onChange={onSdChange}
                  disabled={!editMode || cascadeSource === 'bno'}
                />
              </ERow>
              <ERow label="Sales Division Head" icon={<User size={10} />}>
                <ESelect
                  value={form.sales_division_head ?? ''}
                  options={sdhOptions}
                  onChange={set('sales_division_head')}
                  disabled={!editMode || cascadeSource === 'bno' || cascadeSource === 'sd'}
                />
              </ERow>
              <ERow label="Sales Head" icon={<User size={10} />}>
                <ESelect
                  value={form.sales_head ?? ''}
                  options={shOptions}
                  onChange={set('sales_head')}
                  disabled={!editMode || cascadeSource === 'bno' || cascadeSource === 'sd'}
                />
              </ERow>
            </SectionCard>

            <SectionCard title="App Account">
              <ERow label="App Role" icon={<User size={10} />}>
                <ESelect
                  value={roles.find(r => r.id === form.app_role_id)?.role_name ?? ''}
                  options={roles.map(r => r.role_name)}
                  onChange={v => {
                    const role = roles.find(r => r.role_name === v);
                    setForm(f => ({ ...f, app_role_id: role?.id ?? null }));
                  }}
                  disabled={!editMode}
                />
              </ERow>
              {!editMode && hasAccount && record.email_address && (
                <div className="space-y-1.5 pt-1">
                  <button type="button" onClick={handleResend} disabled={resending || resendDone}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-all active:opacity-70 disabled:opacity-50"
                    style={{ background: resendDone ? 'rgba(52,199,89,0.12)' : 'rgba(192,61,37,0.08)', color: resendDone ? '#1A7F37' : '#C03D25' }}>
                    {resending
                      ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                      : resendDone
                        ? <><Check size={15} /> Invitation Sent!</>
                        : <><Mail size={15} /> Resend Invitation</>}
                  </button>
                  {resendError && <p className="text-xs text-red-400 text-center">{resendError}</p>}
                </div>
              )}
            </SectionCard>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Sheet ─────────────────────────────────────────────────────────────────

function AddSheet({ allRecords, onClose, onAdded }: {
  allRecords: BrokerPersonnelRecord[];
  onClose:    () => void;
  onAdded:    (rec: BrokerPersonnelRecord) => void;
}) {
  const [form,   setForm]   = useState<BrokerPersonnelRecord>(EMPTY_RECORD);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const [allPeople,  setAllPeople]  = useState<SalespersonRecord[]>([]);
  const [bnoList,    setBnoList]    = useState<BrokerPersonnelRecord[]>([]);
  const [projects,   setProjects]   = useState<string[]>([]);
  const [roles,      setRoles]      = useState<AccessRole[]>([]);
  const [sdOptions,  setSdOptions]  = useState<string[]>([]);
  const [sdhOptions, setSdhOptions] = useState<string[]>([]);
  const [shOptions,  setShOptions]  = useState<string[]>([]);
  const [bnoOptions, setBnoOptions] = useState<string[]>([]);
  const [cascadeSource, setCascadeSource] = useState<null | 'bno' | 'sd'>(null);

  useEffect(() => {
    Promise.all([
      fetchProjects(),
      fetchAccessRoles(),
      fetchAllSalespersons(),
    ]).then(([proj, r, people]) => {
      setProjects(proj);
      setRoles(r);
      setAllPeople(people);
      setSdOptions( people.filter(p => p.position_rank === 'SD' ).map(p => p.seller_name));
      setSdhOptions(people.filter(p => p.position_rank === 'SDH').map(p => p.seller_name));
      setShOptions( people.filter(p => p.position_rank === 'SH' ).map(p => p.seller_name));
    }).catch(() => {});
    const bnos = allRecords.filter(p => p.position_rank === 'BNO');
    setBnoList(bnos);
    setBnoOptions(bnos.map(p => p.full_name));
  }, [allRecords]);

  const set = (key: keyof BrokerPersonnelRecord) => (val: string) =>
    setForm(f => ({ ...f, [key]: val || null }));

  function setNameField(key: 'first_name' | 'middle_name' | 'last_name', val: string) {
    setForm(f => {
      const updated = { ...f, [key]: val || null };
      const composed = [updated.first_name, updated.middle_name, updated.last_name].filter(Boolean).join(' ');
      return { ...updated, full_name: composed };
    });
  }

  function onBnoChange(name: string) {
    const rec = name ? bnoList.find(p => p.full_name === name) : null;
    setForm(f => ({
      ...f,
      bno_name:               name || null,
      sales_director:         rec?.sales_director         ?? null,
      sales_director_id:      rec?.sales_director_id      ?? null,
      sales_division_head:    rec?.sales_division_head    ?? null,
      sales_division_head_id: rec?.sales_division_head_id ?? null,
      sales_head:             rec?.sales_head             ?? null,
      sales_head_id:          rec?.sales_head_id          ?? null,
    }));
    setCascadeSource(name ? 'bno' : null);
  }

  function onSdChange(name: string) {
    const rec = name ? allPeople.find(p => p.seller_name === name && p.position_rank === 'SD') : null;
    setForm(f => ({
      ...f,
      sales_director:         name || null,
      sales_director_id:      rec?.seller_id              ?? null,
      sales_division_head:    rec?.sales_division_head    ?? null,
      sales_division_head_id: rec?.sales_division_head_id ?? null,
      sales_head:             rec?.sales_head             ?? null,
      sales_head_id:          rec?.sales_head_id          ?? null,
    }));
    setCascadeSource(name ? 'sd' : null);
  }

  const ini = nameInitials(form.full_name);

  async function handleSave() {
    const missing: string[] = [];
    if (!form.first_name?.trim() && !form.last_name?.trim()) missing.push('First & Last Name');
    if (!form.email_address?.trim()) missing.push('Email Address');
    if (!form.joined_date)           missing.push('Joined Date');
    if (!form.personnel_status)      missing.push('Status');
    if (!form.position_code)         missing.push('Position');
    if (!form.app_role_id)           missing.push('App Role');
    if (missing.length > 0) { setError(`Required: ${missing.join(', ')}`); return; }
    setSaving(true);
    setError('');
    const saveStart = Date.now();
    try {
      const { data: dup } = await supabase
        .from('broker_personnel')
        .select('full_name')
        .ilike('email_address', (form.email_address ?? '').trim())
        .limit(1);
      if (dup && dup.length > 0) {
        setError(`Email is already used by ${(dup[0] as any).full_name}.`);
        return;
      }
      const personnelId = generatePersonnelId(allRecords);
      const toInsert = {
        personnel_id:           personnelId,
        full_name:              form.full_name,
        first_name:             form.first_name,
        middle_name:            form.middle_name,
        last_name:              form.last_name,
        position_code:          form.position_code,
        position_rank:          form.position_rank,
        personnel_status:       form.personnel_status,
        email_address:          form.email_address,
        joined_date:            form.joined_date,
        focus_project:          form.focus_project,
        bno_name:               form.position_rank === 'BNA' ? form.bno_name : null,
        sales_director:         form.sales_director,
        sales_director_id:      form.sales_director_id,
        sales_division_head:    form.sales_division_head,
        sales_division_head_id: form.sales_division_head_id,
        sales_head:             form.sales_head,
        sales_head_id:          form.sales_head_id,
        app_role_id:            form.app_role_id,
      };
      const { data: inserted, error: insErr } = await supabase
        .from('broker_personnel')
        .insert(toInsert)
        .select('id')
        .single();
      if (insErr) throw insErr;
      onAdded({ ...form, personnel_id: personnelId, id: (inserted as any).id });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      const elapsed = Date.now() - saveStart;
      if (elapsed < 2800) await new Promise(r => setTimeout(r, 2800 - elapsed));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <SavingOverlay visible={saving} />

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
        <button type="button" onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/10 backdrop-blur-sm border border-black/10 flex items-center justify-center active:opacity-60">
          <X size={18} className="text-[#1C1C1E]" />
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-4 h-9 rounded-full bg-[#1C1C1E] text-sm font-semibold text-white flex items-center gap-1.5 active:opacity-70 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
      </div>

      <div className="absolute inset-0 overflow-y-auto">
        <div className="px-4 pt-[88px] pb-12 max-w-lg mx-auto w-full">

          <div className="flex flex-col items-center pt-4 pb-8 gap-2">
            <div className="w-24 h-24 rounded-full bg-[#3A3A3C] border-[3px] border-white/30 shadow-2xl flex items-center justify-center mb-1">
              {ini
                ? <span className="text-[32px] font-bold text-white tracking-tight">{ini}</span>
                : <User size={32} className="text-white/60" />}
            </div>
            <p className="text-[#6C6C70] text-[10px] font-semibold uppercase tracking-[0.16em]">New Broker Personnel</p>
            <p className="text-[#1C1C1E] text-[22px] font-bold text-center leading-tight min-h-[28px]">
              {form.full_name || <span className="text-[#C7C7CC] italic font-normal text-base">Enter name below</span>}
            </p>
          </div>

          {error && <p className="text-xs text-red-300 bg-red-500/20 border border-red-400/20 px-3 py-2 rounded-xl mb-4">{error}</p>}

          <div className="space-y-4">

            <SectionCard title="Personnel Information">
              <ERow label="First Name" icon={<User size={10} />} required>
                <input className={inputCls} value={form.first_name ?? ''} onChange={e => setNameField('first_name', e.target.value)} />
              </ERow>
              <ERow label="Middle Name" icon={<User size={10} />}>
                <input className={inputCls} value={form.middle_name ?? ''} onChange={e => setNameField('middle_name', e.target.value)} />
              </ERow>
              <ERow label="Last Name" icon={<User size={10} />} required>
                <input className={inputCls} value={form.last_name ?? ''} onChange={e => setNameField('last_name', e.target.value)} />
              </ERow>
              <ERow label="Full Name" icon={<User size={10} />}>
                <div className={`${readCls} ${form.full_name ? 'text-[#1C1C1E]' : 'text-[#C7C7CC] italic'}`}>
                  {form.full_name || 'Auto-composed from name'}
                </div>
              </ERow>
              <ERow label="Personnel Code" icon={<Tag size={10} />}>
                <div className={`${readCls} text-[#8E8E93] italic`}>Auto-generated</div>
              </ERow>
              <ERow label="Email Address" icon={<Mail size={10} />} required>
                <input className={inputCls} type="email" inputMode="email" value={form.email_address ?? ''} onChange={e => set('email_address')(e.target.value)} />
              </ERow>
              <ERow label="Joined Date" icon={<Calendar size={10} />} required>
                <input className={inputCls} type="date" max={new Date().toISOString().split('T')[0]} value={form.joined_date ?? ''} onChange={e => set('joined_date')(e.target.value)} />
              </ERow>
              <ERow label="Status" icon={<User size={10} />} required>
                <ESelect value={form.personnel_status ?? ''} options={PERSONNEL_STATUS_OPTIONS} onChange={set('personnel_status')} />
              </ERow>
              <ERow label="Focus Project" icon={<Briefcase size={10} />}>
                <EMultiSelect value={form.focus_project ?? ''} options={projects} onChange={set('focus_project')} />
              </ERow>
            </SectionCard>

            <SectionCard title="Network Hierarchy">
              <ERow label="Position" icon={<Briefcase size={10} />} required>
                <ESelect
                  value={form.position_code ?? ''}
                  options={POSITION_CODE_OPTIONS}
                  onChange={v => {
                    const rank = POSITION_RANK_MAP[v] ?? null;
                    setForm(f => ({
                      ...f,
                      position_code: v || null,
                      position_rank: rank,
                      bno_name: rank === 'BNA' ? f.bno_name : null,
                    }));
                  }}
                />
              </ERow>
              {form.position_rank === 'BNA' && (
                <ERow label="Broker Network Officer" icon={<User size={10} />}>
                  <ESelect
                    value={form.bno_name ?? ''}
                    options={bnoOptions}
                    onChange={onBnoChange}
                  />
                </ERow>
              )}
              <ERow label="Sales Director" icon={<User size={10} />}>
                <ESelect
                  value={form.sales_director ?? ''}
                  options={sdOptions}
                  onChange={onSdChange}
                  disabled={cascadeSource === 'bno'}
                />
              </ERow>
              <ERow label="Sales Division Head" icon={<User size={10} />}>
                <ESelect
                  value={form.sales_division_head ?? ''}
                  options={sdhOptions}
                  onChange={set('sales_division_head')}
                  disabled={cascadeSource === 'bno' || cascadeSource === 'sd'}
                />
              </ERow>
              <ERow label="Sales Head" icon={<User size={10} />}>
                <ESelect
                  value={form.sales_head ?? ''}
                  options={shOptions}
                  onChange={set('sales_head')}
                  disabled={cascadeSource === 'bno' || cascadeSource === 'sd'}
                />
              </ERow>
            </SectionCard>

            <SectionCard title="App Account">
              <ERow label="App Role" icon={<User size={10} />} required>
                <ESelect
                  value={roles.find(r => r.id === form.app_role_id)?.role_name ?? ''}
                  options={roles.map(r => r.role_name)}
                  onChange={v => {
                    const role = roles.find(r => r.role_name === v);
                    setForm(f => ({ ...f, app_role_id: role?.id ?? null }));
                  }}
                />
              </ERow>
            </SectionCard>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Account Sheet ──────────────────────────────────────────────────────

function CreateAccountSheet({ records, accountEmails, onClose, onEmailsAdded }: {
  records:       BrokerPersonnelRecord[];
  accountEmails: Set<string>;
  onClose:       () => void;
  onEmailsAdded: (newEmails: string[]) => void;
}) {
  const candidates = records.filter(
    r => !r.email_address || !accountEmails.has(r.email_address.toLowerCase())
  );
  const invitable  = candidates.filter(r => !!r.email_address);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending,  setSending]  = useState(false);
  const [result,   setResult]   = useState<{ invited: number; errors: { full_name: string; reason?: string }[] } | null>(null);
  const [search,   setSearch]   = useState('');

  const visibleCandidates = search.trim()
    ? candidates.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase()))
    : candidates;
  const visibleInvitable  = visibleCandidates.filter(r => !!r.email_address);

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (selected.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/broker-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel_ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const errors = (data.results ?? []).filter((r: any) => r.status === 'error').map((r: any) => ({ full_name: r.full_name, reason: r.reason }));
      setResult({ invited: data.invited ?? 0, errors });
      const newEmails = candidates
        .filter(c => c.id !== undefined && selected.has(c.id!) && !errors.find((e: any) => e.full_name === c.full_name))
        .map(c => c.email_address!.toLowerCase());
      if (newEmails.length > 0) onEmailsAdded(newEmails);
    } catch (e: any) {
      setResult({ invited: 0, errors: [{ full_name: 'All', reason: e.message }] });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="mt-auto rounded-t-3xl flex flex-col max-h-[85vh]"
        style={{ background: 'rgba(242,242,247,0.98)', backdropFilter: 'blur(24px)' }}>

        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06]">
          <div>
            <p className="text-base font-bold text-[#1C1C1E]">Create App Accounts</p>
            <p className="text-xs text-[#8E8E93] mt-0.5">{candidates.length} without an account · {invitable.length} ready to invite</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center active:opacity-60">
            <X size={16} className="text-[#3C3C43]" />
          </button>
        </div>

        {result && (
          <div className={`mx-4 mt-3 px-3 py-2 rounded-xl text-xs font-medium space-y-0.5 ${result.errors.length > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {result.invited > 0 && (
              <p className={result.errors.length === 0 ? 'text-green-700' : 'text-green-600'}>
                ✓ {result.invited} invitation{result.invited !== 1 ? 's' : ''} sent successfully.
              </p>
            )}
            {result.errors.map((e, i) => <p key={i}>✕ {e.full_name}: {e.reason}</p>)}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-black/[0.06]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                className="flex-1 bg-transparent text-sm text-[#1C1C1E] placeholder:text-[#8E8E93] outline-none" />
              {search && <button type="button" onClick={() => setSearch('')} className="text-[#8E8E93] active:opacity-60"><X size={13} /></button>}
            </div>
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2">
            <UserCheck size={32} className="text-[#34C759]" />
            <p className="text-sm font-semibold text-[#1C1C1E]">All personnel have accounts</p>
          </div>
        ) : (
          <>
            {visibleInvitable.length > 0 && (
              <button type="button"
                onClick={() => setSelected(prev =>
                  prev.size === visibleInvitable.length
                    ? new Set()
                    : new Set(visibleInvitable.map(c => c.id!))
                )}
                className="flex items-center gap-2 px-5 py-3 text-xs font-semibold text-[#007AFF] active:opacity-60">
                {visibleInvitable.every(c => selected.has(c.id!)) ? 'Deselect All' : 'Select All'}
              </button>
            )}

            <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
              {visibleCandidates.map(c => {
                const canInvite = !!c.email_address;
                const id        = c.id!;
                return (
                  <button key={id} type="button"
                    onClick={() => canInvite && toggle(id)}
                    disabled={!canInvite}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-opacity ${canInvite ? 'bg-white/80 border-black/[0.06] active:opacity-70' : 'bg-black/[0.03] border-black/[0.04] opacity-50 cursor-not-allowed'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected.has(id) ? 'bg-[#007AFF] border-[#007AFF]' : 'border-[#C7C7CC]'}`}>
                      {selected.has(id) && <Check size={11} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#1C1C1E] truncate">{c.full_name}</p>
                        <PositionBadge rank={c.position_rank} />
                      </div>
                      <p className="text-xs text-[#8E8E93] truncate">{canInvite ? c.email_address : 'No email — edit record first'}</p>
                    </div>
                    {!canInvite
                      ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(255,59,48,0.10)', color: '#C0001E' }}>No email</span>
                      : <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(142,142,147,0.12)', color: '#6C6C70' }}><UserX size={9} className="inline mr-0.5" />No Acct</span>
                    }
                  </button>
                );
              })}
            </div>

            <div className="px-4 pb-8 pt-2">
              <button type="button" onClick={handleCreate}
                disabled={sending || selected.size === 0}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:opacity-80 disabled:opacity-40"
                style={{ background: '#007AFF' }}>
                {sending
                  ? <><Loader2 size={16} className="animate-spin" /> Sending invitations…</>
                  : `Send ${selected.size} Invitation${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const POSITION_RANK_LABELS: Record<string, string> = {
  BNA: 'Broker Network Associate',
  BNO: 'Broker Network Officer',
};

export default function BrokerPersonnelPage() {
  const [records,        setRecords]        = useState<BrokerPersonnelRecord[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [positionFilter, setPositionFilter] = useState('');
  const [search,         setSearch]         = useState('');
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [selected,       setSelected]       = useState<BrokerPersonnelRecord | null>(null);
  const [adding,         setAdding]         = useState(false);
  const [accountSheet,   setAccountSheet]   = useState(false);
  const [accountEmails,  setAccountEmails]  = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAllBrokerPersonnel()
      .then(setRecords)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProfileEmails().then(emails => setAccountEmails(new Set(emails)));
  }, []);

  const filtered = records.filter(r => {
    if (positionFilter && POSITION_RANK_LABELS[r.position_rank ?? ''] !== positionFilter) return false;
    if (search && !r.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <PageShell title="Broker Personnel">
        <div className="space-y-3 pb-6">

          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SearchInput value={search} onChange={setSearch} placeholder="Search by name…" />
            </div>
            <button type="button"
              onClick={() => setFilterOpen(true)}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                positionFilter
                  ? 'bg-[#C03D25] text-white shadow-md'
                  : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
              }`}>
              <SlidersHorizontal size={18} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <Users size={28} className="text-[#C7C7CC] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#1C1C1E]">No broker personnel found</p>
              <p className="text-xs text-[#8E8E93] mt-1">
                {search || positionFilter ? 'Try adjusting your filters' : 'No records yet'}
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => (
                <GlassCard
                  key={r.id ?? r.full_name}
                  className="flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setSelected(r)}
                >
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #5856D6 0%, #3634A3 100%)' }}>
                    <span className="text-sm font-bold text-white">
                      {nameInitials(r.full_name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E] truncate">{r.full_name}</p>
                    <p className="text-xs text-[#8E8E93] truncate">{r.sales_director ?? '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 min-w-[56px]">
                    <PositionBadge rank={r.position_rank} />
                    {r.email_address && (
                      accountEmails.has(r.email_address.toLowerCase())
                        ? <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }}><UserCheck size={9} />Account</span>
                        : <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(142,142,147,0.12)', color: '#6C6C70' }}><UserX size={9} />No Acct</span>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

        </div>

        <div className="fixed bottom-6 right-6 flex flex-col items-center gap-3 z-30">
          <button type="button" onClick={() => setAccountSheet(true)}
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(28,28,30,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <KeyRound size={20} className="text-white" />
          </button>
          <button type="button" onClick={() => setAdding(true)}
            className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(192, 61, 37, 0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <Plus size={26} className="text-white" />
          </button>
        </div>

      </PageShell>

      {selected && (
        <DetailSheet
          record={selected}
          hasAccount={!!(selected.email_address && accountEmails.has(selected.email_address.toLowerCase()))}
          onClose={() => setSelected(null)}
          onSaved={updated => {
            setRecords(prev => prev.map(r => r.id === selected.id ? updated : r));
            setSelected(updated);
          }}
        />
      )}

      {adding && (
        <AddSheet
          allRecords={records}
          onClose={() => setAdding(false)}
          onAdded={rec => {
            setRecords(prev => [rec, ...prev]);
            setAdding(false);
          }}
        />
      )}

      {accountSheet && (
        <CreateAccountSheet
          records={records}
          accountEmails={accountEmails}
          onClose={() => setAccountSheet(false)}
          onEmailsAdded={newEmails => {
            setAccountEmails(prev => new Set([...prev, ...newEmails]));
          }}
        />
      )}

      {filterOpen && (
        <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setFilterOpen(false)} />
      )}

      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button type="button" onClick={() => setFilterOpen(false)}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>
          <div className="px-5 pb-8 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Position</p>
              <div className="flex flex-wrap gap-2">
                {(['Broker Network Associate', 'Broker Network Officer'] as const).map(label => (
                  <button key={label} type="button"
                    onClick={() => { setPositionFilter(positionFilter === label ? '' : label); setFilterOpen(false); }}
                    className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
                    style={positionFilter === label
                      ? { background: '#C03D25', color: '#fff' }
                      : { background: '#F2F2F7', color: '#3C3C43' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {positionFilter && (
              <button type="button" onClick={() => { setPositionFilter(''); setFilterOpen(false); }}
                className="text-sm font-semibold text-[#C03D25] active:opacity-60">
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
