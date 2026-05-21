'use client';

import { HTMLAttributes } from 'react';
import { useTheme } from '@/context/theme';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
}

export default function GlassCard({ children, className = '', strong = false, ...props }: GlassCardProps) {
  const isLight = useTheme() === 'light';

  const base = isLight
    ? `rounded-2xl bg-white border border-black/[0.06] ${strong ? 'shadow-md' : 'shadow-sm'}`
    : `rounded-3xl ${strong ? 'glass-strong' : 'glass'}`;

  return (
    <div className={`${base} ${className}`} {...props}>
      {children}
    </div>
  );
}
