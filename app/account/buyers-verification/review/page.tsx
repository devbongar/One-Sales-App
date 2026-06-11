'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { directorReview } from '@/lib/review';
import { supabase } from '@/lib/supabase';
import { fetchAllClients, fetchBuyerInfo, BuyerInfoRecord, ClientRecord } from '@/lib/clients';
import { fetchSpouseInfo, SpouseInfoRecord } from '@/lib/spouse-info';
import { fetchCoOwner, CoOwnerRecord } from '@/lib/co-owners';
import { fetchAttyInFact, AttyInFactRecord } from '@/lib/atty-in-fact';
import {
  Hash, Building2, Tag, User, FileText, FolderOpen,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown,
  ChevronRight, Loader2, ShieldCheck, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewBooking {
  reservation_id:        string;
  client_name:           string;
  project:               string;
  inventory_code:        string | null;
  unit_type:             string;
  unit_area:             number | null;
  tower:                 string | null;
  floor:                 string | null;
  unit_no:               string | null;
  seller_name:           string | null;
  booking_review_status: string | null;
  director_notes:        string | null;
  net_list_price:        number | null;
  vat:                   number | null;
  other_charges:         number | null;
  total_contract_price:  number | null;
  scheme_name:           string | null;
  payment_term:          string | null;
  list_price:              number | null;
  promo_discount_pct:      number | null;
  promo_discount_amount:   number | null;
  payterm_discount_pct:    number | null;
  payterm_discount_amount: number | null;
  hic_discount:            number | null;
  employee_discount_amount:number | null;
  dp_rate:                 number | null;
  term_months:             number | null;
  dp_amount:               number | null;
  net_spot_dp:             number | null;
  monthly_stretched_dp:    number | null;
  monthly_deferred:        number | null;
  bank_monthly:            number | null;
  hdmf_monthly:            number | null;
  balance_for_financing:   number | null;
  reservation_fee:         number | null;
  due_from:                string | null;
  due_to:                  string | null;
  payment_proof_url:     string | null;
  proof_of_billing_urls: string | null;
  proof_of_income_urls:  string | null;
  proof_of_valid_id_urls:string | null;
  co_owner_id_urls:      string[] | null;
  atty_in_fact_id_urls:  string[] | null;
  spouse_id_urls:        string[] | null;
  has_co_ownership:      boolean | null;
  has_atty_in_fact:      boolean | null;
  has_spouse:            boolean | null;
  signature_base64:      string | null;
  created_at:            string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusChip(status: string | null) {
  switch (status) {
    case 'submitted':         return { label: 'Under Review',      cls: 'bg-blue-100 text-blue-700' };
    case 'director-approved': return { label: 'Director Approved', cls: 'bg-green-100 text-green-700' };
    case 'director-rejected': return { label: 'Rejected',          cls: 'bg-red-100 text-red-700' };
    case 'finance-verified':  return { label: 'Finance Verified',  cls: 'bg-green-100 text-green-700' };
    case 'Booked':            return { label: 'Booked',            cls: 'bg-green-100 text-green-700' };
    default:                  return { label: 'Pending',           cls: 'bg-amber-100 text-amber-700' };
  }
}

function parseJson(s: string | null): string[] {
  try { return JSON.parse(s ?? '[]') as string[]; } catch { return []; }
}
function fileName(url: string) {
  return decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file');
}
function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}
function fmt(n: number | null) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}
function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Agreement terms ──────────────────────────────────────────────────────────

