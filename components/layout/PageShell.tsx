'use client';

import { useEffect } from 'react';
import AppLayout from './AppLayout';
import { ThemeContext } from '@/context/theme';

interface PageShellProps {
  title: string;
  children: React.ReactNode;
  backButton?: boolean;
  onBack?: () => void;
}

export default function PageShell({ title, children, backButton, onBack }: PageShellProps) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content') ?? '#000000';
    meta?.setAttribute('content', '#ffffff');
    return () => { meta?.setAttribute('content', prev); };
  }, []);

  return (
    <ThemeContext.Provider value="light">
      <AppLayout title={title} backButton={backButton} onBack={onBack}>
        <div className="px-4 py-4 space-y-4 animate-fade-in max-w-lg mx-auto w-full">
          {children}
        </div>
      </AppLayout>
    </ThemeContext.Provider>
  );
}
