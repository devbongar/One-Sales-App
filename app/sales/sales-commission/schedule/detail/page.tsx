'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { SellerCommissionSummary, CommissionTranche } from '@/lib/commission';
import { supabase } from '@/lib/supabase';
import { SalespersonRecord } from '@/lib/salesperson';
import { Building2, FileText, Loader2, User, Tag, Percent, UserCheck } from 'lucide-react';

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CommissionScheduleDetailPage() {
  const router = useRouter();
  const [record, setRecord]     = useState<SellerCommissionSummary | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [tranches, setTranches] = useState<CommissionTranche[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    const stored       = sessionStorage.getItem('selectedCommissionRecord');
    const storedSeller = sessionStorage.getItem('selectedSeller');
    if (!stored) { router.replace('/sales/sales-commission/schedule'); return; }
    const rec  = JSON.parse(stored) as SellerCommissionSummary;
    const name = storedSeller ? (JSON.parse(storedSeller) as SalespersonRecord).seller_name : '';
    setRecord(rec);
    setSellerName(name);

    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('commission_schedule')
          .select('tranche, percentage_collection, commission_release_rate, commission_rate, gross_commission')
          .eq('reservation_id', rec.reservation_id)
          .eq('seller_name', name)
          .neq('status', 'Superseded')
          .order('tranche', { ascending: true });
        if (err) throw err;
        setTranches(((data ?? []) as any[]).map(row => ({
          tranche:                 row.tranche,
          percentage_collection:   row.percentage_collection,
          commission_release_rate: row.commission_release_rate,
          commission_rate:         row.commission_rate,
          seller_type:             '',
          gross_commission:        row.gross_commission,
        })));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!record) return null;

  const totalGross = tranches.reduce((sum, t) => sum + ((t as any).gross_commission ?? 0), 0);
  const rate = record.commission_rate ?? 0;

  return (
    <PageShell title="Commission Schedule" backButton onBack={() => router.back()}>

      {/* Rows 1–3 — inside the red card */}
      <GlassCard strong className="overflow-hidden">
        <div className="bg-[#C03D25] px-5 py-4 flex flex-col gap-4">

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
              <p className="text-sm font-semibold text-white leading-tight">{record.inventory_code ?? '—'}</p>
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
            <p className="text-xs font-semibold text-[#1C1C1E] leading-tight">{sellerName || '—'}</p>
          </div>
        </div>
      </GlassCard>

      {/* Tranche table */}
      <GlassCard className="overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        )}
        {error && <p className="text-center text-sm text-red-500 py-6 px-4">{error}</p>}
        {!loading && !error && tranches.length === 0 && (
          <p className="text-center text-sm text-[#8E8E93] py-8 px-4">No tranche schedule found.</p>
        )}
        {!loading && !error && tranches.length > 0 && (
          <>
            {/* Header */}
            <div className="grid grid-cols-[70px_65px_65px_1fr] gap-2 pl-10 pr-10 py-2.5 bg-[#F2F2F7] border-b border-[rgba(0,0,0,0.06)]">
              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">Tr.</p>
              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide">% Coll</p>
              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Rel%</p>
              <p className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-wide text-right">Gross Comm</p>
            </div>
            {tranches.map((t, i) => {
              const gross = (t as any).gross_commission ?? 0;
              return (
                <div
                  key={`${t.tranche}-${i}`}
                  className="grid grid-cols-[70px_65px_65px_1fr] gap-2 pl-10 pr-10 py-2 border-b border-[rgba(0,0,0,0.04)] last:border-0 items-center"
                  style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white' }}
                >
                  {/* Tranche badge */}
                  <div className="w-6 h-6 rounded-full bg-[#F2F2F7] flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[#1C1C1E]">{t.tranche}</span>
                  </div>
                  <p className="text-[13px] text-[#6C6C70]">{t.percentage_collection}%</p>
                  <p className="text-[13px] text-[#6C6C70] text-right">{t.commission_release_rate}%</p>
                  <p className="text-[13px] font-bold text-[#C03D25] text-right">{fmt(gross)}</p>
                </div>
              );
            })}
          </>
        )}
      </GlassCard>

      {/* Footer total */}
      {!loading && !error && tranches.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
          style={{ background: 'rgba(192,61,37,0.07)', border: '1px solid rgba(192,61,37,0.15)' }}
        >
          <p className="text-sm font-bold text-[#1C1C1E]">Total Gross Commission</p>
          <p className="text-base font-bold text-[#C03D25]">{fmt(totalGross)}</p>
        </div>
      )}

    </PageShell>
  );
}
