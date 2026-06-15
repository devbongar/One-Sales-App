'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { Check, Building2, Tag, LayoutGrid, Ruler, Banknote, Receipt, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { generateReservationId, saveReservation } from '@/lib/reservations';
import { getSession } from '@/lib/auth';

interface ReservationData {
  // Unit
  project: string; tower: string; floor: string; unitNo: string;
  inventoryCode: string | null; unitType: string; unitArea: number; unitCategory: string;
  // Scheme
  paymentScheme: string; schemeName: string; paymentTerm: string; dpRate: string; termMonths: number;
  // Prices
  listPrice: number; promoPct: number; promoAmount: number; employeeAmount: number;
  paytermPctDisplay: number; paytermAmount: number; hicDiscount: number; netListPrice: number;
  vat: number; otherCharges: number; totalContractPrice: number;
  // Summary
  netAmount: number; dpAmount: number; netSpotDP: number;
  balanceForFinancing: number; monthlyDeferred: number; monthlyStretchedDP: number;
  bankMonthly: number; hdmfMonthly: number;
  reservationFee?: number;
  // Client
  clientName: string;
  clientId: string | null;
  // Seller
  sellerName: string;
  sellerId: string | null;
  salesManager: string;
  salesDirector: string;
  salesDivisionHead: string;
  firstPaymentAgreed?: boolean;
}

