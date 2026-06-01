'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchInput from '@/components/ui/SearchInput';
import {
  Loader2, Users, Plus, ChevronLeft, Edit2, Check, X,
  Mail, Building2, Tag, User, ChevronDown, SlidersHorizontal, ShieldCheck,
} from 'lucide-react';
import {
  fetchAllBrokerRecruits, addBrokerRecruit, updateBrokerRecruit, BrokerRecruitRecord,
} from '@/lib/brokers';

// ─── Constants ────────────────────────────────────────────────────────────────

const BROKER_STATUS_OPTIONS   = ['Active', 'Inactive'];
const BROKER_CATEGORY_OPTIONS = ['External Broker', 'Internal Broker'];
const BROKER_TYPE_OPTIONS     = ['Individual', 'Corporate'];
const VAT_TYPE_OPTIONS        = ['VAT', 'Non-VAT'];
const EWT_RATE_OPTIONS        = ['5%', '10%', '15%'];

// ─── Theme ────────────────────────────────────────────────────────────────────

const PAGE_GRADIENT = 'linear-gradient(to bottom, #FFFFFF 0%, #8E8E93 50%, #3A3A3C 100%)';
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white/90 transition-colors placeholder:text-[#C7C7CC]';
const readCls  = 'w-full px-3 py-2.5 rounded-xl bg-white/60 text-sm text-[#1C1C1E]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: string | null) {
  return val && val.trim() ? val : '—';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl p-4 space-y-4"
      style={{
        background: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 2px 16px rgba(0, 0, 0, 0.08)',
      }}
    >
      <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function ERow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-[#6C6C70] uppercase tracking-wider flex items-center gap-1">{icon}{label}</p>
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
    <div className="relative">
      <button type="button" onClick={() => setOpen(p => !p)}
        className={`${inputCls} flex items-center justify-between`}>
        <span className={value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}>{value || 'Select…'}</span>
        <ChevronDown size={12} className={`text-[#8E8E93] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-xl border border-black/[0.08] overflow-hidden z-20 backdrop-blur-2xl"
          style={{ background: 'rgba(255, 255, 255, 0.98)' }}
        >
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-black/[0.04] ${o === value ? 'bg-black/[0.04] text-[#1C1C1E] font-semibold' : 'text-[#3C3C43]'}`}>
              {o}
              {o === value && <Check size={12} className="shrink-0 text-[#8E8E93]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function DetailSheet({ broker, onClose, onSaved }: {
  broker: BrokerRecruitRecord;
  onClose: () => void;
  onSaved: (updated: BrokerRecruitRecord) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [form,     setForm]     = useState<BrokerRecruitRecord>(broker);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const initials = (form.full_name ?? '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const set = (key: keyof BrokerRecruitRecord) => (val: string) =>
    setForm(f => ({ ...f, [key]: val || null }));

  function cancelEdit() {
    setForm(broker);
    setEditMode(false);
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await updateBrokerRecruit(broker.full_name, form);
      onSaved(form);
      setEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT }}>

      {/* Fixed nav */}
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

      {/* Scrollable content */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="px-4 pt-[88px] pb-12">

          {/* Hero */}
          <div className="flex flex-col items-center pt-4 pb-8 gap-2">
            <div className="w-24 h-24 rounded-full bg-[#3A3A3C] border-[3px] border-white/30 shadow-2xl flex items-center justify-center mb-1">
              <span className="text-[32px] font-bold text-white tracking-tight">{initials}</span>
            </div>
            {form.broker_id && (
              <p className="text-[#6C6C70] text-[10px] font-semibold uppercase tracking-[0.16em]">{form.broker_id}</p>
            )}
            <p className="text-[#1C1C1E] text-[26px] font-bold text-center leading-tight">{form.full_name}</p>
            {form.broker_category && (
              <p className="text-[13px] text-[#3C3C43] font-medium">{form.broker_category}</p>
            )}
            {form.broker_status && (
              <span className={`text-[11px] font-semibold px-3 py-1 rounded-full mt-0.5 ${
                form.broker_status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>{form.broker_status}</span>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">{error}</p>
          )}

          <div className="space-y-4">

            {/* Broker Information */}
            <SectionCard title="Broker Information">
              <ERow label="Business Unit" icon={<Building2 size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.business_unit ?? ''} onChange={e => set('business_unit')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.business_unit)}</div>}
              </ERow>
              <ERow label="Broker Status" icon={<User size={10} />}>
                <ESelect value={form.broker_status ?? ''} options={BROKER_STATUS_OPTIONS} onChange={set('broker_status')} disabled={!editMode} />
              </ERow>
              <ERow label="Broker Category" icon={<Tag size={10} />}>
                <ESelect value={form.broker_category ?? ''} options={BROKER_CATEGORY_OPTIONS} onChange={set('broker_category')} disabled={!editMode} />
              </ERow>
              <ERow label="Broker Type" icon={<Tag size={10} />}>
                <ESelect value={form.broker_type ?? ''} options={BROKER_TYPE_OPTIONS} onChange={set('broker_type')} disabled={!editMode} />
              </ERow>
              <ERow label="Last Name" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.last_name ?? ''} onChange={e => set('last_name')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.last_name)}</div>}
              </ERow>
              <ERow label="First Name" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.first_name ?? ''} onChange={e => set('first_name')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.first_name)}</div>}
              </ERow>
              <ERow label="Middle Name" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.middle_name ?? ''} onChange={e => set('middle_name')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.middle_name)}</div>}
              </ERow>
              <ERow label="Suffix" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.suffix ?? ''} onChange={e => set('suffix')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.suffix)}</div>}
              </ERow>
              <ERow label="Email Address" icon={<Mail size={10} />}>
                {editMode
                  ? <input className={inputCls} type="email" inputMode="email" value={form.email_address ?? ''} onChange={e => set('email_address')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.email_address)}</div>}
              </ERow>
            </SectionCard>

            {/* Broker Hierarchy */}
            <SectionCard title="Broker Hierarchy">
              <ERow label="Sales Head" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.sales_head ?? ''} onChange={e => set('sales_head')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.sales_head)}</div>}
              </ERow>
              <ERow label="Sales Director Head" icon={<User size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.sales_director_head ?? ''} onChange={e => set('sales_director_head')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.sales_director_head)}</div>}
              </ERow>
              <ERow label="Broker Network Officer" icon={<Users size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.broker_network_officer ?? ''} onChange={e => set('broker_network_officer')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.broker_network_officer)}</div>}
              </ERow>
              <ERow label="Broker Network Associate" icon={<Users size={10} />}>
                {editMode
                  ? <input className={inputCls} value={form.broker_network_associate ?? ''} onChange={e => set('broker_network_associate')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.broker_network_associate)}</div>}
              </ERow>
            </SectionCard>

            {/* Broker BIR Information */}
            <SectionCard title="Broker BIR Information">
              <ERow label="BIR Registered Name">
                {editMode
                  ? <input className={inputCls} value={form.bir_registered_name ?? ''} onChange={e => set('bir_registered_name')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.bir_registered_name)}</div>}
              </ERow>
              <ERow label="VAT Registration Type">
                <ESelect value={form.vat_registration_type ?? ''} options={VAT_TYPE_OPTIONS} onChange={set('vat_registration_type')} disabled={!editMode} />
              </ERow>
              <ERow label="Tax Identification No.">
                {editMode
                  ? <input className={inputCls} value={form.tin ?? ''} onChange={e => set('tin')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.tin)}</div>}
              </ERow>
              <ERow label="EWT/CWT Rate">
                <ESelect value={form.ewt_cwt_rate ?? ''} options={EWT_RATE_OPTIONS} onChange={set('ewt_cwt_rate')} disabled={!editMode} />
              </ERow>
              <ERow label="BIR COR Address">
                {editMode
                  ? <textarea className={`${inputCls} resize-none`} rows={3} value={form.bir_cor_address ?? ''} onChange={e => set('bir_cor_address')(e.target.value)} />
                  : <div className={readCls}>{fmt(form.bir_cor_address)}</div>}
              </ERow>
            </SectionCard>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Sheet ────────────────────────────────────────────────────────────────

const EMPTY_BROKER: BrokerRecruitRecord = {
  full_name: '', broker_id: null, business_unit: null, broker_status: null,
  broker_category: null, broker_type: null, last_name: null, first_name: null,
  middle_name: null, suffix: null, email_address: null, sales_head: null,
  sales_director_head: null, broker_network_officer: null, broker_network_associate: null,
  bir_registered_name: null, vat_registration_type: null, tin: null,
  ewt_cwt_rate: null, bir_cor_address: null,
};

function AddSheet({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: (rec: BrokerRecruitRecord) => void;
}) {
  const [form,   setForm]   = useState<BrokerRecruitRecord>(EMPTY_BROKER);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (key: keyof BrokerRecruitRecord) => (val: string) =>
    setForm(f => ({ ...f, [key]: val || null }));

  const displayName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ');
  const initials = displayName.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  async function handleSave() {
    if (!form.first_name?.trim() && !form.last_name?.trim()) {
      setError('At least First Name or Last Name is required.');
      return;
    }
    const composed = [form.first_name, form.middle_name, form.last_name, form.suffix]
      .filter(Boolean).join(' ');
    const finalForm = { ...form, full_name: composed };
    setSaving(true);
    setError('');
    try {
      await addBrokerRecruit(finalForm);
      onAdded(finalForm);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT }}>

      {/* Fixed nav */}
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

      {/* Scrollable content */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="px-4 pt-[88px] pb-12">

          {/* Hero */}
          <div className="flex flex-col items-center pt-4 pb-8 gap-2">
            <div className="w-24 h-24 rounded-full bg-[#3A3A3C] border-[3px] border-white/30 shadow-2xl flex items-center justify-center mb-1">
              {initials
                ? <span className="text-[32px] font-bold text-white tracking-tight">{initials}</span>
                : <ShieldCheck size={32} className="text-white/60" />}
            </div>
            <p className="text-[#6C6C70] text-[10px] font-semibold uppercase tracking-[0.16em]">New Broker</p>
            <p className="text-[#1C1C1E] text-[22px] font-bold text-center leading-tight min-h-[28px]">
              {displayName || <span className="text-[#C7C7CC] italic font-normal text-base">Fill in name fields below</span>}
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">{error}</p>
          )}

          <div className="space-y-4">

            {/* Broker Information */}
            <SectionCard title="Broker Information">
              <ERow label="Business Unit" icon={<Building2 size={10} />}>
                <input className={inputCls} value={form.business_unit ?? ''} onChange={e => set('business_unit')(e.target.value)} />
              </ERow>
              <ERow label="Broker Status" icon={<User size={10} />}>
                <ESelect value={form.broker_status ?? ''} options={BROKER_STATUS_OPTIONS} onChange={set('broker_status')} />
              </ERow>
              <ERow label="Broker Category" icon={<Tag size={10} />}>
                <ESelect value={form.broker_category ?? ''} options={BROKER_CATEGORY_OPTIONS} onChange={set('broker_category')} />
              </ERow>
              <ERow label="Broker Type" icon={<Tag size={10} />}>
                <ESelect value={form.broker_type ?? ''} options={BROKER_TYPE_OPTIONS} onChange={set('broker_type')} />
              </ERow>
              <ERow label="Last Name" icon={<User size={10} />}>
                <input className={inputCls} value={form.last_name ?? ''} onChange={e => set('last_name')(e.target.value)} />
              </ERow>
              <ERow label="First Name" icon={<User size={10} />}>
                <input className={inputCls} value={form.first_name ?? ''} onChange={e => set('first_name')(e.target.value)} />
              </ERow>
              <ERow label="Middle Name" icon={<User size={10} />}>
                <input className={inputCls} value={form.middle_name ?? ''} onChange={e => set('middle_name')(e.target.value)} />
              </ERow>
              <ERow label="Suffix" icon={<User size={10} />}>
                <input className={inputCls} value={form.suffix ?? ''} onChange={e => set('suffix')(e.target.value)} />
              </ERow>
              <ERow label="Email Address" icon={<Mail size={10} />}>
                <input className={inputCls} type="email" inputMode="email" value={form.email_address ?? ''} onChange={e => set('email_address')(e.target.value)} />
              </ERow>
            </SectionCard>

            {/* Broker Hierarchy */}
            <SectionCard title="Broker Hierarchy">
              <ERow label="Sales Head" icon={<User size={10} />}>
                <input className={inputCls} value={form.sales_head ?? ''} onChange={e => set('sales_head')(e.target.value)} />
              </ERow>
              <ERow label="Sales Director Head" icon={<User size={10} />}>
                <input className={inputCls} value={form.sales_director_head ?? ''} onChange={e => set('sales_director_head')(e.target.value)} />
              </ERow>
              <ERow label="Broker Network Officer" icon={<Users size={10} />}>
                <input className={inputCls} value={form.broker_network_officer ?? ''} onChange={e => set('broker_network_officer')(e.target.value)} />
              </ERow>
              <ERow label="Broker Network Associate" icon={<Users size={10} />}>
                <input className={inputCls} value={form.broker_network_associate ?? ''} onChange={e => set('broker_network_associate')(e.target.value)} />
              </ERow>
            </SectionCard>

            {/* Broker BIR Information */}
            <SectionCard title="Broker BIR Information">
              <ERow label="BIR Registered Name">
                <input className={inputCls} value={form.bir_registered_name ?? ''} onChange={e => set('bir_registered_name')(e.target.value)} />
              </ERow>
              <ERow label="VAT Registration Type">
                <ESelect value={form.vat_registration_type ?? ''} options={VAT_TYPE_OPTIONS} onChange={set('vat_registration_type')} />
              </ERow>
              <ERow label="Tax Identification No.">
                <input className={inputCls} value={form.tin ?? ''} onChange={e => set('tin')(e.target.value)} />
              </ERow>
              <ERow label="EWT/CWT Rate">
                <ESelect value={form.ewt_cwt_rate ?? ''} options={EWT_RATE_OPTIONS} onChange={set('ewt_cwt_rate')} />
              </ERow>
              <ERow label="BIR COR Address">
                <textarea className={`${inputCls} resize-none`} rows={3} value={form.bir_cor_address ?? ''} onChange={e => set('bir_cor_address')(e.target.value)} />
              </ERow>
            </SectionCard>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrokerAccreditationPage() {
  const [brokers,    setBrokers]    = useState<BrokerRecruitRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected,   setSelected]   = useState<BrokerRecruitRecord | null>(null);
  const [adding,     setAdding]     = useState(false);

  useEffect(() => {
    fetchAllBrokerRecruits()
      .then(setBrokers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = brokers.filter(b => {
    if (statusFilter && b.broker_status !== statusFilter) return false;
    if (search && !(b.full_name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
  <>
    <PageShell title="Broker Accreditation">
      <div className="space-y-3 pb-6">

        {/* Search + Filter */}
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name…" />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
              statusFilter
                ? 'bg-[#C03D25] text-white shadow-md'
                : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
            }`}>
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#5AC8FA] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <ShieldCheck size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No brokers found</p>
            <p className="text-xs text-[#8E8E93] mt-1">
              {search || statusFilter ? 'Try adjusting your filters' : 'No records yet'}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(b => (
              <GlassCard
                key={b.full_name ?? b.broker_id ?? Math.random().toString()}
                className="flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setSelected(b)}
              >
                <div className="w-10 h-10 rounded-full bg-[#E5E5EA] flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-[#8E8E93]">
                    {(b.full_name ?? '').split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1C1C1E] truncate">{b.full_name ?? '—'}</p>
                  <p className="text-xs text-[#8E8E93]">{b.broker_category ?? '—'}</p>
                </div>
                {b.broker_status && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    b.broker_status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>{b.broker_status}</span>
                )}
              </GlassCard>
            ))}
          </div>
        )}

      </div>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ background: 'rgba(192, 61, 37, 0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        <Plus size={26} className="text-white" />
      </button>

    </PageShell>

    {/* Detail Sheet */}
    {selected && (
      <DetailSheet
        broker={selected}
        onClose={() => setSelected(null)}
        onSaved={(updated) => {
          setBrokers(prev => prev.map(b => b.full_name === selected.full_name ? updated : b));
          setSelected(updated);
        }}
      />
    )}

    {/* Add Sheet */}
    {adding && (
      <AddSheet
        onClose={() => setAdding(false)}
        onAdded={(rec) => {
          setBrokers(prev => [rec, ...prev]);
          setAdding(false);
        }}
      />
    )}

    {/* Filter sheet backdrop */}
    {filterOpen && (
      <div
        className="fixed inset-0 z-[45] bg-black/40"
        onClick={() => setFilterOpen(false)}
      />
    )}

    {/* Filter bottom sheet */}
    <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="bg-white rounded-t-3xl shadow-2xl">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
          <button type="button" onClick={() => setFilterOpen(false)}
            className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
            <X size={14} className="text-[#8E8E93]" />
          </button>
        </div>

        <div className="px-5 space-y-5 pb-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Status</p>
            <div className="flex gap-2">
              {BROKER_STATUS_OPTIONS.map(s => (
                <button key={s} type="button"
                  onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    statusFilter === s
                      ? 'bg-[#C03D25] text-white border-[#C03D25]'
                      : 'bg-[#F2F2F7] text-[#1C1C1E] border-transparent'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-10 pt-2 flex gap-3">
          <button type="button" onClick={() => setStatusFilter('')}
            className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
            Clear All
          </button>
          <button type="button" onClick={() => setFilterOpen(false)}
            className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
            Done
          </button>
        </div>

      </div>
    </div>
  </>
  );
}
