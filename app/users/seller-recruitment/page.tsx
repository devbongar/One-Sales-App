'use client';

import { useEffect, useRef, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchInput from '@/components/ui/SearchInput';
import { Loader2, Users, UserPlus, Plus, ChevronLeft, Edit2, Check, X, Briefcase, Mail, Calendar, Building2, Tag, User, ChevronDown, SlidersHorizontal, PenLine, Upload, RotateCcw } from 'lucide-react';
import { fetchAllSellerRecruits, fetchAllSalespersons, addSellerRecruit, updateSellerRecruit, fetchSellerSignature, updateSellerSignature, SellerRecruitRecord } from '@/lib/salesperson';
import { fetchProjects } from '@/lib/inventory';

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITION_RANK_LABELS: Record<string, string> = {
  PS:  'Property Specialist',
  SM:  'Sales Manager',
  SD:  'Sales Director',
  SDH: 'Sales Division Head',
  SH:  'Sales Head',
};


const POSITION_OPTIONS = ['Property Specialist', 'Sales Manager', 'Sales Director', 'Sales Division Head', 'Sales Head'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: string | null) {
  return val && val.trim() ? val : '—';
}

function fmtDate(val: string | null) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const POSITION_RANK_BADGE_STYLE: Record<string, React.CSSProperties> = {
  PS:  { background: 'rgba(0,122,255,0.12)',   color: '#0040A0' },
  SM:  { background: 'rgba(255,159,10,0.12)',  color: '#A05A00' },
  SD:  { background: 'rgba(88,86,214,0.12)',   color: '#3634A3' },
  SDH: { background: 'rgba(52,199,89,0.12)',   color: '#1A7F37' },
  SH:  { background: 'rgba(255,69,58,0.12)',   color: '#C0001E' },
};

function PositionBadge({ rank }: { rank: string | null }) {
  if (!rank) return null;
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={POSITION_RANK_BADGE_STYLE[rank] ?? { background: 'rgba(142,142,147,0.12)', color: '#6C6C70' }}>
      {rank}
    </span>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="text-sm text-[#1C1C1E]">{value}</p>
    </div>
  );
}

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

// ─── Edit form helpers ────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white/90 transition-colors placeholder:text-[#C7C7CC]';
const readCls  = 'w-full px-3 py-2.5 rounded-xl bg-white/60 text-sm text-[#1C1C1E]';

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

// ─── Theme ────────────────────────────────────────────────────────────────────

const PAGE_GRADIENT = 'linear-gradient(to bottom, #FFFFFF 0%, #8E8E93 50%, #3A3A3C 100%)';

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

const SELLER_STATUS_OPTIONS  = ['Active', 'Inactive'];
const POSITION_CODE_OPTIONS  = ['Property Specialist', 'Sales Manager', 'Sales Director', 'Sales Division Head', 'Sales Head'];
const POSITION_RANK_MAP: Record<string, string> = {
  'Property Specialist': 'PS', 'Sales Manager': 'SM', 'Sales Director': 'SD',
  'Sales Division Head': 'SDH', 'Sales Head': 'SH',
};