const TERMS = [
  {
    title: 'RESERVATION PROVISION',
    items: [
      `1. As proof of my interest to purchase the Property, I hereby tender the sum of: PHP {{RESERVATION_FEE}} as Reservation Fee, exclusive of VAT, in order to reserve the Property for our intended purchase which shall be effective for a period of thirty (30) days from delivery of the Reservation Fee. I understand and acknowledge that the Reservation Fee is non-refundable. Should I decide to cancel my reservation; fail to submit all the documentary requirements, including this Reservation Agreement; or fail to pay the amounts due on the prescribed due dates, for any reason whatsoever, I agree that my reservation shall lapse and my Reservation Fee shall be forfeited in favor of the Company. I will hold the Company free and harmless for thereafter releasing and offering the Property to other interested buyers.`,
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

export default function ReservationAgreementPage() {
  const router = useRouter();
  const [data, setData] = useState<ReservationData | null>(null);
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [creatorUuid, setCreatorUuid] = useState<string | null>(null);

  useEffect(() => { getSession().then(s => setCreatorUuid(s?.id ?? null)); }, []);

  // Signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('reservationData');
    if (raw) setData(JSON.parse(raw));
  }, []);

  // Attach touch listeners with passive:false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPosByEvent(e: TouchEvent | MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      if ('touches' in e) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      }
      return { x: ((e as MouseEvent).clientX - rect.left) * scaleX, y: ((e as MouseEvent).clientY - rect.top) * scaleY };
    }

    function onStart(e: TouchEvent | MouseEvent) {
      drawing.current = true;
      lastPos.current = getPosByEvent(e);
    }
    function onMove(e: TouchEvent | MouseEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvas!.getContext('2d'); if (!ctx) return;
      const pos = getPosByEvent(e);
      ctx.beginPath();
      ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#1C1C1E';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastPos.current = pos;
      setHasSigned(true);
    }
    function onStop() { drawing.current = false; lastPos.current = null; }

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
  }, [checked1, checked2]);

  function clearSignature() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  }

  async function handleProceed() {
    if (!reservationId) {
      const id = await generateReservationId();
      setReservationId(id);
    }
    setShowConfirm(true);
  }

  async function handleConfirm() {
    if (!data || !reservationId) return;
    setSaving(true);
    setSaveError('');
    try {
      const signature = canvasRef.current?.toDataURL('image/png') ?? '';
      await saveReservation({
        reservation_id: reservationId,
        client_name: data.clientName,
        signature_base64: signature,
        project: data.project,
        tower: data.tower,
        floor: data.floor,
        unit_no: data.unitNo,
        inventory_code: data.inventoryCode,
        unit_type: data.unitType,
        unit_area: data.unitArea,
        unit_category: data.unitCategory,
        payment_scheme: data.paymentScheme,
        scheme_name: data.schemeName,
        payment_term: data.paymentTerm,
        dp_rate: data.dpRate,
        term_months: data.termMonths,
        list_price: data.listPrice,
        promo_discount_pct: data.promoPct,
        promo_discount_amount: data.promoAmount,
        employee_discount_amount: data.employeeAmount,
        payterm_discount_pct: data.paytermPctDisplay,
        payterm_discount_amount: data.paytermAmount,
        hic_discount: data.hicDiscount ?? 0,
        net_list_price: data.netListPrice,
        vat: data.vat,
        other_charges: data.otherCharges,
        total_contract_price: data.totalContractPrice,
        reservation_fee: data.reservationFee ?? 0,
        retention_fee: 50000,
        net_amount: data.netAmount,
        dp_amount: data.dpAmount,
        net_spot_dp: data.netSpotDP,
        balance_for_financing: data.balanceForFinancing,
        monthly_deferred: data.monthlyDeferred,
        monthly_stretched_dp: data.monthlyStretchedDP,
        bank_monthly: data.bankMonthly,
        hdmf_monthly: data.hdmfMonthly,
        client_id: data.clientId ?? null,
        seller_id: data.sellerId ?? null,
        created_by_uuid: creatorUuid,
        seller_name: data.sellerName,
        sales_manager: data.salesManager,
        sales_director: data.salesDirector,
        sales_division_head: data.salesDivisionHead,
        status: 'Pending Proof',
        first_payment_agreed: data.firstPaymentAgreed ?? false,
      });
      sessionStorage.setItem('currentReservationId', reservationId);
      sessionStorage.setItem('proofEntrySource', 'agreement');
      sessionStorage.setItem('selectedReservation', JSON.stringify({
        reservation_id:   reservationId,
        client_name:      data.clientName,
        project:          data.project,
        inventory_code:   data.inventoryCode,
        unit_type:        data.unitType,
        status:           'Pending Proof',
        seller_name:      data.sellerName,
        payment_proof_url: null,
      }));
      setShowConfirm(false);
      router.push('/sales/reservation/proof');
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const details = data ? [
    { icon: <Building2 size={14} />, label: 'Project',        value: data.project },
    { icon: <Tag        size={14} />, label: 'Inventory Code', value: data.inventoryCode ?? '—' },
    { icon: <LayoutGrid size={14} />, label: 'Unit Type',      value: data.unitType || '—' },
    { icon: <Ruler      size={14} />, label: 'Unit Area',      value: `${data.unitArea} sqm` },
    { icon: <Banknote   size={14} />, label: 'Payment Scheme', value: data.schemeName },
    { icon: <Receipt    size={14} />, label: 'Total Contract', value: `₱${data.totalContractPrice.toLocaleString()}` },
  ] : [];

  return (
    <PageShell title="Reservation Agreement" backButton onBack={() => router.back()}>

      {/* Unit Details */}
      {data && (
        <GlassCard className="px-4 py-1">
          {details.map(({ icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
              <span className="text-[#C03D25] shrink-0">{icon}</span>
              <span className="flex-1 text-sm font-medium text-[#1C1C1E]">{label}</span>
              <span className="text-sm text-[#8E8E93] text-right max-w-[180px]">{value}</span>
            </div>
          ))}
        </GlassCard>
      )}

      {/* Agreement */}
      <GlassCard className="px-5 py-5 space-y-5">
        {/* Heading */}
        <div className="text-center space-y-0.5">
          <p className="text-sm font-bold text-[#1C1C1E] uppercase tracking-wide">Reservation Agreement</p>
          <p className="text-xs font-semibold text-[#C03D25] uppercase tracking-wider">Terms and Conditions</p>
        </div>

        {/* Sections */}
        {TERMS.map(({ title, items }) => (
          <div key={title} className="space-y-3">
            <p className="text-xs font-bold text-[#1C1C1E] uppercase tracking-wide">{title}</p>
            {items.map((item, i) => {
              const resolved = item.replace('{{RESERVATION_FEE}}', (data?.reservationFee ?? 0).toLocaleString('en-PH'));
              return (
                <div key={i} className="space-y-1">
                  {resolved.split('\n\n').map((para, j) => (
                    <p key={j} className="text-xs text-[#3A3A3C] leading-relaxed whitespace-pre-line">{para.trim()}</p>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </GlassCard>

      {/* Checkboxes */}
      <GlassCard className="px-4 py-2">
        <button type="button" onClick={() => setChecked1(p => !p)}
          className="w-full flex items-start gap-3 py-4 border-b border-black/[0.06] text-left">
          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            checked1 ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C03D25]'
          }`}>
            {checked1 && <Check size={11} className="text-white" />}
          </div>
          <p className="text-xs font-bold text-[#C03D25] leading-relaxed">
            I hereby acknowledge that I have carefully read and understood the Terms and Conditions under Reservation Agreement, and I expressly give my full consent and agreement thereto.
          </p>
        </button>

        <button type="button" onClick={() => setChecked2(p => !p)}
          className="w-full flex items-start gap-3 py-4 text-left">
          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            checked2 ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C03D25]'
          }`}>
            {checked2 && <Check size={11} className="text-white" />}
          </div>
          <p className="text-xs font-bold text-[#C03D25] leading-relaxed">
            I agree to affix my e-signature to signify my conformity to the Reservation Agreement.
          </p>
        </button>
      </GlassCard>

      {/* Signature Pad — shown when both checkboxes are ticked */}
      {checked1 && checked2 && (
        <GlassCard className="px-4 pt-4 pb-5 space-y-3">
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93]">Client Name</p>
            <p className="text-sm font-bold text-[#1C1C1E]">{data?.clientName || '—'}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93]">Signature</p>
              <button type="button" onClick={clearSignature}
                className="flex items-center gap-1 text-[11px] text-[#C03D25] font-semibold">
                <RotateCcw size={11} /> Clear
              </button>
            </div>
            <div className="relative rounded-2xl border-2 border-dashed border-[#C03D25]/40 overflow-hidden bg-white">
              {!hasSigned && (
                <p className="absolute inset-0 flex items-center justify-center text-xs text-[#C7C7CC] pointer-events-none select-none">
                  Sign here
                </p>
              )}
              <canvas ref={canvasRef} width={600} height={200}
                className="w-full touch-none" style={{ height: '160px' }} />
            </div>
          </div>
        </GlassCard>
      )}

      {/* Reservation ID */}
      {reservationId && (
        <GlassCard className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-[#1C1C1E]">Reservation ID</span>
          <span className="text-sm font-bold text-[#C03D25] tracking-wider">{reservationId}</span>
        </GlassCard>
      )}

      {/* Proceed button */}
      <button type="button" disabled={!checked1 || !checked2 || !hasSigned} onClick={handleProceed}
        className={`w-full py-4 rounded-2xl text-sm font-bold transition-all ${
          checked1 && checked2 && hasSigned
            ? 'bg-[#C03D25] text-white active:opacity-80'
            : 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
        }`}>
        Proceed to Payment
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-fade-in">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Confirm Payment</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                Are you sure you want to proceed with the payment of the Reservation Fee of ₱{(data?.reservationFee ?? 0).toLocaleString()}?
              </p>
            </div>
            <div className="px-6 py-3 border-b border-black/[0.06]">
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#8E8E93]">Reservation ID</span>
                <span className="text-xs font-bold text-[#C03D25]">{reservationId}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#8E8E93]">Client</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{data?.clientName}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#8E8E93]">Unit</span>
                <span className="text-xs font-semibold text-[#1C1C1E]">{data?.inventoryCode ?? `${data?.floor}${data?.unitNo}`}</span>
              </div>
            </div>
            {saveError && <p className="text-red-500 text-xs text-center px-6 pt-3">{saveError}</p>}
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={saving} onClick={handleConfirm}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80 flex items-center justify-center gap-2 disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Saving...' : 'Yes, Proceed to Payment'}
              </button>
              <button type="button" disabled={saving} onClick={() => setShowConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
