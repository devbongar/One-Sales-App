'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { Check, ChevronDown } from 'lucide-react';
import { InventoryUnit } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const RESERVATION_FEE   = 20_000;
const RETENTION_PCT     = 0.05;
const VAT_PCT           = 0.12;
const OTHER_CHARGES_PCT = 0.07;
const PT_DISC_SPOT      = 0.10;
const PT_DISC_DEFERRED  = 0.075;
const STRETCHED_TERM    = 27;

// ─── Saved Quotation type ─────────────────────────────────────────────────────
interface SavedQuotation {
  id: string;
  label: string;
  employeeDiscount: boolean;
  paytermScheme: string;
  deferredTerm: string;
  firstInAdvance: boolean;
  dpPct: string;
  euFinancing: string;
  indicativeRate: string;
  loanTerm: string;
  ageBased: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtM = (n: number) => '₱' + (n / 1_000_000).toFixed(2) + 'M';

function parsePeso(raw: string | null): number {
  if (!raw) return 0;
  return parseFloat(String(raw).replace(/[₱,\s]/g, '')) || 0;
}

function parseDiscPct(raw: string | null): number {
  if (!raw) return 0;
  return parseFloat(String(raw).replace('%', '')) / 100 || 0;
}

function addMonths(d: Date, m: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function bankAmort(p: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (!r || !n || !p) return 0;
  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function ssKey(unit: InventoryUnit) {
  return `quotations_${unit.inventory_code ?? unit.unit_no ?? 'unit'}`;
}

function loadQuotations(unit: InventoryUnit): SavedQuotation[] {
  try { return JSON.parse(sessionStorage.getItem(ssKey(unit)) ?? '[]'); }
  catch { return []; }
}

function saveQuotations(unit: InventoryUnit, list: SavedQuotation[]) {
  sessionStorage.setItem(ssKey(unit), JSON.stringify(list));
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider px-1">
      {children}
    </p>
  );
}

function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[#E8634A] text-[11px] font-bold uppercase tracking-wider px-1 pt-3 pb-0.5">
      {children}
    </p>
  );
}

function RowDivider() {
  return <div className="border-t-2 border-dashed border-black/[0.08] my-0.5" />;
}

function ReadOnlyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
      <span className="text-[#1C1C1E] text-sm font-medium w-36 shrink-0">{label}</span>
      <span className="flex-1 text-right text-sm text-[#1C1C1E] font-semibold truncate">{value ?? '—'}</span>
    </div>
  );
}

function ComputedRow({
  label, value, sub = false, bold = false, highlight = false,
}: {
  label: string; value: string; sub?: boolean; bold?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between py-2.5 px-1 border-b border-black/[0.06] last:border-0 gap-2">
      <span className={`text-sm leading-snug flex-1 ${sub ? 'text-[#6C6C70]' : 'text-[#1C1C1E] font-medium'}`}>
        {label}
      </span>
      <span className={`text-sm shrink-0 ${bold ? 'font-bold' : ''} ${highlight ? 'text-[#E8634A]' : 'text-[#1C1C1E]'}`}>
        {value}
      </span>
    </div>
  );
}

