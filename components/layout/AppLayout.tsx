'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, ChevronLeft } from 'lucide-react';
import Sidebar from './Sidebar';
import { getSession } from '@/lib/auth';
import { AppUser } from '@/types';
import { useTheme } from '@/context/theme';

function getAvatarInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
  title?: string;
  transparent?: boolean;
  backButton?: boolean;
  onBack?: () => void;
}

export default function AppLayout({ children, showHeader = true, title, transparent = false, backButton = false, onBack }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const router = useRouter();
  const isLight = useTheme() === 'light';

  useEffect(() => {
    getSession().then(session => {
      if (!session) { router.replace('/login'); return; }
      setUser(session);
    });
  }, [router]);

  if (!user) return null;

  return (
    <div className={`relative flex flex-col h-screen ${isLight ? 'bg-[#F2F2F7]' : ''}`}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={user.full_name}
        displayName={user.display_name}
        userRole={user.role_name ?? ''}
      />

      {showHeader && (
        <header
          className={`
            fixed top-0 left-0 right-0 z-40 flex items-center justify-between
            px-4 pb-3
            ${transparent
              ? 'bg-transparent'
              : isLight
                ? 'bg-white/90 backdrop-blur-xl border-b border-black/[0.06]'
                : 'glass border-b border-white/10'}
          `}
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            ...(transparent ? { background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)' } : {}),
          }}
        >
          {backButton ? (
            <button
              onClick={() => onBack ? onBack() : router.back()}
              className={`p-2.5 rounded-2xl ${isLight ? 'bg-gray-100 text-[#1C1C1E]' : 'glass text-white'}`}
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-2.5 rounded-2xl ${isLight ? 'bg-gray-100 text-[#1C1C1E]' : 'glass text-white'}`}
            >
              <Menu size={20} />
            </button>
          )}

          {title && (
            <span className={`font-semibold text-base tracking-tight ${isLight ? 'text-[#1C1C1E]' : 'text-white'}`}>
              {title}
            </span>
          )}

          <button
            onClick={() => setSidebarOpen(true)}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isLight ? 'bg-[#C03D25]/10' : 'glass'}`}
          >
            <span className={`font-bold text-sm ${isLight ? 'text-[#C03D25]' : 'text-white'}`}>
              {getAvatarInitials(user.display_name || user.full_name)}
            </span>
          </button>
        </header>
      )}

      <main
        className={`flex-1 ${transparent ? '' : 'overflow-y-auto'}`}
        style={showHeader && !transparent ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)' } : undefined}
      >
        {children}
      </main>
    </div>
  );
}
