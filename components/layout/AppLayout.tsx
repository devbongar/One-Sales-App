'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, ChevronLeft } from 'lucide-react';
import Sidebar from './Sidebar';
import { getSession } from '@/lib/auth';
import { AppUser } from '@/types';
import { useTheme } from '@/context/theme';

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
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setUser(session);
  }, [router]);

  if (!user) return null;

  return (
    <div className={`relative flex flex-col h-screen ${isLight ? 'bg-[#F2F2F7]' : ''}`}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={user.full_name}
        userRole={user.role}
      />

      {showHeader && (
        <header
          className={`
            fixed top-0 left-0 right-0 z-40 flex items-center justify-between
            px-4 pt-12 pb-3
            ${transparent
              ? 'bg-transparent'
              : isLight
                ? 'bg-white/90 backdrop-blur-xl border-b border-black/[0.06]'
                : 'glass border-b border-white/10'}
          `}
          style={transparent ? { background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)' } : {}}
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

          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isLight ? 'bg-gray-100' : 'glass'}`}>
            <span className={`font-bold text-sm ${isLight ? 'text-[#1C1C1E]' : 'text-white'}`}>
              {user.full_name?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
        </header>
      )}

      <main className={`flex-1 overflow-y-auto ${showHeader ? (transparent ? 'pt-0' : 'pt-[88px]') : ''}`}>
        {children}
      </main>
    </div>
  );
}
