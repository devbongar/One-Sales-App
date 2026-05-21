'use client';

import { ButtonHTMLAttributes } from 'react';
import { useTheme } from '@/context/theme';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'px-4 py-2 text-sm rounded-2xl',
  md: 'px-6 py-3 text-base rounded-2xl',
  lg: 'px-8 py-4 text-base rounded-[18px] w-full',
};

export default function GlassButton({
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  disabled,
  ...props
}: GlassButtonProps) {
  const isLight = useTheme() === 'light';

  const variants = {
    primary: 'bg-[#E8634A] hover:bg-[#C5432A] text-white shadow-[0_4px_20px_rgba(232,99,74,0.45)] border border-[rgba(255,255,255,0.2)]',
    ghost: isLight
      ? 'bg-[#E5E5EA] hover:bg-[#D1D1D6] text-[#1C1C1E] border border-black/[0.08]'
      : 'glass hover:bg-white/15 text-white',
    danger: 'bg-[#FF375F] hover:bg-[#e02e52] text-white shadow-[0_4px_20px_rgba(255,55,95,0.4)] border border-[rgba(255,255,255,0.2)]',
  };

  return (
    <button
      className={`
        ${variants[variant]}
        ${sizes[size]}
        font-semibold
        transition-all duration-200
        active:scale-[0.97]
        disabled:opacity-40 disabled:cursor-not-allowed
        cursor-pointer
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