function CheckRow({
  label, checked, onChange, readOnly = false,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; readOnly?: boolean;
}) {
  const box = (
    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${
      checked ? 'bg-[#E8634A] border-[#E8634A]' : 'border-[#C7C7CC]'
    }`}>
      {checked && <Check size={11} className="text-white" />}
    </div>
  );

  if (readOnly) {
    return (
      <div className="flex items-start gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
        <span className="flex-1 text-[#1C1C1E] text-sm font-medium leading-snug">{label}</span>
        {box}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0 text-left"
    >
      <span className="flex-1 text-[#1C1C1E] text-sm font-medium leading-snug">{label}</span>
      {box}
    </button>
  );
}

function InlineSelect({
  label, value, options, onChange, disabled = false, placeholder = 'Select', readOnly = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  if (readOnly) {
    return <ReadOnlyRow label={label} value={selected?.label ?? null} />;
  }

  return (
    <div className={`border-b border-black/[0.06] last:border-0 ${disabled ? 'opacity-40' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 py-3 px-1"
      >
        <span className="text-[#1C1C1E] text-sm font-medium w-36 shrink-0 text-left">{label}</span>
        <span className={`flex-1 text-right text-sm truncate ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && options.length > 0 && (
        <div className="pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                o.value === value
                  ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold'
                  : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              {o.label}
              {o.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoanTermRow({
  value, onChange, ageBased, onAgeBasedChange, readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  ageBased: boolean;
  onAgeBasedChange: (v: boolean) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = [
    { value: '10', label: '10 Years' },
    { value: '15', label: '15 Years' },
    { value: '20', label: '20 Years' },
    ...(ageBased ? [{ value: '25', label: '25 Years' }] : []),
  ];
  const selected = options.find((o) => o.value === value);

  if (readOnly) {
    return (
      <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
        <span className="text-[#1C1C1E] text-sm font-medium w-24 shrink-0">Loan Term</span>
        {ageBased && (
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-4 h-4 rounded border-2 bg-[#E8634A] border-[#E8634A] flex items-center justify-center">
              <Check size={9} className="text-white" />
            </div>
            <span className="text-[#6C6C70] text-xs whitespace-nowrap">Age Based</span>
          </div>
        )}
        <span className="flex-1 text-right text-sm text-[#1C1C1E] font-medium">{selected?.label ?? '—'}</span>
      </div>
    );
  }

  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <div className="flex items-center gap-2 py-3 px-1">
        <span className="text-[#1C1C1E] text-sm font-medium w-24 shrink-0">Loan Term</span>
        <button
          type="button"
          onClick={() => { onAgeBasedChange(!ageBased); if (!ageBased === false && value === '25') onChange(''); }}
          className="flex items-center gap-1 shrink-0"
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
            ageBased ? 'bg-[#E8634A] border-[#E8634A]' : 'border-[#C7C7CC]'
          }`}>
            {ageBased && <Check size={9} className="text-white" />}
          </div>
          <span className="text-[#6C6C70] text-xs whitespace-nowrap">Age Based</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex-1 flex items-center justify-end gap-1"
        >
          <span className={`text-sm ${value ? 'text-[#1C1C1E] font-medium' : 'text-[#8E8E93]'}`}>
            {selected?.label ?? 'Select'}
          </span>
          <ChevronDown size={13} className={`text-[#C7C7CC] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="pb-2 space-y-0.5">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                o.value === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E] hover:bg-gray-50'
              }`}
            >
              {o.label}
              {o.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BankCalculator({
  balance, indicativeRate, setIndicativeRate, loanTerm, setLoanTerm,
  ageBased, setAgeBased, monthlyAmort, readOnly = false,
}: {
  balance: number;
  indicativeRate: string;
  setIndicativeRate: (v: string) => void;
  loanTerm: string;
  setLoanTerm: (v: string) => void;
  ageBased: boolean;
  setAgeBased: (v: boolean) => void;
  monthlyAmort: number;
  readOnly?: boolean;
}) {
  return (
    <>
      <RowDivider />
      <SubSectionTitle>Bank Amortization Calculator</SubSectionTitle>
      <ComputedRow label="Balance Amount" value={fmt(balance)} bold />
      <InlineSelect
        label="Indicative Interest"
        value={indicativeRate}
        options={[{ value: '5.5', label: '5.5%' }, { value: '6', label: '6%' }, { value: '7', label: '7%' }]}
        onChange={setIndicativeRate}
        placeholder="Select rate"
        readOnly={readOnly}
      />
      <LoanTermRow
        value={loanTerm}
        onChange={setLoanTerm}
        ageBased={ageBased}
        onAgeBasedChange={(v) => { setAgeBased(v); if (!v && loanTerm === '25') setLoanTerm(''); }}
        readOnly={readOnly}
      />
      <RowDivider />
      <ComputedRow
        label="Monthly Amortization"
        value={indicativeRate && loanTerm ? fmt(monthlyAmort) : '—'}
        bold highlight
      />
    </>
  );
}

function HDMFCalculator({ balance }: { balance: number }) {
  return (
    <>
      <RowDivider />
      <SubSectionTitle>HDMF Amortization Calculator</SubSectionTitle>
      <ComputedRow label="Balance Amount" value={fmt(balance)} bold />
    </>
  );
}

// View Quotations dropdown
function ViewQuotationsDropdown({
  quotations, activeId, onSelect,
}: {
  quotations: SavedQuotation[];
  activeId: string;
  onSelect: (q: SavedQuotation) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = quotations.find((q) => q.id === activeId);

  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 py-3 px-1"
      >
        <span className="text-[#1C1C1E] text-sm font-medium w-36 shrink-0 text-left">View Quotations</span>
        <span className={`flex-1 text-right text-sm truncate ${active ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
          {active ? active.label : `${quotations.length} saved`}
        </span>
        <ChevronDown
          size={14}
          className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-2 space-y-0.5 max-h-56 overflow-y-auto">
          {quotations.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => { onSelect(q); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                q.id === activeId
                  ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold'
                  : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              {q.label}
              {q.id === activeId && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const DP_OPTIONS = ['15', '20', '25', '30', '35', '40', '45', '50'].map((v) => ({ value: v, label: `${v}%` }));
const FINANCING_OPTIONS = [
  { value: 'cash', label: 'Cash Payment' },
  { value: 'bank', label: 'Bank' },
  { value: 'hdmf', label: 'HDMF' },
];
const SCHEME_LABELS: Record<string, string> = {
  spot_cash: 'Spot Cash',
  deferred_cash: 'Deferred Cash',
  spot_dp: 'Spot DP',
  stretched_dp: 'Stretched DP',
};

export default function QuotationPage() {
  const router = useRouter();
  const [unit, setUnit] = useState<InventoryUnit | null>(null);

  const [employeeDiscount, setEmployeeDiscount] = useState(false);
  const [paytermScheme,    setPaytermScheme]    = useState('');
  const [deferredTerm,     setDeferredTerm]     = useState('');
  const [firstInAdvance,   setFirstInAdvance]   = useState(false);
  const [dpPct,            setDpPct]            = useState('');
  const [euFinancing,      setEuFinancing]      = useState('');
  const [indicativeRate,   setIndicativeRate]   = useState('');
  const [loanTerm,         setLoanTerm]         = useState('');
  const [ageBased,         setAgeBased]         = useState(false);

  // Saved quotations & view mode
  const [savedQuotations, setSavedQuotations] = useState<SavedQuotation[]>([]);
  const [viewMode,         setViewMode]        = useState(false);
  const [activeId,         setActiveId]        = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedUnit');
    if (raw) {
      try {
        const u = JSON.parse(raw) as InventoryUnit;
        setUnit(u);
        setSavedQuotations(loadQuotations(u));
      } catch { router.back(); }
    } else {
      router.back();
    }
  }, [router]);

  const today = useMemo(() => new Date(), []);

  const C = useMemo(() => {
    if (!unit) return null;

    const listPrice  = parsePeso(unit.total_list_price);
    const promoPct   = parseDiscPct(unit.promo_discount);
    const promoAmt   = listPrice * promoPct;

    const ptPct =
      paytermScheme === 'spot_cash'     ? PT_DISC_SPOT    :
      paytermScheme === 'deferred_cash' ? PT_DISC_DEFERRED : 0;
    const ptAmt      = listPrice * ptPct;

    const discounted = listPrice - promoAmt - ptAmt;
    const vat        = discounted * VAT_PCT;
    const other      = discounted * OTHER_CHARGES_PCT;
    const tcp        = discounted + vat + other;
    const retention  = tcp * RETENTION_PCT;

    const dpPercent  = parseFloat(dpPct) / 100 || 0;
    const dpAmount   = tcp * dpPercent;
    const netDP      = dpAmount - RESERVATION_FEE;
    const balance    = tcp - dpAmount;
    const monthlyDP  = netDP > 0 ? netDP / STRETCHED_TERM : 0;

    const dcTerm     = parseInt(deferredTerm) || 12;
    const netDC      = tcp - RESERVATION_FEE - retention;
    const monthlyDC  = netDC / dcTerm;
    const netSC      = tcp - RESERVATION_FEE - retention;

    const rate       = parseFloat(indicativeRate) / 100 || 0;
    const years      = parseInt(loanTerm) || 0;
    const monthlyA   = bankAmort(balance, rate, years);

    const dueDate    = fmtDate(addMonths(today, 1));
    const dcFrom     = firstInAdvance ? today : addMonths(today, 1);
    const strFrom    = firstInAdvance ? today : addMonths(today, 1);

    return {
      listPrice, promoPct, promoAmt, ptPct, ptAmt,
      discounted, vat, other, tcp, retention,
      dpAmount, netDP, balance,
      monthlyDP, monthlyDC, netDC, netSC, monthlyA,
      dueDate,
      dcFrom: fmtDate(dcFrom),
      dcTo:   fmtDate(addMonths(dcFrom, dcTerm - 1)),
      strFrom: fmtDate(strFrom),
      strTo:   fmtDate(addMonths(strFrom, STRETCHED_TERM - 1)),
    };
  }, [unit, paytermScheme, deferredTerm, dpPct, firstInAdvance, indicativeRate, loanTerm, today]);

  if (!unit || !C) return null;

  function resetSchemeFields() {
    setDeferredTerm(''); setFirstInAdvance(false);
    setDpPct(''); setEuFinancing('');
    setIndicativeRate(''); setLoanTerm(''); setAgeBased(false);
  }

  function handleSave() {
    if (!paytermScheme) return;
    const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const suffix = dpPct ? ` ${dpPct}%` : deferredTerm ? ` ${deferredTerm}mo` : '';
    const label = `${SCHEME_LABELS[paytermScheme] ?? paytermScheme}${suffix} · ${fmtM(C.tcp)} · ${time}`;
    const q: SavedQuotation = {
      id: Date.now().toString(),
      label,
      employeeDiscount, paytermScheme, deferredTerm, firstInAdvance,
      dpPct, euFinancing, indicativeRate, loanTerm, ageBased,
    };
    const updated = [...savedQuotations, q];
    setSavedQuotations(updated);
    saveQuotations(unit, updated);
    // Enter view mode for the just-saved quotation
    setActiveId(q.id);
    setViewMode(true);
  }

  function handleSelectQuotation(q: SavedQuotation) {
    setEmployeeDiscount(q.employeeDiscount);
    setPaytermScheme(q.paytermScheme);
    setDeferredTerm(q.deferredTerm);
    setFirstInAdvance(q.firstInAdvance);
    setDpPct(q.dpPct);
    setEuFinancing(q.euFinancing);
    setIndicativeRate(q.indicativeRate);
    setLoanTerm(q.loanTerm);
    setAgeBased(q.ageBased);
    setActiveId(q.id);
    setViewMode(true);
  }

  function handleNewQuotation() {
    setEmployeeDiscount(false);
    setPaytermScheme('');
    resetSchemeFields();
    setViewMode(false);
    setActiveId('');
  }

  const ro = viewMode;
  const promoPctLabel = C.promoPct > 0 ? `${Math.round(C.promoPct * 100)}` : null;
  const hasDp = !!dpPct;
  const hasDC = !!deferredTerm;

  const bankProps = {
    balance: C.balance,
    indicativeRate, setIndicativeRate,
    loanTerm, setLoanTerm,
    ageBased, setAgeBased,
    monthlyAmort: C.monthlyA,
    readOnly: ro,
  };

  return (
    <PageShell title="Quotation" backButton>

      {/* ── Section 1 ── */}
      <SectionHeader>Section 1 — Project Information</SectionHeader>
      <GlassCard className="px-4 py-1">
        <ReadOnlyRow label="Project Name"   value={unit.project_name} />
        <ReadOnlyRow label="Inventory Code" value={unit.inventory_code} />
      </GlassCard>

      {/* ── Section 2 ── */}
      <SectionHeader>Section 2 — Purchase Price Computation</SectionHeader>
      <GlassCard className="px-4 py-1">
        <CheckRow label="Employee Discount" checked={employeeDiscount} onChange={setEmployeeDiscount} readOnly={ro} />
        <InlineSelect
          label="Payterm Scheme"
          value={paytermScheme}
          options={[
            { value: 'spot_cash',     label: 'Spot Cash'     },
            { value: 'deferred_cash', label: 'Deferred Cash' },
            { value: 'spot_dp',       label: 'Spot DP'       },
            { value: 'stretched_dp',  label: 'Stretched DP'  },
          ]}
          onChange={(v) => { setPaytermScheme(v); resetSchemeFields(); }}
          placeholder="Select payterm"
          readOnly={ro}
        />
        <ComputedRow label="Reservation Fee" value={fmt(RESERVATION_FEE)} />
      </GlassCard>

      {/* ── Spot Cash ── */}
      {paytermScheme === 'spot_cash' && (
        <GlassCard className="px-4 py-1">
          <ComputedRow label="Due Date" value={C.dueDate} />
          <RowDivider />
          <ComputedRow label="List Price" value={fmt(C.listPrice)} />
          {promoPctLabel && <ComputedRow label={`(-) Promo Discount (${promoPctLabel}%)`} value={`- ${fmt(C.promoAmt)}`} sub />}
          <ComputedRow label={`(-) Payment Term Discount (${Math.round(C.ptPct * 100)}%)`} value={`- ${fmt(C.ptAmt)}`} sub />
          <RowDivider />
          <ComputedRow label="Discounted Price"    value={fmt(C.discounted)} bold />
          <ComputedRow label="VAT (12%)"            value={fmt(C.vat)} sub />
          <ComputedRow label="Other Charges (7%)"   value={fmt(C.other)} sub />
          <RowDivider />
          <ComputedRow label="Total Contract Price" value={fmt(C.tcp)} bold highlight />
          <ComputedRow label="(-) Reservation Fee"  value={`- ${fmt(RESERVATION_FEE)}`} sub />
          <ComputedRow label="(-) Retention"        value={`- ${fmt(C.retention)}`} sub />
          <RowDivider />
          <ComputedRow label="Net Spot Cash" value={fmt(C.netSC)} bold highlight />
        </GlassCard>
      )}

      {/* ── Deferred Cash ── */}
      {paytermScheme === 'deferred_cash' && (
        <GlassCard className="px-4 py-1">
          <ComputedRow label="Monthly Due Amount" value={hasDC ? fmt(C.monthlyDC) : '—'} bold highlight />
          <InlineSelect label="Term" value={deferredTerm}
            options={[{ value: '12', label: '12 Months' }, { value: '27', label: '27 Months' }]}
            onChange={setDeferredTerm} placeholder="Select term" readOnly={ro} />
          <CheckRow label="The buyer agrees to pay the first deferred cash in advance"
            checked={firstInAdvance} onChange={setFirstInAdvance} readOnly={ro} />
          <ComputedRow label="Monthly Due (From)" value={C.dcFrom} />
          <ComputedRow label="Monthly Due (To)"   value={hasDC ? C.dcTo : '—'} />
          <RowDivider />
          <ComputedRow label="List Price" value={fmt(C.listPrice)} />
          {promoPctLabel && <ComputedRow label={`(-) Promo Discount (${promoPctLabel}%)`} value={`- ${fmt(C.promoAmt)}`} sub />}
          <ComputedRow label={`(-) Payment Term Discount (${Math.round(C.ptPct * 100)}%)`} value={`- ${fmt(C.ptAmt)}`} sub />
          <RowDivider />
          <ComputedRow label="Discounted Price"    value={fmt(C.discounted)} bold />
          <ComputedRow label="VAT (12%)"            value={fmt(C.vat)} sub />
          <ComputedRow label="Other Charges (7%)"   value={fmt(C.other)} sub />
          <RowDivider />
          <ComputedRow label="Total Contract Price" value={fmt(C.tcp)} bold highlight />
          <ComputedRow label="(-) Reservation Fee"  value={`- ${fmt(RESERVATION_FEE)}`} sub />
          <ComputedRow label="(-) Retention"        value={`- ${fmt(C.retention)}`} sub />
          <RowDivider />
          <ComputedRow label="Net Deferred Cash" value={fmt(C.netDC)} bold highlight />
        </GlassCard>
      )}

      {/* ── Spot DP ── */}
      {paytermScheme === 'spot_dp' && (
        <GlassCard className="px-4 py-1">
          <InlineSelect label="Downpayment (%)" value={dpPct} options={DP_OPTIONS}
            onChange={setDpPct} placeholder="Select DP %" readOnly={ro} />
          <ComputedRow label="Net Downpayment Amount" value={hasDp ? fmt(C.netDP) : '—'} bold highlight />
          <ComputedRow label="Due Date" value={C.dueDate} />
          <CheckRow label="The buyer agrees to pay the first deferred cash in advance"
            checked={firstInAdvance} onChange={setFirstInAdvance} readOnly={ro} />
          <RowDivider />
          <ComputedRow label="List Price" value={fmt(C.listPrice)} />
          {promoPctLabel && <ComputedRow label={`(-) Promo Discount (${promoPctLabel}%)`} value={`- ${fmt(C.promoAmt)}`} sub />}
          <RowDivider />
          <ComputedRow label="Discounted Price"    value={fmt(C.discounted)} bold />
          <ComputedRow label="VAT (12%)"            value={fmt(C.vat)} sub />
          <ComputedRow label="Other Charges (7%)"   value={fmt(C.other)} sub />
          <RowDivider />
          <ComputedRow label="Total Contract Price" value={fmt(C.tcp)} bold highlight />
          <ComputedRow label="Downpayment Amount"   value={hasDp ? fmt(C.dpAmount) : '—'} />
          <InlineSelect label="End-User Financing" value={euFinancing} options={FINANCING_OPTIONS}
            onChange={setEuFinancing} placeholder="Select financing" readOnly={ro} />
          {euFinancing === 'bank' && <BankCalculator {...bankProps} />}
          {euFinancing === 'hdmf' && <HDMFCalculator balance={C.balance} />}
        </GlassCard>
      )}

      {/* ── Stretched DP ── */}
      {paytermScheme === 'stretched_dp' && (
        <GlassCard className="px-4 py-1">
          <ComputedRow label="Monthly Due Amount" value={hasDp ? fmt(C.monthlyDP) : '—'} bold highlight />
          <InlineSelect label="Downpayment (%)" value={dpPct} options={DP_OPTIONS}
            onChange={setDpPct} placeholder="Select DP %" readOnly={ro} />
          <ComputedRow label="Net Downpayment Amount" value={hasDp ? fmt(C.netDP) : '—'} />
          <InlineSelect label="Term" value="27" options={[{ value: '27', label: '27 Months' }]}
            onChange={() => {}} readOnly={ro} />
          <CheckRow label="The buyer agrees to pay the first deferred cash in advance"
            checked={firstInAdvance} onChange={setFirstInAdvance} readOnly={ro} />
          <RowDivider />
          <ComputedRow label="Monthly Due (From)" value={C.strFrom} />
          <ComputedRow label="Monthly Due (To)"   value={C.strTo} />
          <RowDivider />
          <ComputedRow label="List Price" value={fmt(C.listPrice)} />
          {promoPctLabel && <ComputedRow label={`(-) Promo Discount (${promoPctLabel}%)`} value={`- ${fmt(C.promoAmt)}`} sub />}
          <RowDivider />
          <ComputedRow label="Discounted Price"    value={fmt(C.discounted)} bold />
          <ComputedRow label="VAT (12%)"            value={fmt(C.vat)} sub />
          <ComputedRow label="Other Charges (7%)"   value={fmt(C.other)} sub />
          <RowDivider />
          <ComputedRow label="Total Contract Price" value={fmt(C.tcp)} bold highlight />
          <ComputedRow label="Downpayment Amount"   value={hasDp ? fmt(C.dpAmount) : '—'} />
          <InlineSelect label="End-User Financing" value={euFinancing} options={FINANCING_OPTIONS}
            onChange={setEuFinancing} placeholder="Select financing" readOnly={ro} />
          {euFinancing === 'bank' && <BankCalculator {...bankProps} />}
          {euFinancing === 'hdmf' && <HDMFCalculator balance={C.balance} />}
        </GlassCard>
      )}

      {/* ── Save / New button ── */}
      {viewMode ? (
        <GlassButton variant="ghost" size="lg" onClick={handleNewQuotation}>
          + New Quotation
        </GlassButton>
      ) : (
        <GlassButton variant="primary" size="lg" onClick={handleSave} disabled={!paytermScheme}>
          Save Quotation
        </GlassButton>
      )}

      {/* ── View Quotations dropdown ── */}
      {savedQuotations.length > 0 && (
        <GlassCard className="px-4 py-1">
          <ViewQuotationsDropdown
            quotations={savedQuotations}
            activeId={activeId}
            onSelect={handleSelectQuotation}
          />
        </GlassCard>
      )}

    </PageShell>
  );
}
