import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { MessageSquare } from 'lucide-react';

export default function RequestInquiryPage() {
  return (
    <PageShell title="Request and Inquiry">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(94,92,230,0.12)] flex items-center justify-center shrink-0">
          <MessageSquare size={22} className="text-[#5E5CE6]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Request and Inquiry</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Handle buyer requests and inquiries</p>
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <p className="text-[#6C6C70] text-sm text-center py-8">No requests or inquiries.</p>
        <GlassButton variant="primary" size="lg">+ New Request</GlassButton>
      </GlassCard>
    </PageShell>
  );
}
