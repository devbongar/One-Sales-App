import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { LayoutDashboard, Users, Settings, Shield } from 'lucide-react';

const adminSections = [
  { icon: Users, label: 'Manage Users', desc: 'Add, edit, and deactivate users', color: '#E8634A' },
  { icon: Shield, label: 'Roles & Permissions', desc: 'Configure role-based access', color: '#5E5CE6' },
  { icon: Settings, label: 'App Settings', desc: 'Configure system preferences', color: '#FF9500' },
];

export default function AdminUserPage() {
  return (
    <PageShell title="Admin User">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(255,55,95,0.12)] flex items-center justify-center shrink-0">
          <LayoutDashboard size={22} className="text-[#FF375F]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Admin User</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">System administration panel</p>
        </div>
      </GlassCard>

      <div className="space-y-3">
        {adminSections.map(({ icon: Icon, label, desc, color }) => (
          <GlassCard key={label} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors active:scale-[0.98]">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${color}1A` }}
            >
              <Icon size={18} style={{ color }} />
            </div>
            <div className="flex-1">
              <p className="text-[#1C1C1E] font-medium text-sm">{label}</p>
              <p className="text-[#8E8E93] text-xs mt-0.5">{desc}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassButton variant="primary" size="lg">+ Add New User</GlassButton>
    </PageShell>
  );
}
