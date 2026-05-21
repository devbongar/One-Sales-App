'use client';

import AppLayout from './AppLayout';
import { ThemeContext } from '@/context/theme';

interface PageShellProps {
  title: string;
  children: React.ReactNode;
  backButton?: boolean;
}

export default function PageShell({ title, children, backButton }: PageShellProps) {
  return (
    <ThemeContext.Provider value="light">
      <AppLayout title={title} backButton={backButton}>
        <div className="px-4 py-4 space-y-4 animate-fade-in max-w-lg mx-auto w-full">
          {children}
        </div>
      </AppLayout>
    </ThemeContext.Provider>
  );
}
