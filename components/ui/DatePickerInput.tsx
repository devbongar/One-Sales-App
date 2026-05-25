'use client';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  value: string;          // YYYY-MM-DD
  onChange: (v: string) => void;
  disabled?: boolean;
}

export default function DatePickerInput({ value, onChange, disabled }: Props) {
  const parts = value ? value.split('-') : ['', '', ''];
  const y = parts[0] ?? '';
  const m = parts[1] ?? '';
  const d = parts[2] ?? '';

  const daysInMonth = m && y ? new Date(parseInt(y), parseInt(m), 0).getDate() : 31;

  function update(newY: string, newM: string, newD: string) {
    if (newY && newM && newD) onChange(`${newY}-${newM}-${newD}`);
    else onChange('');
  }

  // Read-only: show formatted date as plain text
  if (disabled) {
    const display = value
      ? new Date(value + 'T00:00:00').toLocaleDateString('en-PH', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
      : '';
    return (
      <div className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] text-sm text-[#1C1C1E]">
        {display || '—'}
      </div>
    );
  }

  const sel = 'bg-[#F2F2F7] border border-black/[0.1] rounded-xl text-sm text-[#1C1C1E] outline-none py-2.5 px-2';

  return (
    <div className="flex gap-2">
      <select value={m} onChange={e => update(y, e.target.value, d)} className={`flex-1 ${sel}`}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
        ))}
      </select>
      <select value={d} onChange={e => update(y, m, e.target.value)} className={`w-[72px] ${sel}`}>
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(n => (
          <option key={n} value={String(n).padStart(2, '0')}>{n}</option>
        ))}
      </select>
      <select value={y} onChange={e => update(e.target.value, m, d)} className={`w-[84px] ${sel}`}>
        <option value="">Year</option>
        {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(yr => (
          <option key={yr} value={String(yr)}>{yr}</option>
        ))}
      </select>
    </div>
  );
}
