'use client';

import { useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

interface SearchableSelectProps {
  value:       string;
  onChange:    (v: string) => void;
  options:     string[];
  placeholder?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'All',
}: SearchableSelectProps) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');

  const filtered = options.filter(
    o => !query.trim() || o.toLowerCase().includes(query.trim().toLowerCase())
  );

  function close() { setOpen(false); setQuery(''); }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(0,0,0,0.08)' }}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (open) close(); else setOpen(true); }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[#F2F2F7]"
        style={{ transition: 'background-color 150ms ease' }}
      >
        <span className={`text-sm truncate ${value ? 'text-[#1C1C1E] font-medium' : 'text-[#C7C7CC]'}`}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {value && (
            <span
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="p-0.5"
            >
              <X size={12} className="text-[#8E8E93]" />
            </span>
          )}
          <ChevronDown
            size={14}
            className="text-[#8E8E93]"
            style={{
              transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1)',
            }}
          />
        </div>
      </button>

      {/* Expanded panel — inline, no absolute positioning */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>

          {/* Search input */}
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}
          >
            <Search size={13} className="text-[#8E8E93] shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-sm text-[#1C1C1E] bg-transparent outline-none placeholder:text-[#C7C7CC]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}>
                <X size={12} className="text-[#8E8E93]" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="bg-white overflow-y-auto" style={{ maxHeight: 200 }}>

            {/* Clear / All option */}
            <button
              type="button"
              onClick={() => { onChange(''); close(); }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left active:scale-[0.98]"
              style={{
                background: !value ? 'rgba(192,61,37,0.06)' : undefined,
                color:      !value ? '#C03D25' : '#6C6C70',
                fontWeight: !value ? 600 : 400,
                transition: 'transform 100ms ease-out',
              }}
            >
              All
              {!value && <Check size={13} style={{ color: '#C03D25' }} />}
            </button>

            {filtered.length === 0 ? (
              <p className="text-xs text-[#8E8E93] text-center py-3 px-3">No matches</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); close(); }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left active:scale-[0.98]"
                  style={{
                    background: value === opt ? 'rgba(192,61,37,0.06)' : undefined,
                    color:      value === opt ? '#C03D25' : '#1C1C1E',
                    fontWeight: value === opt ? 600 : 400,
                    transition: 'transform 100ms ease-out',
                  }}
                >
                  <span className="truncate flex-1">{opt}</span>
                  {value === opt && <Check size={13} style={{ color: '#C03D25' }} className="shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
