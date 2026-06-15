'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { fetchProjects, fetchTowers, fetchFloorsByCategory, fetchUnitTypes, fetchInventoryUnits, InventoryUnit } from '@/lib/inventory';
import { fetchAllPayterms, PaytermRecord } from '@/lib/paytems';
import { fetchAllClients, ClientRecord } from '@/lib/clients';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchReservationFee, fetchVatThreshold, computeVat, fetchHicTarget } from '@/lib/admin';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  Check, ChevronDown, ChevronLeft, Calculator,
  Building2, Layers, Home, Car, Bike, LayoutGrid,
  BarChart3, Grid3X3,
  Banknote, Clock, CreditCard, CalendarRange, Plus, Ruler, X, GitCompare, AlertTriangle,
  User, UserCheck, UserCog, Users, UserPlus, Mail, Phone, Search,
} from 'lucide-react';
import { COUNTRY_CODES } from '@/lib/client-form-options';

// ─── Payment Schemes ──────────────────────────────────────────────────────────
const PAYMENT_SCHEMES = [
  { value: 'spot_cash',     label: 'Spot Cash',     icon: <Banknote size={18} /> },
  { value: 'deferred_cash', label: 'Deferred Cash', icon: <Clock size={18} /> },
  { value: 'spot_dp',       label: 'Spot DP',       icon: <CreditCard size={18} /> },
  { value: 'stretched_dp',  label: 'Stretched DP',  icon: <CalendarRange size={18} /> },
] as const;
type PaymentScheme = typeof PAYMENT_SCHEMES[number]['value'];

const RETENTION_FEE          = 50_000;
const OTHER_CHARGES_RATE     = 0.07;
const EMPLOYEE_DISCOUNT_RATE = 0.10;

function calcMonthlyAmort(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  return Math.round(principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

// ─── Unit Categories ──────────────────────────────────────────────────────────
const UNIT_CATEGORIES = [
  { value: 'Residential',        label: 'Residential',  icon: <Home size={16} /> },
  { value: 'Car Parking',        label: 'Car Parking',  icon: <Car  size={16} /> },
  { value: 'Motorcycle Parking', label: 'Motor Parking', icon: <Bike size={16} /> },
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
  hicDiscount: number;
  netListPrice: number; vat: number; otherCharges: number;
  totalContractPrice: number; netAmount: number;
  monthlyDeferred: number; dpAmount: number; netSpotDP: number;
  balanceForFinancing: number; monthlyStretchedDP: number;
  bankMonthly: number; hdmfMonthly: number;
  reservationFee: number;
}

type CompRow = { label: string; value: (c: ComparisonItem) => string | null; bold?: boolean; coral?: boolean; green?: boolean; };

const COMP_SECTIONS: { title: string; rows: CompRow[] }[] = [
  { title: 'Unit Info', rows: [
    { label: 'Unit',     value: c => `${String(parseInt(c.floor)||0).padStart(2,'0')}${String(parseInt(c.unitNo)||0).padStart(2,'0')}` },
    { label: 'Tower',    value: c => c.tower },
    { label: 'Floor',    value: c => c.floor },
    { label: 'Type',     value: c => c.unitType || '—' },
    { label: 'Area',     value: c => `${c.unitArea} sqm` },
    { label: 'Category', value: c => c.unitCategory },
    { label: 'Scheme',   value: c => c.schemeName },
  ]},
  { title: 'Price Computation', rows: [
    { label: 'List Price',    value: c => `₱${c.listPrice.toLocaleString()}` },
    { label: 'Promo Disc.',    value: c => c.promoAmount > 0    ? `(₱${c.promoAmount.toLocaleString()})` : '—', green: true },
    { label: 'Employee Disc.', value: c => c.employeeAmount > 0 ? `(₱${c.employeeAmount.toLocaleString()})` : '—', green: true },
    { label: 'Payterm Disc.',  value: c => c.paytermAmount > 0  ? `(₱${c.paytermAmount.toLocaleString()})` : '—', green: true },
    { label: 'HIC Disc.',     value: c => c.hicDiscount > 0   ? `(₱${c.hicDiscount.toLocaleString()})` : '—', green: true },
    { label: 'Net List Price', value: c => `₱${c.netListPrice.toLocaleString()}`, bold: true },
  ]},
  { title: 'Taxes & Charges', rows: [
    { label: 'VAT',            value: c => `₱${c.vat.toLocaleString()}` },
    { label: 'Other (7%)',     value: c => `₱${c.otherCharges.toLocaleString()}` },
    { label: 'HIC Discount',   value: c => c.hicDiscount > 0 ? `₱${c.hicDiscount.toLocaleString()}` : null, green: true },
    { label: 'Total Contract', value: c => `₱${c.totalContractPrice.toLocaleString()}`, bold: true, coral: true },
  ]},
  { title: 'Fees', rows: [
    { label: 'Reservation', value: c => `₱${c.reservationFee.toLocaleString()}` },
    { label: 'Retention',   value: c => ['spot_cash','deferred_cash'].includes(c.paymentScheme) ? `₱${(50_000).toLocaleString()}` : '—' },
  ]},
  { title: 'Payment Summary', rows: [
    { label: 'DP Amount',    value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.dpAmount.toLocaleString()}` : '—' },
    { label: 'Net Amount',   value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.netSpotDP.toLocaleString()}` : `₱${c.netAmount.toLocaleString()}`, bold: true },
    { label: 'Monthly DP',   value: c => c.paymentScheme === 'stretched_dp' ? `₱${c.monthlyStretchedDP.toLocaleString()}/mo (${c.termMonths} mo)` : '—', coral: true, bold: true },
    { label: 'Monthly Def.', value: c => c.paymentScheme === 'deferred_cash' ? `₱${c.monthlyDeferred.toLocaleString()}/mo (${c.termMonths} mo)` : '—', coral: true, bold: true },
    { label: 'Balance',      value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.balanceForFinancing.toLocaleString()}` : '—' },
  ]},
  { title: 'Financing', rows: [
    { label: 'Bank/mo', value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.bankMonthly.toLocaleString()}` : '—' },
    { label: 'HDMF/mo', value: c => ['spot_dp','stretched_dp'].includes(c.paymentScheme) ? `₱${c.hdmfMonthly.toLocaleString()}` : '—' },
  ]},
];

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Client Info', icon: <User       size={14} /> },
  { label: 'Inventory',   icon: <Building2  size={14} /> },
  { label: 'Computation', icon: <Calculator size={14} /> },
  { label: 'Comparison',  icon: <GitCompare size={14} /> },
];

