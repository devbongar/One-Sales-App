'use client';

import { useEffect, useRef, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import DatePickerInput from '@/components/ui/DatePickerInput';
import { fetchAllClients } from '@/lib/clients';
import { COUNTRY_CODES } from '@/lib/client-form-options';
import {
  Hash, Building2, Tag, User, Users, UserCheck,
  Check, ChevronDown, X, Phone, Mail, CreditCard,
  AlertCircle, FileText, Gavel, Globe, Heart, Calendar,
  Home, MapPin, Search,
} from 'lucide-react';

// ─── Reusable components ──────────────────────────────────────────────────────

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

function ReadOnlyField({ label, icon, value }: {
  label: string; icon: React.ReactNode; value?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
        {icon} {label}
      </label>
      <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
        {value || '—'}
      </div>
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
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] disabled:opacity-40"
    />
  );
}

function SelectInput({ value, options, onChange, placeholder }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ref.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
    }
  }, [open]);

  return (
    <div>
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer"
      >
        <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || placeholder}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <div ref={ref} className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                o === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E]'
              }`}>
              {o}
              {o === value && <Check size={13} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchableSelect({ value, options, onChange, placeholder }: {
  value: string; options: { label: string; flag?: string }[];
  onChange: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (open && ref.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
    }
  }, [open]);

  return (
    <div>
      <div
        role="button" tabIndex={0}
        onClick={() => { setOpen(p => !p); setQuery(''); }}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer"
      >
        <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || placeholder}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <div ref={ref} className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
          {/* Search box */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.06] bg-[#F2F2F7]">
            <Search size={13} className="text-[#C7C7CC] shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}>
                <X size={11} className="text-[#C7C7CC]" />
              </button>
            )}
          </div>
          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(o => (
              <button key={o.label} type="button"
                onClick={() => { onChange(o.label); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                  o.label === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E]'
                }`}>
                <span className="flex items-center gap-2">
                  {o.flag && <span>{o.flag}</span>}
                  {o.label}
                </span>
                {o.label === value && <Check size={13} className="shrink-0" />}
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

function ReadOnlyRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
      <span className="text-[#E8634A] shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium text-[#1C1C1E]">{label}</span>
      <span className="text-sm text-right text-[#6C6C70] max-w-[180px] truncate">{value || '—'}</span>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GENDER_OPTIONS         = ['Male', 'Female', 'Non Binary'];
