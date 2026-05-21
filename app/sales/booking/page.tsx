import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { BookOpen } from 'lucide-react';

export default function BookingPage() {
  return (
    <PageShell title="Booking">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(90,200,250,0.12)] flex items-center justify-center shrink-0">
          <BookOpen size={22} className="text-[#5AC8FA]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Booking</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Process unit bookings and contracts</p>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">
          No bookings found. Process a new booking.
        </p>
        <GlassButton variant="primary" size="lg">
          + New Booking
        </GlassButton>
      </GlassCard>
    </PageShell>
  );
}
