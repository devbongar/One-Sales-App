import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { UserPlus } from 'lucide-react';

export default function ClientRegistrationPage() {
  return (
    <PageShell title="Client Registration">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center shrink-0">
          <UserPlus size={22} className="text-[#E8634A]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Client Registration</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Register new property buyers</p>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">
          No clients registered yet. Start by adding a new client.
        </p>
        <GlassButton variant="primary" size="lg">
          + New Client
        </GlassButton>
      </GlassCard>
    </PageShell>
  );
}
