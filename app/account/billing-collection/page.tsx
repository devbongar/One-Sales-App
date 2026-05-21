import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { Receipt } from 'lucide-react';

export default function BillingCollectionPage() {
  return (
    <PageShell title="Billing and Collection">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(52,199,89,0.12)] flex items-center justify-center shrink-0">
          <Receipt size={22} className="text-[#34C759]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Billing and Collection</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Manage billing statements and collections</p>
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">No billing records found.</p>
        <GlassButton variant="primary" size="lg">+ New Bill</GlassButton>
      </GlassCard>
    </PageShell>
  );
}
