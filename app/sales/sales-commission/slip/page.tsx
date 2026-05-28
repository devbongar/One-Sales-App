'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { SalespersonRecord } from '@/lib/salesperson';
import { fetchCommissionRecords, CommissionRecord } from '@/lib/commission';
import { User, FileText } from 'lucide-react';

function positionLabel(rank: string | null) {
  const map: Record<string, string> = {
    PS: 'Property Specialist',
    SM: 'Sales Manager',
    SD: 'Sales Director',
    SDH: 'Sales Division Head',
    SH: 'Sales Head',
  };
  return map[rank ?? ''] ?? rank ?? '—';
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CommissionSlipPage() {
  const router = useRouter();
  const [seller, setSeller] = useState<SalespersonRecord | null>(null);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedSeller');
    if (!stored) { router.replace('/sales/sales-commission'); return; }
    const s = JSON.parse(stored) as SalespersonRecord;
    setSeller(s);

    fetchCommissionRecords()
      .then(all => setRecords(all.filter(r => r.seller_name === s.seller_name)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (!seller) return null;

  const today = new Date().toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const totalCommission = records.reduce((s, r) => s + (r.total_commission ?? 0), 0);

  return (
    <PageShell title="Commission Payout Slip">

      {/* Coral hero */}
      <GlassCard strong className="overflow-hidden">
        <div className="bg-[#E8634A] px-5 pt-4 pb-6">
          {/* Slip label */}
          <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 mb-4">
            <FileText size={11} className="text-white" />
            <span className="text-white text-[11px] font-semibold">Commission Payout Slip</span>
          </div>

          <p className="text-white/70 text-[10px] font-bold tracking-widest uppercase mb-1">
            {positionLabel(seller.position_rank)}
          </p>
          <p className="text-white font-bold text-2xl leading-tight mb-5">{seller.seller_name}</p>

          <div className="flex flex-wrap gap-2">
            {seller.seller_group && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Seller Group</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.seller_group}</p>
                </div>
              </div>
            )}
            {seller.sales_manager && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Manager</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.sales_manager}</p>
                </div>
              </div>
            )}
            {seller.sales_director && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Director</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.sales_director}</p>
                </div>
              </div>
            )}
            {seller.sales_division_head && (
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
                <User size={11} className="text-white/70 shrink-0" />
                <div>
                  <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Division Head</p>
                  <p className="text-white text-xs font-semibold leading-none">{seller.sales_division_head}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="bg-white/95 px-5 py-4 min-h-[220px]">
          <p className="text-[#6C6C70] text-xs font-bold tracking-widest uppercase mb-4">
            For Release ({records.length})
          </p>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
            </div>
          )}

          {error && (
            <p className="text-center text-sm text-red-500 py-6">{error}</p>
          )}

          {!loading && !error && records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <FileText size={40} className="text-[#C7C7CC]" strokeWidth={1.2} />
              <p className="text-sm text-[#8E8E93] text-center">
                No commission records found for this property specialist
              </p>
            </div>
          )}

          {!loading && !error && records.length > 0 && (
            <div className="space-y-3">
              {records.map(r => (
                <div key={r.reservation_id} className="border border-[rgba(0,0,0,0.07)] rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[#1C1C1E] font-bold text-sm">{r.client_name}</p>
                      <p className="text-[#8E8E93] text-xs mt-0.5">
                        {r.project}{r.unit_no ? ` · ${r.unit_no}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                      Approved
                    </span>
                  </div>
                  <div className="flex items-center gap-4 pt-2 border-t border-[rgba(0,0,0,0.06)]">
                    <div>
                      <p className="text-[10px] text-[#8E8E93]">TCP</p>
                      <p className="text-xs font-semibold text-[#1C1C1E]">{fmt(r.total_contract_price)}</p>
                    </div>
                    <div className="w-px h-7 bg-[rgba(0,0,0,0.08)]" />
                    <div>
                      <p className="text-[10px] text-[#8E8E93]">Rate</p>
                      <p className="text-xs font-semibold text-[#E8634A]">
                        {r.commission_rate != null ? `${r.commission_rate}%` : '—'}
                      </p>
                    </div>
                    <div className="w-px h-7 bg-[rgba(0,0,0,0.08)]" />
                    <div>
                      <p className="text-[10px] text-[#8E8E93]">Commission</p>
                      <p className="text-xs font-bold text-[#1C1C1E]">{fmt(r.total_commission)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#C7C7CC] mt-2">{fmtDate(r.created_at)}</p>
                </div>
              ))}

              {/* Total */}
              <div className="flex items-center justify-between pt-1 px-1">
                <p className="text-sm font-bold text-[#1C1C1E]">Total Commission</p>
                <p className="text-sm font-bold text-[#E8634A]">{fmt(totalCommission)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#F9F9F9] border-t border-[rgba(0,0,0,0.06)] px-5 py-3 flex items-center justify-between">
          <p className="text-[11px] text-[#8E8E93]">
            Generated on <span className="text-[#E8634A] font-semibold">{today}</span>
          </p>
          <p className="text-[11px] text-[#8E8E93] font-semibold">
            Total Units: {records.length}
          </p>
        </div>
      </GlassCard>

    </PageShell>
  );
}
