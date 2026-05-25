'use client';

import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { UserPlus, Users } from 'lucide-react';

export default function ClientRegistrationPage() {
  const router = useRouter();

  return (
    <PageShell title="Client Registration">
      <div className="grid grid-cols-2 gap-3">
        <GlassCard
          className="p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => router.push('/sales/client-registration/new')}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#E8634A]/10 flex items-center justify-center">
            <UserPlus size={26} className="text-[#E8634A]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1C1C1E]">New Client</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Register a new client</p>
          </div>
        </GlassCard>

        <GlassCard
          className="p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => router.push('/sales/client-registration/existing')}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#5856D6]/10 flex items-center justify-center">
            <Users size={26} className="text-[#5856D6]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1C1C1E]">Existing Client</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Search client records</p>
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
