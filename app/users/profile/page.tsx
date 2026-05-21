'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { UserCog, Mail, Shield } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { AppUser } from '@/types';

export default function UserProfilePage() {
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    setUser(getSession());
  }, []);

  return (
    <PageShell title="User's Profile">
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[rgba(94,92,230,0.15)] flex items-center justify-center shrink-0">
          <span className="text-2xl font-bold text-[#5E5CE6]">
            {user?.full_name?.charAt(0).toUpperCase() ?? 'U'}
          </span>
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold text-lg">{user?.full_name ?? '—'}</p>
          <p className="text-[#6C6C70] text-sm capitalize">{user?.role ?? '—'}</p>
        </div>
      </GlassCard>

      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Mail size={16} className="text-[#8E8E93]" />
          <div>
            <p className="text-[#8E8E93] text-xs">Email</p>
            <p className="text-[#1C1C1E] text-sm">{user?.email ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Shield size={16} className="text-[#8E8E93]" />
          <div>
            <p className="text-[#8E8E93] text-xs">Role</p>
            <p className="text-[#1C1C1E] text-sm capitalize">{user?.role ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UserCog size={16} className="text-[#8E8E93]" />
          <div>
            <p className="text-[#8E8E93] text-xs">Member since</p>
            <p className="text-[#1C1C1E] text-sm">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassButton variant="ghost" size="lg">Edit Profile</GlassButton>
    </PageShell>
  );
}
