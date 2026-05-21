import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import Link from 'next/link';
import { CalendarCheck, Plus, ListChecks, ChevronRight } from 'lucide-react';

const actions = [
  {
    href: '/sales/inventory',
    icon: Plus,
    color: '#E8634A',
    bg: 'rgba(232,99,74,0.12)',
    label: '+ New Reservation',
    desc: 'Browse available units and reserve',
  },
  {
    href: '/sales/reservation/reserved',
    icon: ListChecks,
    color: '#5E5CE6',
    bg: 'rgba(94,92,230,0.12)',
    label: 'Reserved Units',
    desc: 'View all reserved units',
  },
];

export default function ReservationPage() {
  return (
    <PageShell title="Reservation">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(94,92,230,0.12)] flex items-center justify-center shrink-0">
          <CalendarCheck size={22} className="text-[#5E5CE6]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Reservation</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Manage unit reservations</p>
        </div>
      </GlassCard>

      <div className="space-y-3">
        {actions.map(({ href, icon: Icon, color, bg, label, desc }) => (
          <Link key={href} href={href}>
            <GlassCard className="p-4 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-all">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: bg }}
              >
                <Icon size={22} style={{ color }} />
              </div>
              <div className="flex-1">
                <p className="text-[#1C1C1E] font-semibold">{label}</p>
                <p className="text-[#6C6C70] text-sm mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={18} className="text-[#C7C7CC] shrink-0" />
            </GlassCard>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
