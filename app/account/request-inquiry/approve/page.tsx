'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { computeRemainingBalance, processBRF } from '@/lib/brf';
import { fetchAllPayterms, type PaytermRecord } from '@/lib/paytems';
import {
  Hash, User, Building2, Tag, ChevronDown, Check,
  AlertTriangle, CheckCircle2, Loader2, Calculator,
  ArrowRightLeft, Banknote, Clock, CreditCard, CalendarRange,
} from 'lucide-react';
import type { RequestRecord } from '../page';

const SELECT_FIELDS = 'id, reservation_id, client_id, client_name, project_name, inventory_code, type_of_request, sub_type, request_category, turnaround_days, description, status, submitted_at, approval_status, resolution_status, approved_by, date_approved, new_inventory_code, new_payterm_code, new_payterm_scheme, new_term_months, remaining_balance, requested_by';

const OTHER_CHARGES_RATE = 0.07;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInternalScheme(label: string | null): string {
  switch (label) {
    case 'Deferred Cash': return 'deferred_cash';
    case 'Spot Cash':     return 'spot_cash';
    case 'Spot DP':       return 'spot_dp';
    case 'Stretched DP':  return 'stretched_dp';
    default:              return '';
  }
}

const peso = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Payment scheme cards ─────────────────────────────────────────────────────

const PAYMENT_SCHEMES = [
  { value: 'spot_cash',     label: 'Spot Cash',     icon: <Banknote size={16} /> },
  { value: 'deferred_cash', label: 'Deferred Cash', icon: <Clock size={16} /> },
  { value: 'spot_dp',       label: 'Spot DP',       icon: <CreditCard size={16} /> },
  { value: 'stretched_dp',  label: 'Stretched DP',  icon: <CalendarRange size={16} /> },
];

// ─── Inline expanding select (matches app standard) ──────────────────────────

