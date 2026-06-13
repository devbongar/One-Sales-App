'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { COUNTRY_CODES } from '@/lib/client-form-options';
import { saveAttyInFact, fetchAttyInFact } from '@/lib/atty-in-fact';
import { supabase } from '@/lib/supabase';
import {
  User, CheckCircle2,
  ChevronDown, X, Phone, Mail, Search, Loader2,
} from 'lucide-react';

// ─── Shared UI components ─────────────────────────────────────────────────────

function InputRow({ label, icon, required, children }: {
  label: string; icon: React.ReactNode; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
        {icon} {label}
        {required && <span className="text-red-500 font-bold">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70] disabled:opacity-100"
    />
  );
}


function PhoneInputField({ code, onCodeChange, number, onNumberChange, disabled }: {
  code: string; onCodeChange: (v: string) => void;
  number: string; onNumberChange: (v: string) => void; disabled?: boolean;
}) {
  if (disabled) return (
    <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
      {code} {number || '—'}
    </div>
  );
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = COUNTRY_CODES.find(c => c.dial === code) ?? COUNTRY_CODES[0];
  const filtered = query
    ? COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.dial.includes(query))
    : COUNTRY_CODES;
  useEffect(() => {
    if (open && ref.current)
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }, [open]);
  return (
    <div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setOpen(p => !p); setQuery(''); }}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm shrink-0">
          <span>{selected.flag}</span>
          <span className="text-[#1C1C1E]">{code}</span>
          <ChevronDown size={12} className="text-[#C7C7CC]" />
        </button>
        <input type="tel" value={number}
          onChange={e => onNumberChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="9XX XXX XXXX"
          className="flex-1 px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]" />
      </div>
      {open && (
        <div ref={ref} className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.06] bg-[#F2F2F7]">
            <Search size={13} className="text-[#C7C7CC] shrink-0" />
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search country..." className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]" />
            {query && <button type="button" onClick={() => setQuery('')}><X size={11} className="text-[#C7C7CC]" /></button>}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.dial + c.name} type="button"
                onClick={() => { onCodeChange(c.dial); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                  c.dial === code ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
                }`}>
                <span>{c.flag}</span>
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-[#8E8E93] text-xs">{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AttyInFactPage() {
  const router = useRouter();
  const [hasCoOwnership, setHasCoOwnership] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved,  setIsSaved]  = useState(false);
  const LOCKED_STATUSES = ['submitted', 'director-approved', 'amd-review', 'amd-approved', 'finance-verified', 'Booked'];
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [reservation, setReservation] = useState<{
    reservation_id?: string; project?: string; inventory_code?: string;
  } | null>(null);

  // ── Personal Information state ──
  const [lastName,    setLastName]    = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [middleName,  setMiddleName]  = useState('');
  const [suffix,      setSuffix]      = useState('');
  const [mobileCode,  setMobileCode]  = useState('+63');
  const [mobile,      setMobile]      = useState('');
  const [landline,    setLandline]    = useState('');
  const [email,       setEmail]       = useState('');

  useEffect(() => {
    const co = sessionStorage.getItem('atty_hasCoOwnership');
    setHasCoOwnership(co === '1');

    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { setLoading(false); return; }
    const r = JSON.parse(raw);
    setReservation(r);
    if (!r.reservation_id) { setLoading(false); return; }

    Promise.all([
      fetchAttyInFact(r.reservation_id).catch(() => null),
      supabase.from('reservations').select('booking_review_status').eq('reservation_id', r.reservation_id).single(),
    ]).then(([info, { data: resRow }]) => {
      const brs = (resRow as any)?.booking_review_status ?? null;
      setIsSaved(!!info && LOCKED_STATUSES.includes(brs ?? ''));

      if (!info) return;
      setLastName(info.last_name ?? '');
      setFirstName(info.first_name ?? '');
      setMiddleName(info.middle_name ?? '');
      setSuffix(info.suffix ?? '');
      setMobileCode(info.mobile_code ?? '+63');
      setMobile(info.mobile ?? '');
      setLandline(info.landline ?? '');
      setEmail(info.email ?? '');
    }).catch(err => console.error('[atty-in-fact] load error:', err))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (isSaved) { router.push('/sales/booking/detail'); return; }
    setIsSaving(true);
    try {
      await saveAttyInFact({
        reservation_id: reservation?.reservation_id ?? '',
        last_name: lastName, first_name: firstName,
        middle_name: middleName, suffix,
        mobile_code: mobileCode, mobile, landline, email,
      });
      if (reservation?.reservation_id) {
        await supabase
          .from('reservations')
          .update({ atty_info_saved: true })
          .eq('reservation_id', reservation.reservation_id);
      }
      setShowModal(true);
    } catch (err) {
      alert('Failed to save. Please try again.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) return (
    <PageShell title="Attorney in Fact" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-[#C03D25] animate-spin" />
      </div>
    </PageShell>
  );

  return (
    <PageShell title="Attorney in Fact" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="space-y-4 pb-6">



        {/* Personal Information */}
        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>

          <InputRow label="Last Name" icon={<User size={11} />} required>
            <TextInput value={lastName} onChange={setLastName} placeholder="e.g. Santos" disabled={isSaved} />
          </InputRow>
          <InputRow label="First Name" icon={<User size={11} />} required>
            <TextInput value={firstName} onChange={setFirstName} placeholder="e.g. Maria" disabled={isSaved} />
          </InputRow>
          <InputRow label="Middle Name" icon={<User size={11} />}>
            <TextInput value={middleName} onChange={setMiddleName} placeholder="e.g. Cruz" disabled={isSaved} />
          </InputRow>
          <InputRow label="Suffix" icon={<User size={11} />}>
            <TextInput value={suffix} onChange={setSuffix} placeholder="e.g. Jr." disabled={isSaved} />
          </InputRow>

          <InputRow label="Mobile No." icon={<Phone size={11} />}>
            <PhoneInputField code={mobileCode} onCodeChange={setMobileCode} number={mobile} onNumberChange={setMobile} disabled={isSaved} />
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            <input type="tel" value={landline}
              onChange={e => setLandline(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 028XXXXXXX"
              disabled={isSaved}
              className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70]" />
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />}>
            <TextInput value={email} onChange={setEmail} placeholder="email@example.com" disabled={isSaved} />
          </InputRow>
        </GlassCard>

        {/* Save button */}
        <button type="button"
          onClick={() => isSaved ? handleSave() : setShowConfirmModal(true)}
          disabled={isSaving}
          className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity disabled:opacity-60">
          {isSaving ? 'Saving...' : isSaved ? 'Done' : 'Save'}
        </button>

      </div>

      {/* ── Save confirmation modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5 animate-slide-up">

            <button type="button" onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-70">
              <X size={16} className="text-[#6C6C70]" />
            </button>

            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center">
                <CheckCircle2 size={24} className="text-[#C03D25]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Confirm Details</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                Please make sure all information is correct before saving. This cannot be edited once submitted.
              </p>
            </div>

            <div className="space-y-2">
              <button type="button"
                onClick={() => { setShowConfirmModal(false); handleSave(); }}
                className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
                Confirm &amp; Save
              </button>
              <button type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-80">
                Review Again
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Completion confirmation modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5 animate-slide-up">

            <button type="button" onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-70">
              <X size={16} className="text-[#6C6C70]" />
            </button>

            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center">
                <CheckCircle2 size={24} className="text-[#C03D25]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Buyer's Information Complete!</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                You have successfully completed the buyer's information. All details including the Attorney in Fact have been saved.
              </p>
            </div>

            <button type="button" onClick={() => router.push('/sales/booking/detail')}
              className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
              Done
            </button>

          </div>
        </div>
      )}

    </PageShell>
  );
}
