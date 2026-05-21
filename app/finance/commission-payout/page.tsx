import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { Wallet } from 'lucide-react';

export default function CommissionPayoutPage() {
  return (
    <PageShell title="Commission Payout">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(52,199,89,0.12)] flex items-center justify-center shrink-0">
          <Wallet size={22} className="text-[#34C759]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Commission Payout</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Process agent commission payouts</p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3">
        {['For Release', 'Released', 'On Hold', 'Cancelled'].map((label) => (
          <GlassCard key={label} className="p-4">
            <p className="text-[#8E8E93] text-xs mb-1">{label}</p>
            <p className="text-[#1C1C1E] font-bold text-xl">₱0.00</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-6">No payout records found.</p>
        <GlassButton variant="primary" size="lg">+ New Payout</GlassButton>
      </GlassCard>
    </PageShell>
  );
}
