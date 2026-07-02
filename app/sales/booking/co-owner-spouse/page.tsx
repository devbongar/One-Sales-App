'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import DatePickerInput from '@/components/ui/DatePickerInput';
import { COUNTRY_CODES, CITIZENSHIP_LIST } from '@/lib/client-form-options';
import { saveCoOwnerSpouse, fetchCoOwnerSpouse } from '@/lib/co-owner-spouse';
import { supabase } from '@/lib/supabase';
import {
  User,
  Check, ChevronDown, X, Phone, Mail, CreditCard,
  AlertCircle, FileText, Globe, Heart, Calendar,
  Search, Briefcase, DollarSign, CheckCircle2, Loader2,
} from 'lucide-react';

// ─── Shared UI components ─────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pb-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${
          i + 1 === current ? 'w-6 bg-[#C03D25]' : i + 1 < current ? 'w-4 bg-green-500' : 'w-4 bg-[#E5E5EA]'
        }`} />
      ))}
      <span className="text-[10px] font-semibold text-[#8E8E93] ml-1">{current} / {total}</span>
    </div>
  );
}

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
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] disabled:opacity-40" />
  );
}

function SelectInput({ value, options, onChange, placeholder, disabled }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && ref.current)
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }, [open]);
  if (disabled) return (
    <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
      {value || '—'}
    </div>
  );
  return (
    <div>
      <div role="button" tabIndex={0} onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer">
        <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>{value || placeholder}</span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}><X size={13} className="text-[#C7C7CC]" /></button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] transition-transform ${open ? 'rotate-180' : ''}`} />}
      </div>
      {open && (
        <div ref={ref} className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
          {options.map(o => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                o === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
              }`}>
              {o}{o === value && <Check size={13} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PhoneInputField({ code, onCodeChange, number, onNumberChange, disabled }: {
  code: string; onCodeChange: (v: string) => void;
  number: string; onNumberChange: (v: string) => void; disabled?: boolean;
}) {
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
  if (disabled) return (
    <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
      {code} {number || '—'}
    </div>
  );
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

// ─── Constants ────────────────────────────────────────────────────────────────
const GENDER_OPTIONS          = ['Male', 'Female', 'Non Binary'];
const CIVIL_STATUS_OPTIONS    = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'];
const NATURE_OF_BUSINESS_OPTS = ['Media & Entertainment', 'Hospitality', 'IT / Technology', 'Healthcare', 'Real Estate', 'Retail', 'Construction', 'Others'];
const EMPLOYMENT_SECTOR_OPTS  = ['Not Applicable', 'Private', 'Public'];
const EMPLOYMENT_STATUS_OPTS  = ['Employee', 'Self Employed', 'Student', 'Unemployed', 'Others'];
const RANK_OPTS               = ['Executive', 'Managerial', 'Supervisor', 'Rank & File'];
const SALARY_RANGE_OPTS       = ['50,000 and Below', '50,001 to 80,000', '80,001 to 120,000', '120,001 to 150,000', '150,001 to 200,000', '200,001 and Above'];
const LOCKED_STATUSES         = ['submitted', 'director-approved', 'amd-approved'];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CoOwnerSpousePage() {
  const router = useRouter();
  const [step, setStep]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [isSaved, setIsSaved]     = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [step0Error, setStep0Error] = useState('');
  const [step1Error, setStep1Error] = useState('');

  const [reservation, setReservation] = useState<{ reservation_id?: string } | null>(null);

  // ── Personal Information state ──
  const [lastName,    setLastName]    = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [middleName,  setMiddleName]  = useState('');
  const [suffix,      setSuffix]      = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [mobileCode,  setMobileCode]  = useState('+63');
  const [mobile,      setMobile]      = useState('');
  const [landline,    setLandline]    = useState('');
  const [email,       setEmail]       = useState('');
  const [gender,      setGender]      = useState('');
  const [tin,         setTin]         = useState('');
  const [noTin,       setNoTin]       = useState(false);

  // Citizenship picker
  const [citizenshipPickerOpen,   setCitizenshipPickerOpen]   = useState(false);
  const [citizenshipSearch,       setCitizenshipSearch]       = useState('');
  const [citizenshipPickerTarget, setCitizenshipPickerTarget] = useState<'primary' | number>('primary');
  const [hasMultipleCitizenship,  setHasMultipleCitizenship]  = useState(false);
  const [otherCitizenships,       setOtherCitizenships]       = useState<string[]>([]);

  // ── Employment Information state ──
  const [employer,         setEmployer]         = useState('');
  const [natureOfBusiness, setNatureOfBusiness] = useState('');
  const [employmentSector, setEmploymentSector] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [jobTitle,         setJobTitle]         = useState('');
  const [rank,             setRank]             = useState('');
  const [salaryRange,      setSalaryRange]      = useState('');
  const [workMobileCode,   setWorkMobileCode]   = useState('+63');
  const [workMobile,       setWorkMobile]       = useState('');
  const [workLandline,     setWorkLandline]     = useState('');
  const [workEmail,        setWorkEmail]        = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { setLoading(false); return; }
    const r = JSON.parse(raw);
    setReservation(r);
    if (!r.reservation_id) { setLoading(false); return; }

    Promise.all([
      fetchCoOwnerSpouse(r.reservation_id).catch(() => null),
      supabase.from('reservations').select('booking_review_status').eq('reservation_id', r.reservation_id).single(),
    ]).then(([info, { data: resRow }]) => {
      const brs = (resRow as any)?.booking_review_status ?? null;
      setIsSaved(!!info && LOCKED_STATUSES.includes(brs ?? ''));

      if (!info) return;
      setLastName(info.last_name ?? '');
      setFirstName(info.first_name ?? '');
      setMiddleName(info.middle_name ?? '');
      setSuffix(info.suffix ?? '');
      setGender(info.gender ?? '');
      const citizenshipParts = (info.citizenship ?? '').split(' | ').filter(Boolean);
      setCitizenship(citizenshipParts[0] ?? '');
      if (citizenshipParts.length > 1) {
        setHasMultipleCitizenship(true);
        setOtherCitizenships(citizenshipParts.slice(1));
      }
      setDateOfBirth(info.date_of_birth ?? '');
      setMobileCode(info.mobile_code ?? '+63');
      setMobile(info.mobile ?? '');
      setLandline(info.landline ?? '');
      setEmail(info.email ?? '');
      setTin(info.tin ?? '');
      setNoTin(info.no_tin ?? false);
      setEmployer(info.employer ?? '');
      setNatureOfBusiness(info.nature_of_business ?? '');
      setEmploymentSector(info.employment_sector ?? '');
      setEmploymentStatus(info.employment_status ?? '');
      setJobTitle(info.job_title ?? '');
      setRank(info.rank ?? '');
      setSalaryRange(info.salary_range ?? '');
      setWorkMobileCode(info.work_mobile_code ?? '+63');
      setWorkMobile(info.work_mobile ?? '');
      setWorkLandline(info.work_landline ?? '');
      setWorkEmail(info.work_email ?? '');
    }).catch(err => console.error('[co-owner-spouse] load error:', err))
      .finally(() => setLoading(false));
  }, []);

  function handleNextFromStep0() {
    if (isSaved) { setStep(1); return; }
    if (!lastName.trim())        { setStep0Error('Please enter the last name.'); return; }
    if (!firstName.trim())       { setStep0Error('Please enter the first name.'); return; }
    if (!gender)                 { setStep0Error('Please select a gender.'); return; }
    if (!citizenship)            { setStep0Error('Please select a citizenship.'); return; }
    if (!dateOfBirth)            { setStep0Error('Please enter the date of birth.'); return; }
    if (!mobile.trim())          { setStep0Error('Please enter a mobile number.'); return; }
    if (!noTin && !tin.trim())   { setStep0Error('Please enter the TIN, or mark "No TIN".'); return; }
    setStep0Error('');
    setStep(1);
  }

  const isEmployed = employmentStatus === 'Employee' || employmentStatus === 'Self Employed';

  function handleSaveClick() {
    if (isSaved) { handleSave(); return; }
    if (!employmentStatus)               { setStep1Error('Please select an employment status.'); return; }
    if (isEmployed) {
      if (!employer.trim())              { setStep1Error('Please enter an employer / business.'); return; }
      if (!natureOfBusiness)             { setStep1Error('Please select a nature of business.'); return; }
      if (!employmentSector)             { setStep1Error('Please select an employment sector.'); return; }
      if (!jobTitle.trim())              { setStep1Error('Please enter a job title / position.'); return; }
      if (!rank)                         { setStep1Error('Please select a rank.'); return; }
      if (!salaryRange)                  { setStep1Error('Please select a salary range.'); return; }
      if (!workMobile.trim())            { setStep1Error('Please enter a work mobile number.'); return; }
    }
    setStep1Error('');
    setShowConfirmModal(true);
  }

  async function handleSave() {
    if (isSaved) { router.push('/sales/booking/detail'); return; }
    setIsSaving(true);
    try {
      await saveCoOwnerSpouse({
        reservation_id: reservation?.reservation_id ?? '',
        last_name: lastName, first_name: firstName, middle_name: middleName, suffix,
        gender, civil_status: 'Married',
        citizenship: [citizenship, ...otherCitizenships.filter(Boolean)].join(' | '),
        date_of_birth: dateOfBirth,
        mobile_code: mobileCode, mobile, landline, email,
        tin: noTin ? '' : tin, no_tin: noTin,
        employer, nature_of_business: natureOfBusiness,
        employment_sector: employmentSector, employment_status: employmentStatus,
        job_title: jobTitle, rank, salary_range: salaryRange,
        work_mobile_code: workMobileCode, work_mobile: workMobile,
        work_landline: workLandline, work_email: workEmail,
      });
      if (reservation?.reservation_id) {
        await supabase
          .from('reservations')
          .update({ co_owner_spouse_info_saved: true })
          .eq('reservation_id', reservation.reservation_id);
      }
      router.push('/sales/booking/detail');
    } catch (err) {
      alert('Failed to save. Please try again.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return (
    <PageShell title="Co-Owner Spouse Information" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-[#C03D25] animate-spin" />
      </div>
    </PageShell>
  );

  // ── Citizenship full-page picker ─────────────────────────────────────────
  const filteredCitizenships = citizenshipSearch
    ? CITIZENSHIP_LIST.filter(c => c.toLowerCase().includes(citizenshipSearch.toLowerCase()))
    : CITIZENSHIP_LIST;

  if (citizenshipPickerOpen) return (
    <PageShell title="Select Citizenship" backButton onBack={() => setCitizenshipPickerOpen(false)}>
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-black/[0.08]">
        <Search size={14} className="text-[#C7C7CC] shrink-0" />
        <input autoFocus type="text" value={citizenshipSearch} onChange={e => setCitizenshipSearch(e.target.value)}
          placeholder="Search citizenship..." className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]" />
        {citizenshipSearch && <button type="button" onClick={() => setCitizenshipSearch('')}><X size={13} className="text-[#C7C7CC]" /></button>}
      </div>
      <div className="bg-white rounded-2xl overflow-hidden border border-black/[0.06] mt-2">
        {filteredCitizenships.map(c => {
          const currentVal = citizenshipPickerTarget === 'primary'
            ? citizenship
            : otherCitizenships[citizenshipPickerTarget as number] ?? '';
          return (
            <button key={c} type="button"
              onClick={() => {
                if (citizenshipPickerTarget === 'primary') {
                  setCitizenship(c);
                } else {
                  const idx = citizenshipPickerTarget as number;
                  setOtherCitizenships(prev => prev.map((v, i) => i === idx ? c : v));
                }
                setCitizenshipPickerOpen(false);
                setCitizenshipSearch('');
              }}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                c === currentVal ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
              }`}>
              {c}
              {c === currentVal && <Check size={13} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </PageShell>
  );

  // ── Step 0: Personal Information ─────────────────────────────────────────
  if (step === 0) return (
    <PageShell title="Co-Owner Spouse Information" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="space-y-4 pb-6">
        <StepIndicator current={1} total={2} />

        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>

          <InputRow label="Last Name" icon={<User size={11} />} required>
            <TextInput value={lastName} onChange={v => setLastName(v.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="e.g. Santos" disabled={isSaved} />
          </InputRow>
          <InputRow label="First Name" icon={<User size={11} />} required>
            <TextInput value={firstName} onChange={v => setFirstName(v.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="e.g. Maria" disabled={isSaved} />
          </InputRow>
          <InputRow label="Middle Name" icon={<User size={11} />}>
            <TextInput value={middleName} onChange={v => setMiddleName(v.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="e.g. Cruz" disabled={isSaved} />
          </InputRow>
          <InputRow label="Suffix" icon={<User size={11} />}>
            <TextInput value={suffix} onChange={setSuffix} placeholder="e.g. Jr." disabled={isSaved} />
          </InputRow>
          <InputRow label="Gender" icon={<User size={11} />} required>
            <SelectInput value={gender} options={GENDER_OPTIONS} onChange={setGender} placeholder="Select gender" disabled={isSaved} />
          </InputRow>
          <InputRow label="Civil Status" icon={<Heart size={11} />}>
            <SelectInput value="Married" options={CIVIL_STATUS_OPTIONS} onChange={() => {}} placeholder="" disabled />
          </InputRow>

          {/* Citizenship — primary */}
          <InputRow label={hasMultipleCitizenship ? 'Citizenship 1' : 'Citizenship'} icon={<Globe size={11} />} required={!isSaved}>
            {isSaved
              ? <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
                  {[citizenship, ...otherCitizenships.filter(Boolean)].join(', ') || '—'}
                </div>
              : <div role="button" tabIndex={0}
                  onClick={() => { setCitizenshipPickerTarget('primary'); setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
                  onKeyDown={e => e.key === 'Enter' && (setCitizenshipPickerTarget('primary'), setCitizenshipSearch(''), setCitizenshipPickerOpen(true))}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.10] bg-[#F2F2F7] cursor-pointer">
                  <span className={`text-sm ${citizenship ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                    {citizenship || 'Select citizenship'}
                  </span>
                  {citizenship
                    ? <button type="button" onClick={e => { e.stopPropagation(); setCitizenship(''); }}>
                        <X size={13} className="text-[#C7C7CC]" />
                      </button>
                    : <ChevronDown size={14} className="text-[#C7C7CC] shrink-0" />
                  }
                </div>
            }
          </InputRow>

          {/* Multiple citizenship toggle */}
          {!isSaved && (
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                <Globe size={11} /> Multiple Citizenship
              </label>
              <button type="button"
                onClick={() => { setHasMultipleCitizenship(p => { if (p) setOtherCitizenships([]); return !p; }); }}
                className="relative rounded-full shrink-0 transition-all duration-300 focus:outline-none"
                style={{ width: 52, height: 28, background: hasMultipleCitizenship ? 'linear-gradient(90deg, #E05A3A 0%, #C03D25 100%)' : 'rgba(0,0,0,0.15)' }}>
                <span className="absolute bg-white rounded-full transition-all duration-300"
                  style={{ width: 24, height: 24, top: 2, left: hasMultipleCitizenship ? 26 : 2, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
              </button>
            </div>
          )}

          {/* Secondary citizenships */}
          {hasMultipleCitizenship && !isSaved && (
            <>
              {otherCitizenships.map((c, i) => (
                <InputRow key={i} label={`Citizenship ${i + 2}`} icon={<Globe size={11} />}>
                  <div className="flex gap-2">
                    <div role="button" tabIndex={0}
                      onClick={() => { setCitizenshipPickerTarget(i); setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
                      onKeyDown={e => e.key === 'Enter' && (setCitizenshipPickerTarget(i), setCitizenshipSearch(''), setCitizenshipPickerOpen(true))}
                      className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.10] bg-[#F2F2F7] cursor-pointer">
                      <span className={`text-sm ${c ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                        {c || 'Select citizenship'}
                      </span>
                      {c
                        ? <button type="button" onClick={e => { e.stopPropagation(); setOtherCitizenships(prev => prev.map((v, j) => j === i ? '' : v)); }}>
                            <X size={13} className="text-[#C7C7CC]" />
                          </button>
                        : <ChevronDown size={14} className="text-[#C7C7CC] shrink-0" />
                      }
                    </div>
                    <button type="button"
                      onClick={() => setOtherCitizenships(prev => prev.filter((_, j) => j !== i))}
                      className="w-10 flex items-center justify-center rounded-xl border border-black/[0.10] bg-[#F2F2F7] active:opacity-70 shrink-0">
                      <X size={14} className="text-[#8E8E93]" />
                    </button>
                  </div>
                </InputRow>
              ))}
              <button type="button"
                onClick={() => setOtherCitizenships(prev => [...prev, ''])}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-black/[0.15] bg-[#F2F2F7]/50 text-xs font-medium text-[#6C6C70] active:opacity-70">
                + Add Citizenship
              </button>
            </>
          )}

          <InputRow label="Date of Birth" icon={<Calendar size={11} />} required={!isSaved}>
            <DatePickerInput value={dateOfBirth} onChange={setDateOfBirth} disabled={isSaved} />
          </InputRow>
          <InputRow label="Mobile No." icon={<Phone size={11} />} required={!isSaved}>
            <PhoneInputField code={mobileCode} onCodeChange={setMobileCode} number={mobile} onNumberChange={setMobile} disabled={isSaved} />
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            <input type="tel" value={landline}
              onChange={e => setLandline(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 028XXXXXXX" disabled={isSaved}
              className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70]" />
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />}>
            <TextInput value={email} onChange={setEmail} placeholder="email@example.com" disabled={isSaved} />
          </InputRow>
          <InputRow label="Tax ID No. (TIN)" icon={<CreditCard size={11} />} required={!noTin}>
            <TextInput value={noTin ? '' : tin} onChange={setTin}
              placeholder={noTin ? 'No TIN' : 'XXX-XXX-XXX'} disabled={noTin || isSaved} />
          </InputRow>
          {!isSaved && (
            <button type="button" onClick={() => { setNoTin(p => !p); if (!noTin) setTin(''); }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                noTin ? 'bg-[#C03D25] border-[#C03D25] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
              }`}>
              {noTin && <Check size={13} />}<FileText size={14} />No TIN
            </button>
          )}
          {isSaved && noTin && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-200">
              <FileText size={11} className="text-amber-600" />
              <span className="text-[10px] font-semibold text-amber-700">No TIN</span>
            </div>
          )}
          {noTin && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                The co-owner's spouse agrees to fill the BIR Form 1904 and register with BIR within 30 days from the reservation of payment.
              </p>
            </div>
          )}
        </GlassCard>

        {step0Error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">{step0Error}</p>
          </div>
        )}

        <button type="button" onClick={handleNextFromStep0}
          className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity">
          Next
        </button>
      </div>
    </PageShell>
  );

  // ── Step 1: Employment Information ───────────────────────────────────────
  return (
    <PageShell title="Co-Owner Spouse Information" backButton onBack={() => setStep(0)}>
      <div className="space-y-4 pb-6">
        <StepIndicator current={2} total={2} />

        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Employment Information</p>

          <InputRow label="Employment Status" icon={<Briefcase size={11} />} required={!isSaved}>
            <SelectInput value={employmentStatus} options={EMPLOYMENT_STATUS_OPTS} onChange={setEmploymentStatus} placeholder="Select employment status" disabled={isSaved} />
          </InputRow>
          {isEmployed && (
            <>
              <InputRow label="Employer / Business" icon={<Briefcase size={11} />} required={!isSaved}>
                <TextInput value={employer} onChange={setEmployer} placeholder="e.g. Megawide Construction" disabled={isSaved} />
              </InputRow>
              <InputRow label="Nature of Business" icon={<Briefcase size={11} />} required={!isSaved}>
                <SelectInput value={natureOfBusiness} options={NATURE_OF_BUSINESS_OPTS} onChange={setNatureOfBusiness} placeholder="Select nature of business" disabled={isSaved} />
              </InputRow>
              <InputRow label="Employment Sector" icon={<Briefcase size={11} />} required={!isSaved}>
                <SelectInput value={employmentSector} options={EMPLOYMENT_SECTOR_OPTS} onChange={setEmploymentSector} placeholder="Select employment sector" disabled={isSaved} />
              </InputRow>
              <InputRow label="Job Title / Position" icon={<User size={11} />} required={!isSaved}>
                <TextInput value={jobTitle} onChange={setJobTitle} placeholder="e.g. Software Engineer" disabled={isSaved} />
              </InputRow>
              <InputRow label="Rank" icon={<User size={11} />} required={!isSaved}>
                <SelectInput value={rank} options={RANK_OPTS} onChange={setRank} placeholder="Select rank" disabled={isSaved} />
              </InputRow>
              <InputRow label="Salary Range" icon={<DollarSign size={11} />} required={!isSaved}>
                <SelectInput value={salaryRange} options={SALARY_RANGE_OPTS} onChange={setSalaryRange} placeholder="Select salary range" disabled={isSaved} />
              </InputRow>
              <InputRow label="Mobile No." icon={<Phone size={11} />} required={!isSaved}>
                <PhoneInputField code={workMobileCode} onCodeChange={setWorkMobileCode} number={workMobile} onNumberChange={setWorkMobile} disabled={isSaved} />
              </InputRow>
              <InputRow label="Landline No." icon={<Phone size={11} />}>
                <input type="tel" value={workLandline}
                  onChange={e => setWorkLandline(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 028XXXXXXX" disabled={isSaved}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70]" />
              </InputRow>
              <InputRow label="Email Address" icon={<Mail size={11} />}>
                <TextInput value={workEmail} onChange={setWorkEmail} placeholder="work@email.com" disabled={isSaved} />
              </InputRow>
            </>
          )}
        </GlassCard>

        {step1Error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">{step1Error}</p>
          </div>
        )}

        <button type="button" onClick={handleSaveClick} disabled={isSaving}
          className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity disabled:opacity-60">
          {isSaving ? 'Saving...' : isSaved ? 'Done' : 'Save'}
        </button>
      </div>

      {/* ── Confirm save modal ── */}
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
                Please make sure all the information provided is correct before saving. This will be used for official booking documents.
              </p>
            </div>
            <button type="button" onClick={() => { setShowConfirmModal(false); handleSave(); }}
              className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
              Confirm &amp; Save
            </button>
            <button type="button" onClick={() => setShowConfirmModal(false)}
              className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Review Again
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
