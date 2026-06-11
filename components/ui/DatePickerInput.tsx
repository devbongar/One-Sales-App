'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  value: string;          // YYYY-MM-DD
  onChange: (v: string) => void;
  disabled?: boolean;
}

function PartSelect({ value, placeholder, options, onSelect, onClear }: {
  value: string;
  placeholder: string;
  options: { label: string; val: string }[];
  onSelect: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ref.current)
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.closest('[data-datepicker-part]')?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selectedLabel = options.find(o => o.val === value)?.label ?? '';

  return (
    <div className="flex-1 min-w-0" data-datepicker-part>
      {/* Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer gap-1"
      >
        <span className={`text-sm truncate ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {selectedLabel || placeholder}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onClear(); setOpen(false); }}>
              <X size={12} className="text-[#C7C7CC] shrink-0" />
            </button>
          : <ChevronDown size={13} className={`text-[#C7C7CC] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={ref}
          className="absolute z-50 mt-1 rounded-xl border border-black/[0.08] bg-white shadow-lg overflow-hidden"
          style={{ minWidth: '100%', width: 'max-content', maxHeight: '220px', overflowY: 'auto' }}
        >
          {options.map(o => (
            <button
              key={o.val}
              type="button"
              onClick={() => { onSelect(o.val); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                o.val === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
              }`}
            >
              {o.label}
              {o.val === value && <Check size={12} className="shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DatePickerInput({ value, onChange, disabled }: Props) {
  const [y, setY] = useState('');
  const [m, setM] = useState('');
  const [d, setD] = useState('');

  // Sync internal state when the prop changes (e.g. loaded from DB)
  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      setY(parts[0] ?? '');
      setM(parts[1] ?? '');
      setD(parts[2] ?? '');
    } else {
      setY(''); setM(''); setD('');
    }
  }, [value]);

  const daysInMonth = m && y ? new Date(parseInt(y), parseInt(m), 0).getDate()
                    : m      ? new Date(2000, parseInt(m), 0).getDate()
                    : 31;

  function handleChange(newY: string, newM: string, newD: string) {
    let clampedD = newD;
    if (newM && newD) {
      const refYear = newY ? parseInt(newY) : 2000;
      const maxDays = new Date(refYear, parseInt(newM), 0).getDate();
      if (parseInt(newD) > maxDays) clampedD = String(maxDays).padStart(2, '0');
    }
    setY(newY);
    setM(newM);
    setD(clampedD);
    if (newY && newM && clampedD) onChange(`${newY}-${newM}-${clampedD}`);
    else onChange('');
  }

  // Read-only display
  if (disabled) {
    const display = value
      ? new Date(value + 'T00:00:00').toLocaleDateString('en-PH', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
      : '';
    return (
      <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
        {display || '—'}
      </div>
    );
  }

  const monthOptions = MONTHS.map((name, i) => ({
    label: name,
    val: String(i + 1).padStart(2, '0'),
  }));

  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => ({
    label: String(i + 1),
    val: String(i + 1).padStart(2, '0'),
  }));

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 100 }, (_, i) => ({
    label: String(currentYear - i),
    val: String(currentYear - i),
  }));

  return (
    <div className="flex gap-2 relative">
      <PartSelect
        value={m}
        placeholder="Month"
        options={monthOptions}
        onSelect={v => handleChange(y, v, d)}
        onClear={() => handleChange(y, '', d)}
      />
      <PartSelect
        value={d}
        placeholder="Day"
        options={dayOptions}
        onSelect={v => handleChange(y, m, v)}
        onClear={() => handleChange(y, m, '')}
      />
      <PartSelect
        value={y}
        placeholder="Year"
        options={yearOptions}
        onSelect={v => handleChange(v, m, d)}
        onClear={() => handleChange('', m, d)}
      />
    </div>
  );
}
