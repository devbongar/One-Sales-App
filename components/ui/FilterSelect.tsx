'use client';

import { useState } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

interface FilterSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  searchable?: boolean;
}

export default function FilterSelect({ label, value, options, onChange, icon, searchable = false }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = searchable && query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <div
        role="button" tabIndex={0}
        onClick={() => { setOpen(p => !p); setQuery(''); }}
        onKeyDown={e => e.key === 'Enter' && (setOpen(p => !p), setQuery(''))}
        className="w-full flex items-center gap-3 py-3 px-1 cursor-pointer"
      >
        {icon && <span className="text-[#E8634A] shrink-0">{icon}</span>}
        <span className="flex-1 text-sm font-medium text-[#1C1C1E] text-left">{label}</span>
        <span className={`text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || 'All'}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>

      {open && (
        <div className="pb-2">
          {searchable && (
            <div className="flex items-center gap-2 mx-1 mb-2 px-3 py-2 bg-[#F2F2F7] rounded-xl">
              <Search size={13} className="text-[#C7C7CC] shrink-0" />
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search..." className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]" />
              {query && <button type="button" onClick={() => setQuery('')}><X size={11} className="text-[#C7C7CC]" /></button>}
            </div>
          )}
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtered.length > 0 ? filtered.map(o => (
              <button key={o} type="button"
                onClick={() => { onChange(o); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                  o === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E] active:bg-gray-100'
                }`}>
                {o}
                {o === value && <Check size={13} />}
              </button>
            )) : (
              <p className="text-center text-xs text-[#8E8E93] py-3">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