function StepIndicator({ current, onNavigate, hasComparisons }: { current: number; onNavigate: (step: number) => void; hasComparisons: boolean }) {
  return (
    <div className="flex items-center justify-between px-1">
      {STEPS.map(({ label, icon }, i) => {
        const done      = i < current;
        const active    = i === current;
        const clickable = hasComparisons ? i !== current : done;
        return (
          <div key={label} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              <div className={`flex-1 h-0.5 ${i === 0 ? 'opacity-0' : done || active ? 'bg-[#C03D25]' : 'bg-[#E5E5EA]'}`} />
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onNavigate(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-200 ${
                  done   ? 'bg-[#C03D25] border-[#C03D25] shadow-[0_2px_8px_rgba(192,61,37,0.35)] active:opacity-70' :
                  active ? 'bg-white border-[#C03D25] shadow-[0_2px_8px_rgba(192,61,37,0.25)]' :
                           'bg-white border-[#E5E5EA]'
                } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {done
                  ? <Check size={14} className="text-white" />
                  : <span className={active ? 'text-[#C03D25]' : 'text-[#C7C7CC]'}>{icon}</span>
                }
              </button>
              <div className={`flex-1 h-0.5 ${i === STEPS.length - 1 ? 'opacity-0' : done ? 'bg-[#C03D25]' : 'bg-[#E5E5EA]'}`} />
            </div>
            <span className={`text-[10px] mt-1.5 font-semibold text-center leading-tight ${active ? 'text-[#C03D25]' : done ? 'text-[#6C6C70]' : 'text-[#C7C7CC]'}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function InlineSelect({ label, value, options, onChange, placeholder = 'Select', disabled = false, icon, required, error, formatDisplay }: {
  label: string; value: string;
  options: string[]; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; icon?: React.ReactNode;
  required?: boolean; error?: string; formatDisplay?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
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
        {icon && <span className={`shrink-0 ${error ? 'text-red-400' : 'text-[#C03D25]'}`}>{icon}</span>}
        <span className="text-[#1C1C1E] text-sm font-medium flex-1 text-left flex items-center gap-0.5">
          {label}
          {required && <span className="text-[#C03D25] text-xs leading-none">*</span>}
        </span>
        <span className={`text-right text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
          {value ? (formatDisplay ? formatDisplay(value) : value) : placeholder}
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
                  ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold'
                  : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              {formatDisplay ? formatDisplay(o) : o}
              {o === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-red-400 text-[11px] px-1 pb-2 -mt-1">{error}</p>}
    </div>
  );
}

function InputRow({ label, value, onChange, placeholder, required, error, icon, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; error?: string;
  icon?: React.ReactNode; type?: string;
}) {
  return (
    <div className={`border-b border-black/[0.06] last:border-0 ${error ? 'bg-red-50/50' : ''}`}>
      <div className="flex items-center gap-3 py-3 px-1">
        {icon && <span className={`shrink-0 ${error ? 'text-red-400' : 'text-[#C03D25]'}`}>{icon}</span>}
        <span className="text-[#1C1C1E] text-sm font-medium flex-1 flex items-center gap-0.5">
          {label}
          {required && <span className="text-[#C03D25] text-xs leading-none ml-0.5">*</span>}
        </span>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
          className="text-sm text-[#1C1C1E] text-right outline-none bg-transparent placeholder:text-[#C7C7CC] max-w-[180px]"
        />
      </div>
      {error && <p className="text-red-400 text-[11px] px-1 pb-2 -mt-1">{error}</p>}
    </div>
  );
}

// ─── Per-step header config ───────────────────────────────────────────────────
const STEP_HEADERS = [
  { title: 'Client Information',      subtitle: 'Enter the client\'s personal details before proceeding' },
  { title: 'Select Your Preferences', subtitle: 'Choose a Project, Tower, and Unit Category to load the inventory data' },
  { title: 'Computation',             subtitle: 'Review the price breakdown' },
  { title: 'Comparison',              subtitle: 'Compare different payment schemes' },
];

const pad2 = (s: string) => String(parseInt(s) || 0).padStart(2, '0');

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SampleComputationPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [reservationTarget, setReservationTarget] = useState<ComparisonItem | null>(null);

  // Inventory preferences
  const [project,      setProject]      = useState('');
  const [tower,        setTower]        = useState('');
  const [floor,        setFloor]        = useState('');
  const [unitCategory, setUnitCategory] = useState<UnitCategory>('');
  const [unitType,     setUnitType]     = useState('');
  const [viewMode,     setViewMode]     = useState<'chart' | 'grid'>('chart');
  const [selectedUnit, setSelectedUnit] = useState<InventoryUnit | null>(null);
  const [paymentScheme, setPaymentScheme] = useState<PaymentScheme>('spot_cash');
  const [paymentTerm,  setPaymentTerm]  = useState<string>('12 months');
  const [dpRate,           setDpRate]           = useState<string>('15%');
  const [stretchedDpTerm, setStretchedDpTerm] = useState<string>('');
  const [comparisons,  setComparisons]  = useState<ComparisonItem[]>([]);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [useHIC,       setUseHIC]       = useState(false);
  const [isMegawide,   setIsMegawide]   = useState(false);
  const [userRole,     setUserRole]     = useState('');
  const [reservationFee, setReservationFee] = useState(0);

  // Client info fields
  const [clientLastName,   setClientLastName]   = useState('');
  const [clientFirstName,  setClientFirstName]  = useState('');
  const [clientMiddleName, setClientMiddleName] = useState('');
  const [clientSuffix,     setClientSuffix]     = useState('');
  const [clientMobile,          setClientMobile]          = useState('');
  const [clientEmail,           setClientEmail]           = useState('');
  const [clientCountryCode,     setClientCountryCode]     = useState('+63');
  const [clientCountryPickerOpen, setClientCountryPickerOpen] = useState(false);
  const [clientCountrySearch,   setClientCountrySearch]   = useState('');
  const [allClients,            setAllClients]            = useState<ClientRecord[]>([]);
  const [selectedClientRecord,  setSelectedClientRecord]  = useState<ClientRecord | null>(null);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);

  // Seller
  const [allSalespersons,    setAllSalespersons]    = useState<SalespersonRecord[]>([]);
  const [sellerRecord,       setSellerRecord]       = useState<SalespersonRecord | null>(null);
  const [sellerSearch,       setSellerSearch]       = useState('');
  const [sellerDropdownOpen, setSellerDropdownOpen] = useState(false);

  // undefined = not yet fetched, null = not configured (error), number = ok
  const [vatThreshold, setVatThreshold] = useState<number | null | undefined>(undefined);
  const [hicTarget,    setHicTarget]    = useState<number | null>(null);
  const selectedMobileCountry   = COUNTRY_CODES.find(c => c.dial === clientCountryCode) ?? COUNTRY_CODES[0];
  const filteredMobileCountries = clientCountrySearch
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(clientCountrySearch.toLowerCase()) ||
        c.dial.includes(clientCountrySearch))
    : COUNTRY_CODES;

  const clientSuggestions = (!selectedClientRecord && clientLastName.trim().length >= 2)
    ? allClients
        .filter(c => c.last_name.toLowerCase().startsWith(clientLastName.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  function formatClientFullName(c: ClientRecord) {
    return [c.first_name, c.middle_name, c.last_name, c.suffix].filter(Boolean).join(' ');
  }

  function handleSelectClient(c: ClientRecord) {
    setSelectedClientRecord(c);
    setClientLastName(c.last_name);
    setClientFirstName(c.first_name);
    setClientMiddleName(c.middle_name ?? '');
    setClientSuffix(c.suffix ?? '');
    setClientMobile(c.mobile_number ?? '');
    setClientCountryCode(c.country_code ?? '+63');
    setClientEmail(c.email ?? '');
    setClientSuggestionsOpen(false);
    setErrors(p => ({ ...p, clientLastName: '', clientFirstName: '', clientMobile: '' }));

    // Auto-populate seller from client record
    if (c.seller_type === 'In House' && c.property_specialist) {
      const match = allSalespersons.find(s => s.seller_name === c.property_specialist);
      if (match) { setSellerRecord(match); setSellerSearch(''); setSellerDropdownOpen(false); }
    }
  }

  function handleClearClient() {
    setSelectedClientRecord(null);
    setClientLastName('');
    setClientFirstName('');
    setClientMiddleName('');
    setClientSuffix('');
    setClientMobile('');
    setClientCountryCode('+63');
    setClientEmail('');
  }

  const compHeaderRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const compScrollRef   = useRef<HTMLDivElement>(null);
  const [compScrollPct, setCompScrollPct] = useState(0);

  const generateComparisonPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = 210;
    const pageH  = 297;
    const mg     = 15;
    const HDR          = 32;    // coral header height
    const STRIP        = 13;    // seller info strip height
    const CLIENT_STRIP = 13;    // client info strip height
    const BODY_T       = HDR + STRIP + CLIENT_STRIP + 7;  // body start y (= 65)
    const DISC_Y  = pageH - 28;  // disclaimer block top
    const coral: [number,number,number] = [192, 61, 37];
    const dark:  [number,number,number] = [28, 28, 30];
    const lt:    [number,number,number] = [142, 142, 147];
    const grn:   [number,number,number] = [22, 101, 52];

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

    // Read seller — prefer selected sellerRecord, fall back to session
    let sellerName = '';
    let sellerContact = '';
    let sellerMobile = '';
    if (sellerRecord) {
      sellerName = sellerRecord.seller_name;
      try {
        const { data } = await supabase
          .from('Salesperson')
          .select('"Mobile Number", "Email Address"')
          .eq('Seller Name', sellerRecord.seller_name)
          .maybeSingle();
        sellerMobile  = (data as any)?.['Mobile Number']  ?? '';
        sellerContact = (data as any)?.['Email Address']  ?? '';
      } catch {}
    } else {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('osa_session') : null;
        if (raw) {
          const s = JSON.parse(raw);
          sellerName    = s.full_name ?? '';
          sellerContact = s.email     ?? '';
        }
      } catch {}
      if (sellerContact) {
        try {
          const { data } = await supabase
            .from('Salesperson')
            .select('"Mobile Number"')
            .eq('Email Address', sellerContact)
            .maybeSingle();
          sellerMobile = (data as any)?.['Mobile Number'] ?? '';
        } catch {}
      }
    }

    // Load logo once
    let logoB64 = '';
    try {
      const res  = await fetch('/document logo.png');
      const blob = await res.blob();
      logoB64 = await new Promise<string>(resolve => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
    } catch {}

    const drawHeader = () => {
      // Coral header band
      doc.setFillColor(...coral);
      doc.rect(0, 0, pageW, HDR, 'F');
      if (logoB64) doc.addImage(logoB64, 'PNG', mg, 5, 22, 22);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('SAMPLE COMPUTATION', pageW - mg, 15, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`${dateStr}  ·  ${timeStr}`, pageW - mg, 24, { align: 'right' });

      // Seller row (no background) — 3 columns: Name | Mobile | Email
      const colSellerMobile = mg + 100;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...lt);
      doc.text('SELLER',        mg,              HDR + 5);
      doc.text('MOBILE NO.',    colSellerMobile, HDR + 5);
      if (sellerContact) doc.text('EMAIL ADDRESS', pageW - mg, HDR + 5, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...dark);
      doc.text(sellerName || '—', mg, HDR + 10.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
      doc.text(sellerMobile || '—', colSellerMobile, HDR + 10.5);
      if (sellerContact) {
        doc.text(sellerContact, pageW - mg, HDR + 10.5, { align: 'right' });
      }

      // Client row (no background, single row — 3 columns)
      const clientFullName = [clientFirstName, clientMiddleName, clientLastName].filter(Boolean).join(' ') +
        (clientSuffix ? `, ${clientSuffix}` : '');
      const clientMobileStr = clientMobile ? `${clientCountryCode} ${clientMobile}` : '';
      const cs = HDR + STRIP;
      const colMobile = mg + 100;  // mobile column x
      // Labels row
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...lt);
      doc.text('CLIENT', mg, cs + 5);
      if (clientMobileStr) doc.text('MOBILE NO.', colMobile, cs + 5);
      if (clientEmail)     doc.text('EMAIL ADDRESS', pageW - mg, cs + 5, { align: 'right' });
      // Values row
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...dark);
      doc.text(clientFullName || '—', mg, cs + 10.5);
      if (clientMobileStr) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
        doc.text(clientMobileStr, colMobile, cs + 10.5);
      }
      if (clientEmail) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
        doc.text(clientEmail, pageW - mg, cs + 10.5, { align: 'right' });
      }

      // Dividing line
      const lineY = HDR + STRIP + CLIENT_STRIP + 1;
      doc.setDrawColor(210, 210, 220); doc.setLineWidth(0.4);
      doc.line(mg, lineY, pageW - mg, lineY);
    };

    const drawFooter = () => {
      const boxW = pageW - mg * 2;
      // DISCLAIMER label
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...coral);
      doc.text('DISCLAIMER', mg, DISC_Y);
      // Body text (wrapped)
      const discText =
        'This is a computer-generated document. Prices, discounts, terms, and availability are ' +
        'subject to change without prior notice. This computation is for reference purposes only ' +
        'and does not constitute a binding offer or contract.';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...lt);
      const lines = doc.splitTextToSize(discText, boxW);
      doc.text(lines, mg, DISC_Y + 4.5);
      // Coral divider line
      doc.setDrawColor(...coral); doc.setLineWidth(0.4);
      doc.line(mg, DISC_Y + 16, pageW - mg, DISC_Y + 16);
      // Generated date
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...lt);
      doc.text(`Generated: ${dateStr}  at  ${timeStr}`, mg, DISC_Y + 21);
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    let y = BODY_T;
    const RH = 6; // row height mm

    const secLabel = (t: string) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...lt);
      doc.text(t.toUpperCase(), mg, y); y += 5.5;
    };
    const row = (label: string, value: string, bold = false, color: [number,number,number] = dark) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9.5); doc.setTextColor(...color);
      doc.text(label, mg, y);
      doc.text(value, pageW - mg, y, { align: 'right' });
      y += RH;
    };
    const hr = () => {
      doc.setDrawColor(229, 229, 234); doc.setLineWidth(0.25);
      doc.line(mg, y + 1, pageW - mg, y + 1); y += 6;
    };
    const subHr = () => {
      doc.setDrawColor(229, 229, 234); doc.setLineWidth(0.25);
      doc.line(mg, y - 2, pageW - mg, y - 2); y += 4;
    };

    // ── One page per comparison ───────────────────────────────────────────────
    comparisons.forEach((c, idx) => {
      if (idx > 0) { doc.addPage(); }
      drawHeader();
      drawFooter();
      y = BODY_T;

      // Unit details
      secLabel(`Computation ${idx + 1}`);

      // Row 1: Project | Tower | Floor | Unit No. (4 columns)
      const r1c1 = mg, r1c2 = mg + 60, r1c3 = mg + 105, r1c4 = mg + 145;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lt);
      doc.text('Project',  r1c1, y); doc.text('Tower',    r1c2, y);
      doc.text('Floor',    r1c3, y); doc.text('Unit No.', r1c4, y);
      y += 3.5;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...dark);
      doc.text(c.project, r1c1, y); doc.text(c.tower,  r1c2, y);
      doc.text(pad2(c.floor), r1c3, y); doc.text(pad2(c.unitNo), r1c4, y);
      y += RH;

      // Row 2: Unit Type | Area | Payment Scheme (3 columns)
      const r2c1 = mg, r2c2 = mg + 60, r2c3 = mg + 115;
      let termDetail = '';
      if (c.paymentScheme === 'deferred_cash') termDetail = `${c.termMonths} months`;
      else if (c.paymentScheme === 'spot_dp')      termDetail = `DP ${c.dpRate}%`;
      else if (c.paymentScheme === 'stretched_dp') termDetail = `DP ${c.dpRate}%  ·  ${c.termMonths} months`;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lt);
      doc.text('Unit Type',       r2c1, y);
      doc.text('Area',            r2c2, y);
      doc.text('Payment Scheme',  r2c3, y);
      y += 3.5;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...dark);
      doc.text(c.unitType || '—',       r2c1, y);
      doc.text(`${c.unitArea} sqm`,     r2c2, y);
      doc.setTextColor(...coral);
      doc.text(c.schemeName,            r2c3, y);
      if (termDetail) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lt);
        doc.text(termDetail, r2c3, y + 4);
      }
      y += RH + (termDetail ? 3 : 0);
      hr();

      // Price Computation
      const p = (n: number) => 'PHP ' + n.toLocaleString();
      secLabel('Price Computation');
      row('List Price', p(c.listPrice));
      if (c.promoAmount > 0)    row(`Less: Promo Discount (${Math.round(c.promoPct)}%)`, p(c.promoAmount), false, grn);
      if (c.employeeAmount > 0) row('Less: Employee Discount (10%)', p(c.employeeAmount), false, grn);
      if (c.paytermAmount > 0)  row(`Less: Payterm Discount (${Number(c.paytermPctDisplay).toFixed(1)}%)`, p(c.paytermAmount), false, grn);
      if (c.hicDiscount > 0)   row('Less: HIC Discount', p(c.hicDiscount), false, [94, 92, 230]);
      subHr();
      row('Net List Price', p(c.netListPrice), true);
      hr();

      // Taxes & Charges
      secLabel('Taxes & Charges');
      row(c.vat === 0 ? 'VAT (Exempt)' : 'VAT (12%)', p(c.vat));
      row('Other Charges (7%)', p(c.otherCharges));
      if (c.hicDiscount > 0) row('HIC Discount', p(c.hicDiscount), false, [94, 92, 230]);
      subHr();
      row('Total Contract Price', p(c.totalContractPrice), true, coral);
      hr();

      // Fees
      secLabel('Fees');
      row('Reservation Fee', p(c.reservationFee));
      if (!['spot_dp', 'stretched_dp'].includes(c.paymentScheme))
        row('Retention Fee', p(RETENTION_FEE));
      hr();

      // Payment Summary
      secLabel('Payment Summary');
      if (c.paymentScheme === 'spot_cash' || c.paymentScheme === 'deferred_cash') {
        row(`Net ${c.schemeName}`, p(c.netAmount));
        if (c.paymentScheme === 'deferred_cash')
          row(`Monthly Deferred (${c.termMonths} mo)`, p(c.monthlyDeferred) + '/mo', true, coral);
      } else if (c.paymentScheme === 'spot_dp') {
        row(`DP (${c.dpRate}%)`, p(c.dpAmount));
        row(`Net ${c.schemeName}`, p(c.netSpotDP));
        row('Balance for Financing', p(c.balanceForFinancing));
        hr();
        secLabel('Indicative Financing');
        row('Bank (6.5% p.a., 20 yrs)', p(c.bankMonthly) + '/mo');
        row('HDMF (6.25% p.a., 25 yrs)', p(c.hdmfMonthly) + '/mo');
      } else if (c.paymentScheme === 'stretched_dp') {
        row(`DP (${c.dpRate}%)`, p(c.dpAmount));
        row(`Net ${c.schemeName}`, p(c.netSpotDP));
        row(`Monthly DP (${c.termMonths} mo)`, p(c.monthlyStretchedDP) + '/mo', true, coral);
        row('Balance for Financing', p(c.balanceForFinancing));
        hr();
        secLabel('Indicative Financing');
        row('Bank (6.5% p.a., 20 yrs)', p(c.bankMonthly) + '/mo');
        row('HDMF (6.25% p.a., 25 yrs)', p(c.hdmfMonthly) + '/mo');
      }
    });

    doc.save(`SampleComputation_${Date.now()}.pdf`);
  };

  useLayoutEffect(() => {
    const els = compHeaderRefs.current.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) return;
    els.forEach(el => { el.style.minHeight = ''; });
    const maxH = Math.max(...els.map(el => el.offsetHeight));
    els.forEach(el => { el.style.minHeight = `${maxH}px`; });
  }, [comparisons, step]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Inventory data from DB
  const [projects,       setProjects]       = useState<string[]>([]);
  const [towers,         setTowers]         = useState<string[]>([]);
  const [floors,         setFloors]         = useState<string[]>([]);
  const [unitTypes,      setUnitTypes]      = useState<string[]>([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>([]);
  const [loading,        setLoading]        = useState(false);

  // Payterm data from DB
  const [allPayterms, setAllPayterms] = useState<PaytermRecord[]>([]);

  // Fetch paytems when project + tower are both selected (deferred to after user interaction,
  // which avoids the transient DNS failure that happens if fetched on mount)
  useEffect(() => {
    if (!project || !tower) { setAllPayterms([]); return; }
    fetchAllPayterms()
      .then(data => {
        console.log('[paytems] fetched:', data.length, 'total records');
        const matched = data.filter(p =>
          p.project?.trim().toLowerCase() === project.trim().toLowerCase() &&
          p.tower?.trim().toLowerCase() === tower.trim().toLowerCase()
        );
        console.log('[paytems] matched project="'+project+'" tower="'+tower+'":', matched.length);
        if (data.length > 0) console.log('[paytems] sample projects in DB:', [...new Set(data.map(p => p.project))].slice(0, 5));
        setAllPayterms(data);
      })
      .catch(e => console.error('[paytems] fetch failed:', e));
  }, [project, tower]);

  useEffect(() => {
    fetchAllClients().then(setAllClients).catch(console.error);
    fetchAllSalespersons().then(setAllSalespersons).catch(console.error);
  }, []);

  useEffect(() => {
    getSession().then(s => setUserRole(s?.role_name ?? '')).catch(() => {});
  }, []);

  // Fetch reservation fee, VAT threshold & HIC target when selected unit changes; auto-set HIC
  useEffect(() => {
    if (!selectedUnit) return;
    const pt = selectedUnit.product_type ?? 'Residential Unit';
    console.log('[res-fee] product_type="'+pt+'"');
    fetchReservationFee(pt).then(fee => { console.log('[res-fee] result:', fee); setReservationFee(fee); }).catch(e => { console.error('[res-fee] error:', e); setReservationFee(0); });
    setVatThreshold(undefined);
    fetchVatThreshold(pt).then(setVatThreshold).catch(() => setVatThreshold(null));
    fetchHicTarget(pt).then(setHicTarget).catch(() => setHicTarget(null));
    setUseHIC(selectedUnit.hic === true);
  }, [selectedUnit]);

  // Auto-reset paymentTerm when project/tower changes
  useEffect(() => {
    if (!project || !tower || allPayterms.length === 0) return;
    const deferredRecords = allPayterms.filter(
      p => p.project === project && p.tower === tower && p.payterm_scheme === 'Deferred Cash'
    );
    const opts = [...new Set(
      deferredRecords.map(p => p.term).filter(Boolean) as string[]
    )]
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(t => `${t} months`);
    if (opts.length > 0 && !opts.includes(paymentTerm)) {
      setPaymentTerm(opts[0]);
    }
  }, [allPayterms, project, tower]);

  // Auto-reset dpRate when payment scheme changes
  useEffect(() => {
    if (!project || !tower || allPayterms.length === 0) return;
    const schemeLabel = paymentScheme === 'spot_dp' ? 'Spot DP'
      : paymentScheme === 'stretched_dp' ? 'Stretched DP'
      : null;
    if (!schemeLabel) return;
    const records = allPayterms.filter(
      p => p.project === project && p.tower === tower && p.payterm_scheme === schemeLabel
    );
    const opts = [...new Set(records.map(p => p.dp_percent).filter(Boolean) as string[])];
    if (opts.length > 0 && !opts.includes(dpRate)) {
      setDpRate(opts[0]);
    }
  }, [allPayterms, project, tower, paymentScheme]);

  // Auto-reset stretchedDpTerm when dpRate or project/tower changes
  useEffect(() => {
    if (!project || !tower || allPayterms.length === 0 || paymentScheme !== 'stretched_dp') return;
    const records = allPayterms.filter(
      p => p.project === project && p.tower === tower && p.payterm_scheme === 'Stretched DP' && p.dp_percent === dpRate
    );
    const opts = records
      .map(p => p.payment_term ?? (p.term ? `${p.term} months` : null))
      .filter(Boolean) as string[];
    if (opts.length > 0 && !opts.includes(stretchedDpTerm)) {
      setStretchedDpTerm(opts[0]);
    }
  }, [allPayterms, project, tower, paymentScheme, dpRate]);

  function handleProjectChange(v: string) {
    setProject(v); setTower('');
    setErrors((prev) => ({ ...prev, project: '', tower: '' }));
  }

  function handleTowerChange(v: string) {
    setTower(v); setFloor(''); setUnitType('');
    setErrors((prev) => ({ ...prev, tower: '', floor: '', unitType: '' }));
  }

  // Fetch projects on mount, then pre-fill if coming from carousel
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const list = await fetchProjects();
        setProjects(list);
        const prefill = sessionStorage.getItem('sc_prefill_project');
        if (prefill) {
          sessionStorage.removeItem('sc_prefill_project');
          if (list.includes(prefill)) setProject(prefill);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Fetch towers when project changes
  useEffect(() => {
    if (!project) { setTowers([]); return; }
    fetchTowers(project).then(setTowers).catch(console.error);
  }, [project]);

  // Fetch floors when project, tower, or category changes
  useEffect(() => {
    if (!project || !tower || !unitCategory) { setFloors([]); return; }
    fetchFloorsByCategory(project, tower, unitCategory).then(setFloors).catch(console.error);
  }, [project, tower, unitCategory]);

  // Fetch all inventory units when project + tower are selected
  useEffect(() => {
    if (!project || !tower) { setInventoryUnits([]); return; }
    fetchInventoryUnits(project, tower).then(setInventoryUnits).catch(console.error);
  }, [project, tower]);

  // Fetch unit types when project, tower, or category changes
  useEffect(() => {
    if (!project || !tower || unitCategory !== 'Residential') { setUnitTypes([]); return; }
    fetchUnitTypes(project, tower).then(setUnitTypes).catch(console.error);
  }, [project, tower, unitCategory]);

  const filteredPayterms = (project && tower)
    ? allPayterms.filter(p =>
        p.project?.trim().toLowerCase() === project.trim().toLowerCase() &&
        p.tower?.trim().toLowerCase() === tower.trim().toLowerCase())
    : [];

  function goToStep(n: number) {
    setStep(n);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <PageShell title="Sample Computation" backButton={step > 0} onBack={() => goToStep(step - 1)}>

      {/* Header card */}
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center shrink-0">
          <Calculator size={22} className="text-[#C03D25]" />
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
          <GlassCard className="px-4 py-1">

            {/* Last Name — always shown first */}
            <div className="relative border-b border-black/[0.06]">
              <div className={`flex items-center gap-3 py-3 px-1 ${errors.clientLastName ? 'bg-red-50/50 rounded-t-xl' : ''}`}>
                <span className={`shrink-0 ${errors.clientLastName ? 'text-red-400' : 'text-[#C03D25]'}`}><User size={16} /></span>
                <span className="text-sm font-medium text-[#1C1C1E] w-24 shrink-0 flex items-center gap-0.5">
                  Last Name<span className="text-[#C03D25] text-xs leading-none">*</span>
                </span>
                <input
                  type="text"
                  value={clientLastName}
                  readOnly={!!selectedClientRecord}
                  onChange={e => { setClientLastName(e.target.value); setClientSuggestionsOpen(true); setErrors(p => ({ ...p, clientLastName: '' })); }}
                  onFocus={() => setClientSuggestionsOpen(true)}
                  placeholder="e.g. Dela Cruz"
                  className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] text-right"
                />
                {selectedClientRecord && (
                  <button type="button" onMouseDown={e => { e.preventDefault(); handleClearClient(); }}>
                    <X size={14} className="text-[#C7C7CC] shrink-0" />
                  </button>
                )}
              </div>
              {/* Suggestions dropdown */}
              {clientSuggestionsOpen && clientSuggestions.length > 0 && !selectedClientRecord && (
                <div className="absolute left-0 right-0 top-full z-20 bg-white rounded-2xl shadow-xl border border-black/[0.08] overflow-hidden">
                  {clientSuggestions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); handleSelectClient(c); }}
                      className="w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.05] last:border-0 active:bg-[#F2F2F7] text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1C1C1E]">{c.last_name}, {c.first_name}{c.suffix ? ` ${c.suffix}` : ''}</p>
                        <p className="text-xs text-[#8E8E93]">{c.email ?? c.mobile_number ?? '—'}</p>
                      </div>
                      <span className="text-[10px] font-mono text-[#8E8E93] shrink-0 ml-2">{c.client_id ?? ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {errors.clientLastName && <p className="text-red-400 text-[11px] px-1 pb-2">{errors.clientLastName}</p>}
            </div>

            {/* Rest of fields — revealed once last name is entered */}
            {clientLastName.trim().length > 0 && (
              <>
                {/* Existing client badge */}
                {selectedClientRecord && (
                  <div className="flex items-center gap-2 py-2 px-1 border-b border-black/[0.06] bg-green-50/50">
                    <UserCheck size={14} className="text-green-600 shrink-0" />
                    <span className="text-xs font-semibold text-green-700 flex-1">Existing client</span>
                    <span className="text-[10px] font-mono text-[#8E8E93]">{selectedClientRecord.client_id ?? ''}</span>
                  </div>
                )}

                {/* First Name */}
                <div className={`flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] ${errors.clientFirstName ? 'bg-red-50/50' : ''}`}>
                  <span className={`shrink-0 ${errors.clientFirstName ? 'text-red-400' : 'text-[#C03D25]'}`}><User size={16} /></span>
                  <span className="text-sm font-medium text-[#1C1C1E] w-24 shrink-0 flex items-center gap-0.5">
                    First Name<span className="text-[#C03D25] text-xs leading-none">*</span>
                  </span>
                  <input type="text" value={clientFirstName} readOnly={!!selectedClientRecord}
                    onChange={e => { setClientFirstName(e.target.value); setErrors(p => ({ ...p, clientFirstName: '' })); }}
                    placeholder="e.g. Juan"
                    className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] text-right" />
                  {errors.clientFirstName && <p className="text-red-400 text-[11px] px-1 pb-2">{errors.clientFirstName}</p>}
                </div>

                {/* Middle Name */}
                <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                  <span className="text-[#C03D25] shrink-0"><User size={16} /></span>
                  <span className="text-sm font-medium text-[#1C1C1E] w-24 shrink-0">Middle Name</span>
                  <input type="text" value={clientMiddleName} readOnly={!!selectedClientRecord}
                    onChange={e => setClientMiddleName(e.target.value)}
                    placeholder="e.g. Santos"
                    className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] text-right" />
                </div>

                {/* Suffix */}
                <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                  <span className="text-[#C03D25] shrink-0"><User size={16} /></span>
                  <span className="text-sm font-medium text-[#1C1C1E] w-24 shrink-0">Suffix</span>
                  <input type="text" value={clientSuffix} readOnly={!!selectedClientRecord}
                    onChange={e => setClientSuffix(e.target.value)}
                    placeholder="e.g. Jr., Sr."
                    className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] text-right" />
                </div>

                {/* Mobile Number */}
                <div className={`border-b border-black/[0.06] ${errors.clientMobile ? 'bg-red-50/50' : ''}`}>
                  <div className="flex items-center gap-3 py-3 px-1">
                    <span className={`shrink-0 ${errors.clientMobile ? 'text-red-400' : 'text-[#C03D25]'}`}><Phone size={16} /></span>
                    <span className="text-sm font-medium text-[#1C1C1E] w-24 shrink-0 flex items-center gap-0.5">
                      Mobile<span className="text-[#C03D25] text-xs leading-none">*</span>
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <button type="button"
                        disabled={!!selectedClientRecord}
                        onClick={() => { if (!selectedClientRecord) { setClientCountrySearch(''); setClientCountryPickerOpen(true); } }}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-black/[0.08] bg-[#F2F2F7] shrink-0">
                        <span className="text-base leading-none">{selectedMobileCountry.flag}</span>
                        <span className="text-xs font-medium text-[#1C1C1E]">{selectedMobileCountry.dial}</span>
                        {!selectedClientRecord && <ChevronDown size={11} className="text-[#C7C7CC]" />}
                      </button>
                      <input type="tel" inputMode="numeric"
                        value={clientMobile}
                        readOnly={!!selectedClientRecord}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '');
                          const max = clientCountryCode === '+63' ? 10 : 15;
                          setClientMobile(digits.slice(0, max));
                          setErrors(p => ({ ...p, clientMobile: '' }));
                        }}
                        placeholder={clientCountryCode === '+63' ? '9171234567' : ''}
                        className="text-sm text-[#1C1C1E] outline-none bg-transparent placeholder:text-[#C7C7CC] text-right w-28" />
                    </div>
                  </div>
                  {errors.clientMobile && <p className="text-red-400 text-[11px] px-1 pb-2">{errors.clientMobile}</p>}
                </div>

                {/* Email */}
                <div className="flex items-center gap-3 py-3 px-1">
                  <span className="text-[#C03D25] shrink-0"><Mail size={16} /></span>
                  <span className="text-sm font-medium text-[#1C1C1E] w-24 shrink-0">Email</span>
                  <input type="email" inputMode="email"
                    value={clientEmail}
                    readOnly={!!selectedClientRecord}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="juan@email.com"
                    className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] text-right" />
                </div>
              </>
            )}
          </GlassCard>

          {/* Seller Selection */}
          <GlassCard className="px-4 py-1">
            <div className="border-b border-black/[0.06] last:border-0">
              <button
                type="button"
                onClick={() => { setSellerDropdownOpen(p => !p); setSellerSearch(''); }}
                className="w-full flex items-center gap-3 py-3 px-1"
              >
                <span className="text-[#C03D25] shrink-0"><UserPlus size={16} /></span>
                <span className="text-sm font-medium text-[#1C1C1E] flex-1 text-left">Seller</span>
                <span className={`text-sm text-right truncate max-w-[160px] ${sellerRecord ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
                  {sellerRecord ? sellerRecord.seller_name : 'Search name'}
                </span>
                {sellerRecord
                  ? <X size={14} className="text-[#C7C7CC] shrink-0" onClickCapture={e => { e.stopPropagation(); setSellerRecord(null); setSellerDropdownOpen(false); }} />
                  : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${sellerDropdownOpen ? 'rotate-180' : ''}`} />
                }
              </button>
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

            {sellerRecord && (
              <>
                <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                  <span className="text-[#C03D25] shrink-0"><UserCog size={16} /></span>
                  <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Position</span>
                  <span className="text-sm text-right text-[#8E8E93]">{sellerRecord.position_code}</span>
                </div>
                {sellerRecord.position_code === 'Property Specialist' && sellerRecord.sales_manager && (
                  <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                    <span className="text-[#C03D25] shrink-0"><UserCheck size={16} /></span>
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Sales Manager</span>
                    <span className="text-sm text-right text-[#8E8E93]">{sellerRecord.sales_manager}</span>
                  </div>
                )}
                {['Property Specialist', 'Sales Manager'].includes(sellerRecord.position_code) && sellerRecord.sales_director && (
                  <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
                    <span className="text-[#C03D25] shrink-0"><UserCog size={16} /></span>
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Sales Director</span>
                    <span className="text-sm text-right text-[#8E8E93]">{sellerRecord.sales_director}</span>
                  </div>
                )}
                {['Property Specialist', 'Sales Manager', 'Sales Director'].includes(sellerRecord.position_code) && sellerRecord.sales_division_head && (
                  <div className="flex items-center gap-3 py-3 px-1">
                    <span className="text-[#C03D25] shrink-0"><Users size={16} /></span>
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Division Head</span>
                    <span className="text-sm text-right text-[#8E8E93]">{sellerRecord.sales_division_head}</span>
                  </div>
                )}
              </>
            )}
          </GlassCard>

          <button
            type="button"
            onClick={() => {
              const errs: Record<string, string> = {};
              if (!clientLastName.trim())  errs.clientLastName  = 'Last name is required';
              if (!clientFirstName.trim()) errs.clientFirstName = 'First name is required';
              if (!clientMobile.trim())    errs.clientMobile    = 'Mobile number is required';
              if (Object.keys(errs).length > 0) { setErrors(p => ({ ...p, ...errs })); return; }
              goToStep(1);
            }}
            className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity"
          >
            Continue
          </button>
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
              <span className="text-[#1C1C1E] text-sm font-medium flex items-center gap-0.5">
                Unit Category
                <span className="text-[#C03D25] text-xs leading-none">*</span>
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
                      setFloor(''); setUnitType('');
                      setErrors((p) => ({ ...p, unitCategory: '', floor: '', unitType: '' }));
                    }}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]'
                        : 'bg-white border-[#E5E5EA] text-[#6C6C70] hover:border-[#C03D25]/40'
                    }`}
                  >
                    <span className={active ? 'text-[#C03D25]' : 'text-[#8E8E93]'}>{icon}</span>
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.unitCategory && (
              <p className="text-red-400 text-[11px] px-1 mt-2">{errors.unitCategory}</p>
            )}

            {/* Floor dropdown */}
            {unitCategory && (
              <div className="mt-4 pt-4 border-t border-black/[0.06]">
                <InlineSelect
                  label="Floor"
                  value={floor}
                  options={floors}
                  onChange={(v) => {
                    setFloor(v === floor ? '' : v);
                    setErrors((p) => ({ ...p, floor: '' }));
                  }}
                  placeholder={tower ? 'Select floor' : 'Select tower first'}
                  disabled={!tower}
                  icon={<Layers size={16} />}
                  error={errors.floor}
                />
              </div>
            )}

            {/* Unit Type dropdown — Residential only */}
            {unitCategory === 'Residential' && (
              <div className="mt-4 pt-4 border-t border-black/[0.06]">
                <InlineSelect
                  label="Unit Type"
                  value={unitType}
                  options={unitTypes}
                  onChange={(v) => {
                    setUnitType(v === unitType ? '' : v);
                    setErrors((p) => ({ ...p, unitType: '' }));
                  }}
                  placeholder={tower ? 'Select unit type' : 'Select tower first'}
                  disabled={!tower}
                  icon={<LayoutGrid size={16} />}
                  error={errors.unitType}
                />
              </div>
            )}
          </GlassCard>

          {/* ── Availability Chart ── */}
          {project && tower && unitCategory && (() => {
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

            const counts: Record<string, number> = { available: 0, booked: 0, reserved: 0, unavailable: 0 };
            filtered.forEach(u => { const s = u.status?.toLowerCase(); if (s in counts) counts[s]++; });

            const uniqueFloors  = [...new Set(filtered.map(u => u.floor))].filter(Boolean)
              .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
            const uniqueUnitNos = [...new Set(filtered.map(u => u.unit_no))].filter(Boolean).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
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
            ];
            const totalUnits = counts.available + counts.booked + counts.reserved + counts.unavailable;

            const availableUnits = filtered
              .filter(u => u.status?.toLowerCase() === 'available')
              .sort((a, b) => a.floor.localeCompare(b.floor, undefined, { numeric: true }) || a.unit_no.localeCompare(b.unit_no));

            return (
              <GlassCard className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#C03D25]"><BarChart3 size={13} /></span>
                      <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider">Availability Chart</p>
                    </div>
                    <p className="text-[#1C1C1E] text-[11px] font-medium mt-0.5 pl-[19px]">Total no of units: {totalUnits}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setViewMode('chart')}
                      className={`p-2.5 rounded-xl border-2 transition-all ${viewMode === 'chart' ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]' : 'border-[#E5E5EA] text-[#8E8E93]'}`}
                      title="Chart View"><BarChart3 size={18} /></button>
                    <button type="button" onClick={() => setViewMode('grid')}
                      className={`p-2.5 rounded-xl border-2 transition-all ${viewMode === 'grid' ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]' : 'border-[#E5E5EA] text-[#8E8E93]'}`}
                      title="Grid View"><Grid3X3 size={18} /></button>
                  </div>
                </div>

                {/* CHART VIEW */}
                {viewMode === 'chart' && (
                  <>
                    <div className="flex flex-wrap gap-x-3 gap-y-2">
                      {LEGENDS.map(({ label, bg, text, count }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`${bg} ${text} rounded-md px-2 py-0.5 text-[11px] font-bold min-w-[28px] text-center`}>{count}</div>
                          <span className="text-[#6C6C70] text-[11px]">{label}</span>
                        </div>
                      ))}
                    </div>
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
                                      if (hasUnit && status?.toLowerCase() === 'available') {
                                        const unit = filtered.find(u => u.floor === fl && u.unit_no === unitNo);
                                        if (unit) { setSelectedUnit(unit); goToStep(2); }
                                      }
                                    }}
                                    className={`px-1 py-2.5 border-b border-r border-white/60 text-center whitespace-nowrap min-w-[64px] font-medium ${hasUnit ? statusColor(status) + (status?.toLowerCase() === 'available' ? ' cursor-pointer active:opacity-60' : ' cursor-not-allowed') : 'bg-[#374151]'}`}
                                  >
                                    {hasUnit ? pad2(fl) + pad2(unitNo) : ''}
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

                {/* GRID VIEW */}
                {viewMode === 'grid' && (
                  <>
                    <p className="text-[#6C6C70] text-xs font-medium px-1">
                      <span className="text-[#1C1C1E] font-bold text-sm">{availableUnits.length}</span>{' '}total available units
                    </p>
                    <div className="grid grid-cols-2 gap-2 overflow-y-auto" style={{ maxHeight: '420px' }}>
                      {availableUnits.map((u) => {
                        const catIcon = UNIT_CATEGORIES.find(c => c.value === unitCategory)?.icon;
                        return (
                          <div key={`${u.floor}-${u.unit_no}`} onClick={() => { setSelectedUnit(u); goToStep(2); }}
                            className="bg-[#F2F2F7] rounded-2xl p-4 flex flex-col gap-2.5 shadow-md shadow-black/10 relative overflow-hidden cursor-pointer active:opacity-70">
                            {u.promo_discount && (() => {
                              const n = parseFloat(u.promo_discount);
                              const pct = !isNaN(n) ? (n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n)) : null;
                              return pct ? (
                                <div className="absolute top-0 right-3 w-12 flex flex-col items-center pt-1.5 pb-4 bg-[#166534] text-white z-10"
                                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)' }}>
                                  <span className="text-[7px] font-semibold leading-tight tracking-wide uppercase">Up to</span>
                                  <span className="text-sm font-extrabold leading-none">{pct}%</span>
                                </div>
                              ) : null;
                            })()}
                            <div className="flex items-center gap-1 min-w-0 pr-10">
                              {catIcon && <span className="text-[#C03D25] shrink-0" style={{ fontSize: 12 }}>{catIcon}</span>}
                              <span className="text-sm font-bold text-[#1C1C1E] leading-tight truncate">{pad2(u.floor)}{pad2(u.unit_no)}</span>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-[#8E8E93]">Tower: <span className="text-[#1C1C1E] font-medium">{tower}</span></p>
                              <p className="text-[10px] text-[#8E8E93]">Floor: <span className="text-[#1C1C1E] font-medium">{u.floor}</span></p>
                              <p className="text-[10px] text-[#8E8E93]">Area: <span className="text-[#1C1C1E] font-medium">{u.unit_area} sqm</span></p>
                            </div>
                            <div className="border-t border-black/[0.08]" />
                            <div className="flex items-center justify-between">
                              <span className="text-[#8E8E93] text-xs font-semibold uppercase tracking-wide">Price</span>
                              <span className="text-[#C03D25] text-sm font-bold">₱{Number(u.total_list_price).toLocaleString()}</span>
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

      {/* ── Step 3: Computation ── */}
      {step === 2 && selectedUnit && (() => {
        const catIcon    = UNIT_CATEGORIES.find(c => c.value === unitCategory)?.icon;
        const schemeName = PAYMENT_SCHEMES.find(s => s.value === paymentScheme)?.label ?? '';

        const listPrice   = parseFloat(selectedUnit.total_list_price) || 0;
        const rawPromo    = parseFloat(selectedUnit.promo_discount);
        const promoRate   = (!isNaN(rawPromo) && rawPromo > 0) ? (rawPromo < 1 ? rawPromo : rawPromo / 100) : 0;
        const promoPct    = Math.round(promoRate * 100);
        const promoAmount = Math.round(listPrice * promoRate);
        const termMonths  = parseInt(paymentTerm) || 12;

        const spotCashRecord   = filteredPayterms.find(p => p.payterm_scheme === 'Spot Cash');
        const spotCashDiscount = spotCashRecord?.discount ?? 0;

        const deferredCashRecords = filteredPayterms.filter(p => p.payterm_scheme === 'Deferred Cash');
        const deferredTermOptions = [...new Set(
          deferredCashRecords.map(p => p.term).filter(Boolean) as string[]
        )]
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(t => `${t} months`);
        const deferredRecord   = deferredCashRecords.find(p => p.term === String(parseInt(paymentTerm)));
        const deferredDiscount = deferredRecord?.discount ?? 0;

        const spotDpRecords     = filteredPayterms.filter(p => p.payterm_scheme === 'Spot DP');
        const spotDpRateOptions = [...new Set(spotDpRecords.map(p => p.dp_percent).filter(Boolean) as string[])].sort((a, b) => parseFloat(a) - parseFloat(b));
        console.log('[sort-debug] spotDpRateOptions raw:', spotDpRecords.map(p => p.dp_percent), '=> sorted:', spotDpRateOptions);
        const spotDpRecord      = spotDpRecords.find(p => p.dp_percent === dpRate);
        const spotDpDiscount    = spotDpRecord?.discount ?? 0;

        const stretchedDpRecords     = filteredPayterms.filter(p => p.payterm_scheme === 'Stretched DP');
        const stretchedDpRateOptions = [...new Set(stretchedDpRecords.map(p => p.dp_percent).filter(Boolean) as string[])].sort((a, b) => parseFloat(a) - parseFloat(b));
        console.log('[sort-debug] stretchedDpRateOptions raw:', stretchedDpRecords.map(p => p.dp_percent), '=> sorted:', stretchedDpRateOptions);
        const stretchedDpRecord      = stretchedDpRecords.find(p => p.dp_percent === dpRate);
        const stretchedDpDiscount    = stretchedDpRecord?.discount ?? 0;
        const stretchedDpTermOptions = (stretchedDpRecords
          .filter(p => p.dp_percent === dpRate)
          .map(p => p.payment_term ?? (p.term ? `${p.term} months` : null))
          .filter(Boolean) as string[])
          .sort((a, b) => parseInt(a) - parseInt(b));
        console.log('[sort-debug] stretchedDpTermOptions (dpRate='+dpRate+'):', stretchedDpTermOptions);
        const stretchedTermMonths = parseInt(stretchedDpTerm) || 54;

        const paytermRate = paymentScheme === 'deferred_cash' ? deferredDiscount / 100
          : paymentScheme === 'spot_dp'      ? spotDpDiscount / 100
          : paymentScheme === 'stretched_dp' ? stretchedDpDiscount / 100
          : spotCashDiscount / 100;
        const paytermPctDisplay = paymentScheme === 'deferred_cash' ? deferredDiscount
          : paymentScheme === 'spot_dp'      ? spotDpDiscount
          : paymentScheme === 'stretched_dp' ? stretchedDpDiscount
          : spotCashDiscount;
        const paytermAmount      = Math.round(listPrice * paytermRate);
        const employeeAmount     = isMegawide ? Math.round(listPrice * EMPLOYEE_DISCOUNT_RATE) : 0;
        const nlpBeforeHIC       = listPrice - promoAmount - employeeAmount - paytermAmount;
        const showHIC            = (userRole === 'All Access' || userRole === 'Sales Director') && unitCategory === 'Residential' && selectedUnit.hic === true && hicTarget != null;
        const hicDiscount        = (useHIC && showHIC && hicTarget != null) ? Math.max(0, nlpBeforeHIC - hicTarget) : 0;
        const netListPrice       = nlpBeforeHIC - hicDiscount;
        const vat                = (vatThreshold != null) ? computeVat(netListPrice, vatThreshold) : 0;
        const otherCharges       = Math.round(netListPrice * OTHER_CHARGES_RATE);
        const totalContractPrice = netListPrice + vat + otherCharges + hicDiscount;
        const netAmount          = totalContractPrice - reservationFee - RETENTION_FEE;
        const monthlyDeferred    = paymentScheme === 'deferred_cash' ? Math.round(netAmount / termMonths) : 0;

        const dpRateDecimal       = parseFloat(dpRate) / 100;
        const dpAmount            = Math.round(totalContractPrice * dpRateDecimal);
        const netSpotDP           = dpAmount - reservationFee;
        const balanceForFinancing = totalContractPrice - reservationFee - netSpotDP;
        const monthlyStretchedDP  = Math.round(netSpotDP / stretchedTermMonths);
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
            unitCategory, paymentScheme, schemeName, dpRate, paymentTerm,
            termMonths: paymentScheme === 'stretched_dp' ? stretchedTermMonths : termMonths,
            listPrice, promoAmount, promoPct, employeeAmount, paytermAmount, paytermPctDisplay,
            hicDiscount,
            netListPrice, vat, otherCharges, totalContractPrice,
            netAmount, monthlyDeferred, dpAmount, netSpotDP,
            balanceForFinancing, monthlyStretchedDP, bankMonthly, hdmfMonthly,
            reservationFee,
          }]);
          goToStep(3);
        };

        const vatUnconfigured = vatThreshold === null;
        const vatLoading = vatThreshold === undefined;
        const vatLabel = vatLoading ? 'VAT (loading…)' : vatUnconfigured ? 'VAT (not configured)' : vat === 0 ? 'VAT (Exempt)' : 'VAT (12%)';

        const pct = promoPct > 0 ? promoPct : null;
        return (
          <>
            {/* VAT config error banner */}
            {vatUnconfigured && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
                <AlertTriangle size={16} className="text-[#FF3B30] shrink-0 mt-0.5" />
                <p className="text-xs text-[#FF3B30] leading-snug">
                  <span className="font-bold">VAT not configured</span> for product type <span className="font-semibold">"{selectedUnit.product_type ?? 'Residential Unit'}"</span>. Please configure it in Admin &gt; VAT Settings. VAT has been set to ₱0 for this computation.
                </p>
              </div>
            )}
            {/* Card 1: Unit Info */}
            <GlassCard className="px-4 py-1 relative overflow-hidden">
              {pct && (
                <div className="absolute top-0 right-3 w-12 flex flex-col items-center pt-1.5 pb-4 bg-[#166534] text-white z-10"
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)' }}>
                  <span className="text-[7px] font-semibold leading-tight tracking-wide uppercase">Up to</span>
                  <span className="text-sm font-extrabold leading-none">{pct}%</span>
                </div>
              )}
              <div className="flex items-center gap-2 py-3 pr-12 border-b border-black/[0.06]">
                {catIcon && <span className="text-[#C03D25] shrink-0">{catIcon}</span>}
                <span className="text-base font-bold text-[#1C1C1E]">{pad2(selectedUnit.floor)}{pad2(selectedUnit.unit_no)}</span>
              </div>
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

            {/* Card 2: Payment Calculator */}
            <GlassCard className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[#C03D25] shrink-0"><Calculator size={16} /></span>
                <span className="text-sm font-semibold text-[#1C1C1E] flex-1">Payment Calculator</span>
                <button
                  type="button"
                  onClick={doAddToComparison}
                  className="flex items-center gap-1 text-[#C03D25] text-[11px] font-semibold border border-[#C03D25]/50 rounded-xl px-2.5 py-1.5 active:bg-[#C03D25]/10 shrink-0"
                >
                  <Plus size={11} />
                  Add to Comparison
                  {comparisons.length > 0 && (
                    <span className="bg-[#C03D25] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center ml-0.5">
                      {comparisons.length}
                    </span>
                  )}
                </button>
              </div>
              {duplicateAlert && (
                <p className="text-amber-500 text-[11px] text-center -mt-1">Already added to comparison.</p>
              )}
              <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider px-1">Payment Scheme</p>
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
                          ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]'
                          : 'bg-white border-[#E5E5EA] text-[#6C6C70]'
                      }`}
                    >
                      <span className={active ? 'text-[#C03D25]' : 'text-[#8E8E93]'}>{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
              {paymentScheme === 'deferred_cash' && (
                <div className="border border-black/[0.06] rounded-2xl bg-white">
                  <InlineSelect label="Payment Term" value={paymentTerm} options={deferredTermOptions}
                    onChange={setPaymentTerm} placeholder="Select term" icon={<Clock size={16} />} />
                </div>
              )}
              {(paymentScheme === 'spot_dp' || paymentScheme === 'stretched_dp') && (
                <div className="border border-black/[0.06] rounded-2xl bg-white">
                  <InlineSelect label="DP Rate" value={dpRate}
                    options={paymentScheme === 'spot_dp' ? spotDpRateOptions : stretchedDpRateOptions}
                    onChange={setDpRate} placeholder="Select DP rate" icon={<CreditCard size={16} />}
                    formatDisplay={v => `${v}%`} />
                </div>
              )}
              {paymentScheme === 'stretched_dp' && stretchedDpTermOptions.length > 0 && (
                <div className="border border-black/[0.06] rounded-2xl bg-white">
                  <InlineSelect label="DP Term" value={stretchedDpTerm}
                    options={stretchedDpTermOptions}
                    onChange={setStretchedDpTerm} placeholder="Select DP term" icon={<Clock size={16} />} />
                </div>
              )}

              {/* Employee Discount Checkbox — Sales Director + All Access only */}
              {(userRole === 'All Access' || userRole === 'Sales Director') && (
                <button
                  type="button"
                  onClick={() => setIsMegawide(p => !p)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                    isMegawide ? 'border-[#166534] bg-[#166534]/10' : 'border-[#E5E5EA] bg-white'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    isMegawide ? 'border-[#166534] bg-[#166534]' : 'border-[#C7C7CC]'
                  }`}>
                    {isMegawide && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-semibold ${isMegawide ? 'text-[#166534]' : 'text-[#1C1C1E]'}`}>Megawide Employee</p>
                    <p className="text-[10px] text-[#8E8E93]">10% discount on List Price</p>
                  </div>
                </button>
              )}

              {/* HIC Checkbox — Sales Director + Residential only */}
              {showHIC && (
                <button
                  type="button"
                  onClick={() => setUseHIC(p => !p)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                    useHIC
                      ? 'border-[#5E5CE6] bg-[#5E5CE6]/10'
                      : 'border-[#E5E5EA] bg-white'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    useHIC ? 'border-[#5E5CE6] bg-[#5E5CE6]' : 'border-[#C7C7CC]'
                  }`}>
                    {useHIC && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-semibold ${useHIC ? 'text-[#5E5CE6]' : 'text-[#1C1C1E]'}`}>
                      Home Improvement Contract
                    </p>
                    <p className="text-[10px] text-[#8E8E93]">Adjusts Net List Price to ₱{hicTarget != null ? hicTarget.toLocaleString() : '—'}</p>
                  </div>
                </button>
              )}

              {/* Breakdown */}
              <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-black/[0.06]">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center shrink-0">
                    <Calculator size={18} className="text-[#C03D25]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E]">{schemeName}</p>
                    <p className="text-[#6C6C70] text-xs mt-0.5">{pad2(selectedUnit.floor)}{pad2(selectedUnit.unit_no)} · {selectedUnit.unit_area} sqm</p>
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
                  {employeeAmount > 0 && (
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
                  {hicDiscount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#5E5CE6]">Less: HIC Discount</span>
                      <span className="text-sm font-medium text-[#5E5CE6]">(₱{hicDiscount.toLocaleString()})</span>
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
                    <span className="text-sm text-[#1C1C1E]">{vatLabel}</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{vat.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#1C1C1E]">Other Charges (7%)</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{otherCharges.toLocaleString()}</span>
                  </div>
                  {hicDiscount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#5E5CE6]">HIC Discount</span>
                      <span className="text-sm font-medium text-[#5E5CE6]">₱{hicDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                    <span className="text-sm font-bold text-[#C03D25]">Total Contract Price</span>
                    <span className="text-sm font-bold text-[#C03D25]">₱{totalContractPrice.toLocaleString()}</span>
                  </div>
                </div>

                {/* FEES */}
                <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                  <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Fees</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#1C1C1E]">Reservation Fee</span>
                    <span className="text-sm font-medium text-[#1C1C1E]">₱{reservationFee.toLocaleString()}</span>
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
                        <span className="text-sm text-[#1C1C1E]">DP ({dpRate}%)</span>
                        <span className="text-sm font-medium text-[#1C1C1E]">₱{dpAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">Net {schemeName}</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{netSpotDP.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#1C1C1E]">Monthly Downpayment ({stretchedTermMonths} mo)</span>
                        <span className="text-sm font-bold text-[#C03D25]">₱{monthlyStretchedDP.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-black/[0.06]">
                        <span className="text-sm text-[#1C1C1E]">Balance for Financing</span>
                        <span className="text-sm font-semibold text-[#1C1C1E]">₱{balanceForFinancing.toLocaleString()}</span>
                      </div>
                    </div>
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
                      <p className="text-[#8E8E93] text-[10px] italic pt-1">*Indicative rates based on prevailing market rates. Actual rates may vary.</p>
                    </div>
                  </>
                ) : paymentScheme === 'spot_dp' ? (
                  <>
                    <div className="px-4 pt-3 pb-4 space-y-2.5 border-b border-black/[0.06]">
                      <p className="text-[#8E8E93] text-[10px] font-semibold uppercase tracking-wider">Payment Summary</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#1C1C1E]">DP ({dpRate}%)</span>
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
                      <p className="text-[#8E8E93] text-[10px] italic pt-1">*Indicative rates based on prevailing market rates. Actual rates may vary.</p>
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
                        <span className="text-sm font-bold text-[#C03D25]">₱{monthlyDeferred.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </GlassCard>

            {/* View Comparison button */}
            {comparisons.length > 0 && (
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-[#C03D25] text-[#C03D25] text-sm font-semibold active:bg-[#C03D25]/10"
              >
                <GitCompare size={16} />
                View Comparison ({comparisons.length})
              </button>
            )}
          </>
        );
      })()}

      {/* ── Step 4: Comparison ── */}
      {step === 3 && (
        <>
          <style>{`
            .comp-hscroll::-webkit-scrollbar { display: none; }
            .comp-hscroll { scrollbar-width: none; }
            @keyframes bubble-hint {
              0%, 60%, 100% { transform: translateY(-50%) translateX(0); opacity: 1; }
              80% { transform: translateY(-50%) translateX(10px); opacity: 0.7; }
            }
            .bubble-hint { animation: bubble-hint 1.8s ease-in-out infinite; }
          `}</style>
          {comparisons.length === 0 ? (
            <GlassCard className="p-8 text-center space-y-3">
              <GitCompare size={32} className="text-[#C7C7CC] mx-auto" />
              <p className="text-[#6C6C70] text-sm">No comparisons yet.</p>
              <p className="text-[#8E8E93] text-xs">Go back and tap "+ Add to Comparison".</p>
              <button onClick={() => goToStep(2)} className="text-[#C03D25] text-sm font-semibold">← Back to Computation</button>
            </GlassCard>
          ) : (
            <div
              ref={comparisons.length > 3 ? compScrollRef : undefined}
              onScroll={comparisons.length > 3 ? e => { const el = e.currentTarget; setCompScrollPct(el.scrollLeft / (el.scrollWidth - el.clientWidth) || 0); } : undefined}
              className={comparisons.length > 3 ? 'comp-hscroll overflow-x-auto' : ''}
              style={comparisons.length > 3 ? { WebkitOverflowScrolling: 'touch', display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'calc((100% - 16px) / 3)', gap: '8px' } : undefined}
            >
              <div className={comparisons.length <= 3 ? 'flex gap-2' : 'contents'}>
                {comparisons.map((c, ci) => (
                  <div
                    key={c.id}
                    className="shrink-0 bg-white rounded-2xl border border-black/[0.06] shadow-md flex flex-col overflow-hidden"
                    style={{ width: comparisons.length <= 3 ? `calc((100% - ${(comparisons.length - 1) * 8}px) / ${comparisons.length})` : undefined, maxHeight: '72vh' }}
                  >
                    <div ref={el => { compHeaderRefs.current[ci] = el; }} className="relative flex-shrink-0 px-4 pt-4 pb-3 bg-[rgba(192,61,37,0.06)] border-b border-black/[0.08]">
                      <button
                        type="button"
                        onClick={() => setComparisons(prev => prev.filter(x => x.id !== c.id))}
                        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6C6C70]"
                      >
                        <X size={12} />
                      </button>
                      <div className="flex items-center gap-1.5 pr-7">
                        <span className="text-[#C03D25] shrink-0">
                          {UNIT_CATEGORIES.find(cat => cat.value === c.unitCategory)?.icon}
                        </span>
                        <p className="text-sm font-bold text-[#1C1C1E] leading-tight">{c.project}</p>
                      </div>
                      <p className="text-[11px] text-[#8E8E93] mt-1">{c.unitType || '—'}</p>
                      <p className="text-[12px] font-bold text-[#C03D25] mt-0.5">{c.schemeName}</p>
                      <p className={`text-[11px] font-semibold mt-0.5 ${c.promoPct > 0 ? 'text-[#166534]' : 'invisible'}`}>
                        {Math.round(c.promoPct)}% discount
                      </p>
                    </div>
                    <div className="overflow-y-auto overflow-x-hidden flex-1">
                      {COMP_SECTIONS.map(section => {
                        const visibleRows = section.rows.filter(row => { const v = row.value(c); return v !== null && v !== '—'; });
                        if (visibleRows.length === 0) return null;
                        return (
                          <div key={section.title}>
                            <div className="px-4 pt-2.5 pb-1 bg-[#F9FAFB] border-b border-black/[0.06]">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-[#8E8E93]">{section.title}</p>
                            </div>
                            {visibleRows.map(row => {
                              const val = row.value(c);
                              return (
                                <div key={row.label} className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.04]">
                                  <span className="text-[11px] text-[#8E8E93] leading-tight mr-2 shrink-0">{row.label}</span>
                                  <span className={`text-[11px] leading-tight text-right ${row.bold ? 'font-bold' : 'font-medium'} ${row.coral ? 'text-[#C03D25]' : row.green ? 'text-[#166534]' : 'text-[#1C1C1E]'}`}>
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
          )}

          {comparisons.length > 3 && (
            <div className="flex justify-center items-center mt-1">
              <div className="relative w-20 h-2 rounded-full bg-black/[0.06]">
                <div
                  className={compScrollPct === 0 ? 'bubble-hint' : ''}
                  style={{
                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    left: `${compScrollPct * (80 - 8)}px`,
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: '#C7C7CC',
                    transition: 'left 0.12s ease',
                  }}
                />
              </div>
            </div>
          )}

          {comparisons.length > 0 && (
            <button
              type="button"
              onClick={generateComparisonPDF}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-[#C03D25] text-[#C03D25] text-sm font-semibold active:bg-[#C03D25]/10 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
              </svg>
              Export PDF
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push('/home')}
            className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity"
          >
            Done
          </button>

          {/* ── Futuristic Floating Add Button ── */}
          <>
            {/* Keyframe styles */}
            <style>{`
              @keyframes orb-pulse {
                0%   { box-shadow: 0 4px 24px rgba(192,61,37,0.55), 0 0 0 0 rgba(192,61,37,0.45); }
                60%  { box-shadow: 0 4px 24px rgba(192,61,37,0.55), 0 0 0 14px rgba(192,61,37,0); }
                100% { box-shadow: 0 4px 24px rgba(192,61,37,0.55), 0 0 0 0  rgba(192,61,37,0); }
              }
              @keyframes sheet-up {
                from { transform: translateY(100%); }
                to   { transform: translateY(0); }
              }
              @keyframes card-in {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: translateY(0); }
              }
              @keyframes shimmer {
                0%   { transform: translateX(-100%) skewX(-15deg); }
                100% { transform: translateX(250%) skewX(-15deg); }
              }
            `}</style>

            {/* Backdrop */}
            {showAddSheet && (
              <div
                onClick={() => setShowAddSheet(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 48,
                  background: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                }}
              />
            )}

            {/* Action Sheet */}
            {showAddSheet && (
              <div
                style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                  borderRadius: '28px 28px 0 0',
                  padding: '0 20px 40px',
                  background: '#F2F2F7',
                  borderTop: '1.5px solid #C03D25',
                  boxShadow: '0 -8px 48px rgba(192,61,37,0.2), inset 0 1px 0 rgba(192,61,37,0.5)',
                  animation: 'sheet-up 0.38s cubic-bezier(0.32,0.72,0,1) forwards',
                }}
              >
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 20 }}>
                  <div style={{ width: 40, height: 4, borderRadius: 99, background: '#C03D25' }} />
                </div>

                {/* Label */}
                <p style={{
                  textAlign: 'center', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: '#C03D25', marginBottom: 20,
                }}>
                  Choose Action
                </p>

                {/* Card: New Unit */}
                <button
                  type="button"
                  onClick={() => { setShowAddSheet(false); goToStep(1); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 16px', borderRadius: 20, marginBottom: 8,
                    background: '#FFFFFF',
                    border: '1px solid rgba(192,61,37,0.25)',
                    position: 'relative', overflow: 'hidden',
                    animation: 'card-in 0.32s ease 0.08s both',
                  }}
                >
                  {/* shimmer sweep */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(192,61,37,0.1), transparent)',
                    animation: 'shimmer 1.1s ease 0.25s both',
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(192,61,37,0.2)',
                    boxShadow: '0 0 18px rgba(192,61,37,0.4)',
                    border: '1px solid rgba(192,61,37,0.4)',
                  }}>
                    <Building2 size={20} color="#C03D25" />
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ color: '#1C1C1E', fontWeight: 700, fontSize: 14, marginBottom: 3 }}>New Unit</p>
                    <p style={{ color: '#8E8E93', fontSize: 11 }}>Pick a different unit from inventory</p>
                  </div>
                  <ChevronDown size={15} color="#C03D25" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
                </button>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 1, background: '#E5E5EA' }} />
                  <div style={{ width: 6, height: 6, borderRadius: 99, background: '#C03D25', boxShadow: '0 0 8px rgba(192,61,37,0.9)' }} />
                  <div style={{ flex: 1, height: 1, background: '#E5E5EA' }} />
                </div>

                {/* Card: New Payterm */}
                <button
                  type="button"
                  onClick={() => { setShowAddSheet(false); goToStep(2); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 16px', borderRadius: 20,
                    background: '#FFFFFF',
                    border: '1px solid rgba(192,61,37,0.25)',
                    position: 'relative', overflow: 'hidden',
                    animation: 'card-in 0.32s ease 0.18s both',
                  }}
                >
                  {/* shimmer sweep */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(192,61,37,0.1), transparent)',
                    animation: 'shimmer 1.1s ease 0.38s both',
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(192,61,37,0.2)',
                    boxShadow: '0 0 18px rgba(192,61,37,0.4)',
                    border: '1px solid rgba(192,61,37,0.4)',
                  }}>
                    <Calculator size={20} color="#C03D25" />
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ color: '#1C1C1E', fontWeight: 700, fontSize: 14, marginBottom: 3 }}>New Payterm</p>
                    <p style={{ color: '#8E8E93', fontSize: 11 }}>Change scheme or term for current unit</p>
                  </div>
                  <ChevronDown size={15} color="#C03D25" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
                </button>

                {/* Cancel */}
                <button
                  type="button"
                  onClick={() => setShowAddSheet(false)}
                  style={{
                    width: '100%', paddingTop: 20, paddingBottom: 4,
                    fontSize: 13, fontWeight: 500, color: '#8E8E93',
                    textAlign: 'center',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Floating Orb Button */}
            <button
              type="button"
              onClick={() => setShowAddSheet(p => !p)}
              style={{
                position: 'fixed',
                bottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))',
                right: '1.25rem',
                zIndex: 49,
                width: 56, height: 56,
                borderRadius: 99,
                background: 'radial-gradient(circle at 35% 35%, #E04A2A, #C03D25)',
                boxShadow: showAddSheet
                  ? '0 4px 24px rgba(192,61,37,0.4)'
                  : undefined,
                animation: showAddSheet ? undefined : 'orb-pulse 2.2s ease-in-out infinite',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.18s ease',
              }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
              onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={{
                display: 'flex',
                transform: showAddSheet ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <Plus size={24} color="#fff" />
              </span>
            </button>
          </>
        </>
      )}

      {/* Country Picker for Mobile Number */}
      {clientCountryPickerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-[#F2F2F7]"
          style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button
              type="button"
              onClick={() => setClientCountryPickerOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10 border border-black/10"
            >
              <ChevronLeft size={18} className="text-[#1C1C1E]" />
            </button>
            <p className="text-[#1C1C1E] font-semibold text-sm">Select Country</p>
            <div className="w-9" />
          </div>
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70">
                <Search size={14} className="text-[#8E8E93] shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={clientCountrySearch}
                  onChange={e => setClientCountrySearch(e.target.value)}
                  placeholder="Search country or dial code…"
                  className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
                />
                {clientCountrySearch && (
                  <button type="button" onClick={() => setClientCountrySearch('')}>
                    <X size={12} className="text-[#8E8E93]" />
                  </button>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden bg-white/88 backdrop-blur-xl border border-black/[0.06]">
                {filteredMobileCountries.map(c => (
                  <button
                    key={`${c.name}-${c.dial}`}
                    type="button"
                    onClick={() => { setClientCountryCode(c.dial); setClientCountryPickerOpen(false); setClientCountrySearch(''); setClientMobile(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.05] last:border-0 text-left active:bg-black/[0.04] ${
                      clientCountryCode === c.dial && selectedMobileCountry.name === c.name ? 'bg-black/[0.04]' : ''
                    }`}
                  >
                    <span className="text-xl shrink-0">{c.flag}</span>
                    <span className="flex-1 text-sm text-[#1C1C1E]">{c.name}</span>
                    <span className="text-sm font-semibold text-[#8E8E93]">{c.dial}</span>
                    {clientCountryCode === c.dial && selectedMobileCountry.name === c.name && (
                      <Check size={14} className="text-[#C03D25] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
