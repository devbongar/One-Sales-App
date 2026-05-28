'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { FileText, FolderOpen, X, ChevronRight, ShieldCheck, User } from 'lucide-react';
import { fetchAllClients, fetchBuyerInfo, BuyerInfoRecord, ClientRecord } from '@/lib/clients';
import { fetchSpouseInfo, SpouseInfoRecord } from '@/lib/spouse-info';
import { fetchCoOwner, CoOwnerRecord } from '@/lib/co-owners';
import { fetchAttyInFact, AttyInFactRecord } from '@/lib/atty-in-fact';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderData {
  // Agreement fields
  reservation_id:       string | null;
  client_name:          string | null;
  project:              string | null;
  tower:                string | null;
  floor:                string | null;
  unit_no:              string | null;
  inventory_code:       string | null;
  unit_type:            string | null;
  unit_area:            number | null;
  net_list_price:       number | null;
  vat:                  number | null;
  other_charges:        number | null;
  total_contract_price: number | null;
  scheme_name:          string | null;
  payment_term:         string | null;
  signature_base64:     string | null;
  created_at:           string | null;
  // Terms of Payment fields
  list_price:              number | null;
  promo_discount_pct:      number | null;
  promo_discount_amount:   number | null;
  payterm_discount_pct:    number | null;
  payterm_discount_amount: number | null;
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
  due_from:                string | null;  // not yet in DB
  due_to:                  string | null;  // not yet in DB
  // Flags
  has_co_ownership:   boolean | null;
  has_atty_in_fact:   boolean | null;
  has_spouse:         boolean | null;
  // Document fields
  payment_proof_url:      string | null;
  proof_of_billing_urls:  string | null;
  proof_of_income_urls:   string | null;
  proof_of_valid_id_urls: string | null;
  co_owner_id_urls:       string[] | null;
  atty_in_fact_id_urls:   string[] | null;
  spouse_id_urls:         string[] | null;
}

// ─── Terms (read-only, same content as agreement page) ────────────────────────

const TERMS = [
  {
    title: 'RESERVATION PROVISION',
    items: [
      `1. As proof of my interest to purchase the Property, I hereby tender the sum of: {{RESERVATION_FEE}} as Reservation Fee, exclusive of VAT, in order to reserve the Property for our intended purchase which shall be effective for a period of thirty (30) days from delivery of the Reservation Fee. I understand and acknowledge that the Reservation Fee is non-refundable. Should I decide to cancel my reservation; fail to submit all the documentary requirements, including this Reservation Agreement; or fail to pay the amounts due on the prescribed due dates, for any reason whatsoever, I agree that my reservation shall lapse and my Reservation Fee shall be forfeited in favor of the Company. I will hold the Company free and harmless for thereafter releasing and offering the Property to other interested buyers.`,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(s: string | null): string[] {
  try { return JSON.parse(s ?? '[]') as string[]; } catch { return []; }
}

function fmt(n: number | null) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url);
}

function fileName(url: string) {
  return decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'file');
}

// ─── A4 page wrapper ──────────────────────────────────────────────────────────

function A4Page({
  children,
  pageNum,
  total,
  reservationId,
  title,
  branded,
}: {
  children: React.ReactNode;
  pageNum: number;
  total: number;
  reservationId: string | null;
  title: string;
  branded?: boolean;
}) {
  return (
    <div
      className="bg-white shadow-[0_4px_24px_rgba(0,0,0,0.28)] flex flex-col"
      style={{ minHeight: 'calc((100vw - 24px) * 1.4142)' }}
    >
      {/* Page header — logo · title · res ID */}
      <div className={`flex items-center justify-between px-5 py-2.5 border-b shrink-0 ${
        branded ? 'bg-[#E8634A] border-[#C03D25]' : 'border-gray-200'
      }`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branded ? '/document logo.png' : '/logo.png'}
          alt="PH1 World Developers"
          className="h-7 object-contain object-left"
        />
        <p className={`text-[9px] font-bold uppercase tracking-[0.14em] text-center px-2 ${
          branded ? 'text-white' : 'text-[#1C1C1E]'
        }`}>
          {title}
        </p>
        <p className={`text-[8px] text-right shrink-0 ${branded ? 'text-white/70' : 'text-gray-400'}`}>
          {reservationId ?? '—'}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-5">
        {children}
      </div>

      {/* Page footer */}
      <div className="px-5 py-2 border-t border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-[8px] text-gray-300 uppercase tracking-[0.1em]">
          PH1 World Developers Inc.
        </span>
        <span className="text-[8px] text-gray-300">
          Page {pageNum} of {total}
        </span>
      </div>
    </div>
  );
}

// ─── PDF Viewer overlay ────────────────────────────────────────────────────────