function InlineSelect({ label, value, options, onChange, placeholder = 'Select', formatDisplay }: {
  label:          string;
  value:          string;
  options:        string[];
  onChange:       (v: string) => void;
  placeholder?:   string;
  formatDisplay?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && value && selectedRef.current) {
      setTimeout(() => selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
    }
  }, [open, value]);

  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 py-3 px-1"
      >
        <span className="text-[#1C1C1E] text-sm font-medium flex-1 text-left">{label}</span>
        <span className={`text-right text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
          {value ? (formatDisplay ? formatDisplay(value) : value) : placeholder}
        </span>
        <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && options.length > 0 && (
        <div className="pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {options.map(o => (
            <button
              key={o}
              ref={o === value ? selectedRef : null}
              type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                o === value
                  ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold'
                  : 'text-[#1C1C1E] active:bg-gray-100'
              }`}
            >
              {formatDisplay ? formatDisplay(o) : o}
              {o === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Schedule preview ─────────────────────────────────────────────────────────

interface PreviewLine { label: string; amount: number; isRetention?: boolean }

function buildPreview(
  scheme: string,
  termMonths: number,
  remaining: number,
  retentionFee: number,
  retentionAlreadyPaid: boolean,
  elapsedMonths: number = 0,
  dpPercent: number = 0,
  tcp: number = 0,
): PreviewLine[] {
  const effectiveTerm = (scheme === 'deferred_cash' || scheme === 'stretched_dp')
    ? Math.max(0, termMonths - elapsedMonths)
    : termMonths;
  const retFee      = retentionAlreadyPaid ? 0 : retentionFee;
  const installable = remaining - retFee;
  const lines: PreviewLine[] = [];

  if (scheme === 'deferred_cash') {
    const monthly = effectiveTerm > 0 ? Math.round(installable / effectiveTerm) : 0;
    for (let i = 0; i < Math.min(effectiveTerm, 3); i++) {
      lines.push({ label: `Monthly Deferred ${i + 1}/${effectiveTerm}`, amount: monthly });
    }
    if (effectiveTerm > 3) lines.push({ label: `… ${effectiveTerm - 3} more monthly lines`, amount: monthly });
    if (!retentionAlreadyPaid) lines.push({ label: 'Retention Fee', amount: retFee, isRetention: true });
  } else if (scheme === 'spot_cash') {
    lines.push({ label: 'Cash Out Balance', amount: installable });
    if (!retentionAlreadyPaid) lines.push({ label: 'Retention Fee', amount: retFee, isRetention: true });
  } else if (scheme === 'spot_dp') {
    lines.push({ label: 'Downpayment (Spot)', amount: installable });
    lines.push({ label: 'Loan Take-out (balance)', amount: 0 });
  } else if (scheme === 'stretched_dp') {
    const loanAmount  = Math.round(tcp * (1 - dpPercent / 100));
    const remainingDp = Math.max(0, remaining - loanAmount);
    if (remainingDp > 0 && effectiveTerm > 0) {
      const monthly = Math.round(remainingDp / effectiveTerm);
      for (let i = 0; i < Math.min(effectiveTerm, 3); i++) {
        lines.push({ label: `Monthly DP ${i + 1}/${effectiveTerm}`, amount: monthly });
      }
      if (effectiveTerm > 3) lines.push({ label: `… ${effectiveTerm - 3} more monthly lines`, amount: monthly });
    }
    lines.push({ label: 'Loan Take-out', amount: loanAmount });
  }
  return lines;
}

// ─── Main inner component ─────────────────────────────────────────────────────

function ApprovePageInner() {
  const router    = useRouter();
  const params    = useSearchParams();
  const requestId = params.get('id');

  const [request,      setRequest]      = useState<RequestRecord | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [userName,     setUserName]     = useState('');

  // Original balance (before payterm change)
  const [initialRemaining, setInitialRemaining] = useState(0);
  const [initialTcp,       setInitialTcp]       = useState(0);
  const [retentionFee,     setRetentionFee]      = useState(0);
  const [retPaid,          setRetPaid]           = useState(false);

  // Reservation financials for TCP recalculation
  const [listPrice,             setListPrice]             = useState(0);
  const [promoDiscountAmount,   setPromoDiscountAmount]   = useState(0);
  const [employeeDiscountAmount, setEmployeeDiscountAmount] = useState(0);
  const [hicDiscount,           setHicDiscount]           = useState(0);
  const [existingVat,           setExistingVat]           = useState(0);

  // Payterm data
  const [paytems, setPaytems] = useState<PaytermRecord[]>([]);

  // Calculator state
  const [paymentScheme, setPaymentScheme] = useState('');
  const [dpRate,        setDpRate]        = useState('');
  const [termStr,       setTermStr]       = useState('');

  const [elapsedMonths, setElapsedMonths] = useState(0);

  // UI state
  const [processing, setProcessing] = useState(false);
  const [error,      setError]      = useState('');
  const [done,       setDone]       = useState(false);

  useEffect(() => {
    if (!requestId) return;
    async function load() {
      const [session, { data: req }] = await Promise.all([
        getSession(),
        supabase.from('requests_and_inquiries').select(SELECT_FIELDS).eq('id', requestId!).single(),
      ]);
      setUserName(session?.full_name || session?.email || '');

      if (!req) { setLoading(false); return; }
      const r = req as RequestRecord;
      setRequest(r);

      if (r.reservation_id) {
        const [bal, retLine, resData] = await Promise.all([
          computeRemainingBalance(r.reservation_id),
          supabase
            .from('receivables_database')
            .select('payment_status')
            .eq('reservation_id', r.reservation_id)
            .eq('type_of_payment', 'Retention Fee')
            .maybeSingle(),
          supabase
            .from('reservations')
            .select('retention_fee, list_price, promo_discount_amount, employee_discount_amount, hic_discount, vat, total_contract_price, project, tower')
            .eq('reservation_id', r.reservation_id)
            .single(),
        ]);

        const res = resData.data as any;
        setInitialRemaining(bal);
        setInitialTcp(Number(res?.total_contract_price) || 0);
        setRetentionFee(Number(res?.retention_fee) || 0);
        setRetPaid((retLine.data as any)?.payment_status === 'Paid');
        setListPrice(Number(res?.list_price) || 0);
        setPromoDiscountAmount(Number(res?.promo_discount_amount) || 0);
        setEmployeeDiscountAmount(Number(res?.employee_discount_amount) || 0);
        setHicDiscount(Number(res?.hic_discount) || 0);
        setExistingVat(Number(res?.vat) || 0);

        if (res?.project && res?.tower) {
          try {
            const all = await fetchAllPayterms();
            setPaytems(all.filter(p => p.project === res.project && p.tower === res.tower));
          } catch { /* non-fatal */ }
        }

        // Count installment months already elapsed (calendar-based)
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: elapsedLines } = await supabase
          .from('receivables_database')
          .select('type_of_payment')
          .eq('reservation_id', r.reservation_id)
          .neq('payment_status', 'Superseded')
          .lt('due_date', todayStr);
        const INSTALLMENT_EXCLUDES = [
          'Reservation Fee', 'Retention Fee', 'Downpayment', 'Cash Out Balance', 'Loan Take-out',
        ];
        setElapsedMonths(
          ((elapsedLines ?? []) as any[])
            .filter(l => !INSTALLMENT_EXCLUDES.includes(l.type_of_payment))
            .length
        );
      }
      setLoading(false);
    }
    load();
  }, [requestId]);

  // ── Available schemes (only those present in paytems) ─────────────────────

  const availableSchemes = useMemo(() => {
    const present = new Set(paytems.map(p => toInternalScheme(p.payterm_scheme ?? '')).filter(Boolean));
    return PAYMENT_SCHEMES.filter(s => present.has(s.value));
  }, [paytems]);

  // ── Secondary dropdown options ─────────────────────────────────────────────

  const dpOptions = useMemo(() => {
    if (paymentScheme !== 'spot_dp' && paymentScheme !== 'stretched_dp') return [];
    const set = new Set<string>();
    paytems
      .filter(p => toInternalScheme(p.payterm_scheme ?? '') === paymentScheme)
      .forEach(p => { if (p.dp_percent) set.add(p.dp_percent); });
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [paytems, paymentScheme]);

  const termOptions = useMemo(() => {
    if (paymentScheme !== 'deferred_cash' && paymentScheme !== 'stretched_dp') return [];
    let filtered = paytems.filter(p => toInternalScheme(p.payterm_scheme ?? '') === paymentScheme);
    if (paymentScheme === 'stretched_dp' && dpRate) {
      filtered = filtered.filter(p => p.dp_percent === dpRate);
    }
    const set = new Set<string>();
    filtered.forEach(p => { if (p.term) set.add(p.term); });
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [paytems, paymentScheme, dpRate]);

  // ── Derived: find matching payterm + compute new TCP ──────────────────────

  const derived = useMemo(() => {
    if (!paymentScheme || !listPrice) return null;
    // Require secondary fields when the scheme needs them
    if (paymentScheme === 'deferred_cash' && !termStr) return null;
    if (paymentScheme === 'spot_dp'       && !dpRate)  return null;
    if (paymentScheme === 'stretched_dp'  && (!dpRate || !termStr)) return null;

    const matchedPayterm = paytems.find(p => {
      const pScheme = toInternalScheme(p.payterm_scheme ?? '');
      if (pScheme !== paymentScheme) return false;
      if ((paymentScheme === 'spot_dp' || paymentScheme === 'stretched_dp') && p.dp_percent !== dpRate) return false;
      if ((paymentScheme === 'deferred_cash' || paymentScheme === 'stretched_dp') && p.term !== termStr) return false;
      return true;
    });
    if (!matchedPayterm) return null;

    const discPct      = Number(matchedPayterm.discount) || 0;
    const paytermAmt   = Math.round(listPrice * discPct / 100);
    const nlpBeforeHic = listPrice - promoDiscountAmount - employeeDiscountAmount - paytermAmt;
    const nlp          = nlpBeforeHic - hicDiscount;
    const vat          = existingVat > 0 ? Math.round(nlp * 0.12) : 0;
    const oc           = Math.round(nlp * OTHER_CHARGES_RATE);
    const tcp          = nlp + vat + oc + hicDiscount;
    const totalPaid    = Math.max(0, initialTcp - initialRemaining);
    const remaining    = Math.max(0, tcp - totalPaid);
    const termMonths   = parseInt(matchedPayterm.term ?? '') || 0;
    return { matchedPayterm, discPct, paytermAmt, nlp, vat, oc, tcp, remaining, termMonths };
  }, [paytems, paymentScheme, dpRate, termStr, listPrice, promoDiscountAmount, employeeDiscountAmount, hicDiscount, existingVat, initialTcp, initialRemaining]);

  const scheme     = paymentScheme;
  const termMonths = derived?.termMonths ?? 0;
  const remaining  = derived?.remaining  ?? initialRemaining;

  const needsTerm    = scheme === 'deferred_cash' || scheme === 'stretched_dp';
  const effectiveTerm = needsTerm ? Math.max(0, termMonths - elapsedMonths) : termMonths;
  const termTooShort  = needsTerm && termMonths > 0 && elapsedMonths >= termMonths;
  const canApprove   = !!derived && remaining > 0 && !termTooShort;

  const dpPercent = derived ? Number(derived.matchedPayterm.dp_percent) || 0 : 0;

  const preview = useMemo(() =>
    scheme && derived ? buildPreview(scheme, termMonths, remaining, retentionFee, retPaid, elapsedMonths, dpPercent, derived.tcp) : [],
    [scheme, derived, termMonths, remaining, retentionFee, retPaid, elapsedMonths, dpPercent]
  );

  function onSchemeChange(value: string) {
    setPaymentScheme(value);
    setDpRate('');
    setTermStr('');
  }

  function onDpRateChange(value: string) {
    setDpRate(value);
    if (paymentScheme === 'stretched_dp') setTermStr('');
  }

  async function handleApprove() {
    if (!request || !canApprove || !derived) return;
    const { matchedPayterm } = derived;
    setProcessing(true);
    setError('');
    try {
      await processBRF({
        requestId:               request.id,
        reservationId:           request.reservation_id!,
        typeOfRequest:           request.type_of_request,
        approvedBy:              userName,
        newPaytermCode:          matchedPayterm.payterm_code ?? '',
        newPaytermScheme:        scheme,
        newSchemeName:           matchedPayterm.payterm_scheme ?? '',
        newTermMonths:           termMonths,
        remainingBalance:        remaining,
        newPaytermDiscountPct:   derived.discPct,
        newPaytermDiscountAmount: derived.paytermAmt,
        newDpPercent:            dpPercent,
        newNlp:                  derived.nlp,
        newVat:                  derived.vat,
        newOtherCharges:         derived.oc,
        newTcp:                  derived.tcp,
        newInventoryCode:        request.new_inventory_code ?? undefined,
      });
      setDone(true);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to process BRF. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell title="Approve Request" backButton>
        <GlassCard className="p-8 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#C03D25]" />
        </GlassCard>
      </PageShell>
    );
  }

  if (!request) {
    return (
      <PageShell title="Approve Request" backButton>
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-[#8E8E93]">Request not found.</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (done) {
    return (
      <PageShell title="Approve Request" backButton>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-green-500" />
          </div>
          <p className="text-base font-bold text-[#1C1C1E]">BRF Approved & Processed</p>
          <p className="text-sm text-[#8E8E93] text-center leading-relaxed">
            The new payment schedule for{' '}
            <span className="font-semibold text-[#1C1C1E]">{request.client_name}</span> has been generated.
            Old unpaid lines are marked Superseded.
          </p>
          <button
            onClick={() => { window.location.href = '/account/request-inquiry'; }}
            className="w-full py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
          >
            Back to Requests
          </button>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell title="Approve Request" backButton>
      <div className="space-y-4 pb-8">

        {/* Buyer info */}
        <GlassCard className="px-4 py-1">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
            Buyer Information
          </p>
          {([
            [<Hash size={13} key="ri" />,      'Reservation ID', request.reservation_id ?? '—'],
            [<User size={13} key="cn" />,      'Client Name',    request.client_name    ?? '—'],
            [<Building2 size={13} key="pn" />, 'Project',        request.project_name   ?? '—'],
            [<Tag size={13} key="ic" />,       'Current Unit',   request.inventory_code ?? '—'],
          ] as [React.ReactNode, string, string][]).map(([icon, label, value]) => (
            <div key={label} className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] last:border-0">
              <span className="text-[#C03D25] shrink-0">{icon}</span>
              <span className="flex-1 text-xs font-medium text-[#1C1C1E]">{label}</span>
              <span className="text-xs text-[#6C6C70]">{value}</span>
            </div>
          ))}
          {request.new_inventory_code && (
            <div className="flex items-center gap-3 py-2.5">
              <ArrowRightLeft size={13} className="text-[#C03D25] shrink-0" />
              <span className="flex-1 text-xs font-medium text-[#1C1C1E]">New Unit</span>
              <span className="text-xs font-semibold text-[#C03D25]">{request.new_inventory_code}</span>
            </div>
          )}
        </GlassCard>

        {/* Balance summary */}
        <GlassCard className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <Calculator size={18} className="text-[#C03D25] shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-[#8E8E93]">
                {derived ? 'New Remaining Balance' : 'Remaining Balance'}
              </p>
              <p className="text-xl font-bold text-[#1C1C1E]">{peso(remaining)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#8E8E93]">Type</p>
              <p className="text-xs font-semibold text-[#C03D25]">{request.type_of_request}</p>
            </div>
          </div>
          {derived && (
            <div className="border-t border-black/[0.06] pt-2 grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-[10px] text-[#8E8E93]">New TCP</p>
                <p className="text-xs font-semibold text-[#1C1C1E]">{peso(derived.tcp)}</p>
              </div>
              <div className="text-center border-x border-black/[0.06]">
                <p className="text-[10px] text-[#8E8E93]">Payterm Disc</p>
                <p className="text-xs font-semibold text-green-600">({peso(derived.paytermAmt)})</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#8E8E93]">Was</p>
                <p className="text-xs font-semibold text-[#8E8E93]">{peso(initialTcp)}</p>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Payment calculator */}
        <GlassCard className="px-4 py-4 space-y-4">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">New Payment Terms</p>

          {paytems.length === 0 ? (
            <p className="text-xs text-[#FF3B30]">No paytems found for this project/tower. Cannot approve.</p>
          ) : (
            <>
              {/* Scheme cards */}
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_SCHEMES.map(ps => {
                  const available = availableSchemes.some(s => s.value === ps.value);
                  const active    = paymentScheme === ps.value;
                  return (
                    <button
                      key={ps.value}
                      type="button"
                      disabled={!available}
                      onClick={() => onSchemeChange(ps.value)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border py-3 px-1.5 text-center transition-colors ${
                        !available
                          ? 'bg-[#F2F2F7] border-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed opacity-50'
                          : active
                          ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]'
                          : 'bg-white border-[#E5E5EA] text-[#6C6C70]'
                      }`}
                    >
                      {ps.icon}
                      <span className="text-[10px] font-semibold leading-tight">{ps.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* DP % and Term dropdowns */}
              {((paymentScheme === 'spot_dp' || paymentScheme === 'stretched_dp') && dpOptions.length > 0) ||
               ((paymentScheme === 'deferred_cash' || paymentScheme === 'stretched_dp') && termOptions.length > 0) ? (
                <div className="bg-white/60 rounded-2xl px-3 border border-black/[0.06]">
                  {(paymentScheme === 'spot_dp' || paymentScheme === 'stretched_dp') && dpOptions.length > 0 && (
                    <InlineSelect
                      label="Down Payment %"
                      value={dpRate}
                      onChange={onDpRateChange}
                      options={dpOptions}
                      placeholder="Select DP %"
                      formatDisplay={v => `${v}%`}
                    />
                  )}
                  {(paymentScheme === 'deferred_cash' || paymentScheme === 'stretched_dp') && termOptions.length > 0 && (
                    <InlineSelect
                      label="Term"
                      value={termStr}
                      onChange={setTermStr}
                      options={termOptions}
                      placeholder="Select term"
                      formatDisplay={v => `${v} months`}
                    />
                  )}
                </div>
              ) : null}

              {/* Matched payterm info */}
              {derived && (
                <div className="bg-[#F2F2F7] rounded-xl px-3 py-2.5 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#8E8E93]">Code</span>
                    <span className="text-[11px] font-semibold text-[#1C1C1E]">{derived.matchedPayterm.payterm_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#8E8E93]">Discount</span>
                    <span className="text-[11px] font-semibold text-green-600">{derived.discPct}%</span>
                  </div>
                  {needsTerm && effectiveTerm > 0 && remaining > 0 && (() => {
                    let monthlyBase: number;
                    if (scheme === 'stretched_dp' && derived) {
                      const loanAmt = Math.round(derived.tcp * (1 - dpPercent / 100));
                      monthlyBase   = Math.max(0, remaining - loanAmt);
                    } else {
                      monthlyBase = remaining - (retPaid ? 0 : retentionFee);
                    }
                    return monthlyBase > 0 ? (
                      <div className="flex justify-between border-t border-black/[0.06] pt-1.5 mt-1">
                        <span className="text-[11px] text-[#8E8E93]">
                          Monthly payment{elapsedMonths > 0 ? ` (${effectiveTerm} mo.)` : ''}
                        </span>
                        <span className="text-[11px] font-bold text-[#C03D25]">
                          {peso(Math.round(monthlyBase / effectiveTerm))}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Elapsed months info / term-too-short error */}
              {needsTerm && elapsedMonths > 0 && termMonths > 0 && !termTooShort && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    {elapsedMonths} month{elapsedMonths !== 1 ? 's' : ''} already elapsed.
                    Effective remaining term: <span className="font-bold">{effectiveTerm} months</span>.
                  </p>
                </div>
              )}
              {termTooShort && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                  <AlertTriangle size={13} className="text-[#FF3B30] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[#FF3B30] leading-relaxed">
                    Cannot restructure: {elapsedMonths} months already elapsed exceeds the selected term of {termMonths} months. Choose a longer term.
                  </p>
                </div>
              )}

              {/* No match warning */}
              {paymentScheme && !derived && (
                paymentScheme === 'spot_cash' ? (
                  <p className="text-xs text-[#FF3B30]">No matching payterm record found.</p>
                ) : null
              )}
            </>
          )}
        </GlassCard>

        {/* Schedule preview */}
        {preview.length > 0 && (
          <GlassCard className="px-4 py-1">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
              New Schedule Preview
            </p>
            {preview.map((line, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-black/[0.06] last:border-0">
                <span className={`text-xs ${line.isRetention ? 'text-[#8E8E93] italic' : 'text-[#1C1C1E]'}`}>{line.label}</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{peso(line.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2.5 bg-[#F2F2F7] -mx-4 px-4 rounded-b-2xl mt-1">
              <span className="text-xs font-bold text-[#1C1C1E]">Total Remaining</span>
              <span className="text-xs font-bold text-[#C03D25]">{peso(remaining)}</span>
            </div>
          </GlassCard>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-100">
            <AlertTriangle size={14} className="text-[#FF3B30] shrink-0" />
            <p className="text-xs text-[#FF3B30]">{error}</p>
          </div>
        )}

        <button
          type="button"
          disabled={!canApprove || processing}
          onClick={handleApprove}
          className={`w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${
            canApprove && !processing
              ? 'bg-[#C03D25] text-white shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80'
              : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
          }`}
        >
          {processing
            ? <><Loader2 size={15} className="animate-spin" /> Processing…</>
            : <><CheckCircle2 size={15} /> Approve & Generate Schedule</>}
        </button>

      </div>
    </PageShell>
  );
}

// ─── Page export (Suspense required for useSearchParams) ──────────────────────

export default function ApprovePage() {
  return (
    <Suspense fallback={
      <PageShell title="Approve Request" backButton>
        <GlassCard className="p-8 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#C03D25]" />
        </GlassCard>
      </PageShell>
    }>
      <ApprovePageInner />
    </Suspense>
  );
}
