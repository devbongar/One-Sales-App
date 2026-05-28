'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { CommissionRecord, CommissionTranche, fetchCommissionTranches } from '@/lib/commission';
import { Building2, FileText, User, Tag, Percent, UserCheck } from 'lucide-react';

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CommissionScheduleDetailPage() {
  const router = useRouter();
  const [record, setRecord] = useState<CommissionRecord | null>(null);
  const [tranches, setTranches] = useState<CommissionTranche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedCommissionRecord');
    if (!stored) { router.replace('/sales/sales-commission/schedule'); return; }
    const rec = JSON.parse(stored) as CommissionRecord;
    setRecord(rec);

    if (rec.position_rank && rec.product_type && rec.seller_type) {
      fetchCommissionTranches(rec.project, rec.position_rank, rec.product_type, rec.seller_type)
        .then(setTranches)
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (!record) return null;

  const nlp = record.net_list_price ?? 0;
  const rate = record.commission_rate ?? 0;
  const totalGross = tranches.reduce((sum, t) => sum + nlp * (rate / 100) * (t.commission_release_rate / 100), 0);

  return (
    <PageShell title="Commission Schedule" backButton onBack={() => router.back()}>

      {/* Rows 1–3 — inside the red card */}
      <GlassCard strong className="overflow-hidden">
        <div className="bg-[#E8634A] px-5 py-4 flex flex-col gap-4">

          {/* Row 1: Reservation number */}
          <p className="text-white font-bold text-lg leading-tight">
            {record.reservation_id}
          </p>

          {/* Row 2: Project Name | Inventory Code */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 mb-0.5">
                <Building2 size={11} className="text-white/60 shrink-0" />
                <p className="text-[9px] text-white/60 font-bold uppercase tracking-wide">Project</p>
              </div>
              <p className="text-sm font-semibold text-white leading-tight">{record.project}</p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 mb-0.5">
                <FileText size={11} className="text-white/60 shrink-0" />
                <p className="text-[9px] text-white/60 font-bold uppercase tracking-wide">Inventory Code</p>
              </div>
              <p className="text-sm font-semibold text-white leading-tight">{record.inventory_code ?? record.unit_no ?? '—'}</p>
            </div>
          </div>

          {/* Row 3: Net List Price | Commission Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 mb-0.5">
                <Tag size={11} className="text-white/60 shrink-0" />
                <p className="text-[9px] text-white/60 font-bold uppercase tracking-wide">Net List Price</p>
              </div>
              <p className="text-sm font-semibold text-white leading-tight">{fmt(record.net_list_price)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 mb-0.5">
                <Percent size={11} className="text-white/60 shrink-0" />
                <p className="text-[9px] text-white/60 font-bold uppercase tracking-wide">Comm. Rate</p>
              </div>
              <p className="text-sm font-bold text-white leading-tight">
                {rate > 0 ? `${rate}%` : '—'}
              </p>
            </div>
          </div>

        </div>

        {/* Row 4: Buyer | Seller */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3 border-t border-[rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 mb-0.5">
              <User size={11} className="text-[#8E8E93] shrink-0" />
              <p className="text-[9px] text-[#8E8E93] font-bold uppercase tracking-wide">Buyer</p>
            </div>
            <p className="text-xs font-semibold text-[#1C1C1E] leading-tight">{record.client_name}</p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 mb-0.5">
              <UserCheck size={11} className="text-[#8E8E93] shrink-0" />
              <p className="text-[9px] text-[#8E8E93] font-bold uppercase tracking-wide">Seller</p>
            </div>
            <p className="text-xs font-semibold text-[#1C1C1E] leading-tight">{record.seller_name ?? '—'}</p>
          </div>
        </div>
      </GlassCard>

      {/* Tranche table */}
      <GlassCard className="overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
          </div>
        )}
        {error && <p className="text-center text-sm text-red-500 py-6 px-4">{error}</p>}
        {!loading && !error && tranches.length === 0 && (
          <p className="text-center text-sm text-[#8E8E93] py-8 px-4">No tranche schedule found.</p>
        )}
        {!loading && !error && tranches.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-1 px-4 py-2.5 bg-[#F2F2F7] border-b border-[rgba(0,0,0,0.06)]">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide">Tranche</p>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide">Status</p>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Rel. Rate</p>
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Gross Comm.</p>
            </div>
            {tranches.map((t, i) => {
              const gross = nlp * (rate / 100) * (t.commission_release_rate / 100);
              return (
                <div
                  key={`${t.tranche}-${i}`}
                  className="grid grid-cols-4 gap-1 px-4 py-3 border-b border-[rgba(0,0,0,0.04)] last:border-0"
                >
                  <p className="text-sm font-bold text-[#1C1C1E]">{t.tranche}</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 self-center w-fit">
                    Pending
                  </span>
                  <p className="text-sm text-[#6C6C70] text-right">{t.commission_release_rate}%</p>
                  <p className="text-sm font-semibold text-[#1C1C1E] text-right">{fmt(gross)}</p>
                </div>
              );
            })}
          </>
        )}
      </GlassCard>

      {/* Footer total */}
      {!loading && !error && tranches.length > 0 && (
        <GlassCard strong className="px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-[#1C1C1E]">Total Gross Commission</p>
          <p className="text-base font-bold text-[#E8634A]">{fmt(totalGross)}</p>
        </GlassCard>
      )}

    </PageShell>
  );
}