function DetailSheet({ seller, onClose, onSaved }: {
  seller: SellerRecruitRecord;
  onClose: () => void;
  onSaved: (updated: SellerRecruitRecord) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [form,     setForm]     = useState<SellerRecruitRecord>(seller);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const [sigMode,    setSigMode]    = useState<'idle' | 'draw' | 'upload'>('idle');
  const [sigPreview, setSigPreview] = useState<string | null>(seller.signature_base64 ?? null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing   = useRef(false);
  const sigLastPos   = useRef<{ x: number; y: number } | null>(null);
  const sigFileRef   = useRef<HTMLInputElement>(null);

  // Dropdown option lists
  const [projects,   setProjects]   = useState<string[]>([]);
  const [smOptions,  setSmOptions]  = useState<string[]>([]);
  const [sdOptions,  setSdOptions]  = useState<string[]>([]);
  const [sdhOptions, setSdhOptions] = useState<string[]>([]);
  const [shOptions,  setShOptions]  = useState<string[]>([]);

  useEffect(() => {
    fetchSellerSignature(seller.seller_name).then(sig => {
      if (sig) setSigPreview(sig);
    }).catch(() => {});
  }, [seller.seller_name]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
    fetchAllSalespersons().then(people => {
      setSmOptions( people.filter(p => p.position_rank === 'SM' ).map(p => p.seller_name));
      setSdOptions( people.filter(p => p.position_rank === 'SD' ).map(p => p.seller_name));
      setSdhOptions(people.filter(p => p.position_rank === 'SDH').map(p => p.seller_name));
      setShOptions( people.filter(p => p.position_rank === 'SH' ).map(p => p.seller_name));
    }).catch(() => {});
  }, []);

  // Canvas touch listeners for drawing
  useEffect(() => {
    if (sigMode !== 'draw') return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    function getPos(e: TouchEvent | MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      if ('touches' in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      return { x: ((e as MouseEvent).clientX - rect.left) * scaleX, y: ((e as MouseEvent).clientY - rect.top) * scaleY };
    }
    function onStart(e: TouchEvent | MouseEvent) { sigDrawing.current = true; sigLastPos.current = getPos(e); }
    function onMove(e: TouchEvent | MouseEvent) {
      if (!sigDrawing.current) return;
      e.preventDefault();
      const ctx = canvas!.getContext('2d'); if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath(); ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y);
      ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1C1C1E'; ctx.lineWidth = 2.5;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      sigLastPos.current = pos;
    }
    function onStop() { sigDrawing.current = false; sigLastPos.current = null; }
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onStop);
    canvas.addEventListener('mouseleave', onStop);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onStop);
    return () => {
      canvas.removeEventListener('mousedown', onStart);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onStop);
      canvas.removeEventListener('mouseleave', onStop);
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onStop);
    };
  }, [sigMode]);

  function handleSigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setSigPreview(ev.target?.result as string); setSigMode('idle'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const initials = form.seller_name.split(' ').map(w => w[0]).slice(0, 2).join('');
  const set = (key: keyof SellerRecruitRecord) => (val: string) =>
    setForm(f => ({ ...f, [key]: val || null }));

  function cancelEdit() {
    setForm(seller);
    setEditMode(false);
    setError('');
    setSigMode('idle');
    setSigPreview(seller.signature_base64 ?? null);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await updateSellerRecruit(seller.seller_name, form);
      if (sigPreview !== (seller.signature_base64 ?? null)) {
        await updateSellerSignature(seller.seller_name, sigPreview);
      }
      onSaved({ ...form, signature_base64: sigPreview });
      setEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* ── Fixed nav ─────────────────────────────────────────────────────── */}
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

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="px-4 pt-[88px] pb-12 max-w-lg mx-auto w-full">

          {/* Hero */}
          <div className="flex flex-col items-center pt-4 pb-8 gap-2">
            <div className="w-24 h-24 rounded-full bg-[#3A3A3C] border-[3px] border-white/30 shadow-2xl flex items-center justify-center mb-1">
              <span className="text-[32px] font-bold text-white tracking-tight">{initials}</span>
            </div>
            {form.seller_id && (
              <p className="text-[#6C6C70] text-[10px] font-semibold uppercase tracking-[0.16em]">{form.seller_id}</p>
            )}
            <p className="text-[#1C1C1E] text-[26px] font-bold text-center leading-tight">{form.seller_name}</p>
            {form.sales_team && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Users size={13} className="text-[#6C6C70] shrink-0" />
                <span className="text-[13px] text-[#3C3C43] font-medium">{form.sales_team}</span>
              </div>
            )}
            {form.seller_status && (
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full mt-0.5"
                style={form.seller_status === 'Active'
                  ? { background: 'rgba(52,199,89,0.15)', color: '#1A7F37' }
                  : { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }}>
                {form.seller_status}
              </span>
            )}
          </div>

          {error && <p className="text-xs text-red-300 bg-red-500/20 border border-red-400/20 px-3 py-2 rounded-xl mb-4">{error}</p>}

          <div className="space-y-4">

          {/* Seller Information */}
          <SectionCard title="Seller Information">
            <ERow label="Seller ID" icon={<Tag size={10} />}>
              <div className={readCls}>{fmt(form.seller_id)}</div>
            </ERow>
            <ERow label="Business Units" icon={<Building2 size={10} />}>
              {editMode
                ? <input className={inputCls} value={form.business_units ?? ''} onChange={e => set('business_units')(e.target.value)} />
                : <div className={readCls}>{fmt(form.business_units)}</div>}
            </ERow>
            <ERow label="Focus Project" icon={<Briefcase size={10} />}>
              <ESelect value={form.focus_project ?? ''} options={projects} onChange={set('focus_project')} disabled={!editMode} />
            </ERow>
            <ERow label="Seller Status" icon={<User size={10} />}>
              <ESelect value={form.seller_status ?? ''} options={SELLER_STATUS_OPTIONS} onChange={set('seller_status')} disabled={!editMode} />
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
            <ERow label="Last Name" icon={<User size={10} />}>
              {editMode
                ? <input className={inputCls} value={form.last_name ?? ''} onChange={e => set('last_name')(e.target.value)} />
                : <div className={readCls}>{fmt(form.last_name)}</div>}
            </ERow>
            <ERow label="Email Address" icon={<Mail size={10} />}>
              {editMode
                ? <input className={inputCls} type="email" inputMode="email" value={form.email_address ?? ''} onChange={e => set('email_address')(e.target.value)} />
                : <div className={readCls}>{fmt(form.email_address)}</div>}
            </ERow>
            <ERow label="Hired Date" icon={<Calendar size={10} />}>
              {editMode
                ? <input className={inputCls} type="date" value={form.hired_date ?? ''} onChange={e => set('hired_date')(e.target.value)} />
                : <div className={readCls}>{fmtDate(form.hired_date)}</div>}
            </ERow>
          </SectionCard>

          {/* Sales Hierarchy */}
          <SectionCard title="Sales Hierarchy">
            <ERow label="Position" icon={<Briefcase size={10} />}>
              <ESelect
                value={form.position_code ?? ''}
                options={POSITION_CODE_OPTIONS}
                onChange={v => setForm(f => ({ ...f, position_code: v || null, position_rank: POSITION_RANK_MAP[v] ?? f.position_rank }))}
                disabled={!editMode}
              />
            </ERow>
            <ERow label="Position Code" icon={<Tag size={10} />}>
              <div className={readCls}>{fmt(form.position_rank)}</div>
            </ERow>
            <ERow label="Sales Manager" icon={<User size={10} />}>
              <ESelect value={form.sales_manager ?? ''} options={smOptions} onChange={set('sales_manager')} disabled={!editMode} />
            </ERow>
            <ERow label="Sales Director" icon={<User size={10} />}>
              <ESelect value={form.sales_director ?? ''} options={sdOptions} onChange={set('sales_director')} disabled={!editMode} />
            </ERow>
            <ERow label="Sales Division Head" icon={<User size={10} />}>
              <ESelect value={form.sales_division_head ?? ''} options={sdhOptions} onChange={set('sales_division_head')} disabled={!editMode} />
            </ERow>
            <ERow label="Sales Head" icon={<User size={10} />}>
              <ESelect value={form.sales_head ?? ''} options={shOptions} onChange={set('sales_head')} disabled={!editMode} />
            </ERow>
            <ERow label="Sales Team" icon={<Users size={10} />}>
              {editMode
                ? <input className={inputCls} value={form.sales_team ?? ''} onChange={e => set('sales_team')(e.target.value)} />
                : <div className={readCls}>{fmt(form.sales_team)}</div>}
            </ERow>
          </SectionCard>

          {/* Payroll Information */}
          <SectionCard title="Payroll Information">
            <ERow label="Payroll Code">
              {editMode
                ? <input className={inputCls} value={form.payroll_code ?? ''} onChange={e => set('payroll_code')(e.target.value)} />
                : <div className={readCls}>{fmt(form.payroll_code)}</div>}
            </ERow>
            <ERow label="Payroll Account Number">
              {editMode
                ? <input className={inputCls} value={form.payroll_account_number ?? ''} onChange={e => set('payroll_account_number')(e.target.value)} />
                : <div className={readCls}>{fmt(form.payroll_account_number)}</div>}
            </ERow>
            <ERow label="VAT Registration Type">
              {editMode
                ? <input className={inputCls} value={form.vat_registration_type ?? ''} onChange={e => set('vat_registration_type')(e.target.value)} />
                : <div className={readCls}>{fmt(form.vat_registration_type)}</div>}
            </ERow>
            <ERow label="Tax Identification No.">
              {editMode
                ? <input className={inputCls} value={form.tin ?? ''} onChange={e => set('tin')(e.target.value)} />
                : <div className={readCls}>{fmt(form.tin)}</div>}
            </ERow>
            <ERow label="EWT/WT Rate">
              {editMode
                ? <input className={inputCls} value={form.ewt_rate ?? ''} onChange={e => set('ewt_rate')(e.target.value)} />
                : <div className={readCls}>{fmt(form.ewt_rate)}</div>}
            </ERow>
            <ERow label="BIR COR Address">
              {editMode
                ? <textarea className={`${inputCls} resize-none`} rows={3} value={form.bir_cor_address ?? ''} onChange={e => set('bir_cor_address')(e.target.value)} />
                : <div className={readCls}>{fmt(form.bir_cor_address)}</div>}
            </ERow>
          </SectionCard>

          {/* Seller Signature */}
          <SectionCard title="Seller Signature">
            {(() => {
              if (sigMode === 'draw') return (
                <div className="space-y-2">
                  <div className="relative rounded-2xl border-2 border-dashed border-[#C03D25]/40 overflow-hidden bg-white">
                    <canvas ref={sigCanvasRef} width={600} height={200} className="w-full touch-none" style={{ height: '160px' }} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => { const ctx = sigCanvasRef.current?.getContext('2d'); if (ctx && sigCanvasRef.current) ctx.clearRect(0, 0, sigCanvasRef.current.width, sigCanvasRef.current.height); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                      <RotateCcw size={13} /> Clear
                    </button>
                    <button type="button"
                      onClick={() => { const b64 = sigCanvasRef.current?.toDataURL('image/png') ?? ''; setSigPreview(b64); setSigMode('idle'); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1C1C1E] text-xs font-semibold text-white active:opacity-70">
                      <Check size={13} /> Use Signature
                    </button>
                    <button type="button" onClick={() => setSigMode('idle')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
              return (
                <div className="space-y-3">
                  {sigPreview ? (
                    <div className="rounded-2xl border border-black/[0.08] bg-white/60 p-3 flex items-center justify-center min-h-[100px]">
                      <img src={sigPreview} alt="Signature" className="max-h-[90px] object-contain" />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-black/[0.15] bg-white/40 p-4 flex items-center justify-center min-h-[72px]">
                      <p className="text-xs text-[#C7C7CC]">No signature on file</p>
                    </div>
                  )}
                  {editMode && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSigMode('draw')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                        <PenLine size={13} /> Draw
                      </button>
                      <button type="button" onClick={() => { setSigMode('upload'); sigFileRef.current?.click(); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                        <Upload size={13} /> Upload
                      </button>
                      {sigPreview && (
                        <button type="button" onClick={() => setSigPreview(null)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-500 active:opacity-70">
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleSigFile} />
                </div>
              );
            })()}
          </SectionCard>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Sheet ────────────────────────────────────────────────────────────────

const EMPTY_RECRUIT: SellerRecruitRecord = {
  seller_name: '', seller_id: null, position_code: null, position_rank: null,
  seller_status: null, first_name: null, middle_name: null, last_name: null,
  email_address: null, hired_date: null, business_units: null, focus_project: null,
  sales_manager: null, sales_director: null, sales_division_head: null,
  sales_head: null, sales_team: null, payroll_code: null,
  payroll_account_number: null, vat_registration_type: null, tin: null,
  ewt_rate: null, bir_cor_address: null, signature_base64: null,
};

function AddSheet({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: (rec: SellerRecruitRecord) => void;
}) {
  const [form,   setForm]   = useState<SellerRecruitRecord>(EMPTY_RECRUIT);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const [sigMode,    setSigMode]    = useState<'idle' | 'draw' | 'upload'>('idle');
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing   = useRef(false);
  const sigLastPos   = useRef<{ x: number; y: number } | null>(null);
  const sigFileRef   = useRef<HTMLInputElement>(null);

  const [projects,   setProjects]   = useState<string[]>([]);
  const [smOptions,  setSmOptions]  = useState<string[]>([]);
  const [sdOptions,  setSdOptions]  = useState<string[]>([]);
  const [sdhOptions, setSdhOptions] = useState<string[]>([]);
  const [shOptions,  setShOptions]  = useState<string[]>([]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
    fetchAllSalespersons().then(people => {
      setSmOptions( people.filter(p => p.position_rank === 'SM' ).map(p => p.seller_name));
      setSdOptions( people.filter(p => p.position_rank === 'SD' ).map(p => p.seller_name));
      setSdhOptions(people.filter(p => p.position_rank === 'SDH').map(p => p.seller_name));
      setShOptions( people.filter(p => p.position_rank === 'SH' ).map(p => p.seller_name));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (sigMode !== 'draw') return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    function getPos(e: TouchEvent | MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      if ('touches' in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      return { x: ((e as MouseEvent).clientX - rect.left) * scaleX, y: ((e as MouseEvent).clientY - rect.top) * scaleY };
    }
    function onStart(e: TouchEvent | MouseEvent) { sigDrawing.current = true; sigLastPos.current = getPos(e); }
    function onMove(e: TouchEvent | MouseEvent) {
      if (!sigDrawing.current) return;
      e.preventDefault();
      const ctx = canvas!.getContext('2d'); if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath(); ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y);
      ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1C1C1E'; ctx.lineWidth = 2.5;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      sigLastPos.current = pos;
    }
    function onStop() { sigDrawing.current = false; sigLastPos.current = null; }
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onStop);
    canvas.addEventListener('mouseleave', onStop);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onStop);
    return () => {
      canvas.removeEventListener('mousedown', onStart);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onStop);
      canvas.removeEventListener('mouseleave', onStop);
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onStop);
    };
  }, [sigMode]);

  function handleSigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setSigPreview(ev.target?.result as string); setSigMode('idle'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const set = (key: keyof SellerRecruitRecord) => (val: string) =>
    setForm(f => ({ ...f, [key]: val || null }));

  const initials = form.seller_name.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  async function handleSave() {
    if (!form.seller_name.trim()) { setError('Seller Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await addSellerRecruit(form);
      if (sigPreview) {
        try { await updateSellerSignature(form.seller_name, sigPreview); } catch {}
      }
      onAdded({ ...form, signature_base64: sigPreview });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* ── Fixed nav ─────────────────────────────────────────────────────── */}
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

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="px-4 pt-[88px] pb-12 max-w-lg mx-auto w-full">

          {/* Hero */}
          <div className="flex flex-col items-center pt-4 pb-8 gap-2">
            <div className="w-24 h-24 rounded-full bg-[#3A3A3C] border-[3px] border-white/30 shadow-2xl flex items-center justify-center mb-1">
              {initials
                ? <span className="text-[32px] font-bold text-white tracking-tight">{initials}</span>
                : <User size={32} className="text-white/60" />}
            </div>
            <p className="text-[#6C6C70] text-[10px] font-semibold uppercase tracking-[0.16em]">New Seller</p>
            <p className="text-[#1C1C1E] text-[22px] font-bold text-center leading-tight min-h-[28px]">
              {form.seller_name || <span className="text-[#C7C7CC] italic font-normal text-base">Enter name below</span>}
            </p>
          </div>

          {error && <p className="text-xs text-red-300 bg-red-500/20 border border-red-400/20 px-3 py-2 rounded-xl mb-4">{error}</p>}

          <div className="space-y-4">

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          {/* Seller Information */}
        <SectionCard title="Seller Information">
          <ERow label="Seller Name" icon={<User size={10} />}>
            <input className={inputCls} placeholder="Full name" value={form.seller_name}
              onChange={e => setForm(f => ({ ...f, seller_name: e.target.value }))} />
          </ERow>
          <ERow label="Seller Code" icon={<Tag size={10} />}>
            <div className={`${readCls} text-[#8E8E93] italic`}>Auto-generated</div>
          </ERow>
          <ERow label="Business Units" icon={<Building2 size={10} />}>
            <input className={inputCls} value={form.business_units ?? ''} onChange={e => set('business_units')(e.target.value)} />
          </ERow>
          <ERow label="Focus Project" icon={<Briefcase size={10} />}>
            <ESelect value={form.focus_project ?? ''} options={projects} onChange={set('focus_project')} />
          </ERow>
          <ERow label="Seller Status" icon={<User size={10} />}>
            <ESelect value={form.seller_status ?? ''} options={SELLER_STATUS_OPTIONS} onChange={set('seller_status')} />
          </ERow>
          <ERow label="First Name" icon={<User size={10} />}>
            <input className={inputCls} value={form.first_name ?? ''} onChange={e => set('first_name')(e.target.value)} />
          </ERow>
          <ERow label="Middle Name" icon={<User size={10} />}>
            <input className={inputCls} value={form.middle_name ?? ''} onChange={e => set('middle_name')(e.target.value)} />
          </ERow>
          <ERow label="Last Name" icon={<User size={10} />}>
            <input className={inputCls} value={form.last_name ?? ''} onChange={e => set('last_name')(e.target.value)} />
          </ERow>
          <ERow label="Email Address" icon={<Mail size={10} />}>
            <input className={inputCls} type="email" inputMode="email" value={form.email_address ?? ''} onChange={e => set('email_address')(e.target.value)} />
          </ERow>
          <ERow label="Hired Date" icon={<Calendar size={10} />}>
            <input className={inputCls} type="date" value={form.hired_date ?? ''} onChange={e => set('hired_date')(e.target.value)} />
          </ERow>
        </SectionCard>

        {/* Sales Hierarchy */}
        <SectionCard title="Sales Hierarchy">
          <ERow label="Position" icon={<Briefcase size={10} />}>
            <ESelect
              value={form.position_code ?? ''}
              options={POSITION_CODE_OPTIONS}
              onChange={v => setForm(f => ({ ...f, position_code: v || null, position_rank: POSITION_RANK_MAP[v] ?? null }))}
            />
          </ERow>
          <ERow label="Position Code" icon={<Tag size={10} />}>
            <div className={readCls}>{form.position_rank ?? '—'}</div>
          </ERow>
          <ERow label="Sales Manager" icon={<User size={10} />}>
            <ESelect value={form.sales_manager ?? ''} options={smOptions} onChange={set('sales_manager')} />
          </ERow>
          <ERow label="Sales Director" icon={<User size={10} />}>
            <ESelect value={form.sales_director ?? ''} options={sdOptions} onChange={set('sales_director')} />
          </ERow>
          <ERow label="Sales Division Head" icon={<User size={10} />}>
            <ESelect value={form.sales_division_head ?? ''} options={sdhOptions} onChange={set('sales_division_head')} />
          </ERow>
          <ERow label="Sales Head" icon={<User size={10} />}>
            <ESelect value={form.sales_head ?? ''} options={shOptions} onChange={set('sales_head')} />
          </ERow>
          <ERow label="Sales Team" icon={<Users size={10} />}>
            <input className={inputCls} value={form.sales_team ?? ''} onChange={e => set('sales_team')(e.target.value)} />
          </ERow>
        </SectionCard>

        {/* Payroll Information */}
        <SectionCard title="Payroll Information">
          <ERow label="Payroll Code">
            <input className={inputCls} value={form.payroll_code ?? ''} onChange={e => set('payroll_code')(e.target.value)} />
          </ERow>
          <ERow label="Payroll Account Number">
            <input className={inputCls} value={form.payroll_account_number ?? ''} onChange={e => set('payroll_account_number')(e.target.value)} />
          </ERow>
          <ERow label="VAT Registration Type">
            <input className={inputCls} value={form.vat_registration_type ?? ''} onChange={e => set('vat_registration_type')(e.target.value)} />
          </ERow>
          <ERow label="Tax Identification No.">
            <input className={inputCls} value={form.tin ?? ''} onChange={e => set('tin')(e.target.value)} />
          </ERow>
          <ERow label="EWT/WT Rate">
            <input className={inputCls} value={form.ewt_rate ?? ''} onChange={e => set('ewt_rate')(e.target.value)} />
          </ERow>
          <ERow label="BIR COR Address">
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.bir_cor_address ?? ''} onChange={e => set('bir_cor_address')(e.target.value)} />
          </ERow>
        </SectionCard>

        {/* Seller Signature */}
        <SectionCard title="Seller Signature (optional)">
          {sigMode === 'draw' ? (
            <div className="space-y-2">
              <div className="relative rounded-2xl border-2 border-dashed border-[#C03D25]/40 overflow-hidden bg-white">
                <canvas ref={sigCanvasRef} width={600} height={200} className="w-full touch-none" style={{ height: '160px' }} />
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { const ctx = sigCanvasRef.current?.getContext('2d'); if (ctx && sigCanvasRef.current) ctx.clearRect(0, 0, sigCanvasRef.current.width, sigCanvasRef.current.height); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                  <RotateCcw size={13} /> Clear
                </button>
                <button type="button"
                  onClick={() => { const b64 = sigCanvasRef.current?.toDataURL('image/png') ?? ''; setSigPreview(b64); setSigMode('idle'); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1C1C1E] text-xs font-semibold text-white active:opacity-70">
                  <Check size={13} /> Use Signature
                </button>
                <button type="button" onClick={() => setSigMode('idle')}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {sigPreview ? (
                <div className="rounded-2xl border border-black/[0.08] bg-white/60 p-3 flex items-center justify-center min-h-[100px]">
                  <img src={sigPreview} alt="Signature" className="max-h-[90px] object-contain" />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/[0.15] bg-white/40 p-4 flex items-center justify-center min-h-[72px]">
                  <p className="text-xs text-[#C7C7CC]">No signature added</p>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setSigMode('draw')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                  <PenLine size={13} /> Draw
                </button>
                <button type="button" onClick={() => { setSigMode('upload'); sigFileRef.current?.click(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                  <Upload size={13} /> Upload
                </button>
                {sigPreview && (
                  <button type="button" onClick={() => setSigPreview(null)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-500 active:opacity-70">
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
              <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleSigFile} />
            </div>
          )}
        </SectionCard>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SellerRecruitmentPage() {
  const [recruits,       setRecruits]       = useState<SellerRecruitRecord[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [positionFilter, setPositionFilter] = useState('');
  const [search,         setSearch]         = useState('');
  const [filterOpen,         setFilterOpen]         = useState(false);
  const [filterPositionOpen, setFilterPositionOpen] = useState(false);
  const [selected,       setSelected]       = useState<SellerRecruitRecord | null>(null);
  const [adding,         setAdding]         = useState(false);

  useEffect(() => {
    fetchAllSellerRecruits()
      .then(setRecruits)
      .finally(() => setLoading(false));
  }, []);

  const filtered = recruits.filter(r => {
    if (positionFilter && POSITION_RANK_LABELS[r.position_rank ?? ''] !== positionFilter) return false;
    if (search && !r.seller_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
  <>
    <PageShell title="Seller Recruitment">
      <div className="space-y-3 pb-6">

        {/* Search + Filter */}
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name…"
            />
          </div>
          <button
            type="button"
            onClick={() => { setFilterPositionOpen(false); setFilterOpen(true); }}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
              positionFilter
                ? 'bg-[#C03D25] text-white shadow-md'
                : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
            }`}>
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Users size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No recruits found</p>
            <p className="text-xs text-[#8E8E93] mt-1">
              {search || positionFilter ? 'Try adjusting your filters' : 'No records yet'}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <GlassCard
                key={r.seller_name}
                className="flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setSelected(r)}
              >
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
                  <span className="text-sm font-bold text-white">
                    {r.seller_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1C1C1E] truncate">{r.seller_name}</p>
                  <p className="text-xs text-[#8E8E93]">{r.sales_team ?? '—'}</p>
                </div>
                <PositionBadge rank={r.position_rank} />
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

    {/* Detail Sheet — rendered outside PageShell to avoid fixed positioning issues */}
    {selected && (
      <DetailSheet
        seller={selected}
        onClose={() => setSelected(null)}
        onSaved={(updated) => {
          setRecruits(prev => prev.map(r => r.seller_name === selected.seller_name ? updated : r));
          setSelected(updated);
        }}
      />
    )}

    {/* Add Sheet */}
    {adding && (
      <AddSheet
        onClose={() => setAdding(false)}
        onAdded={(rec) => {
          setRecruits(prev => [rec, ...prev]);
          setAdding(false);
        }}
      />
    )}

    {/* Filter sheet backdrop */}
    {filterOpen && (
      <div
        className="fixed inset-0 z-[45] bg-black/40"
        onClick={() => { setFilterOpen(false); setFilterPositionOpen(false); }}
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
          <button
            type="button"
            onClick={() => { setFilterOpen(false); setFilterPositionOpen(false); }}
            className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
            <X size={14} className="text-[#8E8E93]" />
          </button>
        </div>

        <div className="px-5 space-y-5 pb-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Position</p>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setFilterPositionOpen(p => !p)}
              onKeyDown={e => e.key === 'Enter' && setFilterPositionOpen(p => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer">
              <span className={`text-sm ${positionFilter ? 'text-[#1C1C1E] font-medium' : 'text-[#C7C7CC]'}`}>
                {positionFilter || 'Select position'}
              </span>
              {positionFilter
                ? <button type="button" onClick={e => { e.stopPropagation(); setPositionFilter(''); }}>
                    <X size={13} className="text-[#C7C7CC]" />
                  </button>
                : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${filterPositionOpen ? 'rotate-180' : ''}`} />
              }
            </div>
            {filterPositionOpen && (
              <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
                {POSITION_OPTIONS.map(p => (
                  <button key={p} type="button"
                    onClick={() => { setPositionFilter(p); setFilterPositionOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.04] last:border-0 text-left active:bg-gray-50 ${
                      positionFilter === p ? 'bg-[#C03D25]/5' : ''
                    }`}>
                    <span className={`text-sm ${positionFilter === p ? 'text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}>{p}</span>
                    {positionFilter === p && <Check size={13} className="text-[#C03D25] shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-10 pt-2 flex gap-3">
          <button
            type="button"
            onClick={() => setPositionFilter('')}
            className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
            Clear All
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(false)}
            className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
            Done
          </button>
        </div>

      </div>
    </div>
  </>
  );
}
