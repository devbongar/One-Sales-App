'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-sm font-medium text-white/70 pl-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            glass-input
            w-full px-4 py-3.5
            rounded-2xl
            text-base
            ${error ? 'border-[rgba(255,55,95,0.6)] shadow-[0_0_0_3px_rgba(255,55,95,0.15)]' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-sm text-[#FF375F] pl-1">{error}</p>
        )}
      </div>
    );
  }
);

GlassInput.displayName = 'GlassInput';

export default GlassInput;
