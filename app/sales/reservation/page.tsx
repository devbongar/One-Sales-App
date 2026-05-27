'use client';

import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { FilePlus, ListChecks } from 'lucide-react';

export default function ReservationPage() {
  const router = useRouter();

  return (
    <PageShell title="Reservation">
      <div className="grid grid-cols-2 gap-3">
        <GlassCard
          className="p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => router.push('/sales/reservation/new')}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#E8634A]/10 flex items-center justify-center">
            <FilePlus size={26} className="text-[#E8634A]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1C1C1E]">New Reservation</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Create reservation</p>
          </div>
        </GlassCard>

        <GlassCard
          className="p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => router.push('/sales/reservation/reserved')}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#5856D6]/10 flex items-center justify-center">
            <ListChecks size={26} className="text-[#5856D6]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1C1C1E]">Reserved Units</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">View all reservations</p>
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
