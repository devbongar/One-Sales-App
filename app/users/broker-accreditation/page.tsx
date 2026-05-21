import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { ShieldCheck } from 'lucide-react';

export default function BrokerAccreditationPage() {
  return (
    <PageShell title="Broker Accreditation">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(255,149,0,0.12)] flex items-center justify-center shrink-0">
          <ShieldCheck size={22} className="text-[#FF9500]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Broker Accreditation</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Accredit and manage brokers</p>
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">No broker records found.</p>
        <GlassButton variant="primary" size="lg">+ Accredit Broker</GlassButton>
      </GlassCard>
    </PageShell>
  );
}
