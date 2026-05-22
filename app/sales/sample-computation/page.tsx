import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { Calculator } from 'lucide-react';

export default function SampleComputationPage() {
  return (
    <PageShell title="Sample Computation">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center shrink-0">
          <Calculator size={22} className="text-[#E8634A]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Generate Sample Computation</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Create a sample price computation</p>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">
          Sample computation coming soon.
        </p>
      </GlassCard>
    </PageShell>
  );
}
