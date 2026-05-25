'use client';

import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder = 'Search…' }: SearchInputProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-black/[0.08]">
      <Search size={14} className="text-[#C7C7CC] shrink-0" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
      />
      {value && (
        <button type="button" onClick={() => onChange('')}>
          <X size={12} className="text-[#C7C7CC]" />
        </button>
      )}
    </div>
  );
}