function AgreementViewer({
  open,
  onClose,
  d,
}: {
  open: boolean;
  onClose: () => void;
  d: FolderData;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [open]);

  if (!open) return null;

  const TOTAL = 3;
  const resId = d.reservation_id ?? '—';

  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">
            Reservation Agreement
          </p>
          <p className="text-white/40 text-[10px]">{resId} · {TOTAL} pages</p>
        </div>
        <button
          onClick={onClose}
          className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable pages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        {/* ── PAGE 1: Intro · Buyer Name · Property Info · Price & Terms · Reservation Provision ── */}
        <A4Page pageNum={1} total={TOTAL} reservationId={resId} title="Reservation Agreement" branded>

          {/* Opening statement */}
          <p className="text-[9px] text-[#3A3A3C] leading-[1.75] text-justify mb-3">
            I hereby manifest my intention and offer to purchase from{' '}
            <span className="font-semibold text-[#1C1C1E]">PH1 WORLD DEVELOPERS INC.</span>{' '}
            (the "Company") the following property (the "Property") and request that the Property
            be reserved for me pursuant to the agreed price, terms and conditions indicated below:
          </p>

          {/* Buyer's Full Name */}
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-[9px] text-gray-500 whitespace-nowrap shrink-0">Buyer&apos;s Full Name</span>
            <div className="flex-1 border-b border-gray-400 pb-0.5">
              <p className="text-[11px] font-bold text-[#1C1C1E] uppercase">
                {d.client_name ?? '—'}
              </p>
            </div>
          </div>

          {/* PROPERTY INFORMATION — horizontal table */}
          <div className="border border-gray-200 overflow-hidden mb-3">
            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Property Information
              </p>
            </div>
            <div className="grid grid-cols-5 divide-x divide-gray-200">
              {([
                ['Project',          d.project],
                ['Tower / Building', d.tower],
                ['Unit #',           d.unit_no],
                ['Floor Area (sqm)', d.unit_area != null ? `${d.unit_area}` : '—'],
                ['Unit Type',        d.unit_type],
              ] as [string, string | null][]).map(([label, value]) => (
                <div key={label} className="px-2 py-2">
                  <p className="text-[6.5px] text-gray-400 uppercase tracking-wide leading-tight mb-0.5">{label}</p>
                  <p className="text-[9px] font-semibold text-[#1C1C1E]">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* PRICE AND TERMS — horizontal table */}
          <div className="border border-gray-200 overflow-hidden mb-4">
            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Price and Terms
              </p>
            </div>
            <div className="grid grid-cols-6 divide-x divide-gray-200">
              <div className="px-2 py-2">
                <p className="text-[6.5px] text-gray-400 uppercase tracking-wide leading-tight mb-0.5">Net Selling Price</p>
                <p className="text-[9px] font-semibold text-[#1C1C1E]">{fmt(d.net_list_price)}</p>
              </div>
              <div className="px-2 py-2">
                <p className="text-[6.5px] text-gray-400 uppercase tracking-wide leading-tight mb-0.5">Value Added Tax</p>
                <p className="text-[9px] font-semibold text-[#1C1C1E]">{fmt(d.vat)}</p>
              </div>
              <div className="px-2 py-2">
                <p className="text-[6.5px] text-gray-400 uppercase tracking-wide leading-tight mb-0.5">Other Charges</p>
                <p className="text-[9px] font-semibold text-[#1C1C1E]">{fmt(d.other_charges)}</p>
              </div>
              <div className="px-2 py-2 bg-[#1C1C1E]">
                <p className="text-[6.5px] text-white/60 uppercase tracking-wide leading-tight mb-0.5">Total Contract Price</p>
                <p className="text-[9px] font-bold text-white">{fmt(d.total_contract_price)}</p>
              </div>
              <div className="px-2 py-2">
                <p className="text-[6.5px] text-gray-400 uppercase tracking-wide leading-tight mb-0.5">Chosen Payment Scheme</p>
                <p className="text-[9px] font-semibold text-[#1C1C1E]">{d.scheme_name ?? '—'}</p>
              </div>
              <div className="px-2 py-2">
                <p className="text-[6.5px] text-gray-400 uppercase tracking-wide leading-tight mb-0.5">Down Payment</p>
                <p className="text-[9px] font-semibold text-[#1C1C1E]">{fmt(d.dp_amount)}</p>
              </div>
            </div>
          </div>

          {/* RESERVATION PROVISION */}
          <div className="space-y-2">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#1C1C1E] border-b border-gray-200 pb-1.5">
              Reservation Provision
            </p>
            {TERMS[0].items.map((item, i) => {
              const feeAmt = `PHP ${(d.reservation_fee ?? 25_000).toLocaleString('en-PH')}`;
              return (
                <div key={i}>
                  {item.split('\n\n').map((para, j) => {
                    if (para.includes('{{RESERVATION_FEE}}')) {
                      const [before, after] = para.split('{{RESERVATION_FEE}}');
                      return (
                        <p key={j} className="text-[9.5px] text-[#3A3A3C] leading-[1.8] text-justify mb-2 last:mb-0">
                          {before}
                          <span className="inline-block font-bold text-[#1C1C1E] border border-gray-400 px-1.5 py-0.5 rounded mx-0.5 text-[9.5px]">
                            {feeAmt}
                          </span>
                          {after}
                        </p>
                      );
                    }
                    return (
                      <p key={j} className="text-[9.5px] text-[#3A3A3C] leading-[1.8] text-justify whitespace-pre-line mb-2 last:mb-0">
                        {para.trim()}
                      </p>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </A4Page>

        {/* ── PAGE 2: Payment & Payment Modes ── */}
        <A4Page pageNum={2} total={TOTAL} reservationId={resId} title="Reservation Agreement" branded>
          <div className="space-y-5">
            {TERMS.slice(1, 2).map(({ title, items }) => (
              <div key={title} className="space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1C1C1E] border-b border-gray-200 pb-1.5">
                  {title}
                </p>
                {items.map((item, i) => (
                  <div key={i}>
                    {item.split('\n\n').map((para, j) => (
                      <p
                        key={j}
                        className="text-[10.5px] text-[#3A3A3C] leading-[1.85] text-justify whitespace-pre-line mb-2 last:mb-0"
                      >
                        {para.trim()}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </A4Page>

        {/* ── PAGE 3: Sales Documents + Agreements + Signature ── */}
        <A4Page pageNum={3} total={TOTAL} reservationId={resId} title="Reservation Agreement" branded>
          <div className="space-y-3 mb-5">
            {TERMS.slice(2).map(({ title, items }) => (
              <div key={title} className="space-y-2">
                <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#1C1C1E] border-b border-gray-200 pb-1.5">
                  {title}
                </p>
                {items.map((item, i) => (
                  <div key={i}>
                    {item.split('\n\n').map((para, j) => (
                      <p
                        key={j}
                        className="text-[9px] text-[#3A3A3C] leading-[1.7] text-justify whitespace-pre-line mb-1.5 last:mb-0"
                      >
                        {para.trim()}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Signature block — directly after item 16 */}
          <div className="space-y-1.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-gray-500">
              Buyer&apos;s Signature
            </p>
            <div className="h-20 border-b-2 border-gray-400 flex items-end pb-1 overflow-hidden">
              {d.signature_base64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.signature_base64}
                  alt="Signature"
                  className="max-h-full object-contain"
                />
              ) : (
                <p className="text-[10px] text-gray-300 italic w-full text-center mb-3">
                  No signature on file
                </p>
              )}
            </div>
            <p className="text-[11px] font-bold text-[#1C1C1E] uppercase tracking-wide pt-1">
              {d.client_name ?? '—'}
            </p>
            <p className="text-[9px] text-gray-400">Buyer</p>
          </div>

        </A4Page>

        {/* Bottom breathing room */}
        <div className="h-4" />

      </div>
    </div>
  );
}

// ─── Preview card (tappable, shown in folder detail) ─────────────────────────

function AgreementPreviewCard({
  d,
  onClick,
}: {
  d: FolderData;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left active:scale-[0.98] transition-transform"
    >
      <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.10)] overflow-hidden">

        {/* Mini page header replica */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PH1" className="h-6 object-contain object-left" />
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#1C1C1E]">
            Reservation Agreement
          </p>
          <p className="text-[8px] text-gray-400">{d.reservation_id ?? '—'}</p>
        </div>

        {/* Card body */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F9F9FB]">
          <div>
            <p className="text-[11px] font-semibold text-[#1C1C1E]">{d.client_name ?? '—'}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {formatDate(d.created_at)} · 3 pages
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#E8634A] px-3 py-1.5 rounded-full">
            <FileText size={11} className="text-white" />
            <span className="text-[10px] font-semibold text-white">View</span>
            <ChevronRight size={10} className="text-white" />
          </div>
        </div>

      </div>
    </button>
  );
}

// ─── Data Privacy content ─────────────────────────────────────────────────────

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

// ─── Data Privacy Viewer ──────────────────────────────────────────────────────

function PrivacyViewer({
  open,
  onClose,
  d,
}: {
  open: boolean;
  onClose: () => void;
  d: FolderData;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [open]);

  if (!open) return null;

  const TOTAL = 1;
  const resId = d.reservation_id ?? '—';

  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">
            Data Privacy Statement
          </p>
          <p className="text-white/40 text-[10px]">{resId} · {TOTAL} page</p>
        </div>
        <button
          onClick={onClose}
          className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Single scrollable page */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        <A4Page pageNum={1} total={TOTAL} reservationId={resId} title="Data Privacy Statement" branded>

          {/* Date + Res No */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-gray-500">
              Date: <span className="font-semibold text-[#1C1C1E]">{formatDate(d.created_at)}</span>
            </span>
            <span className="text-[10px] text-gray-500">
              Res. No.: <span className="font-semibold text-[#1C1C1E]">{resId}</span>
            </span>
          </div>

          {/* All sections */}
          <div className="space-y-4 mb-5">
            {PRIVACY_SECTIONS.map(({ title, body }) => (
              <div key={title} className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1C1C1E] border-b border-gray-200 pb-1">
                  {title}
                </p>
                <p className="text-[10.5px] text-[#3A3A3C] leading-[1.75] text-justify">
                  {body}
                </p>
              </div>
            ))}
          </div>

          {/* Witness clause */}
          <p className="text-[10px] text-[#3A3A3C] leading-[1.75] text-justify mb-4">
            IN WITNESS WHEREOF, I have hereunto set my hand this{' '}
            <span className="font-semibold text-[#1C1C1E]">{formatDate(d.created_at)}</span> at
            Metro Manila, Philippines, signifying my full understanding and consent to the foregoing
            Data Privacy Statement.
          </p>

          {/* Read-only checkboxes */}
          <div className="space-y-2.5 mb-5">
            {[
              'I hereby acknowledge that I have carefully read and understood this Data Privacy Statement, and I expressly give my full consent to the collection, use, and processing of my personal data by PH1 WORLD DEVELOPERS INC. as described herein.',
              'I agree to affix my e-signature below to signify my conformity and consent to this Data Privacy Statement.',
            ].map((label, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="mt-0.5 w-4 h-4 rounded bg-[#E8634A] border-2 border-[#E8634A] flex items-center justify-center shrink-0">
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.2 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-[10px] text-[#1C1C1E] leading-[1.65]">{label}</p>
              </div>
            ))}
          </div>

          {/* Signature block */}
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">
              Buyer&apos;s Signature
            </p>
            <div className="h-20 border-b-2 border-gray-400 flex items-end pb-1 overflow-hidden">
              {d.signature_base64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.signature_base64} alt="Signature" className="max-h-full object-contain" />
              ) : (
                <p className="text-[10px] text-gray-300 italic w-full text-center mb-3">
                  No signature on file
                </p>
              )}
            </div>
            <p className="text-[11px] font-bold text-[#1C1C1E] uppercase tracking-wide pt-1">
              {d.client_name ?? '—'}
            </p>
            <p className="text-[10px] text-gray-400">Buyer</p>
          </div>

        </A4Page>

        <div className="h-4" />

      </div>
    </div>
  );
}

// ─── Privacy preview card ─────────────────────────────────────────────────────

function PrivacyPreviewCard({
  d,
  onClick,
}: {
  d: FolderData;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left active:scale-[0.98] transition-transform"
    >
      <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.10)] overflow-hidden">

        {/* Mini page header replica */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PH1" className="h-6 object-contain object-left" />
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#1C1C1E]">
            Data Privacy Statement
          </p>
          <p className="text-[8px] text-gray-400">{d.reservation_id ?? '—'}</p>
        </div>

        {/* Card body */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F9F9FB]">
          <div>
            <p className="text-[11px] font-semibold text-[#1C1C1E]">{d.client_name ?? '—'}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {formatDate(d.created_at)} · 1 page
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#E8634A] px-3 py-1.5 rounded-full">
            <ShieldCheck size={11} className="text-white" />
            <span className="text-[10px] font-semibold text-white">View</span>
            <ChevronRight size={10} className="text-white" />
          </div>
        </div>

      </div>
    </button>
  );
}

// ─── File tile ────────────────────────────────────────────────────────────────

function FileTile({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="relative rounded-xl overflow-hidden border border-black/[0.08] bg-[#F2F2F7] aspect-square active:opacity-70">
      {isImage(url) ? (
        <img src={url} alt={fileName(url)} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
          <FileText size={28} className="text-[#E8634A]" />
          <span className="text-[10px] text-[#6C6C70] text-center leading-tight line-clamp-2 break-all">
            {fileName(url)}
          </span>
        </div>
      )}
    </a>
  );
}

// ─── Doc section ──────────────────────────────────────────────────────────────

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
        <div className="w-full py-7 flex flex-col items-center gap-1.5 text-center">
          <FolderOpen size={22} className="text-[#C7C7CC]" />
          <span className="text-xs text-[#C7C7CC] font-medium">No documents uploaded</span>
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
  return (
    <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-[0.12em] px-1 pt-2">
      {label}
    </p>
  );
}

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

// ─── Terms of Payment Viewer ──────────────────────────────────────────────────

function TermsViewer({ open, onClose, d }: { open: boolean; onClose: () => void; d: FolderData }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
  if (!open) return null;

  const resId  = d.reservation_id ?? '—';
  const fmtN   = (n: number | null) => n != null ? n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const fmtPct = (n: number | null) => n != null ? `${n}%` : '';
  const finPct = d.dp_rate != null ? 100 - d.dp_rate : null;

  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">Terms of Payment</p>
          <p className="text-white/40 text-[10px]">{resId} · 1 page</p>
        </div>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Scrollable A4 page */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div className="bg-white shadow-[0_4px_24px_rgba(0,0,0,0.28)] flex flex-col"
          style={{ minHeight: 'calc((100vw - 24px) * 1.4142)' }}>

          {/* Document header */}
          <div className="bg-[#E8634A] border-b border-[#C03D25] px-5 py-2.5 flex items-center justify-between shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/document logo.png" alt="PH1 World Developers" className="h-7 object-contain object-left" />
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-center px-2 text-white">Terms of Payment</p>
            <p className="text-[8px] text-right shrink-0 text-white/70">{resId}</p>
          </div>

          {/* Body */}
          <div className="flex-1 px-3 py-2.5 space-y-2">

            {/* Property Information */}
            <div className="border border-gray-300 overflow-hidden">
              <div className="bg-gray-100 px-2 py-1 border-b border-gray-300">
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#1C1C1E]">Property Information</p>
              </div>
              <div className="grid grid-cols-5 divide-x divide-gray-200">
                {([
                  ['Project',          d.project],
                  ['Tower / House No.', d.tower],
                  ['Unit Number',      d.unit_no],
                  ['Unit Type',        d.unit_type],
                  ['Unit Area',        d.unit_area != null ? `${d.unit_area}` : '—'],
                ] as [string, string | null][]).map(([lbl, val]) => (
                  <div key={lbl} className="px-1.5 py-1.5">
                    <p className="text-[6.5px] text-gray-500 uppercase tracking-wide leading-tight">{lbl}</p>
                    <p className="text-[8px] font-semibold text-[#1C1C1E] mt-0.5">{val ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Purchase Price Computation */}
            <div className="border border-gray-300 overflow-hidden">
              <div className="bg-gray-100 px-2 py-1 border-b border-gray-300">
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#1C1C1E]">Purchase Price Computation</p>
              </div>
              <div className="grid grid-cols-5 divide-x divide-gray-200">
                {([
                  ['Payment Scheme', d.scheme_name],
                  ['Term',           d.term_months != null ? `${d.term_months}` : '—'],
                  ['Downpayment (%)', d.dp_rate != null ? `${d.dp_rate}%` : '—'],
                  ['Due From',       d.due_from ?? '—'],
                  ['Due To',         d.due_to   ?? '—'],
                ] as [string, string | null][]).map(([lbl, val]) => (
                  <div key={lbl} className="px-1.5 py-1.5">
                    <p className="text-[6.5px] text-gray-500 uppercase tracking-wide leading-tight">{lbl}</p>
                    <p className="text-[8px] font-semibold text-[#1C1C1E] mt-0.5">{val ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Main 2-column body */}
            <div className="flex gap-2">

              {/* Left — price breakdown */}
              <div className="flex-1 min-w-0">
                <div className="bg-[#1C1C1E] px-2 py-1 mb-1">
                  <p className="text-[7.5px] font-bold text-white uppercase tracking-wide">
                    {fmtPct(d.dp_rate)} DP{finPct != null ? `, ${finPct}% END-USER FINANCING` : ''}
                  </p>
                </div>
                <PriceRow label="List Price" value={fmtN(d.list_price)} />
                {(d.promo_discount_amount ?? 0) > 0 && (
                  <PriceRow label={`(-) Promo Discount ${fmtPct(d.promo_discount_pct)}`} value={`(${fmtN(d.promo_discount_amount)})`} indent />
                )}
                {(d.payterm_discount_amount ?? 0) > 0 && (
                  <PriceRow label={`(-) Payterm Discount ${fmtPct(d.payterm_discount_pct)}`} value={`(${fmtN(d.payterm_discount_amount)})`} indent />
                )}
                {(d.employee_discount_amount ?? 0) > 0 && (
                  <PriceRow label="(-) Special Discount" value={`(${fmtN(d.employee_discount_amount)})`} indent />
                )}
                <PriceRow label="Discounted Price" value={fmtN(d.net_list_price)} />
                <PriceRow label="Value Added Tax 12%" value={fmtN(d.vat)} />
                <PriceRow label="Other Charges" value={fmtN(d.other_charges)} />
                <PriceRowBold label="Total Contract Price" value={fmtN(d.total_contract_price)} />
                <div className="h-1.5" />
                <PriceRow label={`Downpayment Amount ${fmtPct(d.dp_rate)}`} value={fmtN(d.dp_amount)} />
                <PriceRow label="(-) Reservation Fee" value={`(${fmtN(d.reservation_fee)})`} indent />
                <PriceRow label="Net Downpayment" value={fmtN(d.net_spot_dp)} />
                <PriceRowBold label={`Monthly Downpayment ${d.term_months ?? '—'} mos.`} value={fmtN(d.monthly_stretched_dp)} />
                <div className="h-1.5" />
                <PriceRow label="Balance for end-user financing" value={fmtN(d.balance_for_financing)} />
              </div>

              {/* Right — amortization tables */}
              <div className="w-[42%] shrink-0 space-y-2">
                <div className="border border-gray-300 overflow-hidden">
                  <div className="bg-[#E8634A] px-2 py-1 text-center">
                    <p className="text-[7.5px] font-bold text-white uppercase tracking-wide">Bank Amortization</p>
                  </div>
                  <AmortRow label="Balance for end-user financing" value={fmtN(d.balance_for_financing)} />
                  <AmortRow label="Indicative Interest Rate" value="—" />
                  <AmortRow label="Loan Term (Max years)" value="—" />
                  <AmortRow label="Monthly Amortization" value={fmtN(d.bank_monthly)} bold />
                </div>
                <div className="border border-gray-300 overflow-hidden">
                  <div className="bg-[#E8634A] px-2 py-1 text-center">
                    <p className="text-[7.5px] font-bold text-white uppercase tracking-wide">HDMF Amortization</p>
                  </div>
                  <AmortRow label="Balance for end-user financing" value={fmtN(d.balance_for_financing)} />
                  <AmortRow label="Indicative Interest Rate" value="—" />
                  <AmortRow label="Loan Term (Max years)" value="—" />
                  <AmortRow label="Monthly Amortization" value={fmtN(d.hdmf_monthly)} bold />
                </div>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-gray-100 text-center shrink-0">
            <p className="text-[7.5px] text-gray-500 italic leading-relaxed">
              **This auto-generated Terms of Payment is valid only if unaltered and shall serve
              as the official payment schedule based on the terms and conditions of the Reservation Agreement.**
            </p>
            <p className="text-[7px] text-gray-400 mt-1">
              Date Generated: {new Date().toLocaleString('en-US')}
            </p>
          </div>

        </div>
        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Terms of Payment Preview Card ───────────────────────────────────────────

function TermsPreviewCard({ d, onClick }: { d: FolderData; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left active:scale-[0.98] transition-transform">
      <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.10)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PH1" className="h-6 object-contain object-left" />
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#1C1C1E]">Terms of Payment</p>
          <p className="text-[8px] text-gray-400">{d.reservation_id ?? '—'}</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-[#F9F9FB]">
          <div>
            <p className="text-[11px] font-semibold text-[#1C1C1E]">{d.client_name ?? '—'}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(d.created_at)} · 1 page</p>
          </div>
          <div className="flex items-center gap-1 bg-[#E8634A] px-3 py-1.5 rounded-full">
            <FileText size={11} className="text-white" />
            <span className="text-[10px] font-semibold text-white">View</span>
            <ChevronRight size={10} className="text-white" />
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Buyer Information Form sub-components ───────────────────────────────────

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
  return (
    <p className="text-[6.5px] font-bold uppercase tracking-[0.08em] text-[#8E8E93] mt-2 mb-0.5">{label}</p>
  );
}

// ─── Buyer Information Viewer ─────────────────────────────────────────────────

function BuyerInfoViewer({
  open, onClose, d, client, buyerInfo, spouse, coOwner, atty, loading,
}: {
  open: boolean; onClose: () => void; d: FolderData;
  client: ClientRecord | null; buyerInfo: BuyerInfoRecord | null;
  spouse: SpouseInfoRecord | null; coOwner: CoOwnerRecord | null;
  atty: AttyInFactRecord | null; loading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = 0; }, [open]);
  if (!open) return null;

  const resId      = d.reservation_id ?? '—';
  const hasSpouse  = !!d.has_spouse;
  const hasCoOwner = !!d.has_co_ownership;
  const hasAtty    = !!d.has_atty_in_fact;
  const fmtMobile  = (code: string | null | undefined, num: string | null | undefined) =>
    [code, num].filter(Boolean).join(' ') || '—';

  // Pre-compute page numbers dynamically
  let p = 1;
  const buyerPage   = p++;
  const spousePage  = (hasSpouse  && !!spouse)   ? p++ : 0;
  const coOwnerPage = (hasCoOwner && !!coOwner)  ? p++ : 0;
  const attyPage    = (hasAtty    && !!atty)     ? p++ : 0;
  const total       = p - 1;

  const TITLE = 'Buyer Information Form';

  return (
    <div className="fixed top-[100px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[#2C2C2E] rounded-t-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1C1C1E] shrink-0">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">{TITLE}</p>
          <p className="text-white/40 text-[10px]">{resId} · {loading ? '…' : `${total} page${total > 1 ? 's' : ''}`}</p>
        </div>
        <button onClick={onClose} className="ml-3 p-2 rounded-xl bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Scrollable A4 pages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        {loading ? (
          <A4Page pageNum={1} total={1} reservationId={resId} title={TITLE} branded>
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
            </div>
          </A4Page>
        ) : (<>

          {/* ── PAGE 1: Buyer Information + Employment ── */}
          <A4Page pageNum={buyerPage} total={total} reservationId={resId} title={TITLE} branded>
            <BIFSection title="Buyer Information" />
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 py-1">
              <InfoField label="Last Name"    value={client?.last_name} />
              <InfoField label="First Name"   value={client?.first_name} />
              <InfoField label="Middle Name"  value={client?.middle_name} />
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
              <InfoField label="Unit No. / Building / House No. / Block No." value={buyerInfo?.home_unit} />
              <InfoField label="Street, Subdivision / Village" value={buyerInfo?.home_street} />
              <InfoField label="Barangay" value={buyerInfo?.home_barangay} />
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
            <BIFSubLabel label="Address" />
            <div className="grid grid-cols-3 gap-x-2 gap-y-1 pb-0.5">
              <InfoField label="Unit No. / Building / House No. / Block No." value={buyerInfo?.work_building_unit} />
              <InfoField label="Street, Subdivision / Village" value={buyerInfo?.work_street} />
              <InfoField label="Barangay" value={buyerInfo?.work_barangay} />
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              <InfoField label="City / Municipality" value={buyerInfo?.work_city_municipality} />
              <InfoField label="Province / Region"   value={buyerInfo?.work_region_province} />
              <InfoField label="Country"             value={buyerInfo?.work_country} />
            </div>
            {!hasSpouse && !hasCoOwner && !hasAtty && (
              <p className="text-[7px] text-gray-400 pt-4">Date Generated: {new Date().toLocaleString('en-US')}</p>
            )}
          </A4Page>

          {/* ── PAGE 3: Spouse (conditional) ── */}
          {spousePage > 0 && spouse && (
            <A4Page pageNum={spousePage} total={total} reservationId={resId} title={TITLE} branded>
              <p className="text-[7px] text-[#3A3A3C] italic pb-2">
                If Married, the buyer agrees that his/her spouse (as applicable) shall sign the contract-to-sell.
              </p>
              <BIFSection title="Spouse Information" />
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Last Name"    value={spouse.last_name} />
                <InfoField label="First Name"   value={spouse.first_name} />
                <InfoField label="Middle Name"  value={spouse.middle_name} />
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
              {!hasCoOwner && !hasAtty && (
                <p className="text-[7px] text-gray-400 pt-6">Date Generated: {new Date().toLocaleString('en-US')}</p>
              )}
            </A4Page>
          )}

          {/* ── PAGE: Co-Owner (conditional) ── */}
          {coOwnerPage > 0 && coOwner && (
            <A4Page pageNum={coOwnerPage} total={total} reservationId={resId} title={TITLE} branded>
              <BIFSection title="Co-Owner Information" />
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 py-1.5">
                <InfoField label="Last Name"    value={coOwner.last_name} />
                <InfoField label="First Name"   value={coOwner.first_name} />
                <InfoField label="Middle Name"  value={coOwner.middle_name} />
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
              <BIFSubLabel label="Address" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Unit No. / Building / House No. / Block No." value={coOwner.home_unit} />
                <InfoField label="Street, Subdivision / Village" value={coOwner.home_street} />
                <InfoField label="Barangay" value={coOwner.home_barangay} />
              </div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-2 pb-1">
                <InfoField label="City / Municipality" value={coOwner.home_city_municipality} />
                <InfoField label="Province / Region"   value={coOwner.home_region_province} />
                <InfoField label="Country"             value={coOwner.home_country} />
                <InfoField label="Home Ownership"      value={coOwner.home_ownership} />
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
              <BIFSubLabel label="Contact Information" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Mobile Number"   value={fmtMobile(coOwner.work_mobile_code, coOwner.work_mobile)} />
                <InfoField label="Landline Number" value={coOwner.work_landline} />
                <InfoField label="Email Address"   value={coOwner.work_email} />
              </div>
              <BIFSubLabel label="Work Address" />
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 pb-1">
                <InfoField label="Unit No. / Building / House No. / Block No." value={coOwner.work_building_unit} />
                <InfoField label="Street, Subdivision / Village" value={coOwner.work_street} />
                <InfoField label="Barangay" value={coOwner.work_barangay} />
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                <InfoField label="City / Municipality" value={coOwner.work_city_municipality} />
                <InfoField label="Province / Region"   value={coOwner.work_region_province} />
                <InfoField label="Country"             value={coOwner.work_country} />
              </div>
              {!hasAtty && (
                <p className="text-[7px] text-gray-400 pt-6">Date Generated: {new Date().toLocaleString('en-US')}</p>
              )}
            </A4Page>
          )}

          {/* ── PAGE: Attorney-in-Fact (conditional) ── */}
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
              <p className="text-[7px] text-gray-400 pt-6">Date Generated: {new Date().toLocaleString('en-US')}</p>
            </A4Page>
          )}

        </>)}

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Buyer Information Preview Card ──────────────────────────────────────────

function BuyerInfoPreviewCard({ d, onClick }: { d: FolderData; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left active:scale-[0.98] transition-transform">
      <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.10)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PH1" className="h-6 object-contain object-left" />
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#1C1C1E]">Buyer Information Form</p>
          <p className="text-[8px] text-gray-400">{d.reservation_id ?? '—'}</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-[#F9F9FB]">
          <div>
            <p className="text-[11px] font-semibold text-[#1C1C1E]">{d.client_name ?? '—'}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(d.created_at)}</p>
          </div>
          <div className="flex items-center gap-1 bg-[#E8634A] px-3 py-1.5 rounded-full">
            <User size={11} className="text-white" />
            <span className="text-[10px] font-semibold text-white">View</span>
            <ChevronRight size={10} className="text-white" />
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersFolderDetailPage() {
  const router = useRouter();

  const [reservation, setReservation] = useState<{
    reservation_id?: string;
    client_name?: string;
    project?: string;
    inventory_code?: string | null;
  } | null>(null);

  const [data,             setData]             = useState<FolderData | null>(null);
  const [loading,          setLoading]          = useState(true);
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
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { router.replace('/account/buyers-foldering'); return; }
    const r = JSON.parse(raw);
    setReservation(r);

    if (r.reservation_id) {
      supabase
        .from('reservations')
        .select(`
          reservation_id, client_name, project, tower, floor, unit_no,
          inventory_code, unit_type, unit_area,
          net_list_price, vat, other_charges, total_contract_price,
          scheme_name, payment_term, signature_base64, created_at,
          list_price, promo_discount_pct, promo_discount_amount,
          payterm_discount_pct, payterm_discount_amount, employee_discount_amount,
          dp_rate, term_months, dp_amount, net_spot_dp,
          monthly_stretched_dp, monthly_deferred, bank_monthly, hdmf_monthly,
          balance_for_financing, reservation_fee,
          has_co_ownership, has_atty_in_fact, has_spouse,
          payment_proof_url, proof_of_billing_urls, proof_of_income_urls,
          proof_of_valid_id_urls, co_owner_id_urls, atty_in_fact_id_urls, spouse_id_urls
        `)
        .eq('reservation_id', r.reservation_id)
        .single()
        .then(({ data: row, error }) => {
          if (!error) setData(row as FolderData ?? null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  // Lazy-load buyer info data when the viewer is first opened
  useEffect(() => {
    if (!buyerInfoOpen || !data || !data.reservation_id || buyerInfoLoaded) return;
    async function loadBuyerInfo() {
      setBuyerInfoLoading(true);
      try {
        const resId      = data!.reservation_id!;
        const clientName = data!.client_name ?? '';
        const allClients = await fetchAllClients().catch(() => []);
        const match      = allClients.find(c =>
          [c.first_name, c.last_name, c.suffix].filter(Boolean).join(' ') === clientName
        );
        if (match) {
          setClientRecord(match);
          const info = await fetchBuyerInfo(match.id).catch(() => null);
          setBuyerInfo(info);
        }
        const [spouse, coOwner, atty] = await Promise.all([
          data!.has_spouse       ? fetchSpouseInfo(resId).catch(() => null) : Promise.resolve(null),
          data!.has_co_ownership ? fetchCoOwner(resId).catch(() => null)    : Promise.resolve(null),
          data!.has_atty_in_fact ? fetchAttyInFact(resId).catch(() => null) : Promise.resolve(null),
        ]);
        setSpouseInfo(spouse);
        setCoOwnerInfo(coOwner);
        setAttyInfo(atty);
        setBuyerInfoLoaded(true);
      } finally {
        setBuyerInfoLoading(false);
      }
    }
    loadBuyerInfo();
  }, [buyerInfoOpen, data, buyerInfoLoaded]);

  const totalCategories = data ? [
    parseJson(data.payment_proof_url).length > 0,
    parseJson(data.proof_of_billing_urls).length > 0,
    parseJson(data.proof_of_income_urls).length > 0,
    parseJson(data.proof_of_valid_id_urls).length > 0,
    (data.co_owner_id_urls ?? []).length > 0,
    (data.atty_in_fact_id_urls ?? []).length > 0,
    (data.spouse_id_urls ?? []).length > 0,
  ].filter(Boolean).length : 0;

  return (
    <PageShell title="Buyer's Folder" backButton onBack={() => router.push('/account/buyers-foldering')}>
      <div className="space-y-3 pb-6">

        {/* Header card */}
        <GlassCard className="px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase">
              {reservation?.reservation_id}
            </p>
            <p className="text-sm font-bold text-[#1C1C1E] truncate">{reservation?.client_name}</p>
            <p className="text-xs text-[#6C6C70]">
              {reservation?.project}{reservation?.inventory_code ? ` · ${reservation.inventory_code}` : ''}
            </p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-3 ${
            totalCategories === 7 ? 'bg-green-100 text-green-700'
            : totalCategories > 0 ? 'bg-amber-100 text-amber-700'
            : 'bg-[#F2F2F7] text-[#8E8E93]'
          }`}>
            {totalCategories}/7 docs
          </span>
        </GlassCard>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* Reservation Agreement — preview card + full-screen viewer */}
            <GroupLabel label="Reservation Agreement" />
            <AgreementPreviewCard d={data} onClick={() => setViewerOpen(true)} />
            <AgreementViewer open={viewerOpen} onClose={() => setViewerOpen(false)} d={data} />

            {/* Data Privacy Statement — preview card + full-screen viewer */}
            <GroupLabel label="Data Privacy Statement" />
            <PrivacyPreviewCard d={data} onClick={() => setPrivacyOpen(true)} />
            <PrivacyViewer open={privacyOpen} onClose={() => setPrivacyOpen(false)} d={data} />

            {/* Terms of Payment — preview card + full-screen viewer */}
            <GroupLabel label="Terms of Payment" />
            <TermsPreviewCard d={data} onClick={() => setTermsOpen(true)} />
            <TermsViewer open={termsOpen} onClose={() => setTermsOpen(false)} d={data} />

            {/* Buyer Information Form — preview card + full-screen viewer */}
            <GroupLabel label="Buyer's Information Form" />
            <BuyerInfoPreviewCard d={data} onClick={() => setBuyerInfoOpen(true)} />
            <BuyerInfoViewer
              open={buyerInfoOpen}
              onClose={() => setBuyerInfoOpen(false)}
              d={data}
              client={clientRecord}
              buyerInfo={buyerInfo}
              spouse={spouseInfo}
              coOwner={coOwnerInfo}
              atty={attyInfo}
              loading={buyerInfoLoading}
            />

            {/* Uploaded documents */}
            <GroupLabel label="Reservation Documents" />
            <DocSection label="Proof of Payment" urls={parseJson(data.payment_proof_url)} />
            <DocSection label="Proof of Billing"  urls={parseJson(data.proof_of_billing_urls)} />
            <DocSection label="Proof of Income"   urls={parseJson(data.proof_of_income_urls)} />
            <DocSection label="Buyer Valid ID"     urls={parseJson(data.proof_of_valid_id_urls)} />

            <GroupLabel label="Booking Documents" />
            {data.has_co_ownership && (
              <DocSection label="Co-Owner Valid ID"         urls={data.co_owner_id_urls ?? []} />
            )}
            {data.has_spouse && (
              <DocSection label="Spouse Valid ID"           urls={data.spouse_id_urls ?? []} />
            )}
            {data.has_atty_in_fact && (
              <DocSection label="Attorney in Fact Valid ID" urls={data.atty_in_fact_id_urls ?? []} />
            )}
          </>
        ) : (
          <GlassCard className="p-8 text-center">
            <p className="text-sm font-semibold text-[#1C1C1E]">No data found</p>
          </GlassCard>
        )}

      </div>
    </PageShell>
  );
}
