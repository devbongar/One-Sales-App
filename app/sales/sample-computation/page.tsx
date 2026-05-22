'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { fetchProjects, fetchTowers, fetchFloors, fetchFloorsByCategory, fetchUnitTypes, fetchInventoryUnits, InventoryUnit } from '@/lib/inventory';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import {
  Check, ChevronDown, Calculator,
  User, Phone, Mail, Briefcase,
  Users, UserCog, UserCheck, UserPlus,
  Building2, Layers, Home, Car, Bike, LayoutGrid,
  BarChart3, Grid3X3,
  Banknote, Clock, CreditCard, CalendarRange, Plus, Ruler, X, GitCompare, AlertTriangle,
} from 'lucide-react';

// ─── Payment Schemes ──────────────────────────────────────────────────────────
const PAYMENT_SCHEMES = [
  { value: 'spot_cash',     label: 'Spot Cash',      icon: <Banknote size={18} /> },
  { value: 'deferred_cash', label: 'Deferred Cash',  icon: <Clock size={18} /> },
  { value: 'spot_dp',       label: 'Spot DP',        icon: <CreditCard size={18} /> },
  { value: 'stretched_dp',  label: 'Stretched DP',   icon: <CalendarRange size={18} /> },
] as const;
type PaymentScheme = typeof PAYMENT_SCHEMES[number]['value'];

const PAYTERM_RATES: Record<PaymentScheme, number> = {
  spot_cash:     0.10,
  deferred_cash: 0.00,
  spot_dp:       0.05,
  stretched_dp:  0.00,
};

const SPOT_DP_DISCOUNTS: Record<string, number> = {
  '15%': 0.015, '20%': 0.02,  '25%': 0.02,  '30%': 0.03,
  '35%': 0.03,  '40%': 0.05,  '45%': 0.05,  '50%': 0.07,
  '55%': 0.07,  '60%': 0.07,  '65%': 0.07,  '70%': 0.07,
  '75%': 0.07,  '80%': 0.07,
};
const STRETCHED_DP_DISCOUNTS: Record<string, number> = {
  '15%': 0.000, '20%': 0.000, '25%': 0.000, '30%': 0.015,
  '35%': 0.015, '40%': 0.03,  '45%': 0.03,  '50%': 0.035,
  '55%': 0.035, '60%': 0.04,  '65%': 0.04,  '70%': 0.05,
  '75%': 0.05,  '80%': 0.06,
};
const SPOT_DP_RATE_OPTIONS = Object.keys(SPOT_DP_DISCOUNTS);

const RESERVATION_FEE = 25_000;
const RETENTION_FEE   = 50_000;
const VAT_RATE        = 0.12;
const OTHER_CHARGES_RATE = 0.07;
const EMPLOYEE_DISCOUNT_RATE = 0.10;

