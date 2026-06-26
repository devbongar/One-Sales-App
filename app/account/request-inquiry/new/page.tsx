'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { isBrfType } from '@/lib/brf';
import { fetchInventoryUnits, type InventoryUnit } from '@/lib/inventory';
import { fetchAllPayterms, type PaytermRecord } from '@/lib/paytems';
import InventoryChart from '@/components/ui/InventoryChart';
import CalcCard from '@/components/ui/CalcCard';
import {
  Hash, User, Building2, Tag, Search,
  FileText, Layers, GitBranch, AlignLeft, Clock, Calendar,
  CheckCircle2, Loader2, AlertTriangle, X, CheckCheck,
  ChevronDown, Check, Banknote, CreditCard, CalendarRange,
} from 'lucide-react';

const OTHER_CHARGES_RATE = 0.07;

const PAYMENT_SCHEMES = [
  { value: 'spot_cash',     label: 'Spot Cash',     icon: <Banknote size={15} /> },
  { value: 'deferred_cash', label: 'Deferred Cash', icon: <Clock size={15} /> },
  { value: 'spot_dp',       label: 'Spot DP',       icon: <CreditCard size={15} /> },
  { value: 'stretched_dp',  label: 'Stretched DP',  icon: <CalendarRange size={15} /> },
];

