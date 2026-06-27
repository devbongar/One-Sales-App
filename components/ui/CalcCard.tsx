'use client';

export const peso = (n: number) =>
  '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function calcMonthlyAmort(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  return Math.round(principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

export interface CalcCardProps {
  title: string;
  unitCode?: string | null;
  unitArea?: number;
  schemeName?: string;
  category?: string | null;
  termMonths?: number;
  dpRate?: string;
  isHic?: boolean;
  listPrice?: number;
  promoAmt?: number;
  promoPct?: number;
  employeeAmt?: number;
  employeePct?: number;
  paytermAmt?: number;
  paytermPct?: number;
  hicAmt?: number;
  nlp?: number;
  vat?: number;
  otherCharges?: number;
  tcp?: number;
  reservationFee?: number;
  retentionFee?: number;
  highlight?: boolean;
}

export default function CalcCard({
  title, unitCode, unitArea = 0, schemeName = '', category, termMonths, dpRate,
  isHic = false,
  listPrice = 0, promoAmt = 0, promoPct = 0, employeeAmt = 0, employeePct = 0,
  paytermAmt = 0, paytermPct = 0, hicAmt = 0, nlp = 0, vat = 0,
  otherCharges = 0, tcp = 0, reservationFee = 0, retentionFee = 0, highlight,
}: CalcCardProps) {

  // Derive scheme type from display name
  const schemeType =
    schemeName === 'Deferred Cash' ? 'deferred_cash' :
    schemeName === 'Spot Cash'     ? 'spot_cash'     :
    schemeName === 'Spot DP'       ? 'spot_dp'       :
    schemeName === 'Stretched DP'  ? 'stretched_dp'  : '';

  const isBankFinanced = schemeType === 'spot_dp' || schemeType === 'stretched_dp';
  const dpPct          = Number(dpRate) || 0;

  // Payment summary computations — mirror payment calculator exactly
  const grossDp         = dpPct > 0 ? Math.round(tcp * dpPct / 100) : 0;
  const netDp           = grossDp - reservationFee;
  const balanceForFin   = tcp - grossDp;
  const monthlyDp       = termMonths && termMonths > 0 && netDp > 0 ? Math.round(netDp / termMonths) : 0;
  const netInstallable  = tcp - reservationFee - retentionFee;
  const monthlyDeferred = termMonths && termMonths > 0 ? Math.round(netInstallable / termMonths) : 0;
  const bankMonthly     = calcMonthlyAmort(balanceForFin, 0.065, 20);
  const hdmfMonthly     = calcMonthlyAmort(balanceForFin, 0.0625, 25);

  const nlpBeforeHIC = listPrice - promoAmt - employeeAmt - paytermAmt;
  const hicPct       = hicAmt > 0 && nlpBeforeHIC > 0 ? Math.round(hicAmt / nlpBeforeHIC * 100) : 0;

  function Row({ label, value, bold, green, red, indigo }: {
    label: string; value: number; bold?: boolean; green?: boolean; red?: boolean; indigo?: boolean;
  }) {
    const cls       = indigo ? 'text-[#5E5CE6]' : green ? 'text-green-600' : red ? 'text-[#C03D25]' : bold ? 'text-[#1C1C1E]' : 'text-[#3C3C43]';
    const formatted = (green || indigo) ? `(${peso(Math.abs(value))})` : peso(value);
    return (
      <div className={`px-3 py-1.5 border-b border-black/[0.04] last:border-0 ${bold ? 'bg-black/[0.025]' : ''}`}>
        <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">{label}</p>
        <p className={`text-sm text-right ${bold ? 'font-bold' : 'font-medium'} ${cls}`}>{formatted}</p>
      </div>
    );
  }

  return (
    <div className={`row-span-2 grid [grid-template-rows:subgrid] min-w-[180px] rounded-2xl overflow-hidden border ${highlight ? 'border-[#C03D25]/30 bg-[#FFF8F7]' : 'border-black/[0.07] bg-white'}`}>

      {/* Header — row 1, equalized via subgrid */}
      <div className="px-3 pt-2.5 pb-2 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${highlight ? 'bg-[#C03D25]/10' : 'bg-[#F2F2F7]'}`}>
            <span className={`text-[14px] ${highlight ? 'text-[#C03D25]' : 'text-[#8E8E93]'}`}>₱</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className={`text-xs font-bold truncate ${highlight ? 'text-[#C03D25]' : 'text-[#1C1C1E]'}`}>{title}</p>
              {isHic && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#5E5CE6]/10 text-[#5E5CE6] shrink-0">HIC</span>
              )}
            </div>
            {unitArea > 0 && <p className="text-[10px] text-[#8E8E93]">{unitArea} sqm</p>}
          </div>
        </div>
        {category && (
          <span className="mt-1.5 inline-block text-[10px] font-semibold text-[#6C6C70] bg-[#F2F2F7] px-2 py-0.5 rounded-full">{category}</span>
        )}
        {(schemeName || dpRate || (termMonths && termMonths > 0)) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {schemeName && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${highlight ? 'bg-[#C03D25]/10 text-[#C03D25]' : 'bg-[#F2F2F7] text-[#6C6C70]'}`}>{schemeName}</span>
            )}
            {dpRate && isBankFinanced && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${highlight ? 'bg-[#C03D25]/10 text-[#C03D25]' : 'bg-[#F2F2F7] text-[#6C6C70]'}`}>
                {dpRate.endsWith('%') ? dpRate : `${dpRate}%`} DP
              </span>
            )}
            {termMonths && termMonths > 0 ? (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${highlight ? 'bg-[#C03D25]/10 text-[#C03D25]' : 'bg-[#F2F2F7] text-[#6C6C70]'}`}>{termMonths} months</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Body — row 2 */}
      <div>
        {/* Price Computation */}
        <div className="pt-2 pb-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Price Computation</p>
          <Row label="List Price" value={listPrice} />
          {promoAmt > 0    && <Row label={`Promo Discount (${promoPct.toFixed(0)}%)`}         value={-promoAmt}    green />}
          {employeeAmt > 0 && <Row label={`Employee Discount (${employeePct.toFixed(0)}%)`}  value={-employeeAmt} green />}
          {paytermAmt > 0  && <Row label={`Payterm Discount (${paytermPct.toFixed(1)}%)`}    value={-paytermAmt}  green />}
          {hicAmt > 0      && <Row label={`Special Discount (${hicPct}%)`}                   value={-hicAmt}      indigo />}
          <Row label="Net List Price" value={nlp} bold />
        </div>

        {/* Taxes & Charges */}
        <div className="pt-1.5 pb-1.5 border-t border-black/[0.06]">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Taxes &amp; Charges</p>
          <Row label={vat > 0 ? 'VAT (12%)' : 'VAT (Exempt)'} value={vat} />
          {otherCharges > 0 && <Row label="Other Charges (7%)" value={otherCharges} />}
          {hicAmt > 0       && <Row label={`Home Improvement Contract (${hicPct}%)`} value={hicAmt} indigo />}
          <Row label="Total Contract Price" value={tcp} bold red />
        </div>

        {/* Fees — retention hidden for bank-financed schemes */}
        {(reservationFee > 0 || (!isBankFinanced && retentionFee > 0)) && (
          <div className="pt-1.5 pb-1.5 border-t border-black/[0.06]">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Fees</p>
            {reservationFee > 0                      && <Row label="Reservation Fee" value={reservationFee} />}
            {!isBankFinanced && retentionFee > 0     && <Row label="Retention Fee"   value={retentionFee}   />}
          </div>
        )}

        {/* Payment Summary — scheme-specific */}
        {schemeType === 'deferred_cash' && (
          <div className="pt-1.5 pb-2.5 border-t border-black/[0.06]">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Payment Summary</p>
            <Row label="Net Deferred Cash" value={netInstallable} bold />
            {termMonths && termMonths > 0 && (
              <Row label={`Monthly Deferred (${termMonths} mos)`} value={monthlyDeferred} />
            )}
          </div>
        )}

        {schemeType === 'spot_cash' && (
          <div className="pt-1.5 pb-2.5 border-t border-black/[0.06]">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Payment Summary</p>
            <Row label="Net Spot Cash" value={netInstallable} bold />
          </div>
        )}

        {schemeType === 'stretched_dp' && dpPct > 0 && (
          <>
            <div className="pt-1.5 pb-1.5 border-t border-black/[0.06]">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Payment Summary</p>
              <Row label={`DP (${dpPct}%)`} value={grossDp} />
              <Row label="Net Stretched DP" value={netDp} />
              {termMonths && termMonths > 0 && (
                <Row label={`Monthly Downpayment (${termMonths} mos)`} value={monthlyDp} bold red />
              )}
              <div className="px-3 py-1.5 border-t border-black/[0.04]">
                <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">Balance for Financing</p>
                <p className="text-sm text-right font-medium text-[#3C3C43]">{peso(balanceForFin)}</p>
              </div>
            </div>
            <div className="pt-1.5 pb-2.5 border-t border-black/[0.06]">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Indicative Financing</p>
              <div className="px-3 py-1.5 border-b border-black/[0.04]">
                <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">Bank (6.5% p.a., 20 yrs)</p>
                <p className="text-sm text-right font-medium text-[#3C3C43]">{peso(bankMonthly)}/mo</p>
              </div>
              <div className="px-3 py-1.5">
                <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">HDMF (6.25% p.a., 25 yrs)</p>
                <p className="text-sm text-right font-medium text-[#3C3C43]">{peso(hdmfMonthly)}/mo</p>
              </div>
            </div>
          </>
        )}

        {schemeType === 'spot_dp' && dpPct > 0 && (
          <>
            <div className="pt-1.5 pb-1.5 border-t border-black/[0.06]">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Payment Summary</p>
              <Row label={`DP (${dpPct}%)`} value={grossDp} />
              <Row label="Net Spot DP" value={netDp} />
              <div className="px-3 py-1.5 border-t border-black/[0.04]">
                <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">Balance for Financing</p>
                <p className="text-sm text-right font-medium text-[#3C3C43]">{peso(balanceForFin)}</p>
              </div>
            </div>
            <div className="pt-1.5 pb-2.5 border-t border-black/[0.06]">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Indicative Financing</p>
              <div className="px-3 py-1.5 border-b border-black/[0.04]">
                <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">Bank (6.5% p.a., 20 yrs)</p>
                <p className="text-sm text-right font-medium text-[#3C3C43]">{peso(bankMonthly)}/mo</p>
              </div>
              <div className="px-3 py-1.5">
                <p className="text-[10px] text-[#8E8E93] leading-tight mb-0.5">HDMF (6.25% p.a., 25 yrs)</p>
                <p className="text-sm text-right font-medium text-[#3C3C43]">{peso(hdmfMonthly)}/mo</p>
              </div>
            </div>
          </>
        )}

        {!schemeType && (
          <div className="pt-1.5 pb-2.5 border-t border-black/[0.06]">
            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-1 px-3">Payment Summary</p>
            <Row label="Net Amount" value={netInstallable} bold />
          </div>
        )}
      </div>
    </div>
  );
}