function calcMonthlyAmort(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  return Math.round(principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

// ─── Unit Categories (hardcoded, not from DB) ─────────────────────────────────
const UNIT_CATEGORIES = [
  { value: 'Residential',   label: 'Residential',   icon: <Home  size={16} /> },
  { value: 'Car Parking',   label: 'Car Parking',   icon: <Car   size={16} /> },
  { value: 'Motorcycle Parking', label: 'Motor Parking',      icon: <Bike  size={16} /> },
] as const;
type UnitCategory = typeof UNIT_CATEGORIES[number]['value'] | '';


// ─── Comparison types ─────────────────────────────────────────────────────────
interface ComparisonItem {
  id: string;
  project: string; tower: string; floor: string; unitNo: string;
  inventoryCode: string | null;
  unitType: string; unitArea: number; unitCategory: string;
  paymentScheme: PaymentScheme; schemeName: string;
  dpRate: string; paymentTerm: string; termMonths: number;
  listPrice: number; promoAmount: number; promoPct: number;
  employeeAmount: number;
  paytermAmount: number; paytermPctDisplay: number;
  netListPrice: number; vat: number; otherCharges: number;
  totalContractPrice: number; netAmount: number;
  monthlyDeferred: number; dpAmount: number; netSpotDP: number;
  balanceForFinancing: number; monthlyStretchedDP: number;
  bankMonthly: number; hdmfMonthly: number;
}

type CompRow = { label: string; value: (c: ComparisonItem) => string; bold?: boolean; coral?: boolean; green?: boolean; };

const COMP_SECTIONS: { title: string; rows: CompRow[] }[] = [
  { title: 'Unit Info', rows: [
    { label: 'Unit',     value: c => `${c.floor}${c.unitNo}` },
    { label: 'Tower',    value: c => c.tower },
    { label: 'Floor',    value: c => c.floor },
    { label: 'Type',     value: c => c.unitType || '—' },
    { label: 'Area',     value: c => `${c.unitArea} sqm` },
    { label: 'Category', value: c => c.unitCategory },
    { label: 'Scheme',   value: c => c.schemeName },
  ]},
  { title: 'Price Computation', rows: [
    { label: 'List Price',    value: c => `₱${c.listPrice.toLocaleString()}` },
    { label: 'Promo Disc.',     value: c => c.promoAmount > 0    ? `(₱${c.promoAmount.toLocaleString()})` : '—', green: true },
    { label: 'Employee Disc.', value: c => c.employeeAmount > 0 ? `(₱${c.employeeAmount.toLocaleString()})` : '—', green: true },
    { label: 'Payterm Disc.',  value: c => c.paytermAmount > 0  ? `(₱${c.paytermAmount.toLocaleString()})` : '—', green: true },
    { label: 'Net List Price',value: c => `₱${c.netListPrice.toLocaleString()}`, bold: true },
  ]},
  { title: 'Taxes & Charges', rows: [
    { label: 'VAT (12%)',       value: c => `₱${c.vat.toLocaleString()}` },
    { label: 'Other (7%)',      value: c => `₱${c.otherCharges.toLocaleString()}` },
    { label: 'Total Contract',  value: c => `₱${c.totalContractPrice.toLocaleString()}`, bold: true, coral: true },
  ]},
  { title: 'Fees', rows: [
    { label: 'Reservation', value: c => `₱${(25_000).toLocaleString()}` },
    { label: 'Retention',   value: c => ['spot_cash','deferred_cash'].includes(c.paymentScheme) ? `₱${(50_000).toLocaleString()}` : '—' },
  ]},
  { title: 'Payment Summary', rows: [
    { label: 'DP Amount',    value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.dpAmount.toLocaleString()}` : '—' },
    { label: 'Net Amount',   value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.netSpotDP.toLocaleString()}` : `₱${c.netAmount.toLocaleString()}`, bold: true },
    { label: 'Monthly DP',   value: c => c.paymentScheme === 'stretched_dp' ? `₱${c.monthlyStretchedDP.toLocaleString()}/mo` : '—', coral: true, bold: true },
    { label: 'Monthly Def.', value: c => c.paymentScheme === 'deferred_cash' ? `₱${c.monthlyDeferred.toLocaleString()}/mo (${c.termMonths} mo)` : '—', coral: true, bold: true },
    { label: 'Balance',      value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.balanceForFinancing.toLocaleString()}` : '—' },
  ]},
  { title: 'Financing', rows: [
    { label: 'Bank/mo',  value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.bankMonthly.toLocaleString()}` : '—' },
    { label: 'HDMF/mo',  value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.hdmfMonthly.toLocaleString()}` : '—' },
  ]},
];

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Client Info',  icon: <User       size={14} /> },
  { label: 'Inventory',    icon: <Building2  size={14} /> },
  { label: 'Computation',  icon: <Calculator size={14} /> },
  { label: 'Comparison',   icon: <GitCompare size={14} /> },
];

function StepIndicator({ current, onNavigate, hasComparisons }: { current: number; onNavigate: (step: number) => void; hasComparisons: boolean }) {
  return (
    <div className="flex items-center justify-between px-1">
      {STEPS.map(({ label, icon }, i) => {
        const done      = i < current;
        const active    = i === current;
        const clickable = hasComparisons ? i !== current : done; // all steps if comparisons exist, else only done
        return (
          <div key={label} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              {/* Left line */}
              <div className={`flex-1 h-0.5 ${i === 0 ? 'opacity-0' : done || active ? 'bg-[#E8634A]' : 'bg-[#E5E5EA]'}`} />
              {/* Circle */}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onNavigate(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-200 ${
                  done   ? 'bg-[#E8634A] border-[#E8634A] shadow-[0_2px_8px_rgba(232,99,74,0.35)] active:opacity-70' :
                  active ? 'bg-white border-[#E8634A] shadow-[0_2px_8px_rgba(232,99,74,0.25)]' :
                           'bg-white border-[#E5E5EA]'
                } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {done
                  ? <Check size={14} className="text-white" />
                  : <span className={active ? 'text-[#E8634A]' : 'text-[#C7C7CC]'}>{icon}</span>
                }
              </button>
              {/* Right line */}
              <div className={`flex-1 h-0.5 ${i === STEPS.length - 1 ? 'opacity-0' : done ? 'bg-[#E8634A]' : 'bg-[#E5E5EA]'}`} />
            </div>
            <span className={`text-[10px] mt-1.5 font-semibold text-center leading-tight ${active ? 'text-[#E8634A]' : done ? 'text-[#6C6C70]' : 'text-[#C7C7CC]'}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Reusable form components ─────────────────────────────────────────────────
function InputRow({ label, value, onChange, placeholder, type = 'text', icon, error, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; icon?: React.ReactNode; error?: string; required?: boolean;
}) {
  return (
    <div className={`border-b border-black/[0.06] last:border-0 ${error ? 'bg-red-50/50' : ''}`}>
      <div className="flex items-center gap-3 py-3 px-1">
        {icon && <span className={`shrink-0 ${error ? 'text-red-400' : 'text-[#E8634A]'}`}>{icon}</span>}
        <span className="text-[#1C1C1E] text-sm font-medium flex-1 shrink-0 flex items-center gap-0.5">
          {label}
          {required && <span className="text-[#E8634A] text-xs leading-none">*</span>}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? ''}
          className="text-right text-sm text-[#1C1C1E] bg-transparent outline-none placeholder:text-[#C7C7CC] w-40"
        />
      </div>
      {error && <p className="text-red-400 text-[11px] px-1 pb-2 -mt-1">{error}</p>}
    </div>
  );
}

function PhoneInputRow({ value, onChange, error }: {
  value: string; onChange: (v: string) => void; error?: string;
}) {
  const rawDigits = value.replace(/^\+63/, '').replace(/\D/g, '').slice(0, 10);

  function fmt(d: string): string {
    if (d.length === 0) return '';
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }

  function handleInput(raw: string) {
    const clean = raw.replace(/\D/g, '').slice(0, 10);
    onChange(clean.length > 0 ? `+63${clean}` : '');
  }

  return (
    <div className={`border-b border-black/[0.06] last:border-0 ${error ? 'bg-red-50/50' : ''}`}>
      <div className="flex items-center gap-3 py-3 px-1">
        <span className={`shrink-0 ${error ? 'text-red-400' : 'text-[#E8634A]'}`}><Phone size={16} /></span>
        <span className="text-[#1C1C1E] text-sm font-medium flex-1 flex items-center gap-0.5">
          Contact Number
          <span className="text-[#E8634A] text-xs leading-none">*</span>
        </span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold shrink-0 text-[#6C6C70]">+63</span>
          <input
            type="tel"
            inputMode="numeric"
            value={fmt(rawDigits)}
            onChange={(e) => handleInput(e.target.value)}
            placeholder=""
            className="text-right text-sm text-[#1C1C1E] bg-transparent outline-none w-28"
          />
        </div>
      </div>
      {error && <p className="text-red-400 text-[11px] px-1 pb-2 -mt-1">{error}</p>}
    </div>
  );
}

function CheckRow({ label, checked, onChange, icon }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0 text-left"
    >
      {icon && <span className="text-[#E8634A] shrink-0">{icon}</span>}
      <span className="flex-1 text-[#1C1C1E] text-sm font-medium">{label}</span>
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
        checked ? 'bg-[#E8634A] border-[#E8634A]' : 'border-[#C7C7CC]'
      }`}>
        {checked && <Check size={11} className="text-white" />}
      </div>
    </button>
  );
}

function InlineSelect({ label, value, options, onChange, placeholder = 'Select', disabled = false, icon, required, error }: {
  label: string; value: string;
  options: string[]; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; icon?: React.ReactNode;
  required?: boolean; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Scroll to selected option when dropdown opens
    if (open && value && selectedRef.current) {
      setTimeout(() => {
        selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
  }, [open, value]);

  return (
    <div className={`border-b border-black/[0.06] last:border-0 ${disabled ? 'opacity-40' : ''} ${error ? 'bg-red-50/50' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 py-3 px-1"
      >
        {icon && <span className={`shrink-0 ${error ? 'text-red-400' : 'text-[#E8634A]'}`}>{icon}</span>}
        <span className="text-[#1C1C1E] text-sm font-medium flex-1 text-left flex items-center gap-0.5">
          {label}
          {required && <span className="text-[#E8634A] text-xs leading-none">*</span>}
        </span>
        <span className={`text-right text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && options.length > 0 && (
        <div className="pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o}
              ref={o === value ? selectedRef : null}
              type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                o === value
                  ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold'
                  : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              {o}
              {o === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-red-400 text-[11px] px-1 pb-2 -mt-1">{error}</p>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {icon && <span className="text-[#E8634A]">{icon}</span>}
      <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider">
        {children}
      </p>
    </div>
  );
}

// ─── Per-step header config ───────────────────────────────────────────────────
const STEP_HEADERS = [
  { title: 'Generate Sample Computation',  subtitle: 'Step-by-step price computation' },
  { title: 'Select Your Preferences',      subtitle: 'Choose a Project, Tower, and Unit Category to load the inventory data' },
  { title: 'Computation',                  subtitle: 'Review the price breakdown' },
  { title: 'Comparison',                   subtitle: 'Compare different payment schemes' },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SampleComputationPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [reservationTarget, setReservationTarget] = useState<ComparisonItem | null>(null);

  // Client Info
  const [fullName,    setFullName]    = useState('');
  const [contact,     setContact]     = useState('');
  const [email,       setEmail]       = useState('');
  const [isMegawide,  setIsMegawide]  = useState(false);

  // Seller Info
  const [sellerSearch,  setSellerSearch]  = useState('');
  const [sellerRecord,  setSellerRecord]  = useState<SalespersonRecord | null>(null);
  const [sellerDropdownOpen, setSellerDropdownOpen] = useState(false);

  // Inventory preferences
  const [project,      setProject]      = useState('');
  const [tower,        setTower]        = useState('');
  const [floor,        setFloor]        = useState('');
  const [unitCategory, setUnitCategory] = useState<UnitCategory>('');
  const [unitType,     setUnitType]     = useState('');
  const [viewMode,     setViewMode]     = useState<'chart' | 'grid'>('chart');
  const [selectedUnit, setSelectedUnit] = useState<InventoryUnit | null>(null);
  const [paymentScheme, setPaymentScheme] = useState<PaymentScheme>('spot_cash');
  const [paymentTerm, setPaymentTerm] = useState<string>('12 months');
  const [dpRate,       setDpRate]       = useState<string>('15%');
  const [comparisons,  setComparisons]  = useState<ComparisonItem[]>([]);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const compHeaderRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Equalize comparison card header heights to the tallest one
  useLayoutEffect(() => {
    const els = compHeaderRefs.current.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) return;
    els.forEach(el => { el.style.minHeight = ''; }); // reset first
    const maxH = Math.max(...els.map(el => el.offsetHeight));
    els.forEach(el => { el.style.minHeight = `${maxH}px`; });
  }, [comparisons, step]);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Inventory data from DB
  const [projects,       setProjects]       = useState<string[]>([]);
  const [towers,         setTowers]         = useState<string[]>([]);
  const [floors,         setFloors]         = useState<string[]>([]);
  const [unitTypes,      setUnitTypes]      = useState<string[]>([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>([]);
  const [loading,        setLoading]        = useState(false);

  // Salesperson data from DB
  const [allSalespersons, setAllSalespersons] = useState<SalespersonRecord[]>([]);

  // Fetch all salespersons on mount
  useEffect(() => {
    fetchAllSalespersons().then(setAllSalespersons).catch(console.error);
  }, []);

  function handleClearForm() {
    setFullName(''); setContact(''); setEmail(''); setIsMegawide(false);
    setSellerSearch(''); setSellerRecord(null); setSellerDropdownOpen(false);
    setErrors({});
  }

  function validateStep0(): boolean {
    const e: Record<string, string> = {};
    if (!fullName.trim())                         e.fullName = 'Full name is required.';
    if (!contact || contact.replace(/^\+63/, '').replace(/\D/g, '').length < 10)
                                                  e.contact  = 'Enter a valid 10-digit number.';
    if (!email.trim())                            e.email    = 'Email address is required.';
    else if (!email.includes('@'))                e.email    = 'Email must contain @.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!project)      e.project      = 'Please select a project.';
    if (!tower)        e.tower        = 'Please select a tower.';
    if (!unitCategory) e.unitCategory = 'Please select a unit category.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function goToStep(n: number) {
    setStep(n);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleContinue() {
    if (validateStep0()) goToStep(1);
  }

  function handleContinueInventory() {
    if (validateStep1()) goToStep(2);
  }

  function handleProjectChange(v: string) {
    setProject(v); setTower('');
    setErrors((prev) => ({ ...prev, project: '', tower: '' }));
  }

  function handleTowerChange(v: string) {
    setTower(v);
    setFloor(''); // Reset floor when tower changes
    setUnitType(''); // Reset unit type when tower changes
    setErrors((prev) => ({ ...prev, tower: '', floor: '', unitType: '' }));
  }

  // Fetch projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const data = await fetchProjects();
        setProjects(data);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, []);

  // Fetch towers when project changes
  useEffect(() => {
    if (!project) {
      setTowers([]);
      return;
    }
    const loadTowers = async () => {
      try {
        const data = await fetchTowers(project);
        setTowers(data);
      } catch (err) {
        console.error('Failed to fetch towers:', err);
      }
    };
    loadTowers();
  }, [project]);

  // Fetch floors when project, tower, or category changes
  useEffect(() => {
    if (!project || !tower || !unitCategory) {
      setFloors([]);
      return;
    }
    const loadFloors = async () => {
      try {
        const data = await fetchFloorsByCategory(project, tower, unitCategory);
        setFloors(data);
      } catch (err) {
        console.error('Failed to fetch floors:', err);
      }
    };
    loadFloors();
  }, [project, tower, unitCategory]);

  // Fetch all inventory units when project + tower are selected
  useEffect(() => {
    if (!project || !tower) {
      setInventoryUnits([]);
      return;
    }
    const loadUnits = async () => {
      try {
        const data = await fetchInventoryUnits(project, tower);
        setInventoryUnits(data);
      } catch (err) {
        console.error('Failed to fetch inventory units:', err);
      }
    };
    loadUnits();
  }, [project, tower]);

  // Fetch unit types when project, tower, or category changes
  useEffect(() => {
    if (!project || !tower || unitCategory !== 'Residential') {
      setUnitTypes([]);
      return;
    }
    const loadUnitTypes = async () => {
      try {
        const data = await fetchUnitTypes(project, tower);
        setUnitTypes(data);
      } catch (err) {
        console.error('Failed to fetch unit types:', err);
      }
    };
    loadUnitTypes();
  }, [project, tower, unitCategory]);

  return (
    <PageShell title="Sample Computation" backButton={step > 0} onBack={() => goToStep(step - 1)}>

      {/* Header card */}
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center shrink-0">
          <Calculator size={22} className="text-[#E8634A]" />
        </div>
        <div className="min-w-0">
          <p className="text-[#1C1C1E] font-semibold">{STEP_HEADERS[step].title}</p>
          <p className="text-[#6C6C70] text-sm mt-0.5 leading-snug">{STEP_HEADERS[step].subtitle}</p>
        </div>
      </GlassCard>

      {/* Step indicator */}
      <StepIndicator current={step} onNavigate={goToStep} hasComparisons={comparisons.length > 0} />

      {/* ── Step 1: Client Info ── */}
      {step === 0 && (
        <>
          {/* Client Information */}
          <SectionHeader icon={<User size={13} />}>Client Information</SectionHeader>
          <GlassCard className="px-4 py-1">
            <InputRow label="Full Name"     value={fullName} onChange={setFullName} placeholder="Enter full name" icon={<User size={16} />} error={errors.fullName} required />
            <PhoneInputRow value={contact} onChange={setContact} error={errors.contact} />
            <InputRow label="Email Address" value={email}    onChange={setEmail}    placeholder="Enter email"     icon={<Mail size={16} />} type="email" error={errors.email} required />
            <CheckRow label="Megawide Employee" checked={isMegawide} onChange={setIsMegawide} icon={<Briefcase size={16} />} />
          </GlassCard>

          {/* Seller Information */}
          <SectionHeader icon={<Users size={13} />}>Seller Information</SectionHeader>
          <GlassCard className="px-4 py-1">
            {/* Searchable seller dropdown */}
            <div className="border-b border-black/[0.06] last:border-0">
              {/* Closed state — tap to open */}
              <button
                type="button"
                onClick={() => { setSellerDropdownOpen(p => !p); setSellerSearch(''); }}
                className="w-full flex items-center gap-3 py-3 px-1"
              >
                <span className="text-[#E8634A] shrink-0"><UserPlus size={16} /></span>
                <span className="text-sm font-medium text-[#1C1C1E] flex-1 text-left">Seller</span>
                <span className={`text-sm text-right truncate max-w-[160px] ${sellerRecord ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
                  {sellerRecord ? sellerRecord.seller_name : 'Search name'}
                </span>
                {sellerRecord
                  ? <X size={14} className="text-[#C7C7CC] shrink-0" onClickCapture={e => { e.stopPropagation(); setSellerRecord(null); setSellerDropdownOpen(false); }} />
                  : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${sellerDropdownOpen ? 'rotate-180' : ''}`} />
                }
              </button>
              {/* Open state — search + list */}
              {sellerDropdownOpen && (
                <div className="pb-2">
                  <div className="flex items-center gap-2 mx-1 mb-2 px-3 py-2 bg-[#F2F2F7] rounded-xl">
                    <input
                      autoFocus
                      type="text"
                      value={sellerSearch}
                      onChange={e => setSellerSearch(e.target.value)}
                      placeholder="Type to search..."
                      className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]"
                    />
                    {sellerSearch && (
                      <button type="button" onClick={() => setSellerSearch('')}>
                        <X size={12} className="text-[#C7C7CC]" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {(() => {
                      const q = sellerSearch.trim().toLowerCase();
                      const filtered = q.length === 0
                        ? allSalespersons
                        : allSalespersons.filter(s => s.seller_name.toLowerCase().includes(q));
                      return filtered.length > 0
                        ? filtered.map(s => (
                            <button
                              key={s.seller_name}
                              type="button"
                              onClick={() => { setSellerRecord(s); setSellerSearch(''); setSellerDropdownOpen(false); }}
                              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm active:bg-gray-100"
                            >
                              <span className="font-medium text-[#1C1C1E] text-left">{s.seller_name}</span>
                              <span className="text-[#8E8E93] text-xs shrink-0 ml-2">{s.position_code}</span>
                            </button>
                          ))
                        : <p className="text-center text-xs text-[#8E8E93] py-3">No results found</p>;
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Selected seller details */}
            {sellerRecord && (
              <>
                {/* Position */}
                <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                  <span className="text-[#E8634A] shrink-0"><UserCog size={16} /></span>
                  <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Position</span>
                  <span className="text-sm text-right max-w-[160px] text-[#8E8E93]">{sellerRecord.position_code}</span>
                </div>
                {/* Sales Manager — shown for Property Specialist */}
                {sellerRecord.position_code === 'Property Specialist' && sellerRecord.sales_manager && (
                  <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                    <span className="text-[#E8634A] shrink-0"><UserCheck size={16} /></span>
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Sales Manager</span>
                    <span className="text-sm text-right max-w-[160px] text-[#8E8E93]">{sellerRecord.sales_manager}</span>
                  </div>
                )}
                {/* Sales Director — shown for Specialist and Manager */}
                {['Property Specialist', 'Sales Manager'].includes(sellerRecord.position_code) && sellerRecord.sales_director && (
                  <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                    <span className="text-[#E8634A] shrink-0"><UserCog size={16} /></span>
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Sales Director</span>
                    <span className="text-sm text-right max-w-[160px] text-[#8E8E93]">{sellerRecord.sales_director}</span>
                  </div>
                )}
                {/* Sales Division Head — shown for Specialist, Manager, and Director */}
                {['Property Specialist', 'Sales Manager', 'Sales Director'].includes(sellerRecord.position_code) && sellerRecord.sales_division_head && (
                  <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                    <span className="text-[#E8634A] shrink-0"><Users size={16} /></span>
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Division Head</span>
                    <span className="text-sm text-right max-w-[160px] text-[#8E8E93]">{sellerRecord.sales_division_head}</span>
                  </div>
                )}
              </>
            )}
          </GlassCard>

          {/* Actions */}
          <GlassButton variant="primary" size="lg" onClick={handleContinue}>
            Continue to Inventory
          </GlassButton>
          <GlassButton variant="ghost" size="lg" onClick={handleClearForm}>
            Clear Form
          </GlassButton>
        </>
      )}

      {/* ── Step 2: Inventory ── */}
      {step === 1 && (
        <>
          <GlassCard className="px-4 py-1">
            <InlineSelect
              label="Project"
              value={project}
              options={projects}
              onChange={handleProjectChange}
              placeholder={loading ? 'Loading...' : 'Select project'}
              icon={<Building2 size={16} />}
              required
              error={errors.project}
              disabled={loading}
            />
            <InlineSelect
              label="Tower"
              value={tower}
              options={towers}
              onChange={handleTowerChange}
              placeholder={project ? 'Select tower' : 'Select project first'}
              disabled={!project}
              icon={<Layers size={16} />}
              required
              error={errors.tower}
            />
          </GlassCard>

          {/* Unit Category buttons */}
          <GlassCard className={`px-4 py-3 ${errors.unitCategory ? 'ring-1 ring-red-300' : ''}`}>
            <div className="flex items-center gap-1.5 mb-3 px-1">
              <span className={`text-[#1C1C1E] text-sm font-medium flex items-center gap-0.5`}>
                Unit Category
                <span className="text-[#E8634A] text-xs leading-none">*</span>
              </span>
            </div>
            <div className="flex gap-2">
              {UNIT_CATEGORIES.map(({ value, label, icon }) => {
                const active = unitCategory === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setUnitCategory(value);
                      setFloor(''); // Reset floor when category changes
                      setUnitType(''); // Reset unit type when category changes
                      setErrors((p) => ({ ...p, unitCategory: '', floor: '', unitType: '' }));
                    }}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[#E8634A]/10 border-[#E8634A] text-[#E8634A]'
                        : 'bg-white border-[#E5E5EA] text-[#6C6C70] hover:border-[#E8634A]/40'
                    }`}
                  >
                    <span className={active ? 'text-[#E8634A]' : 'text-[#8E8E93]'}>{icon}</span>
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.unitCategory && (
              <p className="text-red-400 text-[11px] px-1 mt-2">{errors.unitCategory}</p>
            )}

            {/* Floor dropdown - shown when a category is selected */}
            {unitCategory && (
              <div className="mt-4 pt-4 border-t border-black/[0.06]">
                <InlineSelect
                  label="Floor"
                  value={floor}
                  options={floors}
                  onChange={(v) => {
                    // Toggle: click same value to deselect
                    if (v === floor) {
                      setFloor('');
                      setErrors((p) => ({ ...p, floor: '' }));
                    } else {
                      setFloor(v);
                      setErrors((p) => ({ ...p, floor: '' }));
                    }
                  }}
                  placeholder={tower ? 'Select floor' : 'Select tower first'}
                  disabled={!tower}
                  icon={<Layers size={16} />}
                  error={errors.floor}
                />
              </div>
            )}

            {/* Unit Type dropdown - only shown for Residential */}
            {unitCategory === 'Residential' && (
              <div className="mt-4 pt-4 border-t border-black/[0.06]">
                <InlineSelect
                  label="Unit Type"
                  value={unitType}
                  options={unitTypes}
                  onChange={(v) => {
                    // Toggle: click same value to deselect
                    if (v === unitType) {
                      setUnitType('');
                      setErrors((p) => ({ ...p, unitType: '' }));
                    } else {
                      setUnitType(v);
                      setErrors((p) => ({ ...p, unitType: '' }));
                    }
                  }}
                  placeholder={tower ? 'Select unit type' : 'Select tower first'}
                  disabled={!tower}
                  icon={<LayoutGrid size={16} />}
                  error={errors.unitType}
                />
              </div>
            )}
          </GlassCard>

          {/* ── Availability Chart Section ── */}
          {project && tower && unitCategory && (() => {
            // Apply category + optional filters
            let filtered = inventoryUnits;
            if (unitCategory === 'Residential') {
              filtered = filtered.filter(u => !u.unit_type?.includes('Car Parking') && !u.unit_type?.includes('Motorcycle Parking'));
            } else if (unitCategory === 'Car Parking') {
              filtered = filtered.filter(u => u.unit_type?.includes('Car Parking'));
            } else if (unitCategory === 'Motorcycle Parking') {
              filtered = filtered.filter(u => u.unit_type?.includes('Motorcycle Parking'));
            }
            if (floor)    filtered = filtered.filter(u => u.floor === floor);
            if (unitType) filtered = filtered.filter(u => u.unit_type === unitType);

            if (filtered.length === 0) return null;

            // Status counts
            const counts: Record<string, number> = { available: 0, booked: 0, reserved: 0, unavailable: 0 };
            filtered.forEach(u => { const s = u.status?.toLowerCase(); if (s in counts) counts[s]++; });

            // Chart view data
            const uniqueFloors = [...new Set(filtered.map(u => u.floor))].filter(Boolean)
              .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
            const uniqueUnitNos = [...new Set(filtered.map(u => u.unit_no))].filter(Boolean).sort();
            const naCount = uniqueFloors.length * uniqueUnitNos.length - filtered.length;
            const unitMap = new Map<string, Map<string, string>>();
            filtered.forEach(u => {
              if (!unitMap.has(u.floor)) unitMap.set(u.floor, new Map());
              unitMap.get(u.floor)!.set(u.unit_no, u.status);
            });
            const statusColor = (status?: string) => {
              switch (status?.toLowerCase()) {
                case 'available':   return 'bg-[#DCFCE7] text-[#166534]';
                case 'unavailable': return 'bg-[#E5E7EB] text-[#6B7280]';
                case 'reserved':    return 'bg-[#FFEDD5] text-[#9A3412]';
                case 'booked':      return 'bg-[#FEE2E2] text-[#991B1B]';
                default:            return 'bg-[#E5E7EB] text-[#6B7280]';
              }
            };
            const LEGENDS = [
              { label: 'Available',   bg: 'bg-[#DCFCE7]', text: 'text-[#166534]', count: counts.available },
              { label: 'Booked',      bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', count: counts.booked },
              { label: 'Reserved',    bg: 'bg-[#FFEDD5]', text: 'text-[#9A3412]', count: counts.reserved },
              { label: 'Unavailable', bg: 'bg-[#E5E7EB]', text: 'text-[#6B7280]', count: counts.unavailable },
              { label: 'N/A',         bg: 'bg-[#374151]', text: 'text-white',      count: naCount },
            ];

            // Grid view data — Available units only, sorted floor asc then unit no asc
            const availableUnits = filtered
              .filter(u => u.status?.toLowerCase() === 'available')
              .sort((a, b) => a.floor.localeCompare(b.floor, undefined, { numeric: true }) || a.unit_no.localeCompare(b.unit_no));

            return (
              <GlassCard className="p-4 space-y-3">
                {/* Section header: icon + title + view toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#E8634A]"><BarChart3 size={13} /></span>
                    <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider">
                      Availability Chart
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setViewMode('chart')}
                      className={`p-2.5 rounded-xl border-2 transition-all ${viewMode === 'chart' ? 'bg-[#E8634A]/10 border-[#E8634A] text-[#E8634A]' : 'border-[#E5E5EA] text-[#8E8E93] hover:border-[#E8634A]/40'}`}
                      title="Chart View"><BarChart3 size={18} /></button>
                    <button type="button" onClick={() => setViewMode('grid')}
                      className={`p-2.5 rounded-xl border-2 transition-all ${viewMode === 'grid' ? 'bg-[#E8634A]/10 border-[#E8634A] text-[#E8634A]' : 'border-[#E5E5EA] text-[#8E8E93] hover:border-[#E8634A]/40'}`}
                      title="Grid View"><Grid3X3 size={18} /></button>
                  </div>
                </div>

                {/* ── CHART VIEW ── */}
                {viewMode === 'chart' && (
                  <>
                    {/* Legends */}
                    <div className="flex flex-wrap gap-x-3 gap-y-2">
                      {LEGENDS.map(({ label, bg, text, count }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`${bg} ${text} rounded-md px-2 py-0.5 text-[11px] font-bold min-w-[28px] text-center`}>{count}</div>
                          <span className="text-[#6C6C70] text-[11px]">{label}</span>
                        </div>
                      ))}
                    </div>
                    {/* Table */}
                    <div className="overflow-auto rounded-xl border border-black/[0.06]" style={{ maxHeight: '400px' }}>
                      <table className="border-collapse text-xs" style={{ minWidth: `${(uniqueUnitNos.length + 1) * 70}px` }}>
                        <tbody>
                          {uniqueFloors.map((fl) => (
                            <tr key={fl}>
                              <td className="sticky left-0 z-10 bg-[#F3F4F6] font-semibold text-[#374151] px-3 py-2.5 border-b border-r border-black/[0.08] whitespace-nowrap min-w-[64px] text-center">{fl}</td>
                              {uniqueUnitNos.map((unitNo) => {
                                const status = unitMap.get(fl)?.get(unitNo);
                                const hasUnit = status !== undefined;
                                return (
                                  <td
                                    key={unitNo}
                                    onClick={() => {
                                      if (hasUnit) {
                                        const unit = filtered.find(u => u.floor === fl && u.unit_no === unitNo);
                                        if (unit) { setSelectedUnit(unit); goToStep(2); }
                                      }
                                    }}
                                    className={`px-1 py-2.5 border-b border-r border-white/60 text-center whitespace-nowrap min-w-[64px] font-medium ${hasUnit ? statusColor(status) + ' cursor-pointer active:opacity-60' : 'bg-[#374151]'}`}
                                  >
                                    {hasUnit ? unitNo : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                </table>
                </div>
              </>
            )}

            {/* ── GRID VIEW ── */}
            {viewMode === 'grid' && (
              <>
                {/* Total available units count */}
                <p className="text-[#6C6C70] text-xs font-medium px-1">
                  <span className="text-[#1C1C1E] font-bold text-sm">{availableUnits.length}</span>{' '}total available units
                </p>
                {/* 3-column grid of unit cards */}
                <div className="grid grid-cols-2 gap-2 overflow-y-auto" style={{ maxHeight: '420px' }}>
                  {availableUnits.map((u) => {
                    const catIcon = UNIT_CATEGORIES.find(c => c.value === unitCategory)?.icon;
                    return (
                    <div key={`${u.floor}-${u.unit_no}`} onClick={() => { setSelectedUnit(u); goToStep(2); }} className="bg-[#F2F2F7] rounded-2xl p-4 flex flex-col gap-2.5 shadow-md shadow-black/10 relative overflow-hidden cursor-pointer active:opacity-70">
                      {/* Ribbon badge — upper right corner */}
                      {u.promo_discount && (() => {
                        const n = parseFloat(u.promo_discount);
                        const pct = !isNaN(n) ? (n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n)) : null;
                        return pct ? (
                          <div
                            className="absolute top-0 right-3 w-12 flex flex-col items-center pt-1.5 pb-4 bg-[#166534] text-white z-10"
                            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)' }}
                          >
                            <span className="text-[7px] font-semibold leading-tight tracking-wide uppercase">Up to</span>
                            <span className="text-sm font-extrabold leading-none">{pct}%</span>
                          </div>
                        ) : null;
                      })()}
                      {/* Top row: icon + floor + unit no */}
                      <div className="flex items-center gap-1 min-w-0 pr-10">
                        {catIcon && <span className="text-[#E8634A] shrink-0" style={{ fontSize: 12 }}>{catIcon}</span>}
                        <span className="text-sm font-bold text-[#1C1C1E] leading-tight truncate">{u.floor}{u.unit_no}</span>
                      </div>
                      {/* Info rows */}
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-[#8E8E93]">Tower: <span className="text-[#1C1C1E] font-medium">{tower}</span></p>
                        <p className="text-[10px] text-[#8E8E93]">Floor: <span className="text-[#1C1C1E] font-medium">{u.floor}</span></p>
                        <p className="text-[10px] text-[#8E8E93]">Area: <span className="text-[#1C1C1E] font-medium">{u.unit_area} sqm</span></p>
                      </div>
                      {/* Divider */}
                      <div className="border-t border-black/[0.08]" />
                      {/* Price */}
                      <div className="flex items-center justify-between">
                        <span className="text-[#8E8E93] text-xs font-semibold uppercase tracking-wide">Price</span>
                        <span className="text-[#E8634A] text-sm font-bold">₱{Number(u.total_list_price).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                  })}
                </div>
              </>
            )}
              </GlassCard>
            );
          })()}
        </>
      )}
      {step === 2 && selectedUnit && (() => {
        const catIcon = UNIT_CATEGORIES.find(c => c.value === unitCategory)?.icon;
        const schemeName = PAYMENT_SCHEMES.find(s => s.value === paymentScheme)?.label ?? '';

        // Price computation
        const listPrice    = parseFloat(selectedUnit.total_list_price) || 0;
        const rawPromo     = parseFloat(selectedUnit.promo_discount);
        const promoRate    = (!isNaN(rawPromo) && rawPromo > 0) ? (rawPromo < 1 ? rawPromo : rawPromo / 100) : 0;
        const promoPct     = Math.round(promoRate * 100);
        const promoAmount  = Math.round(listPrice * promoRate);
        const termMonths   = parseInt(paymentTerm) || 12; // parseInt handles "12 months" → 12
        const paytermRate  = paymentScheme === 'deferred_cash'
          ? (termMonths === 12 ? 0.075 : 0.05)
          : paymentScheme === 'spot_dp'
          ? (SPOT_DP_DISCOUNTS[dpRate] ?? 0)
          : paymentScheme === 'stretched_dp'
          ? (STRETCHED_DP_DISCOUNTS[dpRate] ?? 0)
          : PAYTERM_RATES[paymentScheme];
        const paytermPctDisplay = paymentScheme === 'deferred_cash'
          ? (termMonths === 12 ? 7.5 : 5)
          : paymentScheme === 'spot_dp'
          ? (SPOT_DP_DISCOUNTS[dpRate] ?? 0) * 100
          : paymentScheme === 'stretched_dp'
          ? (STRETCHED_DP_DISCOUNTS[dpRate] ?? 0) * 100
          : Math.round(paytermRate * 100);
        const paytermAmount   = Math.round(listPrice * paytermRate);
        const employeeAmount  = isMegawide ? Math.round(listPrice * EMPLOYEE_DISCOUNT_RATE) : 0;
        const netListPrice    = listPrice - promoAmount - employeeAmount - paytermAmount;
        const vat          = Math.round(netListPrice * VAT_RATE);
        const otherCharges = Math.round(netListPrice * OTHER_CHARGES_RATE);
        const totalContractPrice = netListPrice + vat + otherCharges;
        const netAmount    = totalContractPrice - RESERVATION_FEE - RETENTION_FEE;
        const monthlyDeferred = paymentScheme === 'deferred_cash'
          ? Math.round(netAmount / termMonths)
          : 0;

        // Spot DP specific
        const dpRateDecimal       = parseFloat(dpRate) / 100;
        const dpAmount            = Math.round(totalContractPrice * dpRateDecimal);
        const netSpotDP           = dpAmount - RESERVATION_FEE;
        const balanceForFinancing = totalContractPrice - RESERVATION_FEE - netSpotDP;
        const monthlyStretchedDP  = Math.round(netSpotDP / 54);
        const bankMonthly         = calcMonthlyAmort(balanceForFinancing, 0.065, 20);
        const hdmfMonthly         = calcMonthlyAmort(balanceForFinancing, 0.0625, 25);

        const doAddToComparison = () => {
          const id = `${project}-${tower}-${selectedUnit.floor}-${selectedUnit.unit_no}-${paymentScheme}-${dpRate}-${paymentTerm}`;
          if (comparisons.some(c => c.id === id)) {
            setDuplicateAlert(true);
            setTimeout(() => setDuplicateAlert(false), 2500);
            return;
          }
          setComparisons(prev => [...prev, {
            id, project, tower,
            floor: selectedUnit.floor, unitNo: selectedUnit.unit_no,
            inventoryCode: selectedUnit.inventory_code ?? null,
            unitType: selectedUnit.unit_type || '', unitArea: selectedUnit.unit_area,
            unitCategory, paymentScheme, schemeName, dpRate, paymentTerm, termMonths,
            listPrice, promoAmount, promoPct, employeeAmount, paytermAmount, paytermPctDisplay,
            netListPrice, vat, otherCharges, totalContractPrice,
            netAmount, monthlyDeferred, dpAmount, netSpotDP,
            balanceForFinancing, monthlyStretchedDP, bankMonthly, hdmfMonthly,
          }]);
          goToStep(3);
        };

        const pct = promoPct > 0 ? promoPct : null;
        return (
          <>
            {/* ── Card 1: Unit Info ── */}
            <GlassCard className="px-4 py-1 relative overflow-hidden">
              {pct && (
                <div
                  className="absolute top-0 right-3 w-12 flex flex-col items-center pt-1.5 pb-4 bg-[#166534] text-white z-10"
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)' }}
                >
                  <span className="text-[7px] font-semibold leading-tight tracking-wide uppercase">Up to</span>
                  <span className="text-sm font-extrabold leading-none">{pct}%</span>
                </div>
              )}
              {/* Row 1: icon + unit id */}
              <div className="flex items-center gap-2 py-3 pr-12 border-b border-black/[0.06]">
                {catIcon && <span className="text-[#E8634A] shrink-0">{catIcon}</span>}
                <span className="text-base font-bold text-[#1C1C1E]">{selectedUnit.floor}{selectedUnit.unit_no}</span>
              </div>
              {/* Row 1: Tower + Floor */}
              <div className="flex gap-4 py-3 border-b border-black/[0.06]">
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-[#8E8E93]">
                    <Building2 size={11} />
                    <span className="text-[10px] font-medium uppercase tracking-wide">Tower</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1C1C1E]">{tower}</span>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-[#8E8E93]">
                    <Layers size={11} />
                    <span className="text-[10px] font-medium uppercase tracking-wide">Floor</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1C1C1E]">{selectedUnit.floor}</span>
                </div>
              </div>
              {/* Row 2: Unit Type + Area */}
              <div className="flex gap-4 py-3">
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-[#8E8E93]">
                    <LayoutGrid size={11} />
                    <span className="text-[10px] font-medium uppercase tracking-wide">Unit Type</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1C1C1E]">{selectedUnit.unit_type || '—'}</span>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-[#8E8E93]">
                    <Ruler size={11} />
                    <span className="text-[10px] font-medium uppercase tracking-wide">Area</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1C1C1E]">{selectedUnit.unit_area} sqm</span>
                </div>
              </div>
            </GlassCard>

            {/* ── Card 2: Payment Calculator ── */}
            <GlassCard className="p-4 space-y-3">
              {/* Row 1: icon + title + add to comparison */}
              <div className="flex items-center gap-2">
                <span className="text-[#E8634A] shrink-0"><Calculator size={16} /></span>
                <span className="text-sm font-semibold text-[#1C1C1E] flex-1">Payment Calculator</span>
                <button
                  type="button"
                  onClick={doAddToComparison}
                  className="flex items-center gap-1 text-[#E8634A] text-[11px] font-semibold border border-[#E8634A]/50 rounded-xl px-2.5 py-1.5 active:bg-[#E8634A]/10 shrink-0"
                >
                  <Plus size={11} />
                  Add to Comparison
                  {comparisons.length > 0 && (
                    <span className="bg-[#E8634A] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center ml-0.5">
                      {comparisons.length}
                    </span>
                  )}
                </button>
              </div>
              {duplicateAlert && (
                <p className="text-amber-500 text-[11px] text-center -mt-1">Already added to comparison.</p>
              )}
              {/* Row 2: Payment Scheme label */}
              <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider px-1">Payment Scheme</p>
              {/* Row 3: 4 scheme buttons */}
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_SCHEMES.map(({ value, label, icon }) => {
                  const active = paymentScheme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentScheme(value)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl border-2 text-[10px] font-semibold transition-all text-center leading-tight ${
                        active
                          ? 'bg-[#E8634A]/10 border-[#E8634A] text-[#E8634A]'
                          : 'bg-white border-[#E5E5EA] text-[#6C6C70]'
                      }`}
                    >
                      <span className={active ? 'text-[#E8634A]' : 'text-[#8E8E93]'}>{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* Payment Term dropdown — deferred cash only */}
              {paymentScheme === 'deferred_cash' && (
                <div className="border border-black/[0.06] rounded-2xl bg-white">
                  <InlineSelect
                    label="Payment Term"
                    value={paymentTerm}
                    options={['12 months', '54 months']}
                    onChange={setPaymentTerm}
                    placeholder="Select term"
                    icon={<Clock size={16} />}
                  />
                </div>
              )}
              {(paymentScheme === 'spot_dp' || paymentScheme === 'stretched_dp') && (
                <div className="border border-black/[0.06] rounded-2xl bg-white">
                  <InlineSelect
                    label="DP Rate"
                    value={dpRate}
                    options={SPOT_DP_RATE_OPTIONS}
                    onChange={setDpRate}
                    placeholder="Select DP rate"
                    icon={<CreditCard size={16} />}
                  />
                </div>
              )}
              {/* Row 4: Computation breakdown card */}
              <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">

                {/* Card header */}
                <div className="flex items-center gap-3 p-4 border-b border-black/[0.06]">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center shrink-0">
                    <Calculator size={18} className="text-[#E8634A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E]">{schemeName}</p>
                    <p className="text-[#6C6C70] text-xs mt-0.5">{selectedUnit.floor}{selectedUnit.unit_no} · {selectedUnit.unit_area} sqm</p>
                  </div>
                  <span className="bg-[#F2F2F7] text-[#6C6C70] text-xs font-medium px-2.5 py-1 rounded-full shrink-0">{unitCategory}</span>
                </div>

                {/* PRICE COMPUTATION */}
                <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                  <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Price Computation</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#1C1C1E]">List Price</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{listPrice.toLocaleString()}</span>
                  </div>
                  {promoAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#166534]">Less: Promo Discount ({promoPct}%)</span>
                      <span className="text-sm font-medium text-[#166534]">(₱{promoAmount.toLocaleString()})</span>
                    </div>
                  )}
                  {isMegawide && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#166534]">Less: Employee Discount (10%)</span>
                      <span className="text-sm font-medium text-[#166534]">(₱{employeeAmount.toLocaleString()})</span>
                    </div>
                  )}
                  {paytermAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#166534]">Less: Payterm Discount ({Number(paytermPctDisplay).toFixed(1)}%)</span>
                      <span className="text-sm font-medium text-[#166534]">(₱{paytermAmount.toLocaleString()})</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                    <span className="text-sm font-bold text-[#1C1C1E]">Net List Price</span>
                    <span className="text-sm font-bold text-[#1C1C1E]">₱{netListPrice.toLocaleString()}</span>
                  </div>
                </div>

                {/* TAXES & CHARGES */}
                <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                  <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Taxes & Charges</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#1C1C1E]">VAT (12%)</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{vat.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#1C1C1E]">Other Charges (7%)</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{otherCharges.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                    <span className="text-sm font-bold text-[#E8634A]">Total Contract Price</span>
                    <span className="text-sm font-bold text-[#E8634A]">₱{totalContractPrice.toLocaleString()}</span>
                  </div>
                </div>

                {/* FEES */}
                <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                  <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Fees</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#1C1C1E]">Reservation Fee</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{RESERVATION_FEE.toLocaleString()}</span>
                  </div>
                  {paymentScheme !== 'spot_dp' && paymentScheme !== 'stretched_dp' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#1C1C1E]">Retention Fee</span>
                      <span className="text-sm font-medium text-[#1C1C1E]">₱{RETENTION_FEE.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* PAYMENT SUMMARY */}
                {paymentScheme === 'stretched_dp' ? (
                  <>
                    <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                      <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Payment Summary</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">DP ({dpRate})</span>
                        <span className="text-sm font-medium text-[#1C1C1E]">₱{dpAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">Net {schemeName}</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{netSpotDP.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#1C1C1E]">Monthly Downpayment (54 mo)</span>
                        <span className="text-sm font-bold text-[#E8634A]">₱{monthlyStretchedDP.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-black/[0.06]">
                        <span className="text-sm text-[#1C1C1E]">Balance for Financing</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{balanceForFinancing.toLocaleString()}</span>
                      </div>
                    </div>
                    {/* INDICATIVE FINANCING OPTIONS */}
                    <div className="px-4 pt-3 pb-4 space-y-2.5">
                      <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Indicative Financing Options</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">Bank (6.5% p.a., 20 yrs)</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{bankMonthly.toLocaleString()}/mo</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">HDMF (6.25% p.a., 25 yrs)</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{hdmfMonthly.toLocaleString()}/mo</span>
                      </div>
                      <p className="text-[#8E8E93] text-[10px] italic pt-1">
                        *Indicative rates based on prevailing market rates. Actual rates may vary.
                      </p>
                    </div>
                  </>
                ) : paymentScheme === 'spot_dp' ? (
                  <>
                    <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                      <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Payment Summary</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">DP ({dpRate})</span>
                        <span className="text-sm font-medium text-[#1C1C1E]">₱{dpAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">Net {schemeName}</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{netSpotDP.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-black/[0.06]">
                        <span className="text-sm text-[#1C1C1E]">Balance for Financing</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{balanceForFinancing.toLocaleString()}</span>
                      </div>
                    </div>
                    {/* INDICATIVE FINANCING OPTIONS */}
                    <div className="px-4 pt-3 pb-4 space-y-2.5">
                      <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Indicative Financing Options</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">Bank (6.5% p.a., 20 yrs)</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{bankMonthly.toLocaleString()}/mo</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">HDMF (6.25% p.a., 25 yrs)</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{hdmfMonthly.toLocaleString()}/mo</span>
                      </div>
                      <p className="text-[#8E8E93] text-[10px] italic pt-1">
                        *Indicative rates based on prevailing market rates. Actual rates may vary.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="px-4 pt-3 pb-4 space-y-2.5">
                    <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Payment Summary</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#1C1C1E]">Net {schemeName}</span>
                      <span className="text-sm font-semibold text-[#1C1C1E]">₱{netAmount.toLocaleString()}</span>
                    </div>
                    {paymentScheme === 'deferred_cash' && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-sm font-bold text-[#1C1C1E]">Monthly Deferred ({termMonths} mo)</span>
                        <span className="text-sm font-bold text-[#E8634A]">₱{monthlyDeferred.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </GlassCard>

            {/* View Comparison button — shown when comparisons already exist */}
            {comparisons.length > 0 && (
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-[#E8634A] text-[#E8634A] text-sm font-semibold active:bg-[#E8634A]/10"
              >
                <GitCompare size={16} />
                View Comparison ({comparisons.length})
              </button>
            )}
          </>
        );
      })()}
      {step === 3 && (
        comparisons.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <GitCompare size={32} className="text-[#C7C7CC] mx-auto" />
            <p className="text-[#6C6C70] text-sm">No comparisons yet.</p>
            <p className="text-[#8E8E93] text-xs">Go back to the computation tab and tap "+ Add to Comparison".</p>
            <button onClick={() => goToStep(2)} className="text-[#E8634A] text-sm font-semibold">← Back to Computation</button>
          </GlassCard>
        ) : (
          <div className="overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2" style={{ minWidth: `${comparisons.length * 172 + (comparisons.length - 1) * 8}px` }}>
              {comparisons.map((c, ci) => (
                <div key={c.id} onClick={() => setReservationTarget(c)} className="shrink-0 w-[172px] bg-white rounded-2xl border border-black/[0.06] shadow-md flex flex-col overflow-hidden cursor-pointer active:opacity-70" style={{ maxHeight: '72vh' }}>

                  {/* ── Card header (fixed, not scrollable) ── */}
                  <div ref={el => { compHeaderRefs.current[ci] = el; }} className="relative flex-shrink-0 px-4 pt-4 pb-3 bg-[rgba(232,99,74,0.06)] border-b border-black/[0.08]">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setComparisons(prev => prev.filter(x => x.id !== c.id)); }}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6C6C70]"
                    >
                      <X size={12} />
                    </button>
                    {/* Row 1: category icon + project name */}
                    <div className="flex items-center gap-1.5 pr-7">
                      <span className="text-[#E8634A] shrink-0">
                        {UNIT_CATEGORIES.find(cat => cat.value === c.unitCategory)?.icon}
                      </span>
                      <p className="text-sm font-bold text-[#1C1C1E] leading-tight">{c.project}</p>
                    </div>
                    {/* Row 2: unit type */}
                    <p className="text-[11px] text-[#8E8E93] mt-1">{c.unitType || '—'}</p>
                    {/* Row 3: payment scheme — bold red */}
                    <p className="text-[12px] font-bold text-[#E8634A] mt-0.5">{c.schemeName}</p>
                    {/* Row 4: promo discount — always rendered to keep uniform height */}
                    <p className={`text-[11px] font-semibold mt-0.5 ${c.promoPct > 0 ? 'text-[#166534]' : 'invisible'}`}>
                      {Math.round(c.promoPct)}% discount
                    </p>
                  </div>

                  {/* ── Scrollable body ── */}
                  <div className="overflow-y-auto flex-1">
                    {COMP_SECTIONS.map(section => {
                      const visibleRows = section.rows.filter(row => row.value(c) !== '—');
                      if (visibleRows.length === 0) return null;
                      return (
                      <div key={section.title}>
                        {/* Section header */}
                        <div className="px-4 pt-2.5 pb-1 bg-[#F9FAFB] border-b border-black/[0.06]">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[#8E8E93]">{section.title}</p>
                        </div>
                        {/* Rows — skip N/A */}
                        {visibleRows.map(row => {
                          const val = row.value(c);
                          return (
                            <div key={row.label} className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.04]">
                              <span className="text-[11px] text-[#8E8E93] leading-tight mr-2 shrink-0">{row.label}</span>
                              <span className={`text-[11px] leading-tight text-right ${row.bold ? 'font-bold' : 'font-medium'} ${row.coral ? 'text-[#E8634A]' : row.green ? 'text-[#166534]' : 'text-[#1C1C1E]'}`}>
                                {val}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      );
                    })}
                  </div>

                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Reservation Confirmation Modal ── */}
      {reservationTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-fade-in">
            {/* Header */}
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Proceed with Reservation?</p>
              <p className="text-xs text-[#8E8E93] mt-1 text-center">Please confirm the unit details below.</p>
            </div>
            {/* Details */}
            <div className="px-6 py-4 space-y-2.5">
              {[
                { label: 'Project',         value: reservationTarget.project },
                { label: 'Inventory Code',  value: reservationTarget.inventoryCode ?? `${reservationTarget.floor}${reservationTarget.unitNo}` },
                { label: 'Unit Type',       value: reservationTarget.unitType || '—' },
                { label: 'Unit Area',       value: `${reservationTarget.unitArea} sqm` },
                { label: 'Payment Scheme',  value: reservationTarget.schemeName },
                { label: 'Total Contract',  value: `₱${reservationTarget.totalContractPrice.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-[#8E8E93]">{label}</span>
                  <span className="text-sm font-semibold text-[#1C1C1E] text-right max-w-[180px]">{value}</span>
                </div>
              ))}
            </div>
            {/* Actions */}
            <div className="px-6 pb-7 pt-2 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('reservationData', JSON.stringify({
                    ...reservationTarget,
                    clientName: fullName,
                    sellerName: sellerRecord?.seller_name ?? '',
                    salesManager: sellerRecord?.sales_manager ?? '',
                    salesDirector: sellerRecord?.sales_director ?? '',
                    salesDivisionHead: sellerRecord?.sales_division_head ?? '',
                  }));
                  setReservationTarget(null);
                  router.push('/sales/reservation/agreement');
                }}
                className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80"
              >
                Yes, Proceed to Reservation
              </button>
              <button
                type="button"
                onClick={() => setReservationTarget(null)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
