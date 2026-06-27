'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import CalcCard from '@/components/ui/CalcCard';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { computeRemainingBalance, processBRF } from '@/lib/brf';
import { fetchAllPayterms } from '@/lib/paytems';
import {
  Hash, User, Building2, Tag, ArrowRight, FileText,
  CheckCircle2, Loader2, AlertTriangle, Calendar,
} from 'lucide-react';
import type { RequestRecord } from '../page';
import BrfLoadingScreen from '@/components/ui/BrfLoadingScreen';

const SELECT_FIELDS = 'id, reservation_id, client_id, client_name, project_name, inventory_code, type_of_request, sub_type, description, submitted_at, approval_status, approved_by, date_approved, new_inventory_code, new_payterm_code, new_payterm_scheme, new_term_months, remaining_balance, requested_by_name, ticket_id, new_list_price, new_promo_amt, new_employee_amt, new_payterm_amt, new_hic_amt, new_nlp, new_vat, new_oc, new_tcp';

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ResFin {
  listPrice:      number;
  promoAmt:       number;
  promoRate:      number;
  employeeAmt:    number;
  employeeRate:   number;
  paytermDiscPct: number;
  paytermAmt:     number;
  hicAmt:         number;
  nlp:            number;
  vat:            number;
  oc:             number;
  tcp:            number;
  resFee:         number;
  retFee:         number;
  unitArea:       number;
  schemeName:     string;
  internalScheme: string;
  dpRate:         string;
  termMonths:     number;
  hasVat:         boolean;
  project:        string;
  tower:          string;
}

interface NewPayterm {
  discPct:        number;
  dpRate:         string;
  termMonths:     number;
  schemeName:     string;
  internalScheme: string;
  paytermCode:    string;
}

function toInternalScheme(display: string): string {
  const map: Record<string, string> = {
    'Deferred Cash':    'deferred_cash',
    'Spot Cash':        'spot_cash',
    'Spot DP':          'spot_dp',
    'Stretched DP':     'stretched_dp',
  };
  return map[display] ?? display.toLowerCase().replace(/\s+/g, '_');
}

function InfoRow({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] last:border-0">
      <span className="text-[#C03D25] shrink-0">{icon}</span>
      <span className="flex-1 text-xs font-medium text-[#1C1C1E]">{label}</span>
      <span className={`text-xs text-right max-w-[55%] truncate ${accent ? 'font-bold text-[#C03D25]' : 'text-[#6C6C70]'}`}>{value}</span>
    </div>
  );
}

// ─── Main inner component ─────────────────────────────────────────────────────

