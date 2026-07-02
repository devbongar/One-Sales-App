'use client';

import { useState, useRef } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type SingleProps = {
  multiSelect?: false;
  value: string;
  onChange: (v: string) => void;
};

type MultiProps = {
  multiSelect: true;
  value: string[];
  onChange: (v: string[]) => void;
};

export type SelectOption = string | { label: string; value: string };

type SearchableSelectProps = (SingleProps | MultiProps) & {
  options:      SelectOption[];
  placeholder?: string;
  disabled?:    boolean;
  align?:       'left' | 'right';
  dropUp?:      boolean;
};

function optLabel(o: SelectOption) { return typeof o === 'string' ? o : o.label; }
function optValue(o: SelectOption) { return typeof o === 'string' ? o : o.value; }

export default function SearchableSelect(props: SearchableSelectProps) {
  const { options, placeholder = 'All', disabled = false, align = 'left', dropUp = false } = props;
  const [open,      setOpen]      = useState(false);
  const [query,     setQuery]     = useState('');
  const [flippedUp, setFlippedUp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = options.filter(
    o => !query.trim() || optLabel(o).toLowerCase().includes(query.trim().toLowerCase())
  );

  function close() { setOpen(false); setQuery(''); setFlippedUp(false); }

  function handleOpen() {
    if (disabled) return;
    if (open) { close(); return; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const panelHeight = 260; // search bar + max options + padding
      setFlippedUp(rect.bottom + panelHeight > window.innerHeight);
    }
    setOpen(true);
  }

  // ── Multi-select helpers ──────────────────────────────────────
  function isSelected(opt: SelectOption): boolean {
    const v = optValue(opt);
    if (props.multiSelect) return props.value.includes(v);
    return props.value === v;
  }

  function toggleOption(opt: SelectOption) {
    const v = optValue(opt);
    if (props.multiSelect) {
      const next = props.value.includes(v)
        ? props.value.filter(x => x !== v)
        : [...props.value, v];
      props.onChange(next);
    } else {
      props.onChange(v);
      close();
    }
  }

  function clearAll() {
    if (props.multiSelect) props.onChange([]);
    else props.onChange('');
    close();
  }

  // ── Trigger label ─────────────────────────────────────────────
  let triggerLabel: string;
  let hasValue: boolean;
  if (props.multiSelect) {
    hasValue = props.value.length > 0;
    triggerLabel = props.value.length === 0
      ? placeholder
      : props.value.length === 1
        ? (optLabel(options.find(o => optValue(o) === props.value[0]) ?? props.value[0]))
        : `${props.value.length} selected`;
  } else {
    hasValue = !!props.value;
    triggerLabel = (props.value ? optLabel(options.find(o => optValue(o) === props.value) ?? props.value) : '') || placeholder;
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl"
        style={{
          background: disabled ? '#E5E5EA' : '#F2F2F7',
          border: '1px solid rgba(0,0,0,0.08)',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'background-color 150ms ease',
        }}
      >
        <span className={`text-sm truncate ${hasValue ? (disabled ? 'text-[#6C6C70]' : 'text-[#1C1C1E] font-medium') : 'text-[#C7C7CC]'}`}>
          {triggerLabel}
        </span>
        {hasValue && !disabled ? (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); clearAll(); }}
            className="shrink-0 text-[#8E8E93] active:opacity-60 cursor-pointer"
          >
            <X size={14} />
          </span>
        ) : (
          <ChevronDown
            size={14}
            className={disabled ? 'text-[#C7C7CC]' : 'text-[#8E8E93]'}
            style={{
              transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1)',
              flexShrink: 0,
            }}
          />
        )}
      </button>

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40" onClick={close} />}

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute z-50 rounded-xl overflow-hidden bg-white"
          style={{
            ...((dropUp || flippedUp) ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            minWidth: '100%',
            maxWidth: 'min(400px, calc(100vw - 32px))',
            width: 'max-content',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
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

          {/* Options */}
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {filtered.length === 0 ? (
              <p className="text-xs text-[#8E8E93] text-center py-3 px-3">No matches</p>
            ) : (
              filtered.map((opt, i) => {
                const selected = isSelected(opt);
                return (
                  <button
                    key={optValue(opt) || i}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left"
                    style={{
                      background: selected ? 'rgba(192,61,37,0.06)' : undefined,
                      color:      selected ? '#C03D25' : '#1C1C1E',
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    <span className="truncate flex-1">{optLabel(opt)}</span>
                    {props.multiSelect ? (
                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${selected ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C7C7CC]'}`}>
                        {selected && <Check size={10} className="text-white" />}
                      </div>
                    ) : (
                      selected && <Check size={13} style={{ color: '#C03D25' }} className="shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Done button for multi-select */}
          {props.multiSelect && (
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button
                type="button"
                onClick={close}
                className="w-full py-2.5 text-sm font-semibold text-[#C03D25] active:opacity-70"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
