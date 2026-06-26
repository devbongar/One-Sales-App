'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { isBrfType } from '@/lib/brf';
import { fetchAllPayterms } from '@/lib/paytems';
import CalcCard from '@/components/ui/CalcCard';
import {
  FilePlus, ChevronRight, Building2, Hash, User, Tag,
  Clock, Calendar, ListChecks, Layers, FileText, GitBranch, AlignLeft, X,
  CircleDot, CheckCircle2, AlertTriangle, ArrowRight, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestRecord {
  id:                 string;
  ticket_id:          string | null;
  reservation_id:     string | null;
  client_id:          string | null;
  client_name:        string | null;
  project_name:       string | null;
  inventory_code:     string | null;
  type_of_request:    string;
  sub_type:           string | null;
  request_category:   string;
  turnaround_days:    number;
  description:        string | null;
  status:             string;
  submitted_at:       string;
  approval_status:    string | null;
  resolution_status:  string | null;
  approved_by:        string | null;
  date_approved:      string | null;
  new_inventory_code: string | null;
  new_payterm_code:   string | null;
  new_payterm_scheme: string | null;
  new_term_months:    number | null;
  remaining_balance:  number | null;
  requested_by:       string | null;
  requested_by_name:  string | null;
}

const SELECT_FIELDS = 'id, ticket_id, reservation_id, client_id, client_name, project_name, inventory_code, type_of_request, sub_type, request_category, turnaround_days, description, status, submitted_at, approval_status, resolution_status, approved_by, date_approved, new_inventory_code, new_payterm_code, new_payterm_scheme, new_term_months, remaining_balance, requested_by, requested_by_name';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null) {
  if (!name) return 'RQ';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function categoryStyle(cat: string) {
  if (cat === 'simple')  return { bg: 'rgba(0,122,255,0.10)',  text: '#0055CC', label: 'Simple' };
  if (cat === 'complex') return { bg: 'rgba(255,159,10,0.12)', text: '#A05A00', label: 'Complex' };
  return { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: cat };
}

export function statusStyle(status: string, approvalStatus?: string | null) {
  if (approvalStatus === 'Pending')  return { bg: 'rgba(255,159,10,0.12)', text: '#A05A00', label: 'Pending',  Icon: AlertTriangle };
  if (approvalStatus === 'Approved') return { bg: 'rgba(0,122,255,0.10)',  text: '#0055CC', label: 'Approved', Icon: CheckCircle2  };
  if (approvalStatus === 'Rejected') return { bg: 'rgba(255,59,48,0.10)',  text: '#C0392B', label: 'Rejected', Icon: X             };
  if (approvalStatus === 'Resolved') return { bg: 'rgba(52,199,89,0.12)',  text: '#1A7F37', label: 'Resolved', Icon: CheckCircle2  };
  if (status === 'open')   return { bg: 'rgba(52,199,89,0.12)',   text: '#1A7F37', label: 'Open',   Icon: CircleDot   };
  if (status === 'closed') return { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: 'Closed', Icon: CheckCircle2 };
  return { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70', label: status, Icon: CircleDot };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Request Card ─────────────────────────────────────────────────────────────

export function RequestCard({ r, onClick }: { r: RequestRecord; onClick: () => void }) {
  const st = statusStyle(r.status, r.approval_status);
  return (
    <GlassCard
      className="p-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
      >
        <span className="text-sm font-bold text-white">{getInitials(r.client_name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold font-mono text-[#1C1C1E] truncate">{r.ticket_id ?? '—'}</p>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: st.bg, color: st.text }}
          >
            {st.label}
          </span>
        </div>
        <p className="text-xs text-[#8E8E93] mt-0.5 truncate">{r.client_name ?? '—'}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Hash size={10} className="text-[#C7C7CC] shrink-0" />
          <span className="text-xs text-[#6C6C70] truncate">{r.reservation_id ?? '—'}</span>
          <span className="text-[#D1D1D6]">·</span>
          <span className="text-xs text-[#6C6C70] truncate">{r.type_of_request}</span>
          {r.sub_type && (
            <>
              <span className="text-[#D1D1D6]">·</span>
              <span className="text-xs text-[#6C6C70] truncate">{r.sub_type}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-[#8E8E93]">{timeAgo(r.submitted_at)}</span>
        <span className="text-[10px] text-[#C7C7CC]">{r.turnaround_days}d TAT</span>
      </div>
    </GlassCard>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

interface ResFin {
  listPrice: number; promoAmt: number; promoRate: number;
  employeeAmt: number; employeeRate: number;
  paytermDiscPct: number; hicAmt: number;
  nlp: number; vat: number; oc: number; tcp: number;
  resFee: number; retFee: number; unitArea: number;
  schemeName: string; dpRate: string; termMonths: number;
  hasVat: boolean; project: string; tower: string;
}
interface NewUnitFin { listPrice: number; unitArea: number; hic: boolean; }
interface SheetNewPayterm { discPct: number; dpRate: string; termMonths: number; schemeName: string; }

function ComparisonCards({ r, resFin, newUnitFin, newPayterm, isChangeOfUnit }: {
  r: RequestRecord; resFin: ResFin; newUnitFin: NewUnitFin | null;
  newPayterm: SheetNewPayterm | null; isChangeOfUnit: boolean;
}) {
  const couNew = (() => {
    if (!isChangeOfUnit || !newUnitFin || newUnitFin.listPrice === 0) return null;
    const newLP    = newUnitFin.listPrice;
    const promoAmt = Math.round(newLP * resFin.promoRate / 100);
    const empAmt   = Math.round(newLP * resFin.employeeRate / 100);
    const ptAmt    = Math.round(newLP * resFin.paytermDiscPct / 100);
    const hicAmt   = newUnitFin.hic ? resFin.hicAmt : 0;
    const nlp      = newLP - promoAmt - empAmt - ptAmt - hicAmt;
    const vat      = resFin.hasVat ? Math.round(nlp * 0.12) : 0;
    const oc       = Math.round(nlp * 0.07);
    const tcp      = nlp + vat + oc + hicAmt;
    return { newLP, promoAmt, empAmt, ptAmt, hicAmt, nlp, vat, oc, tcp };
  })();

  const rsNew = (() => {
    if (isChangeOfUnit || !newPayterm) return null;
    const lp    = resFin.listPrice;
    const ptAmt = Math.round(lp * newPayterm.discPct / 100);
    const nlp   = lp - resFin.promoAmt - resFin.employeeAmt - ptAmt - resFin.hicAmt;
    const vat   = resFin.hasVat ? Math.round(nlp * 0.12) : 0;
    const oc    = Math.round(nlp * 0.07);
    const tcp   = nlp + vat + oc + resFin.hicAmt;
    return { ptAmt, nlp, vat, oc, tcp };
  })();

  const showNew = isChangeOfUnit ? !!couNew : !!rsNew;

  return (
    <div className="grid grid-cols-2 [grid-template-rows:auto_1fr] gap-2 overflow-x-auto -mx-5 px-5">
      <CalcCard
        title="Current"
        unitCode={r.inventory_code}
        unitArea={resFin.unitArea}
        schemeName={resFin.schemeName}
        dpRate={resFin.dpRate || undefined}
        termMonths={resFin.termMonths || undefined}
        listPrice={resFin.listPrice}
        promoAmt={resFin.promoAmt}
        promoPct={resFin.promoRate}
        employeeAmt={resFin.employeeAmt}
        employeePct={resFin.employeeRate}
        paytermAmt={Math.round(resFin.listPrice * resFin.paytermDiscPct / 100)}
        paytermPct={resFin.paytermDiscPct}
        hicAmt={resFin.hicAmt}
        nlp={resFin.nlp}
        vat={resFin.vat}
        otherCharges={resFin.oc}
        tcp={resFin.tcp}
        reservationFee={resFin.resFee}
        retentionFee={resFin.retFee}
      />
      {showNew && isChangeOfUnit && couNew ? (
        <CalcCard
          title="New Unit"
          unitCode={r.new_inventory_code}
          unitArea={newUnitFin?.unitArea}
          schemeName={resFin.schemeName}
          dpRate={resFin.dpRate || undefined}
          termMonths={resFin.termMonths || undefined}
          listPrice={couNew.newLP}
          promoAmt={couNew.promoAmt}
          promoPct={resFin.promoRate}
          employeeAmt={couNew.empAmt}
          employeePct={resFin.employeeRate}
          paytermAmt={couNew.ptAmt}
          paytermPct={resFin.paytermDiscPct}
          hicAmt={couNew.hicAmt}
          nlp={couNew.nlp}
          vat={couNew.vat}
          otherCharges={couNew.oc}
          tcp={couNew.tcp}
          reservationFee={resFin.resFee}
          retentionFee={resFin.retFee}
          highlight
        />
      ) : showNew && !isChangeOfUnit && rsNew && newPayterm ? (
        <CalcCard
          title="New Terms"
          unitCode={r.inventory_code}
          unitArea={resFin.unitArea}
          schemeName={newPayterm.schemeName}
          dpRate={newPayterm.dpRate || undefined}
          termMonths={newPayterm.termMonths || undefined}
          listPrice={resFin.listPrice}
          promoAmt={resFin.promoAmt}
          promoPct={resFin.promoRate}
          employeeAmt={resFin.employeeAmt}
          employeePct={resFin.employeeRate}
          paytermAmt={rsNew.ptAmt}
          paytermPct={newPayterm.discPct}
          hicAmt={resFin.hicAmt}
          nlp={rsNew.nlp}
          vat={rsNew.vat}
          otherCharges={rsNew.oc}
          tcp={rsNew.tcp}
          reservationFee={resFin.resFee}
          retentionFee={resFin.retFee}
          highlight
        />
      ) : (
        <div className="row-span-2 rounded-2xl border border-dashed border-black/[0.10] flex items-center justify-center p-4">
          <p className="text-xs text-[#8E8E93] text-center">New {isChangeOfUnit ? 'unit' : 'payterm'} data unavailable</p>
        </div>
      )}
    </div>
  );
}

export function RequestDetailSheet({
  r, onClose, isAM, onApprove, onReject, onExecute, onMarkResolved,
}: {
  r: RequestRecord;
  onClose:        () => void;
  isAM:           boolean;
  onApprove:      (r: RequestRecord) => void;
  onReject:       (r: RequestRecord) => void;
  onExecute:      (r: RequestRecord) => void;
  onMarkResolved: (r: RequestRecord) => void;
}) {
  const cat = categoryStyle(r.request_category);
  const st  = statusStyle(r.status, r.approval_status);
  const isPending  = r.approval_status === 'Pending';
  const isApproved = r.approval_status === 'Approved';
  const isBrf      = isBrfType(r.type_of_request);
  const [resolveConfirm, setResolveConfirm] = useState(false);

  const isChangeOfUnit  = r.type_of_request === 'Change of Unit';
  const isRestructuring = r.type_of_request === 'Payment Schedule Restructuring';

  const [resFin,       setResFin]       = useState<ResFin | null>(null);
  const [newUnitFin,   setNewUnitFin]   = useState<NewUnitFin | null>(null);
  const [newPayterm,   setNewPayterm]   = useState<SheetNewPayterm | null>(null);
  const [calcLoading,  setCalcLoading]  = useState(false);

  useEffect(() => {
    if (!r.reservation_id || (!isChangeOfUnit && !isRestructuring)) return;
    setCalcLoading(true);
    setResFin(null); setNewUnitFin(null); setNewPayterm(null);

    async function fetchCalc() {
      const { data: res } = await supabase
        .from('reservations')
        .select('list_price, promo_discount_amount, employee_discount_amount, hic_discount, payterm_discount_pct, net_list_price, vat, other_charges, total_contract_price, reservation_fee, retention_fee, unit_area, scheme_name, term_months, dp_rate, project, tower')
        .eq('reservation_id', r.reservation_id)
        .single();

      if (!res) { setCalcLoading(false); return; }

      const lp  = Number(res.list_price) || 0;
      const vat = Number(res.vat) || 0;
      const fin: ResFin = {
        listPrice: lp,
        promoAmt: Number(res.promo_discount_amount) || 0,
        promoRate: lp > 0 ? (Number(res.promo_discount_amount) || 0) / lp * 100 : 0,
        employeeAmt: Number(res.employee_discount_amount) || 0,
        employeeRate: lp > 0 ? (Number(res.employee_discount_amount) || 0) / lp * 100 : 0,
        paytermDiscPct: Number(res.payterm_discount_pct) || 0,
        hicAmt: Number(res.hic_discount) || 0,
        nlp: Number(res.net_list_price) || 0,
        vat,
        oc: Number(res.other_charges) || 0,
        tcp: Number(res.total_contract_price) || 0,
        resFee: Number(res.reservation_fee) || 0,
        retFee: Number(res.retention_fee) || 0,
        unitArea: Number(res.unit_area) || 0,
        schemeName: res.scheme_name ?? '',
        dpRate: (res.dp_rate ?? '').replace('%', ''),
        termMonths: Number(res.term_months) || 0,
        hasVat: vat > 0,
        project: res.project ?? '',
        tower: res.tower ?? '',
      };
      setResFin(fin);

      if (isChangeOfUnit && r.new_inventory_code) {
        const code = r.new_inventory_code.trim();
        const { data: unit } = await supabase
          .from('Inventory')
          .select('"Inventory Code", "Total List Price", "Unit Area", HIC')
          .eq('"Inventory Code"', code)
          .maybeSingle();
        if (unit) {
          const raw = unit as Record<string, unknown>;
          const lp = parseFloat(String(raw['Total List Price'] ?? '0').replace(/,/g, '')) || 0;
          setNewUnitFin({ listPrice: lp, unitArea: Number(raw['Unit Area']) || 0, hic: !!raw['HIC'] });
        }
      }

      if (isRestructuring && fin.project && fin.tower) {
        const all = await fetchAllPayterms();
        const match = all.find(p => p.payterm_code === r.new_payterm_code)
          ?? all.filter(p => p.project === fin.project && p.tower === fin.tower)
               .find(p => {
                 if (p.payterm_scheme !== r.new_payterm_scheme) return false;
                 if (r.new_term_months && p.term && Number(p.term) !== r.new_term_months) return false;
                 return true;
               });
        if (match) {
          setNewPayterm({
            discPct: Number(match.discount) || 0,
            dpRate: match.dp_percent ?? '',
            termMonths: Number(match.term) || r.new_term_months || 0,
            schemeName: match.payterm_scheme ?? r.new_payterm_scheme ?? '',
          });
        }
      }

      setCalcLoading(false);
    }
    fetchCalc();
  }, [r.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex flex-col items-center pt-3 pb-4 px-5 border-b border-black/[0.06]">
          <div className="w-10 h-1 rounded-full bg-[#D1D1D6] mb-4" />
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
              >
                <span className="text-sm font-bold text-white">{getInitials(r.client_name)}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#1C1C1E]">{r.client_name ?? '—'}</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">{r.ticket_id ?? r.reservation_id ?? '—'}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#6C6C70]">{r.type_of_request}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-60">
              <X size={14} className="text-[#6C6C70]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Buyer info */}
          <div>
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Buyer Information</p>
            <div className="bg-[#F2F2F7] rounded-2xl px-3 py-1 space-y-0">
              {([
                [<Hash size={13} key="ci" />,      'Client ID',      r.client_id      ?? '—'],
                [<Hash size={13} key="ri" />,      'Reservation ID', r.reservation_id ?? '—'],
                [<Building2 size={13} key="pn" />, 'Project',        r.project_name   ?? '—'],
                [<Tag size={13} key="ic" />,       'Inventory Code', r.inventory_code ?? '—'],
              ] as [React.ReactNode, string, string][]).map(([icon, label, value]) => (
                <div key={label} className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] last:border-0">
                  <span className="text-[#C03D25] shrink-0">{icon}</span>
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">{label}</span>
                  <span className="text-xs text-[#6C6C70] text-right max-w-[55%] truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Request details */}
          <div>
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Request Details</p>
            <div className="bg-[#F2F2F7] rounded-2xl px-3 py-1 space-y-0">
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06] bg-black/[0.015] -mx-3 px-3">
                <FileText size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-bold text-[#1C1C1E]">Type of Request</span>
                <span className="text-xs font-bold text-[#C03D25] text-right max-w-[55%]">{r.type_of_request}</span>
              </div>
              {r.sub_type && (
                <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                  <GitBranch size={13} className="text-[#C03D25] shrink-0" />
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Sub Type</span>
                  <span className="text-xs text-[#6C6C70] text-right max-w-[55%]">{r.sub_type}</span>
                </div>
              )}
              {r.new_inventory_code && (
                <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                  <ArrowRight size={13} className="text-[#C03D25] shrink-0" />
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Unit Change</span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-right">
                    <span className="text-[#6C6C70]">{r.inventory_code ?? '—'}</span>
                    <ArrowRight size={11} className="text-[#C7C7CC]" />
                    <span className="text-[#C03D25]">{r.new_inventory_code}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <Layers size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Category</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cat.bg, color: cat.text }}>
                  {cat.label}
                </span>
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <st.Icon size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Status</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>
                  {st.label}
                </span>
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <Clock size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Turnaround</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{r.turnaround_days} days</span>
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.06]">
                <Calendar size={13} className="text-[#C03D25] shrink-0" />
                <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Submitted</span>
                <span className="text-xs text-[#6C6C70]">{formatDate(r.submitted_at)}</span>
              </div>
              {(r.requested_by || r.requested_by_name) && (
                <div className={`flex items-center gap-3 py-2.5 ${r.approved_by ? 'border-b border-black/[0.06]' : ''}`}>
                  <User size={13} className="text-[#C03D25] shrink-0" />
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Requested By</span>
                  <div className="flex flex-col items-end max-w-[55%]">
                    {r.requested_by_name && <span className="text-xs font-semibold text-[#1C1C1E] truncate">{r.requested_by_name}</span>}
                    {r.requested_by && <span className="text-[10px] text-[#8E8E93] truncate">{r.requested_by}</span>}
                  </div>
                </div>
              )}
              {r.approved_by && (
                <div className="flex items-center gap-3 py-2.5">
                  <CheckCircle2 size={13} className="text-[#C03D25] shrink-0" />
                  <span className="flex-1 text-xs font-medium text-[#1C1C1E]">Approved By</span>
                  <span className="text-xs text-[#6C6C70] text-right max-w-[55%] truncate">{r.approved_by} · {r.date_approved}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {r.description && (
            <div>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Description</p>
              <div className="bg-[#F2F2F7] rounded-2xl px-4 py-3 flex items-start gap-3">
                <AlignLeft size={13} className="text-[#C03D25] shrink-0 mt-0.5" />
                <p className="text-xs text-[#3A3A3C] leading-relaxed">{r.description}</p>
              </div>
            </div>
          )}

          {/* Payment Comparison — Change of Unit or Restructuring */}
          {(isChangeOfUnit || isRestructuring) && (
            <div>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">Payment Comparison</p>
              {calcLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 size={15} className="animate-spin text-[#C03D25]" />
                  <span className="text-xs text-[#8E8E93]">Loading…</span>
                </div>
              ) : resFin ? (
                <ComparisonCards
                  r={r} resFin={resFin} newUnitFin={newUnitFin} newPayterm={newPayterm}
                  isChangeOfUnit={isChangeOfUnit}
                />
              ) : null}
            </div>
          )}

        </div>

        {/* Action bar — AMD / All Access only */}
        {isAM && isPending && (
          <div className="px-5 pb-6 pt-3 border-t border-black/[0.06] flex gap-3">
            <button
              type="button"
              onClick={() => onReject(r)}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#C0392B] text-sm font-semibold active:opacity-70"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => onApprove(r)}
              className="flex-2 flex-grow-[2] py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Approve
            </button>
          </div>
        )}

        {isAM && isApproved && isBrf && (
          <div className="px-5 pb-6 pt-3 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={() => onExecute(r)}
              className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Execute
            </button>
          </div>
        )}

        {isAM && isApproved && !isBrf && (
          <div className="px-5 pb-6 pt-3 border-t border-black/[0.06]">
            {resolveConfirm ? (
              <div className="space-y-2">
                <p className="text-xs text-center text-[#6C6C70]">Mark this request as resolved?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setResolveConfirm(false)}
                    className="flex-1 py-3 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResolveConfirm(false); onMarkResolved(r); }}
                    className="flex-2 flex-grow-[2] py-3 rounded-2xl bg-[#1A7F37] text-white text-sm font-bold active:opacity-80"
                  >
                    Yes, Resolved
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setResolveConfirm(true)}
                className="w-full py-3.5 rounded-2xl bg-[#1A7F37] text-white text-sm font-bold active:opacity-80"
              >
                Mark Resolved
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequestInquiryPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [isAM,     setIsAM]     = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    async function load() {
      const [session] = await Promise.all([getSession()]);
      setIsAM(session?.role_name === 'Account Management' || session?.role_name === 'All Access');
      setUserName(session?.full_name || session?.email || '');

      const { data } = await supabase
        .from('requests_and_inquiries')
        .select(SELECT_FIELDS)
        .order('submitted_at', { ascending: false })
        .limit(50);
      setRequests((data as RequestRecord[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function reload() {
    setLoading(true);
    supabase
      .from('requests_and_inquiries')
      .select(SELECT_FIELDS)
      .order('submitted_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRequests((data as RequestRecord[]) ?? []);
        setLoading(false);
      });
  }

  const total    = requests.length;
  const pending  = requests.filter(r => r.approval_status === 'Pending').length;
  const approved = requests.filter(r => r.approval_status === 'Approved').length;
  const resolved = requests.filter(r => r.approval_status === 'Resolved').length;
  const recent   = requests.slice(0, 5);

  return (
    <PageShell title="Request and Inquiry">
      <div className="space-y-4 pb-6">

        {/* ── New Request CTA ── */}
        <button
          type="button"
          onClick={() => router.push('/account/request-inquiry/new')}
          className="w-full text-left active:scale-[0.98] transition-transform rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)',
            boxShadow: '0 4px 24px rgba(192,61,37,0.30)',
          }}
        >
          <div className="px-5 py-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <FilePlus size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-tight">New Request</p>
              <p className="text-white/70 text-[12px] mt-0.5">Submit a buyer request or inquiry</p>
            </div>
            <ChevronRight size={18} className="text-white/60 shrink-0" />
          </div>
        </button>

        {/* ── Pending Approval alert (AM only) ── */}
        {isAM && !loading && pending > 0 && (
          <button
            type="button"
            onClick={() => router.push('/account/request-inquiry/all')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl active:scale-[0.98] transition-transform"
            style={{ background: 'rgba(255,159,10,0.10)', border: '1px solid rgba(255,159,10,0.25)' }}
          >
            <AlertTriangle size={18} style={{ color: '#A05A00' }} className="shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold" style={{ color: '#A05A00' }}>
                {pending} request{pending !== 1 ? 's' : ''} pending your approval
              </p>
              <p className="text-xs" style={{ color: '#C17A00' }}>Tap to review</p>
            </div>
            <ChevronRight size={16} style={{ color: '#A05A00' }} />
          </button>
        )}

        {/* ── Summary tiles ── */}
        <div className="grid grid-cols-2 gap-2">
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <ListChecks size={12} className="text-[#8E8E93]" />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Total</span>
            </div>
            <p className="text-2xl font-bold text-[#1C1C1E] leading-none">{loading ? '–' : total}</p>
          </GlassCard>
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={12} style={{ color: '#A05A00' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Pending</span>
            </div>
            <p className="text-2xl font-bold leading-none" style={{ color: pending > 0 ? '#A05A00' : '#1C1C1E' }}>
              {loading ? '–' : pending}
            </p>
          </GlassCard>
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} style={{ color: '#0055CC' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Approved</span>
            </div>
            <p className="text-2xl font-bold leading-none" style={{ color: approved > 0 ? '#0055CC' : '#1C1C1E' }}>
              {loading ? '–' : approved}
            </p>
          </GlassCard>
          <GlassCard className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} style={{ color: '#1A7F37' }} />
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Resolved</span>
            </div>
            <p className="text-2xl font-bold leading-none" style={{ color: resolved > 0 ? '#1A7F37' : '#1C1C1E' }}>
              {loading ? '–' : resolved}
            </p>
          </GlassCard>
        </div>

        {/* ── View all button ── */}
        {!loading && total > 0 && (
          <button
            type="button"
            onClick={() => router.push('/account/request-inquiry/all')}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl active:scale-[0.98] transition-transform"
            style={{
              background: 'rgba(255,255,255,0.80)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(192,61,37,0.10)' }}>
                <ListChecks size={18} style={{ color: '#C03D25' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1C1C1E]">All Requests</p>
                <p className="text-[11px] text-[#8E8E93]">{total} total submitted</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-[#C7C7CC]" />
          </button>
        )}

        {/* ── Recent requests ── */}
        {loading ? (
          <GlassCard className="p-6 flex items-center justify-center">
            <p className="text-sm text-[#8E8E93]">Loading…</p>
          </GlassCard>
        ) : recent.length === 0 ? (
          <GlassCard className="p-8 flex flex-col items-center gap-3">
            <ListChecks size={32} className="text-[#D1D1D6]" />
            <p className="text-sm font-semibold text-[#8E8E93]">No requests yet</p>
            <p className="text-xs text-[#C7C7CC] text-center">Tap "New Request" above to submit one.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">Recent</p>
            {recent.map(r => (
              <RequestCard key={r.id} r={r} onClick={() => {
                if (isAM && r.approval_status === 'Approved' && isBrfType(r.type_of_request)) {
                  router.push(`/account/request-inquiry/approve?id=${r.id}`);
                } else {
                  setSelected(r);
                }
              }} />
            ))}
            {total > 5 && (
              <button
                type="button"
                onClick={() => router.push('/account/request-inquiry/all')}
                className="w-full py-3 text-center text-sm font-semibold text-[#C03D25] active:opacity-60"
              >
                See all {total} requests →
              </button>
            )}
          </div>
        )}

      </div>

      {selected && (
        <RequestDetailSheet
          r={selected}
          onClose={() => setSelected(null)}
          isAM={isAM}
          onApprove={async r => {
            await supabase
              .from('requests_and_inquiries')
              .update({ approval_status: 'Approved', status: 'open' })
              .eq('id', r.id);
            setSelected(null);
            reload();
          }}
          onReject={async r => {
            await supabase
              .from('requests_and_inquiries')
              .update({ approval_status: 'Rejected', status: 'closed' })
              .eq('id', r.id);
            setSelected(null);
            reload();
          }}
          onExecute={r => {
            setSelected(null);
            router.push(`/account/request-inquiry/approve?id=${r.id}`);
          }}
          onMarkResolved={async r => {
            await supabase
              .from('requests_and_inquiries')
              .update({ approval_status: 'Resolved', status: 'closed' })
              .eq('id', r.id);
            setSelected(null);
            reload();
          }}
        />
      )}
    </PageShell>
  );
}