function toInternalScheme(label: string | null): string {
  switch (label) {
    case 'Deferred Cash': return 'deferred_cash';
    case 'Spot Cash':     return 'spot_cash';
    case 'Spot DP':       return 'spot_dp';
    case 'Stretched DP':  return 'stretched_dp';
    default:              return '';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TYPES = [
  'Cancellation',
  'Change in Personal Information',
  'Change of Buyer/Ownership',
  'Change of Payment Method',
  'Change of Unit',
  'Check Handling',
  'Payment Schedule Restructuring',
  'Refund',
  'Request of Unit Alteration',
  'Waiving of Penalties',
] as const;

const SUB_TYPES: Record<string, string[]> = {
  'Cancellation':                   ['Cancellation of Unit/Parking'],
  'Change in Personal Information':  [],
  'Change of Buyer/Ownership':      ['Addition of Co Buyer', 'Deletion of Co Buyer', 'Change of Co Buyer'],
  'Change of Payment Method':       ['ADA Enrollment Details', 'ADA to PDC', 'PDC to ADA'],
  'Change of Unit':                  [],
  'Check Handling':                 ['Check Holding', 'Check Pullout'],
  'Payment Schedule Restructuring': ['Catchup Payment', 'Change of End User Financing', 'Change of Payterm', 'Continuous Downpayment'],
  'Refund':                          [],
  'Request of Unit Alteration':      [],
  'Waiving of Penalties':            [],
};

// ─── Inline Select ────────────────────────────────────────────────────────────

function InlineSelect({
  icon, label, required, value, options, placeholder, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center gap-3 py-3 px-1 cursor-pointer"
      >
        <span className="text-[#C03D25] shrink-0">{icon}</span>
        <span className="flex-1 text-sm font-medium text-[#1C1C1E] text-left">
          {label}{required && <span className="text-[#C03D25] text-xs ml-0.5">*</span>}
        </span>
        <span className={`text-sm truncate max-w-[150px] ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || placeholder}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC] shrink-0" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <div className="pb-2 max-h-44 overflow-y-auto space-y-0.5">
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                o === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E] active:bg-gray-100'
              }`}
            >
              {o}
              {o === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResFinancials {
  listPrice:              number;
  promoDiscountAmount:    number;
  employeeDiscountAmount: number;
  hicDiscount:            number;
  paytermDiscountPct:     number;
  netListPrice:           number;
  vat:                    number;
  otherCharges:           number;
  hasVat:                 boolean;
  tcp:                    number;
  reservationFee:         number;
  retentionFee:           number;
  unitArea:               number;
  schemeName:             string;
  paymentScheme:          string;
  termMonths:             number;
  dpRate:                 string;
}


interface BuyerInfo {
  reservation_id: string;
  client_id:      string | null;
  client_name:    string | null;
  project:        string | null;
  tower:          string | null;
  inventory_code: string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewRequestPage() {
  const router = useRouter();

  // Buyer search
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searching,     setSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState<BuyerInfo[]>([]);
  const [showResults,   setShowResults]   = useState(false);
  const [lookupErr,     setLookupErr]     = useState('');
  const [buyer,         setBuyer]         = useState<BuyerInfo | null>(null);
  const searchRef      = useRef<HTMLDivElement>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Request detail fields
  const [typeOfRequest,   setTypeOfRequest]   = useState('');
  const [subType,         setSubType]         = useState('');
  const [requestCategory, setRequestCategory] = useState('');
  const [description,     setDescription]     = useState('');

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, [description]);

  // Payment Schedule Restructuring — calculator
  const [paytems,         setPaytems]         = useState<PaytermRecord[]>([]);
  const [paytermLoading,  setPaytermLoading]  = useState(false);
  const [rPaymentScheme,  setRPaymentScheme]  = useState('');
  const [rDpRate,         setRDpRate]         = useState('');
  const [rTermStr,        setRTermStr]        = useState('');
  const [rComputed,       setRComputed]       = useState(false);

  // Change of Unit — inventory chart
  const [newUnit,          setNewUnit]          = useState<InventoryUnit | null>(null);
  const [chartUnits,       setChartUnits]       = useState<InventoryUnit[]>([]);
  const [chartLoading,     setChartLoading]     = useState(false);
  const [chartTower,       setChartTower]       = useState<string | null>(null);
  const [resFinancials,    setResFinancials]    = useState<ResFinancials | null>(null);

  // Live timestamp
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // UI state
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState('');
  const [done,        setDone]        = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ticketId,    setTicketId]    = useState<string | null>(null);

  // Derived
  const subTypeOptions = typeOfRequest ? (SUB_TYPES[typeOfRequest] ?? []) : [];
  const hasSubTypes    = subTypeOptions.length > 0;
  const turnaroundDays = requestCategory === 'simple' ? 5 : requestCategory === 'complex' ? 7 : null;

  // Change of Unit: compute new unit TCP using same discount rates
  const newCalc = useMemo(() => {
    if (!newUnit || !resFinancials || resFinancials.listPrice === 0) return null;
    const newLP     = parseFloat(newUnit.total_list_price) || 0;
    if (newLP === 0) return null;
    const promoRate    = resFinancials.promoDiscountAmount    / resFinancials.listPrice;
    const employeeRate = resFinancials.employeeDiscountAmount / resFinancials.listPrice;
    const promoAmt     = Math.round(newLP * promoRate);
    const employeeAmt  = Math.round(newLP * employeeRate);
    const paytermAmt   = Math.round(newLP * resFinancials.paytermDiscountPct / 100);
    const hicAmt       = newUnit.hic ? resFinancials.hicDiscount : 0;
    const nlpRaw       = newLP - promoAmt - employeeAmt - paytermAmt - hicAmt;
    const vat          = resFinancials.hasVat ? Math.round(nlpRaw * 0.12) : 0;
    const oc           = Math.round(nlpRaw * 0.07);
    const tcp          = nlpRaw + vat + oc + hicAmt;
    return { newLP, promoAmt, employeeAmt, paytermAmt, hicAmt, nlp: nlpRaw, vat, oc, tcp };
  }, [newUnit, resFinancials]);

  // Payment Schedule Restructuring: derived paytems options + new TCP
  const isRestructuring = typeOfRequest === 'Payment Schedule Restructuring';



  const rAvailableSchemes = useMemo(() => {
    const present = new Set(paytems.map(p => toInternalScheme(p.payterm_scheme ?? '')).filter(Boolean));
    return PAYMENT_SCHEMES.filter(s => present.has(s.value));
  }, [paytems]);

  const rDpOptions = useMemo(() => {
    if (rPaymentScheme !== 'spot_dp' && rPaymentScheme !== 'stretched_dp') return [];
    const set = new Set<string>();
    paytems.filter(p => toInternalScheme(p.payterm_scheme ?? '') === rPaymentScheme)
      .forEach(p => { if (p.dp_percent) set.add(p.dp_percent); });
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [paytems, rPaymentScheme]);

  const rTermOptions = useMemo(() => {
    if (rPaymentScheme !== 'deferred_cash' && rPaymentScheme !== 'stretched_dp') return [];
    let filtered = paytems.filter(p => toInternalScheme(p.payterm_scheme ?? '') === rPaymentScheme);
    if (rPaymentScheme === 'stretched_dp' && rDpRate) filtered = filtered.filter(p => p.dp_percent === rDpRate);
    const set = new Set<string>();
    filtered.forEach(p => { if (p.term) set.add(p.term); });
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [paytems, rPaymentScheme, rDpRate]);

  const restructureDerived = useMemo(() => {
    if (!isRestructuring || !rPaymentScheme || !resFinancials || resFinancials.listPrice === 0) return null;
    if (rPaymentScheme === 'deferred_cash' && !rTermStr) return null;
    if (rPaymentScheme === 'spot_dp'       && !rDpRate)  return null;
    if (rPaymentScheme === 'stretched_dp'  && (!rDpRate || !rTermStr)) return null;

    const match = paytems.find(p => {
      const s = toInternalScheme(p.payterm_scheme ?? '');
      if (s !== rPaymentScheme) return false;
      if ((rPaymentScheme === 'spot_dp' || rPaymentScheme === 'stretched_dp') && p.dp_percent !== rDpRate) return false;
      if ((rPaymentScheme === 'deferred_cash' || rPaymentScheme === 'stretched_dp') && p.term !== rTermStr) return false;
      return true;
    });
    if (!match) return null;

    const lp          = resFinancials.listPrice;
    const discPct     = Number(match.discount) || 0;
    const paytermAmt  = Math.round(lp * discPct / 100);
    const promoAmt    = resFinancials.promoDiscountAmount;
    const employeeAmt = resFinancials.employeeDiscountAmount;
    const hicAmt      = resFinancials.hicDiscount;
    const nlp         = lp - promoAmt - employeeAmt - paytermAmt - hicAmt;
    const vat         = resFinancials.hasVat ? Math.round(nlp * 0.12) : 0;
    const oc          = Math.round(nlp * OTHER_CHARGES_RATE);
    const tcp         = nlp + vat + oc + hicAmt;
    const termMonths  = parseInt(match.term ?? '') || 0;
    return { match, discPct, paytermAmt, promoAmt, employeeAmt, hicAmt, nlp, vat, oc, tcp, termMonths };
  }, [isRestructuring, rPaymentScheme, rDpRate, rTermStr, paytems, resFinancials]);

  // Lock chart tower to buyer's own tower
  useEffect(() => {
    setChartTower(buyer?.tower ?? null);
    setChartUnits([]);
    setNewUnit(null);
  }, [buyer]);

  // Fetch inventory units when tower tab changes
  useEffect(() => {
    if (!buyer?.project || !chartTower) { setChartUnits([]); return; }
    setChartLoading(true);
    fetchInventoryUnits(buyer.project, chartTower).then(units => {
      setChartUnits(units);
      setChartLoading(false);
    });
  }, [buyer, chartTower]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowResults(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    setBuyer(null);
    setLookupErr('');
    setShowResults(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(value.trim()), 350);
  }

  async function runSearch(q: string) {
    setSearching(true);
    const upper = q.toUpperCase();
    const { data } = await supabase
      .from('reservations')
      .select('reservation_id, client_id, client_name, project, tower, inventory_code')
      .or(
        `client_name.ilike.%${q}%,client_id.ilike.%${q}%,reservation_id.ilike.%${upper}%,project.ilike.%${q}%,inventory_code.ilike.%${q}%`
      )
      .order('reservation_id', { ascending: true })
      .limit(25);
    setSearchResults((data as BuyerInfo[]) ?? []);
    setShowResults(true);
    setSearching(false);
    if (!data || data.length === 0) setLookupErr('No reservations found. Try a different keyword.');
    else setLookupErr('');
  }

  function selectBuyer(b: BuyerInfo) {
    setBuyer(b);
    setSearchQuery(b.client_name ?? b.reservation_id);
    setShowResults(false);
    setLookupErr('');
    // Fetch paytems for buyer's project/tower
    if (b.project && b.tower) {
      setPaytermLoading(true);
      fetchAllPayterms().then(all =>
        setPaytems(all.filter(p => p.project === b.project && p.tower === b.tower))
      ).catch(() => {}).finally(() => setPaytermLoading(false));
    }

    // Fetch reservation financials
    supabase
      .from('reservations')
      .select('list_price, promo_discount_amount, employee_discount_amount, hic_discount, payterm_discount_pct, net_list_price, vat, other_charges, total_contract_price, reservation_fee, retention_fee, unit_area, scheme_name, payment_scheme, term_months, dp_rate')
      .eq('reservation_id', b.reservation_id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        setResFinancials({
          listPrice:              Number(d.list_price)              || 0,
          promoDiscountAmount:    Number(d.promo_discount_amount)   || 0,
          employeeDiscountAmount: Number(d.employee_discount_amount)|| 0,
          hicDiscount:            Number(d.hic_discount)            || 0,
          paytermDiscountPct:     Number(d.payterm_discount_pct)    || 0,
          netListPrice:           Number(d.net_list_price)          || 0,
          vat:                    Number(d.vat)                     || 0,
          otherCharges:           Number(d.other_charges)           || 0,
          hasVat:                 Number(d.vat)                     >  0,
          tcp:                    Number(d.total_contract_price)    || 0,
          reservationFee:         Number(d.reservation_fee)         || 0,
          retentionFee:           Number(d.retention_fee)           || 0,
          unitArea:               Number(d.unit_area)               || 0,
          schemeName:             d.scheme_name                     ?? '',
          paymentScheme:          d.payment_scheme                  ?? '',
          termMonths:             Number(d.term_months)             || 0,
          dpRate:                 (d.dp_rate ?? '').replace('%', ''),
        });
      });
  }

  function clearSearch() {
    setBuyer(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
    setLookupErr('');
    setResFinancials(null);
    setPaytems([]); setPaytermLoading(false);
    setRPaymentScheme(''); setRDpRate(''); setRTermStr(''); setRComputed(false);
  }

  async function handleSubmit() {
    if (!buyer) return;
    setSaving(true);
    setSaveErr('');
    try {
      const session = await getSession();
      const isBrf = isBrfType(typeOfRequest);
      const { data: inserted, error } = await supabase.from('requests_and_inquiries').insert({
        reservation_id:    buyer.reservation_id,
        client_id:         buyer.client_id,
        client_name:       buyer.client_name,
        project_name:      buyer.project,
        inventory_code:    buyer.inventory_code,
        type_of_request:   typeOfRequest,
        sub_type:          hasSubTypes ? subType || null : null,
        request_category:  requestCategory,
        turnaround_days:   turnaroundDays,
        description:       description.trim() || null,
        requested_by:      session?.email     ?? null,
        requested_by_name: session?.full_name ?? null,
        status:            'open',
        approval_status:   isBrf ? 'Pending' : null,
        new_inventory_code:  typeOfRequest === 'Change of Unit' ? (newUnit?.inventory_code ?? null) : null,
        new_payterm_code:    isRestructuring ? (restructureDerived?.match.payterm_code ?? null) : null,
        new_payterm_scheme:  isRestructuring ? rPaymentScheme || null : null,
        new_term_months:     isRestructuring ? (restructureDerived?.termMonths ?? null) : null,
      }).select('ticket_id').single();
      if (error) throw error;
      setTicketId((inserted as { ticket_id: string | null } | null)?.ticket_id ?? null);
      setDone(true);
    } catch (e: unknown) {
      setSaveErr((e as Error).message ?? 'Failed to submit. Please try again.');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  const canSubmit =
    !!buyer &&
    !!typeOfRequest &&
    (!hasSubTypes || !!subType) &&
    !!requestCategory &&
    !!description.trim() &&
    (typeOfRequest !== 'Change of Unit'              || !!newUnit) &&
    (!isRestructuring                                || !!restructureDerived);

  // ── Done screen ──────────────────────────────────────────────────────────────

  if (done) {
    return (
      <PageShell title="New Request" backButton>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-green-500" />
          </div>
          <p className="text-base font-bold text-[#1C1C1E]">Request Submitted</p>
          {ticketId && (
            <div className="flex flex-col items-center gap-0.5">
              <p className="text-[10px] text-[#8E8E93] uppercase tracking-wider">Ticket ID</p>
              <p className="text-lg font-bold font-mono tracking-widest" style={{ color: '#C03D25' }}>{ticketId}</p>
            </div>
          )}
          <p className="text-sm text-[#8E8E93] text-center leading-relaxed">
            The <span className="font-semibold text-[#1C1C1E]">{typeOfRequest}</span> request for{' '}
            <span className="font-semibold text-[#1C1C1E]">{buyer?.client_name}</span> has been recorded.
          </p>
          <div className="flex gap-3 mt-2 w-full">
            <button
              onClick={() => router.push('/account/request-inquiry')}
              className="flex-1 py-3 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
            >
              View All
            </button>
            <button
              onClick={() => {
                setBuyer(null); setSearchQuery(''); setSearchResults([]);
                setTypeOfRequest(''); setSubType(''); setRequestCategory('');
                setDescription(''); setSaveErr(''); setLookupErr('');
                setTicketId(null); setDone(false);
              }}
              className="flex-1 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              New Request
            </button>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <PageShell title="New Request" backButton>
      <div className="space-y-4 pb-8">

        {/* ── Section 1: Buyer Information ── */}
        <GlassCard className="px-4 py-1">
          <div className="flex items-center justify-between py-2.5 border-b border-black/[0.06]">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">
              Buyer Information
            </p>
            {buyer && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <CheckCheck size={10} />
                Selected
              </span>
            )}
          </div>

          {/* Search input */}
          <div ref={searchRef} className="relative border-b border-black/[0.06]">
            <div className={`flex items-center gap-3 py-2.5 px-1 rounded-xl transition-colors ${buyer ? 'bg-green-50/60' : ''}`}>
              {searching
                ? <Loader2 size={15} className="text-[#C03D25] shrink-0 animate-spin" />
                : buyer
                  ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                  : <Search size={15} className="text-[#C03D25] shrink-0" />}
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearchInput(e.target.value)}
                onFocus={() => searchResults.length > 0 && !buyer && setShowResults(true)}
                placeholder="Search by name, client ID, project…"
                className={`flex-1 text-sm bg-transparent outline-none font-medium placeholder-[#C7C7CC] ${buyer ? 'text-green-700' : 'text-[#1C1C1E]'}`}
                readOnly={!!buyer}
              />
              {(searchQuery || buyer) && (
                <button type="button" onClick={clearSearch} className="shrink-0 active:opacity-60">
                  <X size={14} className="text-[#8E8E93]" />
                </button>
              )}
            </div>

            {showResults && searchResults.length > 0 && !buyer && (
              <div className="absolute left-0 right-0 top-full z-20 bg-white rounded-2xl shadow-xl border border-black/[0.07] max-h-60 overflow-y-auto">
                {searchResults.map(r => (
                  <button
                    key={r.reservation_id}
                    type="button"
                    onMouseDown={() => selectBuyer(r)}
                    className="w-full flex flex-col px-4 py-3 text-left border-b border-black/[0.05] last:border-0 active:bg-[#F2F2F7]"
                  >
                    <span className="text-sm font-bold text-[#1C1C1E] leading-tight">{r.reservation_id}</span>
                    <span className="text-xs text-[#6C6C70] mt-0.5">{r.client_name ?? '—'}</span>
                    <span className="text-[11px] text-[#8E8E93] mt-0.5">{r.project ?? '—'} · {r.inventory_code ?? '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lookupErr && !buyer && (
            <div className="flex items-center gap-2 py-2 px-1">
              <AlertTriangle size={12} className="text-[#FF3B30] shrink-0" />
              <p className="text-xs text-[#FF3B30]">{lookupErr}</p>
            </div>
          )}

          {buyer ? (
            <>
              {([
                [<Hash size={15} key="ci" />,      'Client ID',      buyer.client_id      ?? '—'],
                [<User size={15} key="cn" />,      'Client Name',    buyer.client_name    ?? '—'],
                [<Hash size={15} key="ri" />,      'Reservation ID', buyer.reservation_id],
                [<Building2 size={15} key="pn" />, 'Project Name',   buyer.project        ?? '—'],
                [<Tag size={15} key="ic" />,       'Inventory Code', buyer.inventory_code ?? '—'],
              ] as [React.ReactNode, string, string][]).map(([icon, label, value]) => (
                <div key={label} className="flex items-center gap-3 py-2.5 px-1 border-b border-black/[0.06] last:border-0">
                  <span className="text-[#C03D25] shrink-0">{icon}</span>
                  <span className="flex-1 text-sm font-medium text-[#1C1C1E]">{label}</span>
                  <span className="text-xs text-right text-[#6C6C70] max-w-[55%] truncate">{value}</span>
                </div>
              ))}
            </>
          ) : !lookupErr && (
            <div className="flex flex-col items-center py-6 gap-1.5">
              <Search size={22} className="text-[#C7C7CC]" />
              <p className="text-xs text-[#C7C7CC] text-center">
                Type a name, client ID, reservation ID,<br />project, or inventory code to search
              </p>
            </div>
          )}
        </GlassCard>

        {/* ── Section 2: Request Details — dimmed until buyer selected ── */}
        <div className={`transition-opacity duration-200 ${!buyer ? 'opacity-40 pointer-events-none select-none' : ''}`}>
          <GlassCard className="px-4 py-1">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
              Request Details
            </p>

            <InlineSelect
              icon={<FileText size={15} />}
              label="Type of Request"
              required
              value={typeOfRequest}
              options={[...REQUEST_TYPES]}
              placeholder="Select type"
              onChange={v => { setTypeOfRequest(v); setSubType(''); setRPaymentScheme(''); setRDpRate(''); setRTermStr(''); setRComputed(false); }}
            />

            {hasSubTypes && (
              <InlineSelect
                icon={<GitBranch size={15} />}
                label="Sub Type"
                required
                value={subType}
                options={subTypeOptions}
                placeholder="Select sub type"
                onChange={setSubType}
              />
            )}


            <InlineSelect
              icon={<Layers size={15} />}
              label="Request Category"
              required
              value={requestCategory}
              options={['Simple', 'Complex']}
              placeholder="Select category"
              onChange={v => setRequestCategory(v.toLowerCase())}
            />

            <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06]">
              <Clock size={15} className="text-[#C03D25] shrink-0" />
              <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Turnaround Days</span>
              {turnaroundDays != null ? (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  requestCategory === 'simple' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  {turnaroundDays} days
                </span>
              ) : (
                <span className="text-sm text-[#C7C7CC]">—</span>
              )}
            </div>

            <div className="py-3 px-1 border-b border-black/[0.06]">
              <div className="flex items-center gap-3 mb-2.5">
                <AlignLeft size={15} className="text-[#C03D25] shrink-0" />
                <span className="text-sm font-medium text-[#1C1C1E]">Description<span className="text-[#C03D25] text-xs ml-0.5">*</span></span>
              </div>
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the request in detail…"
                style={{ minHeight: '52px' }}
                className="w-full px-3 py-2.5 rounded-xl border border-black/[0.08] bg-[#F2F2F7] text-sm text-[#1C1C1E] placeholder-[#C7C7CC] outline-none focus:border-[#C03D25]/40 resize-none leading-relaxed overflow-hidden"
              />
            </div>

            <div className="flex items-center gap-3 py-3 px-1">
              <Calendar size={15} className="text-[#C03D25] shrink-0" />
              <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Timestamp</span>
              <span className="text-xs text-[#6C6C70]">
                {now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          </GlassCard>
        </div>

        {/* ── Section 3: New Unit selector (Change of Unit only) ── */}
        {typeOfRequest === 'Change of Unit' && (
          <div className={`transition-opacity duration-200 ${!buyer ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <GlassCard className="px-4 py-1">
              <div className="flex items-center justify-between py-2.5 border-b border-black/[0.06]">
                <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">
                  New Unit <span className="text-[#C03D25]">*</span>
                </p>
                {newUnit && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={10} />
                    {newUnit.inventory_code}
                    <button type="button" onClick={() => setNewUnit(null)} className="ml-0.5 active:opacity-60">
                      <X size={10} className="text-green-600" />
                    </button>
                  </span>
                )}
              </div>
              {!newUnit && (chartLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 size={16} className="animate-spin text-[#C03D25]" />
                  <span className="text-xs text-[#8E8E93]">Loading units…</span>
                </div>
              ) : buyer?.project && chartTower ? (
                <InventoryChart
                  project={buyer.project}
                  tower={chartTower}
                  inventoryUnits={chartUnits}
                  onSelectUnit={unit => setNewUnit(unit)}
                  excludeCode={buyer.inventory_code}
                  showCategoryTabs
                  showFilters
                />
              ) : null)}

              {/* Side-by-side price comparison */}
              {newUnit && resFinancials && newCalc && (
                <div className="grid grid-cols-2 [grid-template-rows:auto_1fr] gap-2 pt-2 pb-1 -mx-4 px-4 overflow-x-auto">
                  <CalcCard
                    title="Current Unit"
                    unitCode={buyer?.inventory_code ?? null}
                    unitArea={resFinancials.unitArea}
                    schemeName={resFinancials.schemeName}
                    category={newUnit.product_type}
                    listPrice={resFinancials.listPrice}
                    promoAmt={resFinancials.promoDiscountAmount}
                    promoPct={resFinancials.listPrice > 0 ? resFinancials.promoDiscountAmount / resFinancials.listPrice * 100 : 0}
                    employeeAmt={resFinancials.employeeDiscountAmount}
                    employeePct={resFinancials.listPrice > 0 ? resFinancials.employeeDiscountAmount / resFinancials.listPrice * 100 : 0}
                    paytermAmt={Math.round(resFinancials.listPrice * resFinancials.paytermDiscountPct / 100)}
                    paytermPct={resFinancials.paytermDiscountPct}
                    hicAmt={resFinancials.hicDiscount}
                    nlp={resFinancials.netListPrice}
                    vat={resFinancials.vat}
                    otherCharges={resFinancials.otherCharges}
                    tcp={resFinancials.tcp}
                    reservationFee={resFinancials.reservationFee}
                    retentionFee={resFinancials.retentionFee}
                  />
                  <CalcCard
                    title="New Unit"
                    unitCode={newUnit.inventory_code}
                    unitArea={newUnit.unit_area}
                    schemeName={resFinancials.schemeName}
                    category={newUnit.product_type}
                    listPrice={newCalc.newLP}
                    promoAmt={newCalc.promoAmt}
                    promoPct={newCalc.newLP > 0 ? newCalc.promoAmt / newCalc.newLP * 100 : 0}
                    employeeAmt={newCalc.employeeAmt}
                    employeePct={newCalc.newLP > 0 ? newCalc.employeeAmt / newCalc.newLP * 100 : 0}
                    paytermAmt={newCalc.paytermAmt}
                    paytermPct={resFinancials.paytermDiscountPct}
                    hicAmt={newCalc.hicAmt}
                    nlp={newCalc.nlp}
                    vat={newCalc.vat}
                    otherCharges={newCalc.oc}
                    tcp={newCalc.tcp}
                    reservationFee={resFinancials.reservationFee}
                    retentionFee={resFinancials.retentionFee}
                    highlight
                  />
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {/* ── Section 4: Payment Calculator (Restructuring only) ── */}
        {isRestructuring && (
          <div className={`transition-opacity duration-200 ${!buyer ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <GlassCard className="px-4 py-1 space-y-0">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
                Payment Calculator
              </p>

              {paytermLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 size={15} className="animate-spin text-[#C03D25]" />
                  <span className="text-xs text-[#8E8E93]">Loading paytems…</span>
                </div>
              ) : paytems.length === 0 ? (
                <p className="text-xs text-[#FF3B30] py-4 text-center">No paytems found for this project/tower.</p>
              ) : rComputed && resFinancials ? (
                /* ── Computed view: side-by-side cards + Reset ── */
                <div className="py-3 space-y-3">
                  <div className="grid grid-cols-2 [grid-template-rows:auto_1fr] gap-2 -mx-4 px-4 overflow-x-auto">
                    <CalcCard
                      title="Current"
                      unitCode={buyer?.inventory_code ?? null}
                      unitArea={resFinancials.unitArea}
                      schemeName={resFinancials.schemeName}
                      category={null}
                      termMonths={resFinancials.termMonths || undefined}
                      dpRate={resFinancials.dpRate || undefined}
                      listPrice={resFinancials.listPrice}
                      promoAmt={resFinancials.promoDiscountAmount}
                      promoPct={resFinancials.listPrice > 0 ? resFinancials.promoDiscountAmount / resFinancials.listPrice * 100 : 0}
                      employeeAmt={resFinancials.employeeDiscountAmount}
                      employeePct={resFinancials.listPrice > 0 ? resFinancials.employeeDiscountAmount / resFinancials.listPrice * 100 : 0}
                      paytermAmt={Math.round(resFinancials.listPrice * resFinancials.paytermDiscountPct / 100)}
                      paytermPct={resFinancials.paytermDiscountPct}
                      hicAmt={resFinancials.hicDiscount}
                      nlp={resFinancials.netListPrice}
                      vat={resFinancials.vat}
                      otherCharges={resFinancials.otherCharges}
                      tcp={resFinancials.tcp}
                      reservationFee={resFinancials.reservationFee}
                      retentionFee={resFinancials.retentionFee}
                    />
                    <CalcCard
                      title="New"
                      unitCode={buyer?.inventory_code ?? null}
                      unitArea={resFinancials.unitArea}
                      schemeName={restructureDerived.match.payterm_scheme ?? ''}
                      category={null}
                      termMonths={restructureDerived.termMonths}
                      dpRate={rDpRate || undefined}
                      listPrice={resFinancials.listPrice}
                      promoAmt={restructureDerived.promoAmt}
                      promoPct={resFinancials.listPrice > 0 ? restructureDerived.promoAmt / resFinancials.listPrice * 100 : 0}
                      employeeAmt={restructureDerived.employeeAmt}
                      employeePct={resFinancials.listPrice > 0 ? restructureDerived.employeeAmt / resFinancials.listPrice * 100 : 0}
                      paytermAmt={restructureDerived.paytermAmt}
                      paytermPct={restructureDerived.discPct}
                      hicAmt={restructureDerived.hicAmt}
                      nlp={restructureDerived.nlp}
                      vat={restructureDerived.vat}
                      otherCharges={restructureDerived.oc}
                      tcp={restructureDerived.tcp}
                      reservationFee={resFinancials.reservationFee}
                      retentionFee={resFinancials.retentionFee}
                      highlight
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRComputed(false)}
                    className="w-full py-2.5 rounded-2xl border border-[#C03D25] text-[#C03D25] text-xs font-bold transition-colors active:bg-[#C03D25]/10"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                /* ── Selection view: scheme cards + dropdowns + Compute ── */
                <div className="py-3 space-y-3">
                  {/* Scheme cards */}
                  <div>
                    <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Payterm Scheme</p>
                    <div className="grid grid-cols-4 gap-2">
                      {PAYMENT_SCHEMES.map(ps => {
                        const available = rAvailableSchemes.some(s => s.value === ps.value);
                        const active    = rPaymentScheme === ps.value;
                        return (
                          <button key={ps.value} type="button" disabled={!available}
                            onClick={() => { setRPaymentScheme(ps.value); setRDpRate(''); setRTermStr(''); }}
                            className={`flex flex-col items-center gap-1 rounded-2xl border py-3 px-1.5 text-center transition-colors ${
                              !available
                                ? 'bg-[#F2F2F7] border-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed opacity-50'
                                : active
                                ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]'
                                : 'bg-white border-[#E5E5EA] text-[#6C6C70] active:bg-gray-50'
                            }`}
                          >
                            {ps.icon}
                            <span className="text-[10px] font-semibold leading-tight">{ps.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* DP % and Term dropdowns */}
                  {(rDpOptions.length > 0 || rTermOptions.length > 0) && (
                    <div className="bg-white/60 rounded-2xl px-3 border border-black/[0.06]">
                      {rDpOptions.length > 0 && (
                        <InlineSelect icon={<CreditCard size={15} />} label="Down Payment %" required
                          value={rDpRate ? `${rDpRate}%` : ''}
                          options={rDpOptions.map(v => `${v}%`)}
                          placeholder="Select DP %"
                          onChange={v => { setRDpRate(v.replace('%', '')); setRTermStr(''); }}
                        />
                      )}
                      {rTermOptions.length > 0 && (
                        <InlineSelect icon={<Clock size={15} />} label="Term" required
                          value={rTermStr ? `${rTermStr} months` : ''}
                          options={rTermOptions.map(v => `${v} months`)}
                          placeholder="Select term"
                          onChange={v => setRTermStr(v.replace(' months', ''))}
                        />
                      )}
                    </div>
                  )}

                  {rPaymentScheme && !restructureDerived && rPaymentScheme === 'spot_cash' && (
                    <p className="text-xs text-[#FF3B30]">No matching payterm found.</p>
                  )}

                  {/* Compute button */}
                  <button
                    type="button"
                    disabled={!restructureDerived}
                    onClick={() => setRComputed(true)}
                    className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all ${
                      restructureDerived
                        ? 'bg-[#C03D25] text-white shadow-[0_4px_12px_rgba(192,61,37,0.3)] active:opacity-80'
                        : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
                    }`}
                  >
                    Compute
                  </button>
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {saveErr && <p className="text-[#FF3B30] text-xs text-center px-4">{saveErr}</p>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => { setSaveErr(''); setShowConfirm(true); }}
          className={`w-full py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            canSubmit
              ? 'bg-[#C03D25] text-white shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80'
              : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
          }`}
        >
          <FileText size={15} />
          Submit Request
        </button>

      </div>

      {/* ── Confirm Modal ── */}
      {showConfirm && buyer && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Submit Request?</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                This will record the request for <span className="font-semibold text-[#1C1C1E]">{buyer.client_name}</span>.
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{buyer.reservation_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Type of Request</span>
                <span className="text-xs font-semibold text-[#1C1C1E] text-right max-w-[60%]">{typeOfRequest}</span>
              </div>
              {hasSubTypes && subType && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8E8E93]">Sub Type</span>
                  <span className="text-xs font-semibold text-[#1C1C1E] text-right max-w-[60%]">{subType}</span>
                </div>
              )}
              {typeOfRequest === 'Change of Unit' && newUnit && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8E8E93]">New Unit</span>
                  <span className="text-xs font-semibold text-[#C03D25] text-right">{newUnit.inventory_code}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Category</span>
                <span className="text-xs font-semibold text-[#1C1C1E] capitalize">{requestCategory}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8E8E93]">Turnaround</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{turnaroundDays} days</span>
              </div>
            </div>
            {saveErr && <p className="text-[#FF3B30] text-xs text-center px-6 pt-3">{saveErr}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80"
              >
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Submitting...</>
                  : <><CheckCircle2 size={15} /> Yes, Submit</>}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowConfirm(false)}
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
