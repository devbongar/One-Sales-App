import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { Banknote } from 'lucide-react';

export default function BuyersPaymentPage() {
  return (
    <PageShell title="Buyer's Payment">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center shrink-0">
          <Banknote size={22} className="text-[#E8634A]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Buyer&apos;s Payment</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Record and track buyer payments</p>
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">No payment records found.</p>
        <GlassButton variant="primary" size="lg">+ New Payment</GlassButton>
      </GlassCard>
    </PageShell>
  );
}
