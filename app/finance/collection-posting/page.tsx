import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { BookMarked } from 'lucide-react';

export default function CollectionPostingPage() {
  return (
    <PageShell title="Collection Posting">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(94,92,230,0.12)] flex items-center justify-center shrink-0">
          <BookMarked size={22} className="text-[#5E5CE6]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Collection Posting</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Post and reconcile collections</p>
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">No collection postings found.</p>
        <GlassButton variant="primary" size="lg">+ New Posting</GlassButton>
      </GlassCard>
    </PageShell>
  );
}