const CIVIL_STATUS_OPTIONS   = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'];
const HOME_OWNERSHIP_OPTIONS = ['Owned', 'Rented', 'Living with Parents', 'Others'];
const COUNTRY_OPTIONS        = COUNTRY_CODES.map(c => ({ label: c.name, flag: c.flag }));

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BuyerInfoPage() {
  const [step, setStep] = useState(0); // 0 = Personal Info, 1 = Address Info

  const [reservation, setReservation] = useState<{
    reservation_id?: string; project?: string; inventory_code?: string; client_name?: string;
  } | null>(null);

  // Auto-populated read-only fields
  const [clientId,    setClientId]    = useState('');
  const [lastName,    setLastName]    = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [middleName,  setMiddleName]  = useState('');
  const [suffix,      setSuffix]      = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [mobile,      setMobile]      = useState('');
  const [landline,    setLandline]    = useState('');
  const [email,       setEmail]       = useState('');

  // Editable personal fields
  const [gender,      setGender]      = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [tin,         setTin]         = useState('');
  const [noTin,       setNoTin]       = useState(false);

  // Toggle buttons
  const [hasCoOwnership, setHasCoOwnership] = useState(false);
  const [hasAttyInFact,  setHasAttyInFact]  = useState(false);

  // Address fields
  const [homeOwnership,  setHomeOwnership]  = useState('');
  const [country,        setCountry]        = useState('Philippines');
  const [regionProvince, setRegionProvince] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [barangayLine1,  setBarangayLine1]  = useState('');
  const [streetLine2,    setStreetLine2]    = useState('');
  const [unitNo,         setUnitNo]         = useState('');

  // Load reservation + auto-fill from client record
  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) return;
    const r = JSON.parse(raw);
    setReservation(r);

    fetchAllClients().then(clients => {
      const match = clients.find(c => {
        const name = [c.first_name, c.last_name, c.suffix].filter(Boolean).join(' ');
        return name === r.client_name;
      });
      if (!match) return;
      setClientId(match.client_id ?? '');
      setLastName(match.last_name ?? '');
      setFirstName(match.first_name ?? '');
      setMiddleName(match.middle_name ?? '');
      setSuffix(match.suffix ?? '');
      setCitizenship(match.citizenship ?? '');
      setDateOfBirth(match.date_of_birth ?? '');
      const cc  = match.country_code ?? '+63';
      const num = match.mobile_number ?? '';
      setMobile(num ? `${cc} ${num}` : '');
      setLandline(match.landline_no ?? '');
      setEmail(match.email ?? '');
    }).catch(console.error);
  }, []);

  // ── Step 0: Personal Information ──────────────────────────────────────────
  if (step === 0) {
    return (
      <PageShell title="Buyer Information" backButton>
        <div className="space-y-4 pb-6">

          {/* Project Information */}
          <GlassCard className="px-4 py-1">
            <ReadOnlyRow icon={<Hash size={16} />}      label="Reservation ID" value={reservation?.reservation_id} />
            <ReadOnlyRow icon={<Building2 size={16} />} label="Project"        value={reservation?.project} />
            <ReadOnlyRow icon={<Tag size={16} />}       label="Inventory Code" value={reservation?.inventory_code} />
          </GlassCard>

          {/* Personal Information */}
          <GlassCard className="p-4 space-y-4">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>

            {/* Toggle buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setHasCoOwnership(p => !p)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  hasCoOwnership ? 'bg-[#E8634A] border-[#E8634A] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                }`}>
                {hasCoOwnership && <Check size={13} />}
                <Users size={14} />
                Co-Ownership
              </button>
              <button type="button" onClick={() => setHasAttyInFact(p => !p)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  hasAttyInFact ? 'bg-[#E8634A] border-[#E8634A] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                }`}>
                {hasAttyInFact && <Check size={13} />}
                <Gavel size={14} />
                Atty in Fact
              </button>
            </div>

            {/* Co-Ownership note */}
            {hasCoOwnership && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  The buyer agrees that the co-owner and his/her spouse shall sign the contract to sell
                  should they agree to be co-owners.
                </p>
              </div>
            )}

            {/* Read-only auto-filled */}
            <ReadOnlyField label="Client ID"   icon={<UserCheck size={11} />} value={clientId} />
            <ReadOnlyField label="Last Name"   icon={<User size={11} />}      value={lastName} />
            <ReadOnlyField label="First Name"  icon={<User size={11} />}      value={firstName} />
            <ReadOnlyField label="Middle Name" icon={<User size={11} />}      value={middleName} />
            <ReadOnlyField label="Suffix"      icon={<User size={11} />}      value={suffix} />

            {/* Editable: Gender */}
            <InputRow label="Gender" icon={<User size={11} />} required>
              <SelectInput value={gender} options={GENDER_OPTIONS} onChange={setGender} placeholder="Select gender" />
            </InputRow>

            {/* Editable: Civil Status */}
            <InputRow label="Civil Status" icon={<Heart size={11} />} required>
              <SelectInput value={civilStatus} options={CIVIL_STATUS_OPTIONS} onChange={setCivilStatus} placeholder="Select civil status" />
            </InputRow>

            {/* Read-only auto-filled (continued) */}
            <ReadOnlyField label="Citizenship"   icon={<Globe size={11} />}    value={citizenship} />

            <InputRow label="Date of Birth" icon={<Calendar size={11} />}>
              <DatePickerInput value={dateOfBirth} onChange={() => {}} disabled />
            </InputRow>

            <ReadOnlyField label="Mobile No."    icon={<Phone size={11} />}    value={mobile} />
            <ReadOnlyField label="Landline No."  icon={<Phone size={11} />}    value={landline} />
            <ReadOnlyField label="Email Address" icon={<Mail size={11} />}     value={email} />

            {/* Editable: TIN */}
            <InputRow label="Tax ID No. (TIN)" icon={<CreditCard size={11} />} required={!noTin}>
              <TextInput
                value={noTin ? '' : tin}
                onChange={setTin}
                placeholder={noTin ? 'No TIN' : 'XXX-XXX-XXX'}
                disabled={noTin}
              />
            </InputRow>

            {/* No TIN toggle */}
            <button type="button"
              onClick={() => { setNoTin(p => !p); if (!noTin) setTin(''); }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                noTin ? 'bg-[#E8634A] border-[#E8634A] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
              }`}>
              {noTin && <Check size={13} />}
              <FileText size={14} />
              No TIN
            </button>

            {/* No TIN note */}
            {noTin && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  The buyer agrees to fill the BIR Form 1904 and register with BIR within 30 days
                  from the reservation of payment.
                </p>
              </div>
            )}
          </GlassCard>

          {/* Next button */}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold shadow-[0_4px_16px_rgba(232,99,74,0.35)] active:opacity-80 transition-opacity"
          >
            Next
          </button>

        </div>
      </PageShell>
    );
  }

  // ── Step 1: Address Information ───────────────────────────────────────────
  return (
    <PageShell title="Buyer Information" backButton onBack={() => setStep(0)}>
      <div className="space-y-4 pb-6">

        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Address Information</p>

          <InputRow label="Home Ownership" icon={<Home size={11} />}>
            <SelectInput
              value={homeOwnership}
              options={HOME_OWNERSHIP_OPTIONS}
              onChange={setHomeOwnership}
              placeholder="Select home ownership"
            />
          </InputRow>

          <InputRow label="Country" icon={<Globe size={11} />}>
            <SearchableSelect
              value={country}
              options={COUNTRY_OPTIONS}
              onChange={setCountry}
              placeholder="Select country"
            />
          </InputRow>

          <InputRow label="Region / Province" icon={<MapPin size={11} />}>
            <TextInput value={regionProvince} onChange={setRegionProvince} placeholder="e.g. Metro Manila" />
          </InputRow>

          <InputRow label="City / Municipality" icon={<MapPin size={11} />}>
            <TextInput value={cityMunicipality} onChange={setCityMunicipality} placeholder="e.g. Quezon City" />
          </InputRow>

          <InputRow label="Barangay / Address Line 1" icon={<MapPin size={11} />}>
            <TextInput value={barangayLine1} onChange={setBarangayLine1} placeholder="e.g. Brgy. Commonwealth" />
          </InputRow>

          <InputRow label="Street / Subdivision / Village / Address Line 2" icon={<MapPin size={11} />}>
            <TextInput value={streetLine2} onChange={setStreetLine2} placeholder="e.g. Batangas St." />
          </InputRow>

          <InputRow label="Unit / Building / House / Block No." icon={<Building2 size={11} />}>
            <TextInput value={unitNo} onChange={setUnitNo} placeholder="e.g. Unit 12B" />
          </InputRow>

        </GlassCard>

        {/* Next button */}
        <button
          type="button"
          onClick={() => {/* next step */}}
          className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold shadow-[0_4px_16px_rgba(232,99,74,0.35)] active:opacity-80 transition-opacity"
        >
          Next
        </button>

      </div>
    </PageShell>
  );
}
