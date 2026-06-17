'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { fetchMyQuotations, SavedQuotationRecord } from '@/lib/quotations';
import { fetchUnitStatus } from '@/lib/inventory';
import {
  Building2, Clock, BookmarkCheck, ArrowRight, Loader2, AlertTriangle,
} from 'lucide-react';

const fmt = (n: number) =>
  '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function daysAgoLabel(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7)  return `${days} days ago`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} wk${w > 1 ? 's' : ''} ago`; }
  const m = Math.floor(days / 30); return `${m} mo ago`;
}

const SCHEME_COLORS: Record<string, { bg: string; text: string }> = {
  spot_cash:     { bg: 'rgba(52,199,89,0.12)',   text: '#1A7F37' },
  deferred_cash: { bg: 'rgba(48,176,199,0.12)',  text: '#0E6E7E' },
  spot_dp:       { bg: 'rgba(88,86,214,0.12)',   text: '#4B44B6' },
  stretched_dp:  { bg: 'rgba(192,61,37,0.10)',   text: '#C03D25' },
};

function schemeStyle(scheme: string) {
  return SCHEME_COLORS[scheme] ?? { bg: 'rgba(142,142,147,0.12)', text: '#6C6C70' };
}

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<SavedQuotationRecord[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [checking,  setChecking]  = useState<string | null>(null);
  const [unavailableUnit, setUnavailableUnit] = useState<{ name: string; status: string } | null>(null);

  useEffect(() => {
    fetchMyQuotations()
      .then(setQuotations)
      .finally(() => setLoading(false));
  }, []);

  async function handleProceedToReservation(q: SavedQuotationRecord) {
    if (!q.inventory_code) {
      // No inventory code — proceed without availability check
      proceedWithPrefill(q);
      return;
    }
    setChecking(q.id);
    try {
      const status = await fetchUnitStatus(q.inventory_code);
      if (status && status !== 'Available') {
        setUnavailableUnit({ name: q.inventory_code, status });
        return;
      }
    } catch {
      // If check fails, let the seller proceed (fail open)
    } finally {
      setChecking(null);
    }
    proceedWithPrefill(q);
  }

  function proceedWithPrefill(q: SavedQuotationRecord) {
    sessionStorage.setItem('quotation_prefill', JSON.stringify({
        inventoryCode:        q.inventory_code,
        project:              q.project,
        tower:                q.tower,
        floor:                q.floor,
        unitNo:               q.unit_no,
        unitType:             q.unit_type,
        unitCategory:         q.unit_category,
        paymentScheme:        q.payment_scheme,
        schemeName:           q.scheme_name,
        dpRate:               q.dp_rate,
        paymentTerm:          q.payment_term,
        termMonths:           q.term_months,
        listPrice:            q.list_price,
        promoAmount:          q.promo_amount,
        promoPct:             q.promo_pct,
        employeeAmount:       q.employee_amount,
        paytermAmount:        q.payterm_amount,
        hicDiscount:          q.hic_discount,
        netListPrice:         q.net_list_price,
        vat:                  q.vat,
        otherCharges:         q.other_charges,
        totalContractPrice:   q.total_contract_price,
        netAmount:            q.net_amount,
        monthlyDeferred:      q.monthly_deferred,
        dpAmount:             q.dp_amount,
        netSpotDP:            q.net_spot_dp,
        balanceForFinancing:  q.balance_for_financing,
        monthlyStretchedDP:   q.monthly_stretched_dp,
        bankMonthly:          q.bank_monthly,
        hdmfMonthly:          q.hdmf_monthly,
        reservationFee:       q.reservation_fee,
        clientLastName:       q.client_last_name,
        clientFirstName:      q.client_first_name,
        clientMiddleName:     q.client_middle_name,
        clientSuffix:         q.client_suffix,
        clientMobile:         q.client_mobile,
        clientEmail:          q.client_email,
        quotationId:          q.id,
        quotationName:        q.name,
      }));
    router.push('/sales/reservation/new');
  }

  return (
    <PageShell title="Saved Quotations" backButton>
      <div className="space-y-3 pb-6">

        {loading && (
          <div className="text-center py-12 text-[#8E8E93] text-sm">Loading…</div>
        )}

        {!loading && quotations.length === 0 && (
          <GlassCard className="p-8 text-center space-y-3">
            <BookmarkCheck size={32} className="text-[#C7C7CC] mx-auto" />
            <p className="text-[#6C6C70] text-sm">No saved quotations yet.</p>
            <p className="text-[#8E8E93] text-xs">
              Go to Sample Computation, add units to comparison, then tap the save button.
            </p>
            <button
              type="button"
              onClick={() => router.push('/sales/sample-computation')}
              className="text-[#C03D25] text-sm font-semibold active:opacity-60"
            >
              Go to Sample Computation →
            </button>
          </GlassCard>
        )}

        {!loading && quotations.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">
              {quotations.length} active quotation{quotations.length !== 1 ? 's' : ''}
            </p>

            {quotations.map(q => {
              const ss = schemeStyle(q.payment_scheme);
              const clientName = [q.client_last_name, q.client_first_name].filter(Boolean).join(', ');
              return (
                <GlassCard key={q.id} className="overflow-hidden">
                  {/* Header */}
                  <div className="px-4 pt-4 pb-3 border-b border-black/[0.06]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-mono text-[#8E8E93] truncate">{q.name}</p>
                        {clientName && (
                          <p className="text-sm font-bold text-[#1C1C1E] mt-0.5">{clientName}</p>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                        style={{ background: ss.bg, color: ss.text }}
                      >
                        {q.scheme_name}
                      </span>
                    </div>

                    {/* Unit details */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <Building2 size={11} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs text-[#6C6C70]">{q.project}</span>
                      {q.tower && (
                        <>
                          <span className="text-[#D1D1D6]">·</span>
                          <span className="text-xs text-[#6C6C70]">Tower {q.tower}</span>
                        </>
                      )}
                      {q.inventory_code && (
                        <>
                          <span className="text-[#D1D1D6]">·</span>
                          <span className="text-xs font-medium text-[#6C6C70]">{q.inventory_code}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Price row */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-black/[0.06]">
                    <div>
                      <p className="text-[10px] text-[#8E8E93] uppercase tracking-wide font-semibold">Total Contract Price</p>
                      <p className="text-base font-bold text-[#C03D25]">{fmt(q.total_contract_price)}</p>
                    </div>
                    {q.monthly_stretched_dp > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-[#8E8E93] uppercase tracking-wide font-semibold">Monthly DP</p>
                        <p className="text-sm font-bold text-[#1C1C1E]">{fmt(q.monthly_stretched_dp)}/mo</p>
                      </div>
                    )}
                    {q.monthly_deferred > 0 && q.monthly_stretched_dp === 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-[#8E8E93] uppercase tracking-wide font-semibold">Monthly</p>
                        <p className="text-sm font-bold text-[#1C1C1E]">{fmt(q.monthly_deferred)}/mo</p>
                      </div>
                    )}
                  </div>

                  {/* Footer: date + Proceed button */}
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-[#C7C7CC]" />
                      <span className="text-xs text-[#8E8E93]">{daysAgoLabel(q.created_at)}</span>
                      {q.seller_name && (
                        <>
                          <span className="text-[#D1D1D6]">·</span>
                          <span className="text-xs text-[#8E8E93]">{q.seller_name}</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={checking === q.id}
                      onClick={() => handleProceedToReservation(q)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold active:opacity-70 transition-opacity"
                      style={{ background: '#C03D25', color: '#fff', opacity: checking === q.id ? 0.7 : 1 }}
                    >
                      {checking === q.id
                        ? <><Loader2 size={12} className="animate-spin" /> Checking…</>
                        : <>Proceed to Reservation <ArrowRight size={12} /></>
                      }
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </>
        )}

      </div>
      {/* Unit unavailable modal */}
      {unavailableUnit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E] text-center">Unit No Longer Available</p>
              <p className="text-xs text-[#8E8E93] mt-1 text-center">
                Unit <span className="font-semibold text-[#1C1C1E]">{unavailableUnit.name}</span> is currently{' '}
                <span className="font-semibold text-[#C03D25]">{unavailableUnit.status}</span> and cannot be reserved.
              </p>
            </div>
            <div className="px-6 pb-7 pt-4">
              <button
                type="button"
                onClick={() => setUnavailableUnit(null)}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