const TERMS = [
  {
    title: 'RESERVATION PROVISION',
    items: [
      `1. As proof of my interest to purchase the Property, I hereby tender the sum of: PHP 10,000 as Reservation Fee, exclusive of VAT, in order to reserve the Property for our intended purchase which shall be effective for a period of thirty (30) days from delivery of the Reservation Fee. I understand and acknowledge that the Reservation Fee is non-refundable. Should I decide to cancel my reservation; fail to submit all the documentary requirements, including this Reservation Agreement; or fail to pay the amounts due on the prescribed due dates, for any reason whatsoever, I agree that my reservation shall lapse and my Reservation Fee shall be forfeited in favor of the Company. I will hold the Company free and harmless for thereafter releasing and offering the Property to other interested buyers.`,
      `2. I acknowledge that the Company reserves the right to accept or deny this request for reservation and that it is non-transferable. Subject to a written request by me, the Company, at its sole discretion, may extend this reservation for a period of more than fifteen (15) days within which to make the down payment, provided that I shall incur a penalty charge of three percent (3%) per month, or a fraction thereof.`,
      `3. In the event the Property is found unavailable for sale for any reason whatsoever, I agree to hold the Company free and harmless from any liability and it shall have the option of exchanging the Property with another similar unit/lot/property, as applicable, or otherwise cancel this Reservation Agreement. Should there be no substitution or should the substituted Property be unacceptable to me, I shall hold the Company free and harmless from any liability for canceling the Reservation Agreement, subject to reimbursement to me of all payments made, without interest.`,
    ],
  },
  {
    title: 'PAYMENT AND PAYMENT MODES',
    items: [
      `4. I acknowledge that in the event my application to purchase the Property is accepted, the Reservation Fee shall automatically form part of the required down payment. Upon being notified of the acceptance of my offer to purchase the Property, I shall remit, within the period required by the Company, the down payment and/or balance, and the complete post-dated checks, in accordance with the Terms of Payment (inclusive of VAT and Other Charges), attached hereto as ANNEX A, without need of further demand. Any and all payments made to any individual, realtor, broker, employee, or to a party other than the Company for safekeeping in favor of or for transmittal to the Company shall be at my sole and exclusive risk and responsibility and shall not bind nor make the former answerable in any way unless and until actually received, receipted, and validated by the Company's Cashier or authorized officer. All checks shall be crossed and made payable only to the Companies.`,
      `5. In case I am permitted to issue checks in foreign currencies, or if payments are made through foreign remittances in the manner authorized by the Company, such checks or remittances shall be credited only after conversion to Philippine currency based on the prevailing buying rate of the Company's designated bank upon clearing. Any underpayment shall be paid on the last installment or last payment due; any overpayment shall adjust the final installment accordingly. I shall shoulder all bank fees, charges, and taxes upon remittances or conversion of foreign currencies.`,
      `6. All payments shall be made on or before their respective due dates without need of demand or legal action. In the event that I avail of bank financing, I shall be solely responsible for filing the loan application and all necessary requirements so that the loan may be processed and proceeds released to the Company on or before the due date.`,
    ],
  },
  {
    title: 'SALES DOCUMENT AND OTHER BUYER REQUIREMENTS',
    items: [
      `7. Should I fail to pay any of the amounts due in relation to my purchase of the Property, or fail to submit the required documents and execute the relevant Contract to Sell and Deed of Absolute Sale, or fail to comply with any terms of my purchase, the Company shall have the sole option to:\n\n   • Cancel the sale and forfeit in its favor all payments made, including the Reservation Fee, as liquidated damages; and/or\n\n   • Impose penalty charges at the rate of three percent (3%) per month (or fraction thereof) of delay on the unpaid amount.\n\nLate payments will only be accepted upon payment of interest and penalty charges. Should this reservation be cancelled, the Company shall have full authority to resell and dispose of the Property.`,
      `8. Unless otherwise provided, my Contract to Sell shall be prepared only after I have submitted all necessary documents and post-dated checks in accordance with the Schedule of Payment. The Contract to Sell shall be executed by me within thirty (30) days from receipt; otherwise, this Reservation Agreement shall be cancelled.`,
      `9. I understand that this Agreement only gives me the right to purchase the Property subject to fulfillment of all stated conditions. No other right, title, or ownership is vested upon me until the Property is fully paid. The Company retains title and ownership until full payment is made.`,
      `10. I agree that my purchase of the Property is subject to the covenants and restrictions in the Project's Deed of Restrictions or Master Deed with Declaration of Restrictions, as applicable, which shall bind the Property and which I undertake to faithfully comply with.`,
    ],
  },
  {
    title: 'AGREEMENTS AND OTHER PROVISIONS',
    items: [
      `11. I confirm that I have personally inspected the plans and specifications of the Property, studied and verified the Project site and the layout of my requested property, and find the same acceptable. I acknowledge that I have independently evaluated all material and technical information related to the Property and am satisfied with what was explained to me. I further understand that numbering, sizes, and layout may be subject to adjustments per approved plans, and I accept the Company's right to revise plans without my consent.`,
      `12. I authorize the developer to organize the Project's Homeowners' Association or Condominium Corporation, as applicable.`,
      `13. I warrant the truthfulness of all information provided and shall personally inform the Company in writing of any changes to my personal data.`,
      `14. The address stated herein shall be the official address for all communications unless updated in writing. I hold the Company free from liability for any errors, miscommunication, or failure of communication arising from outdated or incorrect information provided by me. I also warrant that all funds used for purchasing the Property are legitimate and not from unlawful activity. I authorize the Company to disclose any required information to government bodies as required by law.`,
      `15. This document constitutes the entire agreement on my reservation of the Property. Any stipulations or agreements not in writing and signed by the Company's authorized representative shall not be binding.`,
      `16. If there are two (2) or more buyers signing, we understand that our obligations hereunder are joint and solidary.`,
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    title: 'PURPOSE AND SCOPE',
    body: `PH1 WORLD DEVELOPERS INC. ("the Company") is committed to protecting your personal data in accordance with Republic Act No. 10173 (Data Privacy Act of 2012) and the issuances of the National Privacy Commission. This Statement covers all personal information collected in connection with your property reservation and purchase.`,
  },
  {
    title: 'PERSONAL INFORMATION WE COLLECT',
    body: `The Company collects: identification data (name, birth date, civil status, government IDs); contact details (address, email, mobile); financial records (income proof, bank statements); transaction data (reservation details, payment records, signed documents); and your electronic signature.`,
  },
  {
    title: 'PURPOSE OF PROCESSING',
    body: `Your data is processed to: evaluate and process your reservation and purchase; prepare the Contract to Sell and Deed of Absolute Sale; comply with AMLA and other laws; conduct credit verification; communicate account and payment updates; and comply with DHSUD, BIR, and other regulatory requirements.`,
  },
  {
    title: 'DISCLOSURE AND DATA RETENTION',
    body: `Data may be shared with authorized sales personnel, banks, Pag-IBIG Fund, legal counsels, government agencies, and service providers — strictly on a need-to-know basis. The Company does not sell your data to third parties. Records are retained for a minimum of ten (10) years from the last transaction date, after which data is securely disposed of or anonymized.`,
  },
  {
    title: 'YOUR RIGHTS AND CONTACT',
    body: `Under RA 10173, you have the right to be informed, access, correct, erase, object to processing, and file complaints with the National Privacy Commission (complaints@privacy.gov.ph). To exercise these rights, contact our Data Protection Officer at dpo@ph1world.com or (02) 8XXX-XXXX.`,
  },
];

// ─── Pinch zoom hook ──────────────────────────────────────────────────────────

function usePinchZoom(ref: React.RefObject<HTMLDivElement>, open: boolean) {
  const [scale, setScale] = useState(1);
  const scaleRef    = useRef(1);
  const baseScale   = useRef(1);
  const lastDist    = useRef<number | null>(null);
  const lastTap     = useRef(0);

  useEffect(() => {
    if (!open) { scaleRef.current = 1; setScale(1); return; }
    const el = ref.current;
    if (!el) return;

    const dist = (t: TouchList) =>
      Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastDist.current  = dist(e.touches);
        baseScale.current = scaleRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastDist.current === null) return;
      e.preventDefault();
      const s = Math.min(4, Math.max(1, baseScale.current * (dist(e.touches) / lastDist.current)));
      scaleRef.current = s;
      setScale(s);
    };
    const onEnd = (e: TouchEvent) => {
      lastDist.current = null;
      if (e.touches.length !== 0) return;
      const now = Date.now();
      if (now - lastTap.current < 280) {
        scaleRef.current = 1;
        setScale(1);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [open, ref]);

  return scale;
}

// ─── A4 page wrapper ──────────────────────────────────────────────────────────

function A4Page({ children, pageNum, total, reservationId, title, branded }: {
  children: React.ReactNode; pageNum: number; total: number;
  reservationId: string | null; title: string; branded?: boolean;
}) {
  return (
    <div className="bg-white shadow-[0_4px_24px_rgba(0,0,0,0.28)] flex flex-col overflow-hidden"
      style={{ height: 'calc((100vw - 24px) * 1.4142)' }}>
      <div className={`flex items-center justify-between px-5 py-2.5 border-b shrink-0 ${
        branded ? 'bg-[#C03D25] border-[#C03D25]' : 'border-gray-200'
      }`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branded ? '/document logo.png' : '/logo.png'}
          alt="PH1 World Developers"
          className="h-7 object-contain object-left"
        />
        <p className={`text-[9px] font-bold uppercase tracking-[0.14em] text-center px-2 ${
          branded ? 'text-white' : 'text-[#1C1C1E]'
        }`}>{title}</p>
        <p className={`text-[8px] text-right shrink-0 ${branded ? 'text-white/70' : 'text-gray-400'}`}>
          {reservationId ?? '—'}
        </p>
      </div>
      <div className="flex-1 px-5 py-5 overflow-hidden min-h-0">{children}</div>
      <div className="px-5 py-2 border-t border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-[8px] text-gray-300 uppercase tracking-[0.1em]">PH1 World Developers Inc.</span>
        <span className="text-[8px] text-gray-300">Page {pageNum} of {total}</span>
      </div>
    </div>
  );
}

// ─── Agreement viewer ─────────────────────────────────────────────────────────

function AgreementViewer({ open, onClose, b }: { open: boolean; onClose: () => void; b: ReviewBooking }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scale = usePinchZoom(scrollRef, open);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
  if (!open) return null;
  const TOTAL = 4;
  const resId = b.reservation_id ?? '—';
  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">Reservation Agreement</p>
          <p className="text-white/40 text-[10px]">{resId} · {TOTAL} pages{scale > 1.05 ? ` · ${scale.toFixed(1)}×` : ''}</p>
        </div>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
          <X size={18} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
      <div style={{ zoom: scale }} className="px-3 py-3 space-y-3">

        <A4Page pageNum={1} total={TOTAL} reservationId={resId} title="Reservation Agreement">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[10px] text-gray-500">Date: <span className="font-semibold text-[#1C1C1E]">{formatDate(b.created_at)}</span></span>
            <span className="text-[10px] text-gray-500">Res. No.: <span className="font-semibold text-[#1C1C1E]">{resId}</span></span>
          </div>
          <p className="text-[11px] leading-[1.85] text-[#3A3A3C] text-justify mb-6">
            I, <span className="font-bold text-[#1C1C1E] uppercase">{b.client_name ?? '___________________________'}</span>, Filipino, of legal age, hereby agree to purchase the Property described below from <span className="font-semibold text-[#1C1C1E]">PH1 WORLD DEVELOPERS INC.</span> ("the Company"), subject to the following Terms and Conditions:
          </p>
          <div className="border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Property Details</p>
            </div>
            <div className="divide-y divide-gray-100">
              {([
                ['Project',          b.project],
                ['Tower / Building', b.tower],
                ['Floor Level',      b.floor],
                ['Unit Number',      b.unit_no],
                ['Inventory Code',   b.inventory_code ?? '—'],
                ['Unit Type',        b.unit_type],
                ['Unit Area',        b.unit_area != null ? `${b.unit_area} sqm` : '—'],
              ] as [string, string | null][]).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] text-gray-500 shrink-0">{label}</span>
                  <span className="text-[10px] font-semibold text-[#1C1C1E] text-right ml-3">{value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </A4Page>

        <A4Page pageNum={2} total={TOTAL} reservationId={resId} title="Reservation Agreement">
          <div className="space-y-5">
            {TERMS.slice(0, 2).map(({ title, items }) => (
              <div key={title} className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1C1C1E] border-b border-gray-200 pb-1.5">{title}</p>
                {items.map((item, i) => (
                  <div key={i}>
                    {item.split('\n\n').map((para, j) => (
                      <p key={j} className="text-[10.5px] text-[#3A3A3C] leading-[1.85] text-justify whitespace-pre-line mb-2 last:mb-0">{para.trim()}</p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </A4Page>

        <A4Page pageNum={3} total={TOTAL} reservationId={resId} title="Reservation Agreement">
          <div className="space-y-5">
            {TERMS.slice(2).map(({ title, items }) => (
              <div key={title} className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1C1C1E] border-b border-gray-200 pb-1.5">{title}</p>
                {items.map((item, i) => (
                  <div key={i}>
                    {item.split('\n\n').map((para, j) => (
                      <p key={j} className="text-[10.5px] text-[#3A3A3C] leading-[1.85] text-justify whitespace-pre-line mb-2 last:mb-0">{para.trim()}</p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </A4Page>

        <A4Page pageNum={4} total={TOTAL} reservationId={resId} title="Reservation Agreement">
          <div className="space-y-3 mb-8">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1C1C1E] border-b border-gray-200 pb-1.5">Annex A — Terms of Payment</p>
            <div className="border border-gray-200 overflow-hidden">
              {([
                ['Net Selling Price',     fmt(b.net_list_price)],
                ['Value Added Tax (12%)', fmt(b.vat)],
                ['Other Charges',         fmt(b.other_charges)],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                  <span className="text-[10px] text-gray-500">{label}</span>
                  <span className="text-[10px] text-[#1C1C1E] font-medium">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-3 bg-[#1C1C1E]">
                <span className="text-[10px] font-bold text-white uppercase tracking-wide">Total Contract Price</span>
                <span className="text-[10px] font-bold text-white">{fmt(b.total_contract_price)}</span>
              </div>
              {([
                ['Payment Scheme', b.scheme_name  ?? '—'],
                ['Payment Term',   b.payment_term ?? '—'],
                ['Reservation Fee', '₱ 10,000.00'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100">
                  <span className="text-[10px] text-gray-500 shrink-0">{label}</span>
                  <span className="text-[10px] text-[#1C1C1E] font-medium text-right ml-3">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-[#3A3A3C] leading-[1.85] text-justify mb-8">
            IN WITNESS WHEREOF, I have hereunto set my hand this <span className="font-semibold text-[#1C1C1E]">{formatDate(b.created_at)}</span> at Metro Manila, Philippines.
          </p>
          <div className="space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Buyer&apos;s Signature</p>
            <div className="h-24 border-b-2 border-gray-400 flex items-end pb-1 overflow-hidden">
              {b.signature_base64
                ? <img src={b.signature_base64} alt="Signature" className="max-h-full object-contain" /> // eslint-disable-line @next/next/no-img-element
                : <p className="text-[10px] text-gray-300 italic w-full text-center mb-4">No signature on file</p>}
            </div>
            <p className="text-[11px] font-bold text-[#1C1C1E] uppercase tracking-wide pt-1">{b.client_name ?? '—'}</p>
            <p className="text-[10px] text-gray-400">Buyer</p>
          </div>
        </A4Page>

        <div className="h-4" />
      </div>
      </div>
    </div>
  );
}

function AgreementPreviewCard({ b, onClick }: { b: ReviewBooking; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left active:opacity-70 transition-opacity">
      <GlassCard className="px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#C03D25]/10 flex items-center justify-center shrink-0">
          <FileText size={18} className="text-[#C03D25]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1C1C1E]">Reservation Agreement</p>
          <p className="text-xs text-[#8E8E93] mt-0.5">{formatDate(b.created_at)} · 4 pages</p>
        </div>
        <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
      </GlassCard>
    </button>
  );
}

// ─── Privacy viewer ───────────────────────────────────────────────────────────

function PrivacyViewer({ open, onClose, b }: { open: boolean; onClose: () => void; b: ReviewBooking }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scale = usePinchZoom(scrollRef, open);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
  if (!open) return null;
  const TOTAL = 1;
  const resId = b.reservation_id ?? '—';
  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">Data Privacy Statement</p>
          <p className="text-white/40 text-[10px]">{resId} · {TOTAL} page{scale > 1.05 ? ` · ${scale.toFixed(1)}×` : ''}</p>
        </div>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
          <X size={18} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
      <div style={{ zoom: scale }} className="px-3 py-3 space-y-3">
        <A4Page pageNum={1} total={TOTAL} reservationId={resId} title="Data Privacy Statement" branded>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-gray-500">Date: <span className="font-semibold text-[#1C1C1E]">{formatDate(b.created_at)}</span></span>
            <span className="text-[10px] text-gray-500">Res. No.: <span className="font-semibold text-[#1C1C1E]">{resId}</span></span>
          </div>
          <div className="space-y-4 mb-5">
            {PRIVACY_SECTIONS.map(({ title, body }) => (
              <div key={title} className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1C1C1E] border-b border-gray-200 pb-1">{title}</p>
                <p className="text-[10.5px] text-[#3A3A3C] leading-[1.75] text-justify">{body}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#3A3A3C] leading-[1.75] text-justify mb-4">
            IN WITNESS WHEREOF, I have hereunto set my hand this <span className="font-semibold text-[#1C1C1E]">{formatDate(b.created_at)}</span> at Metro Manila, Philippines, signifying my full understanding and consent to the foregoing Data Privacy Statement.
          </p>
          <div className="space-y-2.5 mb-5">
            {[
              'I hereby acknowledge that I have carefully read and understood this Data Privacy Statement, and I expressly give my full consent to the collection, use, and processing of my personal data by PH1 WORLD DEVELOPERS INC. as described herein.',
              'I agree to affix my e-signature below to signify my conformity and consent to this Data Privacy Statement.',
            ].map((label, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="mt-0.5 w-4 h-4 rounded bg-[#C03D25] border-2 border-[#C03D25] flex items-center justify-center shrink-0">
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.2 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-[10px] text-[#1C1C1E] leading-[1.65]">{label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Buyer&apos;s Signature</p>
            <div className="h-20 border-b-2 border-gray-400 flex items-end pb-1 overflow-hidden">
              {b.signature_base64
                ? <img src={b.signature_base64} alt="Signature" className="max-h-full object-contain" /> // eslint-disable-line @next/next/no-img-element
                : <p className="text-[10px] text-gray-300 italic w-full text-center mb-3">No signature on file</p>}
            </div>
            <p className="text-[11px] font-bold text-[#1C1C1E] uppercase tracking-wide pt-1">{b.client_name ?? '—'}</p>
            <p className="text-[10px] text-gray-400">Buyer</p>
          </div>
        </A4Page>
        <div className="h-4" />
      </div>
      </div>
    </div>
  );
}

function PrivacyPreviewCard({ b, onClick }: { b: ReviewBooking; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left active:opacity-70 transition-opacity">
      <GlassCard className="px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#C03D25]/10 flex items-center justify-center shrink-0">
          <ShieldCheck size={18} className="text-[#C03D25]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1C1C1E]">Data Privacy Statement</p>
          <p className="text-xs text-[#8E8E93] mt-0.5">{formatDate(b.created_at)} · 1 page</p>
        </div>
        <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
      </GlassCard>
    </button>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

// ─── Terms of Payment sub-components ─────────────────────────────────────────

function PriceRow({ label, value, indent }: { label: string; value: string; indent?: boolean }) {
  return (
    <div className="flex items-start justify-between py-[2px]">
      <span className={`text-[8px] leading-tight flex-1 ${indent ? 'pl-2 text-gray-500' : 'text-[#3A3A3C]'}`}>{label}</span>
      <span className="text-[8px] text-[#3A3A3C] ml-1 text-right shrink-0">{value}</span>
    </div>
  );
}
function PriceRowBold({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-[#3A3A3C] px-1.5 py-1 mt-0.5 mb-0.5">
      <span className="text-[8px] font-bold text-white uppercase tracking-wide flex-1 leading-tight">{label}</span>
      <span className="text-[8px] font-bold text-white ml-1 shrink-0">{value}</span>
    </div>
  );
}
function AmortRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-1.5 py-1 border-b border-gray-100 last:border-0">
      <span className={`text-[7.5px] leading-tight flex-1 ${bold ? 'font-bold text-[#1C1C1E]' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-[7.5px] ml-1 shrink-0 ${bold ? 'font-bold text-[#1C1C1E]' : 'text-[#3A3A3C]'}`}>{value}</span>
    </div>
  );
}

function TermsViewer({ open, onClose, b }: { open: boolean; onClose: () => void; b: ReviewBooking }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scale = usePinchZoom(scrollRef, open);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
  if (!open) return null;

  const resId  = b.reservation_id ?? '—';
  const fmtN   = (n: number | null) => n != null ? n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const fmtPct = (n: number | null) => n != null ? `${n}%` : '';
  const finPct = b.dp_rate != null ? 100 - b.dp_rate : null;

  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">Terms of Payment</p>
          <p className="text-white/40 text-[10px]">{resId} · 1 page{scale > 1.05 ? ` · ${scale.toFixed(1)}×` : ''}</p>
        </div>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
          <X size={18} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
      <div style={{ zoom: scale }} className="px-3 py-3 space-y-3">
        <div className="bg-white shadow-[0_4px_24px_rgba(0,0,0,0.28)] flex flex-col overflow-hidden"
          style={{ height: 'calc((100vw - 24px) * 1.4142)' }}>
          <div className="bg-[#C03D25] border-b border-[#C03D25] px-5 py-2.5 flex items-center justify-between shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/document logo.png" alt="PH1 World Developers" className="h-7 object-contain object-left" />
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-center px-2 text-white">Terms of Payment</p>
            <p className="text-[8px] text-right shrink-0 text-white/70">{resId}</p>
          </div>
          <div className="flex-1 px-3 py-2.5 space-y-2 overflow-hidden min-h-0">
            <div className="border border-gray-300 overflow-hidden">
              <div className="bg-gray-100 px-2 py-1 border-b border-gray-300">
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#1C1C1E]">Property Information</p>
              </div>
              <div className="grid grid-cols-5 divide-x divide-gray-200">
                {([['Project', b.project], ['Tower / House No.', b.tower], ['Unit Number', b.unit_no], ['Unit Type', b.unit_type], ['Unit Area', b.unit_area != null ? `${b.unit_area}` : '—']] as [string, string | null][]).map(([lbl, val]) => (
                  <div key={lbl} className="px-1.5 py-1.5">
                    <p className="text-[6.5px] text-gray-500 uppercase tracking-wide leading-tight">{lbl}</p>
                    <p className="text-[8px] font-semibold text-[#1C1C1E] mt-0.5">{val ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-gray-300 overflow-hidden">
              <div className="bg-gray-100 px-2 py-1 border-b border-gray-300">
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#1C1C1E]">Purchase Price Computation</p>
              </div>
              <div className="grid grid-cols-5 divide-x divide-gray-200">
                {([['Payment Scheme', b.scheme_name], ['Term', b.term_months != null ? `${b.term_months}` : '—'], ['Downpayment (%)', b.dp_rate != null ? `${b.dp_rate}%` : '—'], ['Due From', b.due_from ?? '—'], ['Due To', b.due_to ?? '—']] as [string, string | null][]).map(([lbl, val]) => (
                  <div key={lbl} className="px-1.5 py-1.5">
                    <p className="text-[6.5px] text-gray-500 uppercase tracking-wide leading-tight">{lbl}</p>
                    <p className="text-[8px] font-semibold text-[#1C1C1E] mt-0.5">{val ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <div className="bg-[#1C1C1E] px-2 py-1 mb-1">
                  <p className="text-[7.5px] font-bold text-white uppercase tracking-wide">
                    {fmtPct(b.dp_rate)} DP{finPct != null ? `, ${finPct}% END-USER FINANCING` : ''}
                  </p>
                </div>
                <PriceRow label="List Price" value={fmtN(b.list_price)} />
                {(b.promo_discount_amount ?? 0) > 0 && <PriceRow label={`(-) Promo Discount ${fmtPct(b.promo_discount_pct)}`} value={`(${fmtN(b.promo_discount_amount)})`} indent />}
                {(b.payterm_discount_amount ?? 0) > 0 && <PriceRow label={`(-) Payterm Discount ${fmtPct(b.payterm_discount_pct)}`} value={`(${fmtN(b.payterm_discount_amount)})`} indent />}
                {(b.employee_discount_amount ?? 0) > 0 && <PriceRow label="(-) Special Discount" value={`(${fmtN(b.employee_discount_amount)})`} indent />}
                {(b.hic_discount ?? 0) > 0 && <PriceRow label="(-) HIC Discount" value={`(${fmtN(b.hic_discount)})`} indent />}
                <PriceRow label="Discounted Price" value={fmtN(b.net_list_price)} />
                <PriceRow label="Value Added Tax 12%" value={fmtN(b.vat)} />
                <PriceRow label="Other Charges" value={fmtN(b.other_charges)} />
                <PriceRowBold label="Total Contract Price" value={fmtN(b.total_contract_price)} />
                <div className="h-1.5" />
                <PriceRow label={`Downpayment Amount ${fmtPct(b.dp_rate)}`} value={fmtN(b.dp_amount)} />
                <PriceRow label="(-) Reservation Fee" value={`(${fmtN(b.reservation_fee)})`} indent />
                <PriceRow label="Net Downpayment" value={fmtN(b.net_spot_dp)} />
                <PriceRowBold label={`Monthly Downpayment ${b.term_months ?? '—'} mos.`} value={fmtN(b.monthly_stretched_dp)} />
                <div className="h-1.5" />
                <PriceRow label="Balance for end-user financing" value={fmtN(b.balance_for_financing)} />
              </div>
              <div className="w-[42%] shrink-0 space-y-2">
                <div className="border border-gray-300 overflow-hidden">
                  <div className="bg-[#C03D25] px-2 py-1 text-center">
                    <p className="text-[7.5px] font-bold text-white uppercase tracking-wide">Bank Amortization</p>
                  </div>
                  <AmortRow label="Balance for end-user financing" value={fmtN(b.balance_for_financing)} />
                  <AmortRow label="Indicative Interest Rate" value="—" />
                  <AmortRow label="Loan Term (Max years)" value="—" />
                  <AmortRow label="Monthly Amortization" value={fmtN(b.bank_monthly)} bold />
                </div>
                <div className="border border-gray-300 overflow-hidden">
                  <div className="bg-[#C03D25] px-2 py-1 text-center">
                    <p className="text-[7.5px] font-bold text-white uppercase tracking-wide">HDMF Amortization</p>
                  </div>
                  <AmortRow label="Balance for end-user financing" value={fmtN(b.balance_for_financing)} />
                  <AmortRow label="Indicative Interest Rate" value="—" />
                  <AmortRow label="Loan Term (Max years)" value="—" />
                  <AmortRow label="Monthly Amortization" value={fmtN(b.hdmf_monthly)} bold />
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 text-center shrink-0">
            <p className="text-[7.5px] text-gray-500 italic leading-relaxed">
              **This auto-generated Terms of Payment is valid only if unaltered and shall serve as the official payment schedule based on the terms and conditions of the Reservation Agreement.**
            </p>
            <p className="text-[7px] text-gray-400 mt-1">Date Generated: {new Date().toLocaleString('en-US')}</p>
          </div>
        </div>
        <div className="h-4" />
      </div>
      </div>
    </div>
  );
}

function TermsPreviewCard({ b, onClick }: { b: ReviewBooking; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left active:opacity-70 transition-opacity">
      <GlassCard className="px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#C03D25]/10 flex items-center justify-center shrink-0">
          <FileText size={18} className="text-[#C03D25]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1C1C1E]">Terms of Payment</p>
          <p className="text-xs text-[#8E8E93] mt-0.5">{formatDate(b.created_at)} · 1 page</p>
        </div>
        <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
      </GlassCard>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FileTile({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square active:opacity-70">
      {isImage(url) ? (
        <img src={url} alt={fileName(url)} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
          <FileText size={26} className="text-[#C03D25]" />
          <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">{fileName(url)}</span>
        </div>
      )}
    </a>
  );
}

function DocSection({ label, urls }: { label: string; urls: string[] }) {
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">{label}</p>
        {urls.length > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {urls.length} file{urls.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {urls.length === 0 ? (
        <div className="py-7 flex flex-col items-center gap-2">
          <FolderOpen size={22} className="text-[#C7C7CC]" />
          <p className="text-xs text-[#C7C7CC]">No documents uploaded</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {urls.map(url => <FileTile key={url} url={url} />)}
        </div>
      )}
    </GlassCard>
  );
}

function GroupLabel({ label }: { label: string }) {
  return <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-[0.12em] px-1 pt-2">{label}</p>;
}

// ─── Buyer Information Form helpers ──────────────────────────────────────────

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[6px] text-[#8E8E93] uppercase tracking-wide font-semibold leading-tight">{label}</p>
      <p className="text-[7.5px] text-[#1C1C1E] font-medium mt-0.5 border-b border-gray-200 pb-0.5 min-h-[13px] break-words">{value || '—'}</p>
    </div>
  );
}
function BIFSection({ title }: { title: string }) {
  return (
    <div className="bg-gray-100 -mx-5 px-5 py-1.5 mt-2 first:mt-0">
      <p className="text-[7.5px] font-bold uppercase tracking-[0.1em] text-[#1C1C1E]">{title}</p>
    </div>
  );
}
function BIFSubLabel({ label }: { label: string }) {
  return <p className="text-[6.5px] font-bold uppercase tracking-[0.08em] text-[#8E8E93] mt-2 mb-0.5">{label}</p>;
}

function BuyerInfoViewer({
  open, onClose, b, client, buyerInfo, spouse, coOwner, atty, loading,
}: {
  open: boolean; onClose: () => void; b: ReviewBooking;
  client: ClientRecord | null; buyerInfo: BuyerInfoRecord | null;
  spouse: SpouseInfoRecord | null; coOwner: CoOwnerRecord | null;
  atty: AttyInFactRecord | null; loading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scale = usePinchZoom(scrollRef, open);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
  if (!open) return null;

  const resId      = b.reservation_id ?? '—';
  const hasSpouse  = !!b.has_spouse;
  const hasCoOwner = !!b.has_co_ownership;
  const hasAtty    = !!b.has_atty_in_fact;
  const fmtMobile  = (code: string | null | undefined, num: string | null | undefined) =>
    [code, num].filter(Boolean).join(' ') || '—';

  let p = 1;
  const buyerPage   = p++;
  const spousePage  = (hasSpouse  && !!spouse)  ? p++ : 0;
  const coOwnerPage = (hasCoOwner && !!coOwner) ? p++ : 0;
  const attyPage    = (hasAtty    && !!atty)    ? p++ : 0;
  const total       = p - 1;
  const TITLE = 'Buyer Information Form';

  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">{TITLE}</p>
          <p className="text-white/40 text-[10px]">{resId} · {loading ? '…' : `${total} page${total > 1 ? 's' : ''}`}{scale > 1.05 ? ` · ${scale.toFixed(1)}×` : ''}</p>
        </div>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
          <X size={18} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
      <div style={{ zoom: scale }} className="px-3 py-3 space-y-3">
        {loading ? (
          <A4Page pageNum={1} total={1} reservationId={resId} title={TITLE} branded>
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          </A4Page>
        ) : (<>
          <A4Page pageNum={buyerPage} total={total} reservationId={resId} title={TITLE} branded>
            <BIFSection title="Buyer Information" />
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 py-1">
              <InfoField label="Last Name"     value={client?.last_name} />
              <InfoField label="First Name"    value={client?.first_name} />
              <InfoField label="Middle Name"   value={client?.middle_name} />
              <InfoField label="Date of Birth" value={client?.date_of_birth} />
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Gender"       value={buyerInfo?.gender} />
              <InfoField label="Citizenship"  value={client?.citizenship} />
              <InfoField label="Civil Status" value={buyerInfo?.civil_status} />
              <InfoField label="Tax Identification No." value={buyerInfo?.tin || (buyerInfo?.no_tin ? 'N/A' : null)} />
            </div>
            <BIFSubLabel label="Contact Information" />
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Mobile Number"   value={fmtMobile(client?.country_code, client?.mobile_number)} />
              <InfoField label="Landline Number" value={client?.landline_no} />
              <InfoField label="Email Address"   value={client?.email} />
            </div>
            <BIFSubLabel label="Address" />
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Unit No. / Building" value={buyerInfo?.home_unit} />
              <InfoField label="Street / Village"    value={buyerInfo?.home_street} />
              <InfoField label="Barangay"            value={buyerInfo?.home_barangay} />
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="City / Municipality" value={buyerInfo?.home_city_municipality} />
              <InfoField label="Province / Region"   value={buyerInfo?.home_region_province} />
              <InfoField label="Country"             value={buyerInfo?.home_country} />
              <InfoField label="Home Ownership"      value={buyerInfo?.home_ownership} />
            </div>
            <BIFSection title="Employment / Business Information" />
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 py-1">
              <InfoField label="Employment Status"        value={buyerInfo?.employment_status} />
              <InfoField label="Employment Sector"        value={buyerInfo?.employment_sector} />
              <InfoField label="Employer / Business Name" value={buyerInfo?.employer} />
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Nature of Business"   value={buyerInfo?.nature_of_business} />
              <InfoField label="Rank"                 value={buyerInfo?.rank} />
              <InfoField label="Job Title / Position" value={buyerInfo?.job_title} />
              <InfoField label="Salary Range"         value={buyerInfo?.salary_range} />
            </div>
            <BIFSubLabel label="Contact Information" />
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Mobile Number"   value={fmtMobile(buyerInfo?.work_mobile_code, buyerInfo?.work_mobile)} />
              <InfoField label="Landline Number" value={buyerInfo?.work_landline} />
              <InfoField label="Email Address"   value={buyerInfo?.work_email} />
            </div>
            <BIFSubLabel label="Work Address" />
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Unit No. / Building" value={buyerInfo?.work_building_unit} />
              <InfoField label="Street / Village"    value={buyerInfo?.work_street} />
              <InfoField label="Barangay"            value={buyerInfo?.work_barangay} />
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              <InfoField label="City / Municipality" value={buyerInfo?.work_city_municipality} />
              <InfoField label="Province / Region"   value={buyerInfo?.work_region_province} />
              <InfoField label="Country"             value={buyerInfo?.work_country} />
            </div>
          </A4Page>

          {spousePage > 0 && spouse && (
            <A4Page pageNum={spousePage} total={total} reservationId={resId} title={TITLE} branded>
              <BIFSection title="Spouse Information" />
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Last Name"     value={spouse.last_name} />
                <InfoField label="First Name"    value={spouse.first_name} />
                <InfoField label="Middle Name"   value={spouse.middle_name} />
                <InfoField label="Date of Birth" value={spouse.date_of_birth} />
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Gender"      value={spouse.gender} />
                <InfoField label="Citizenship" value={spouse.citizenship} />
                <InfoField label="Tax Identification No." value={spouse.tin || (spouse.no_tin ? 'N/A' : null)} />
              </div>
              <BIFSubLabel label="Contact Information" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Mobile Number"   value={fmtMobile(spouse.mobile_code, spouse.mobile)} />
                <InfoField label="Landline Number" value={spouse.landline} />
                <InfoField label="Email Address"   value={spouse.email} />
              </div>
              <BIFSection title="Spouse Employment / Business Information" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Employment Status"        value={spouse.employment_status} />
                <InfoField label="Employment Sector"        value={spouse.employment_sector} />
                <InfoField label="Employer / Business Name" value={spouse.employer} />
              </div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-2">
                <InfoField label="Nature of Business"   value={spouse.nature_of_business} />
                <InfoField label="Rank"                 value={spouse.rank} />
                <InfoField label="Job Title / Position" value={spouse.job_title} />
                <InfoField label="Salary Range"         value={spouse.salary_range} />
              </div>
            </A4Page>
          )}

          {coOwnerPage > 0 && coOwner && (
            <A4Page pageNum={coOwnerPage} total={total} reservationId={resId} title={TITLE} branded>
              <BIFSection title="Co-Owner Information" />
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Last Name"     value={coOwner.last_name} />
                <InfoField label="First Name"    value={coOwner.first_name} />
                <InfoField label="Middle Name"   value={coOwner.middle_name} />
                <InfoField label="Date of Birth" value={coOwner.date_of_birth} />
              </div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Gender"       value={coOwner.gender} />
                <InfoField label="Citizenship"  value={coOwner.citizenship} />
                <InfoField label="Civil Status" value={coOwner.civil_status} />
                <InfoField label="Tax Identification No." value={coOwner.tin || (coOwner.no_tin ? 'N/A' : null)} />
              </div>
              <BIFSubLabel label="Contact Information" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Mobile Number"   value={fmtMobile(coOwner.mobile_code, coOwner.mobile)} />
                <InfoField label="Landline Number" value={coOwner.landline} />
                <InfoField label="Email Address"   value={coOwner.email} />
              </div>
              <BIFSection title="Co-Owner Employment / Business Information" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Employment Status"        value={coOwner.employment_status} />
                <InfoField label="Employment Sector"        value={coOwner.employment_sector} />
                <InfoField label="Employer / Business Name" value={coOwner.employer} />
              </div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Nature of Business"   value={coOwner.nature_of_business} />
                <InfoField label="Rank"                 value={coOwner.rank} />
                <InfoField label="Job Title / Position" value={coOwner.job_title} />
                <InfoField label="Salary Range"         value={coOwner.salary_range} />
              </div>
              <BIFSubLabel label="Work Address" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                <InfoField label="City / Municipality" value={coOwner.work_city_municipality} />
                <InfoField label="Province / Region"   value={coOwner.work_region_province} />
                <InfoField label="Country"             value={coOwner.work_country} />
              </div>
            </A4Page>
          )}

          {attyPage > 0 && atty && (
            <A4Page pageNum={attyPage} total={total} reservationId={resId} title={TITLE} branded>
              <BIFSection title="Attorney-in-Fact Information" />
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Last Name"   value={atty.last_name} />
                <InfoField label="First Name"  value={atty.first_name} />
                <InfoField label="Middle Name" value={atty.middle_name} />
                <InfoField label="Suffix"      value={atty.suffix} />
              </div>
              <BIFSubLabel label="Contact Information" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                <InfoField label="Mobile Number"   value={fmtMobile(atty.mobile_code, atty.mobile)} />
                <InfoField label="Landline Number" value={atty.landline} />
                <InfoField label="Email Address"   value={atty.email} />
              </div>
            </A4Page>
          )}
        </>)}
        <div className="h-4" />
      </div>
      </div>
    </div>
  );
}

function BuyerInfoPreviewCard({ b, onClick }: { b: ReviewBooking; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left active:opacity-70 transition-opacity">
      <GlassCard className="px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#C03D25]/10 flex items-center justify-center shrink-0">
          <User size={18} className="text-[#C03D25]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1C1C1E]">Buyer Information Form</p>
          <p className="text-xs text-[#8E8E93] mt-0.5">{formatDate(b.created_at)}</p>
        </div>
        <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
      </GlassCard>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DirectorReviewPage() {
  const router = useRouter();
  const [booking,          setBooking]          = useState<ReviewBooking | null>(null);
  const [rejecting,        setRejecting]        = useState(false);
  const [rejectNotes,      setRejectNotes]      = useState('');
  const [saving,           setSaving]           = useState(false);
  const [done,             setDone]             = useState<'approved' | 'rejected' | null>(null);
  const [viewerOpen,       setViewerOpen]       = useState(false);
  const [privacyOpen,      setPrivacyOpen]      = useState(false);
  const [termsOpen,        setTermsOpen]        = useState(false);
  const [buyerInfoOpen,    setBuyerInfoOpen]    = useState(false);
  const [buyerInfoLoading, setBuyerInfoLoading] = useState(false);
  const [buyerInfoLoaded,  setBuyerInfoLoaded]  = useState(false);
  const [clientRecord,     setClientRecord]     = useState<ClientRecord | null>(null);
  const [buyerInfo,        setBuyerInfo]        = useState<BuyerInfoRecord | null>(null);
  const [spouseInfo,       setSpouseInfo]       = useState<SpouseInfoRecord | null>(null);
  const [coOwnerInfo,      setCoOwnerInfo]      = useState<CoOwnerRecord | null>(null);
  const [attyInfo,         setAttyInfo]         = useState<AttyInFactRecord | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('reviewBooking');
    if (!raw) { router.replace('/account/buyers-verification'); return; }
    const b = JSON.parse(raw) as ReviewBooking;
    setBooking(b);
  }, []);

  useEffect(() => {
    if (!buyerInfoOpen || !booking || buyerInfoLoaded) return;
    async function loadBuyerInfo() {
      setBuyerInfoLoading(true);
      try {
        const resId = booking!.reservation_id;
        const [allClients, { data: resRow }] = await Promise.all([
          fetchAllClients().catch(() => []),
          supabase.from('reservations').select('client_id').eq('reservation_id', resId).single(),
        ]);
        const clientIdFromRes = (resRow as any)?.client_id ?? null;
        const match =
          (clientIdFromRes ? allClients.find(c => c.client_id === clientIdFromRes) : null)
          ?? allClients.find(c =>
              [c.first_name, c.last_name, c.suffix].filter(Boolean).join(' ') === (booking!.client_name ?? '')
            )
          ?? null;
        if (match) {
          setClientRecord(match);
          const info = await fetchBuyerInfo(match.id).catch(() => null);
          setBuyerInfo(info);
        }
        const [spouse, coOwner, atty] = await Promise.all([
          booking!.has_spouse       ? fetchSpouseInfo(resId).catch(() => null)  : Promise.resolve(null),
          booking!.has_co_ownership ? fetchCoOwner(resId).catch(() => null)     : Promise.resolve(null),
          booking!.has_atty_in_fact ? fetchAttyInFact(resId).catch(() => null)  : Promise.resolve(null),
        ]);
        setSpouseInfo(spouse); setCoOwnerInfo(coOwner); setAttyInfo(atty);
        setBuyerInfoLoaded(true);
      } finally { setBuyerInfoLoading(false); }
    }
    loadBuyerInfo();
  }, [buyerInfoOpen, booking, buyerInfoLoaded]);

  async function handleApprove() {
    if (!booking) return;
    setSaving(true);
    try {
      await directorReview(booking.reservation_id, true);
      setDone('approved');
    } catch (err) { alert('Failed to approve. Please try again.'); console.error(err); }
    finally { setSaving(false); }
  }

  async function handleReject() {
    if (!booking) return;
    if (!rejectNotes.trim()) { alert('Please enter rejection notes.'); return; }
    setSaving(true);
    try {
      await directorReview(booking.reservation_id, false, rejectNotes.trim());
      setDone('rejected');
    } catch (err) { alert('Failed to reject. Please try again.'); console.error(err); }
    finally { setSaving(false); }
  }

  const alreadyReviewed = booking?.booking_review_status === 'director-approved'
    || booking?.booking_review_status === 'director-rejected'
    || booking?.booking_review_status === 'finance-verified'
    || booking?.booking_review_status === 'Booked';

  if (done) {
    return (
      <PageShell title="Director Review" backButton onBack={() => router.push('/account/buyers-verification')}>
        <GlassCard className="p-8 flex flex-col items-center gap-4">
          {done === 'approved'
            ? <CheckCircle2 size={48} className="text-green-500" />
            : <XCircle size={48} className="text-red-500" />}
          <p className="text-base font-bold text-[#1C1C1E]">
            {done === 'approved' ? 'Booking Approved' : 'Booking Rejected'}
          </p>
          <p className="text-sm text-[#8E8E93] text-center">
            {done === 'approved'
              ? 'This booking has been approved and forwarded to Finance.'
              : 'The agent has been notified to review and resubmit.'}
          </p>
          {done === 'approved' ? (
            <button
              onClick={() => {
                sessionStorage.setItem('selectedReservation', JSON.stringify({
                  reservation_id: booking?.reservation_id,
                  client_name:    booking?.client_name,
                  project:        booking?.project,
                  inventory_code: booking?.inventory_code,
                }));
                router.push('/sales/booking/detail');
              }}
              className="mt-2 px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              View Booking Detail
            </button>
          ) : (
            <button
              onClick={() => router.push('/account/buyers-verification')}
              className="mt-2 px-6 py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Back to Queue
            </button>
          )}
        </GlassCard>
      </PageShell>
    );
  }

  if (!booking) {
    return (
      <PageShell title="Director Review" backButton onBack={() => router.push('/account/buyers-verification')}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-[#C03D25] animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Director Review" backButton onBack={() => router.push('/account/buyers-verification')}>
      <div className="space-y-3 pb-32">

        {/* Already reviewed notice */}
        {alreadyReviewed && (
          <GlassCard className={`px-4 py-3 flex items-center gap-3 ${
            booking.booking_review_status === 'director-rejected' ? 'bg-red-50' : 'bg-green-50'
          }`}>
            {booking.booking_review_status === 'director-rejected'
              ? <XCircle size={16} className="text-red-500 shrink-0" />
              : <CheckCircle2 size={16} className="text-green-600 shrink-0" />}
            <p className={`text-xs font-semibold ${
              booking.booking_review_status === 'director-rejected' ? 'text-red-700' : 'text-green-700'
            }`}>
              {booking.booking_review_status === 'director-approved'   ? 'You have already approved this booking.'
              : booking.booking_review_status === 'director-rejected'  ? 'You have already rejected this booking.'
              : booking.booking_review_status === 'finance-verified'   ? 'This booking has been verified by Finance.'
              : booking.booking_review_status === 'Booked'             ? 'This booking is fully completed.'
              : ''}
            </p>
          </GlassCard>
        )}

        {/* Reservation hero card */}
        <GlassCard className="overflow-hidden">
          <div className="px-4 py-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
              <span className="text-lg font-bold text-white">
                {getInitials(booking.client_name ?? '?')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">Reservation ID</p>
              <p className="text-lg font-bold text-[#1C1C1E] truncate">{booking.reservation_id}</p>
              <p className="text-sm text-[#6C6C70] truncate">{booking.client_name ?? '—'}</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${statusChip(booking.booking_review_status).cls}`}>
              {statusChip(booking.booking_review_status).label}
            </span>
          </div>
          <div className="border-t border-black/[0.06] px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Building2 size={12} className="text-[#C7C7CC]" />
              <span className="text-xs text-[#6C6C70]">{booking.project ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Tag size={12} className="text-[#C7C7CC]" />
              <span className="text-xs font-medium text-[#6C6C70]">
                {[booking.tower, booking.floor, booking.unit_no, booking.inventory_code].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Reservation Agreement */}
        <GroupLabel label="Reservation Agreement" />
        <AgreementPreviewCard b={booking} onClick={() => setViewerOpen(true)} />
        <AgreementViewer open={viewerOpen} onClose={() => setViewerOpen(false)} b={booking} />

        {/* Data Privacy Statement */}
        <GroupLabel label="Data Privacy Statement" />
        <PrivacyPreviewCard b={booking} onClick={() => setPrivacyOpen(true)} />
        <PrivacyViewer open={privacyOpen} onClose={() => setPrivacyOpen(false)} b={booking} />

        {/* Terms of Payment */}
        <GroupLabel label="Terms of Payment" />
        <TermsPreviewCard b={booking} onClick={() => setTermsOpen(true)} />
        <TermsViewer open={termsOpen} onClose={() => setTermsOpen(false)} b={booking} />

        {/* Buyer's Information Form */}
        <GroupLabel label="Buyer's Information Form" />
        <BuyerInfoPreviewCard b={booking} onClick={() => setBuyerInfoOpen(true)} />
        <BuyerInfoViewer
          open={buyerInfoOpen}
          onClose={() => setBuyerInfoOpen(false)}
          b={booking}
          client={clientRecord}
          buyerInfo={buyerInfo}
          spouse={spouseInfo}
          coOwner={coOwnerInfo}
          atty={attyInfo}
          loading={buyerInfoLoading}
        />

        {/* Uploaded documents */}
        <GroupLabel label="Reservation Documents" />
        <DocSection label="Proof of Payment"  urls={booking.payment_proof_url ? [booking.payment_proof_url] : []} />
        <DocSection label="Proof of Billing"  urls={parseJson(booking.proof_of_billing_urls)} />
        <DocSection label="Proof of Income"   urls={parseJson(booking.proof_of_income_urls)} />
        <DocSection label="Buyer Valid ID"     urls={parseJson(booking.proof_of_valid_id_urls)} />

        {(booking.has_co_ownership || booking.has_spouse || booking.has_atty_in_fact) && (
          <>
            <GroupLabel label="Booking Documents" />
            {booking.has_co_ownership && (
              <DocSection label="Co-Owner Valid ID"         urls={booking.co_owner_id_urls ?? []} />
            )}
            {booking.has_spouse && (
              <DocSection label="Spouse Valid ID"           urls={booking.spouse_id_urls ?? []} />
            )}
            {booking.has_atty_in_fact && (
              <DocSection label="Attorney in Fact Valid ID" urls={booking.atty_in_fact_id_urls ?? []} />
            )}
          </>
        )}

        {/* Previous rejection notes */}
        {booking.director_notes && (
          <GlassCard className="px-4 py-3 space-y-1.5 bg-red-50">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-500" />
              <p className="text-xs font-bold text-red-700">Previous Rejection Notes</p>
            </div>
            <p className="text-xs text-[#3A3A3C] leading-relaxed">{booking.director_notes}</p>
          </GlassCard>
        )}


      </div>
      {/* Sticky action bar */}
      {!alreadyReviewed && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-8 pt-4 bg-white/80 backdrop-blur-md border-t border-black/[0.06]">
          {rejecting ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-[#1C1C1E]">Rejection Notes <span className="text-red-500">*</span></p>
              <textarea
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                placeholder="Describe what needs to be corrected…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white resize-none placeholder:text-[#C7C7CC]"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => { setRejecting(false); setRejectNotes(''); }}
                  className="flex-1 py-3.5 rounded-2xl border border-black/[0.08] text-sm font-semibold text-[#8E8E93] active:bg-black/[0.02]">
                  Cancel
                </button>
                <button type="button" onClick={handleReject}
                  disabled={saving || !rejectNotes.trim()}
                  className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80 disabled:opacity-40">
                  {saving ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button type="button" onClick={() => setRejecting(true)}
                className="flex-1 py-4 rounded-2xl border-2 border-red-300 text-red-600 text-sm font-bold active:bg-red-50">
                Reject
              </button>
              <button type="button" onClick={handleApprove} disabled={saving}
                className="flex-1 py-4 rounded-2xl bg-green-500 text-white text-sm font-bold shadow-[0_4px_16px_rgba(34,197,94,0.3)] active:opacity-80 disabled:opacity-40">
                {saving ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )}
        </div>
      )}

    </PageShell>
  );
}
