'use client';

import AppLayout from './AppLayout';
import { ThemeContext } from '@/context/theme';

interface PageShellProps {
  title: string;
  children: React.ReactNode;
  backButton?: boolean;
  onBack?: () => void;
}

export default function PageShell({ title, children, backButton, onBack }: PageShellProps) {
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
