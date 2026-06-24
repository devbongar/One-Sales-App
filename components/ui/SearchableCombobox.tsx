'use client';

import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export default function SearchableCombobox({ value, options, onChange, placeholder, disabled }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(name: string) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border ${
        disabled ? 'border-transparent bg-white/50 cursor-default' : 'border-black/[0.10] bg-white/80'
      }`}>
        <input
          type="text"
          value={open ? query : value}
          readOnly={disabled}
          placeholder={value || placeholder}
          onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
          onChange={e => { if (!disabled) setQuery(e.target.value); }}
          className="flex-1 bg-transparent outline-none text-sm text-[#1C1C1E] placeholder:text-[#C7C7CC] min-w-0"
        />
        {!disabled && value && !open
          ? <button type="button" onClick={clear}><X size={13} className="text-[#C7C7CC]" /></button>
          : !disabled && <ChevronDown size={14} className="text-[#C7C7CC] shrink-0" />
        }
      </div>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0
                ? <p className="px-3 py-2.5 text-sm text-[#C7C7CC]">No results</p>
                : filtered.map(o => (
                  <button key={o} type="button"
                    onMouseDown={e => { e.preventDefault(); select(o); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                      o === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
                    }`}>
                    {o}
                    {o === value && <Check size={13} className="shrink-0" />}
                  </button>
                ))
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}