function ExecutePageInner() {
  const params    = useSearchParams();
  const requestId = params.get('id');

  const [request,    setRequest]    = useState<RequestRecord | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [userName,   setUserName]   = useState('');
  const [error,      setError]      = useState('');
  const [processing, setProcessing] = useState(false);
  const [brfStep,    setBrfStep]    = useState(0);
  const [done,       setDone]       = useState(false);

  const [resFin,           setResFin]           = useState<ResFin | null>(null);
  const [newUnitArea,      setNewUnitArea]       = useState(0);
  const [newUnitHic,       setNewUnitHic]        = useState(false);
  const [newPayterm,       setNewPayterm]        = useState<NewPayterm | null>(null);
  const [initialRemaining, setInitialRemaining]  = useState(0);

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

      if (!r.reservation_id) { setLoading(false); return; }

      const [bal, { data: res }] = await Promise.all([
        computeRemainingBalance(r.reservation_id),
        supabase.from('reservations')
          .select('list_price, promo_discount_amount, employee_discount_amount, hic_discount, payterm_discount_pct, net_list_price, vat, other_charges, total_contract_price, reservation_fee, retention_fee, unit_area, scheme_name, payment_scheme, term_months, dp_rate, project, tower, unit_type')
          .eq('reservation_id', r.reservation_id)
          .single(),
      ]);
      setInitialRemaining(bal);
      if (!res) { setLoading(false); return; }

      const lp  = Number(res.list_price) || 0;
      const vat = Number(res.vat) || 0;
      const fin: ResFin = {
        listPrice:      lp,
        promoAmt:       Number(res.promo_discount_amount) || 0,
        promoRate:      lp > 0 ? (Number(res.promo_discount_amount) || 0) / lp * 100 : 0,
        employeeAmt:    Number(res.employee_discount_amount) || 0,
        employeeRate:   lp > 0 ? (Number(res.employee_discount_amount) || 0) / lp * 100 : 0,
        paytermDiscPct: Number(res.payterm_discount_pct) || 0,
        paytermAmt:     Math.round(lp * (Number(res.payterm_discount_pct) || 0) / 100),
        hicAmt:         Number(res.hic_discount) || 0,
        nlp:            Number(res.net_list_price) || 0,
        vat,
        oc:             Number(res.other_charges) || 0,
        tcp:            Number(res.total_contract_price) || 0,
        resFee:         Number(res.reservation_fee) || 0,
        retFee:         Number(res.retention_fee) || 0,
        unitArea:       Number(res.unit_area) || 0,
        schemeName:     res.scheme_name ?? '',
        internalScheme: res.payment_scheme || toInternalScheme(res.scheme_name ?? ''),
        dpRate:         (res.dp_rate ?? '').replace('%', ''),
        termMonths:     Number(res.term_months) || 0,
        hasVat:         vat > 0,
        project:        res.project ?? '',
        tower:          res.tower ?? '',
      };
      setResFin(fin);

      // Change of Unit: fetch new unit area for display (financials come from stored r.new_*)
      if (r.type_of_request === 'Change of Unit' && r.new_inventory_code) {
        const { data: unit } = await supabase
          .from('Inventory')
          .select('"Inventory Code", "Unit Area", HIC')
          .eq('"Inventory Code"', r.new_inventory_code.trim())
          .maybeSingle();
        if (unit) {
          const raw = unit as Record<string, unknown>;
          setNewUnitArea(Number(raw['Unit Area']) || 0);
          setNewUnitHic(!!raw['HIC']);
        }
        // Change of Unit keeps same payterm — use existing reservation payterm
        setNewPayterm({
          discPct:        fin.paytermDiscPct,
          dpRate:         fin.dpRate,
          termMonths:     fin.termMonths,
          schemeName:     fin.schemeName,
          internalScheme: fin.internalScheme,
          paytermCode:    '',
        });
      }

      // Payment Schedule Restructuring: look up new payterm
      if (r.type_of_request === 'Payment Schedule Restructuring' && (r.new_payterm_code || r.new_payterm_scheme)) {
        const all = await fetchAllPayterms();
        const byCode = r.new_payterm_code ? all.find(p => p.payterm_code === r.new_payterm_code) : null;
        const byScheme = all.filter(p => p.project === fin.project && p.tower === fin.tower)
          .find(p => {
            if (r.new_payterm_scheme && p.payterm_scheme !== r.new_payterm_scheme) return false;
            if (r.new_term_months && p.term && Number(p.term) !== r.new_term_months) return false;
            return true;
          });
        const match = byCode ?? byScheme ?? null;
        if (match) {
          const rawScheme = match.payterm_scheme ?? r.new_payterm_scheme ?? '';
          setNewPayterm({
            discPct:        Number(match.discount) || 0,
            dpRate:         match.dp_percent ?? '',
            termMonths:     Number(match.term) || r.new_term_months || 0,
            schemeName:     rawScheme,
            internalScheme: toInternalScheme(rawScheme),
            paytermCode:    match.payterm_code ?? r.new_payterm_code ?? '',
          });
        }
      }

      setLoading(false);
    }
    load();
  }, [requestId]);

  // ── Derived: new card financials (read from stored submission snapshot) ──────

  const newFin = useMemo(() => {
    if (!resFin || !newPayterm || !request) return null;
    if (request.new_tcp == null) return null;   // old record without stored financials
    const isChangeOfUnit = request.type_of_request === 'Change of Unit';
    const lp        = Number(request.new_list_price)   || 0;
    const promoAmt  = Number(request.new_promo_amt)    || 0;
    const empAmt    = Number(request.new_employee_amt) || 0;
    const paytermAmt = Number(request.new_payterm_amt) || 0;
    const hicAmt    = Number(request.new_hic_amt)      || 0;
    const nlp       = Number(request.new_nlp)          || 0;
    const vat       = Number(request.new_vat)          || 0;
    const oc        = Number(request.new_oc)           || 0;
    const tcp       = Number(request.new_tcp)          || 0;
    const totalPaid = Math.max(0, resFin.tcp - initialRemaining);
    const remaining = Math.max(0, tcp - totalPaid);
    const area      = isChangeOfUnit ? newUnitArea : resFin.unitArea;
    return { lp, promoAmt, empAmt, paytermAmt, hicAmt, nlp, vat, oc, tcp, remaining, area };
  }, [resFin, newPayterm, request, newUnitArea, initialRemaining]);

  const canExecute = !!newFin && !!newPayterm && !processing;

  async function handleExecute() {
    if (!request || !resFin || !newFin || !newPayterm) return;
    setProcessing(true);
    setBrfStep(0);
    setError('');
    try {
      await processBRF({
        requestId:                request.id,
        reservationId:            request.reservation_id!,
        typeOfRequest:            request.type_of_request,
        approvedBy:               userName,
        newPaytermCode:           newPayterm.paytermCode || request.new_payterm_code || '',
        newPaytermScheme:         request.new_payterm_scheme || newPayterm.internalScheme || '',
        newSchemeName:            newPayterm.schemeName,
        newTermMonths:            newPayterm.termMonths,
        remainingBalance:         newFin.remaining,
        newPaytermDiscountPct:    newPayterm.discPct,
        newPaytermDiscountAmount: newFin.paytermAmt,
        newDpPercent:             Number(newPayterm.dpRate) || 0,
        newListPrice:             newFin.lp,
        newPromoAmount:           newFin.promoAmt,
        newEmployeeAmount:        newFin.empAmt,
        newNlp:                   newFin.nlp,
        newVat:                   newFin.vat,
        newOtherCharges:          newFin.oc,
        newHicAmount:             newFin.hicAmt,
        newTcp:                   newFin.tcp,
        newUnitArea:              isChangeOfUnit && newUnitArea > 0 ? newUnitArea : undefined,
        newInventoryCode:         request.new_inventory_code ?? undefined,
        onStep:                   setBrfStep,
      });
      setDone(true);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to execute BRF. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell title="Execute BRF" backButton>
        <GlassCard className="p-8 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#C03D25]" />
        </GlassCard>
      </PageShell>
    );
  }

  if (!request) {
    return (
      <PageShell title="Execute BRF" backButton>
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-[#8E8E93]">Request not found.</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (done) {
    return (
      <PageShell title="Execute BRF" backButton>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-green-500" />
          </div>
          <p className="text-base font-bold text-[#1C1C1E]">BRF Resolved</p>
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

  const isChangeOfUnit = request.type_of_request === 'Change of Unit';

  return (
    <>
      {processing && <BrfLoadingScreen currentStep={brfStep} />}
      <PageShell title="Execute BRF" backButton>
        <div className="space-y-4 pb-8">

          {/* Request details */}
          <GlassCard className="px-4 py-1">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider py-2.5 border-b border-black/[0.06]">
              Request Details
            </p>
            <InfoRow icon={<Hash size={13} />}     label="Reservation ID"   value={request.reservation_id ?? '—'} />
            <InfoRow icon={<User size={13} />}     label="Client"           value={request.client_name ?? '—'} />
            <InfoRow icon={<Building2 size={13} />} label="Project"          value={request.project_name ?? '—'} />
            <InfoRow icon={<Tag size={13} />}      label="Current Unit"     value={request.inventory_code ?? '—'} />
            {isChangeOfUnit && request.new_inventory_code && (
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <ArrowRight size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Unit Change</span>
                <div className="flex items-center gap-1 text-xs font-semibold">
                  <span className="text-[#6C6C70]">{request.inventory_code ?? '—'}</span>
                  <ArrowRight size={11} className="text-[#C7C7CC]" />
                  <span className="text-[#C03D25]">{request.new_inventory_code}</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] bg-black/[0.015] -mx-4 px-4">
              <FileText size={13} className="text-[#C03D25] shrink-0" />
              <span className="flex-1 text-xs font-bold text-[#1C1C1E]">Type</span>
              <span className="text-xs font-bold text-[#C03D25]">{request.type_of_request}</span>
            </div>
            <InfoRow icon={<Calendar size={13} />} label="Submitted"        value={fmt(request.submitted_at)} />
            <InfoRow icon={<Calendar size={13} />} label="Approved"         value={fmt(request.date_approved)} />
            {request.approved_by && (
              <InfoRow icon={<User size={13} />} label="Approved By" value={request.approved_by} />
            )}
            {request.description && (
              <div className="py-2.5">
                <p className="text-[10px] text-[#8E8E93] mb-1">Description</p>
                <p className="text-xs text-[#3C3C43] leading-relaxed">{request.description}</p>
              </div>
            )}
          </GlassCard>

          {/* Comparison cards */}
          {resFin && newFin && newPayterm && (
            <div>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2 px-1">Comparison</p>
              <div className="grid grid-cols-2 [grid-template-rows:auto_1fr] gap-3">
                <CalcCard
                  title="Current"
                  unitCode={request.inventory_code}
                  unitArea={resFin.unitArea}
                  schemeName={resFin.schemeName}
                  termMonths={resFin.termMonths}
                  dpRate={resFin.dpRate}
                  isHic={resFin.hicAmt > 0}
                  listPrice={resFin.listPrice}
                  promoAmt={resFin.promoAmt}
                  promoPct={resFin.promoRate}
                  employeeAmt={resFin.employeeAmt}
                  employeePct={resFin.employeeRate}
                  paytermAmt={resFin.paytermAmt}
                  paytermPct={resFin.paytermDiscPct}
                  hicAmt={resFin.hicAmt}
                  nlp={resFin.nlp}
                  vat={resFin.vat}
                  otherCharges={resFin.oc}
                  tcp={resFin.tcp}
                  reservationFee={resFin.resFee}
                  retentionFee={resFin.retFee}
                />
                <CalcCard
                  title="New"
                  unitCode={isChangeOfUnit ? (request.new_inventory_code ?? undefined) : request.inventory_code}
                  unitArea={newFin.area}
                  schemeName={newPayterm.schemeName}
                  termMonths={newPayterm.termMonths}
                  dpRate={newPayterm.dpRate}
                  isHic={newFin.hicAmt > 0}
                  listPrice={newFin.lp}
                  promoAmt={newFin.promoAmt}
                  promoPct={newFin.lp > 0 ? newFin.promoAmt / newFin.lp * 100 : 0}
                  employeeAmt={newFin.empAmt}
                  employeePct={newFin.lp > 0 ? newFin.empAmt / newFin.lp * 100 : 0}
                  paytermAmt={newFin.paytermAmt}
                  paytermPct={newPayterm.discPct}
                  hicAmt={newFin.hicAmt}
                  nlp={newFin.nlp}
                  vat={newFin.vat}
                  otherCharges={newFin.oc}
                  tcp={newFin.tcp}
                  reservationFee={resFin.resFee}
                  retentionFee={resFin.retFee}
                  highlight
                />
              </div>
            </div>
          )}

          {!newPayterm && !loading && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-100">
              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Could not load new payment terms. The request may be missing payterm data.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-100">
              <AlertTriangle size={14} className="text-[#FF3B30] shrink-0" />
              <p className="text-xs text-[#FF3B30]">{error}</p>
            </div>
          )}

          <button
            type="button"
            disabled={!canExecute}
            onClick={handleExecute}
            className={`w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${
              canExecute
                ? 'bg-[#C03D25] text-white shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80'
                : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
            }`}
          >
            <CheckCircle2 size={15} /> Execute
          </button>

        </div>
      </PageShell>
    </>
  );
}

// ─── Page export (Suspense required for useSearchParams) ──────────────────────

export default function ApprovePage() {
  return (
    <Suspense fallback={
      <PageShell title="Execute BRF" backButton>
        <GlassCard className="p-8 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#C03D25]" />
        </GlassCard>
      </PageShell>
    }>
      <ExecutePageInner />
    </Suspense>
  );
}
