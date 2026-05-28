'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { COUNTRY_CODES } from '@/lib/client-form-options';
import { saveCoOwner, fetchCoOwner } from '@/lib/co-owners';
import { supabase } from '@/lib/supabase';
import { fetchSpouseInfo, SpouseInfoRecord } from '@/lib/spouse-info';
import {
  Hash, Building2, Tag, User,
  Check, ChevronDown, X, Phone, Mail, CreditCard,
  AlertCircle, FileText, Gavel, Globe, Heart, Calendar,
  Home, MapPin, Search, Briefcase, DollarSign, CheckCircle2,
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
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] disabled:opacity-40"
    />
  );
}

function SelectInput({ value, options, onChange, placeholder, disabled }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder: string; disabled?: boolean;
}) {
  if (disabled) return (
    <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
      {value || '—'}
    </div>
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && ref.current)
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }, [open]);
  return (
    <div>
      <div role="button" tabIndex={0}
        onClick={() => setOpen(p => !p)}
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
                o === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E]'
              }`}>
              {o}{o === value && <Check size={13} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchableSelect({ value, options, onChange, placeholder, disabled }: {
  value: string; options: { label: string; flag?: string }[];
  onChange: (v: string) => void; placeholder: string; disabled?: boolean;
}) {
  if (disabled) return (
    <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">
      {value || '—'}
    </div>
  );
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    if (open && ref.current)
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }, [open]);
  return (
    <div>
      <div role="button" tabIndex={0}
        onClick={() => { setOpen(p => !p); setQuery(''); }}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer">
        <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>{value || placeholder}</span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}><X size={13} className="text-[#C7C7CC]" /></button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] transition-transform ${open ? 'rotate-180' : ''}`} />}
      </div>
      {open && (
        <div ref={ref} className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.06] bg-[#F2F2F7]">
            <Search size={13} className="text-[#C7C7CC] shrink-0" />
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search..." className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]" />
            {query && <button type="button" onClick={() => setQuery('')}><X size={11} className="text-[#C7C7CC]" /></button>}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(o => (
              <button key={o.label} type="button"
                onClick={() => { onChange(o.label); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                  o.label === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E]'
                }`}>
                <span className="flex items-center gap-2">{o.flag && <span>{o.flag}</span>}{o.label}</span>
                {o.label === value && <Check size={13} className="shrink-0" />}
              </button>
            )) : <p className="text-center text-xs text-[#8E8E93] py-3">No results</p>}
          </div>
        </div>
      )}
    </div>
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
                  c.dial === code ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E]'
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

function ReadOnlyRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-black/[0.06] last:border-0">
      <span className="text-[#E8634A] shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium text-[#1C1C1E]">{label}</span>
      <span className="text-sm text-right text-[#6C6C70] max-w-[180px] truncate">{value || '—'}</span>
    </div>
  );
}

function NextButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold shadow-[0_4px_16px_rgba(232,99,74,0.35)] active:opacity-80 transition-opacity">
      Next
    </button>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GENDER_OPTIONS           = ['Male', 'Female', 'Non Binary'];
const CIVIL_STATUS_OPTIONS     = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'];
const HOME_OWNERSHIP_OPTIONS   = ['Owned', 'Rented', 'Living with Parents', 'Others'];
const NATURE_OF_BUSINESS_OPTS  = ['Media & Entertainment', 'Hospitality', 'IT / Technology', 'Healthcare', 'Real Estate', 'Retail', 'Construction', 'Others'];
const EMPLOYMENT_SECTOR_OPTS   = ['Not Applicable', 'Private', 'Public'];
const EMPLOYMENT_STATUS_OPTS   = ['Employee', 'Self Employed', 'Student', 'Unemployed', 'Others'];
const RANK_OPTS                = ['Executive', 'Managerial', 'Supervisor', 'Rank & File'];
const SALARY_RANGE_OPTS        = ['50,000 and Below', '50,001 to 80,000', '80,001 to 120,000', '120,001 to 150,000', '150,001 to 200,000', '200,001 and Above'];
const MAILING_OPTS             = ['Home Address', 'Office Address', 'Others'];
const COUNTRY_OPTIONS          = COUNTRY_CODES.map(c => ({ label: c.name, flag: c.flag }));

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CoOwnerPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSaving,         setIsSaving]         = useState(false);
  const [isSaved,          setIsSaved]          = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hasAttyInFact,    setHasAttyInFact]    = useState(false);
  const [spouseInfo,       setSpouseInfo]       = useState<SpouseInfoRecord | null>(null);
  const [sameAsSpouse,     setSameAsSpouse]     = useState(false);

  const [reservation, setReservation] = useState<{
    reservation_id?: string; project?: string; inventory_code?: string;
  } | null>(null);

  // ── Step 0: Personal Information state ──
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
  const [civilStatus, setCivilStatus] = useState('');
  const [tin,         setTin]         = useState('');
  const [noTin,       setNoTin]       = useState(false);

  // ── Step 1: Address Information state ──
  const [homeOwnership,    setHomeOwnership]    = useState('');
  const [country,          setCountry]          = useState('Philippines');
  const [regionProvince,   setRegionProvince]   = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [barangayLine1,    setBarangayLine1]    = useState('');
  const [streetLine2,      setStreetLine2]      = useState('');
  const [unitNo,           setUnitNo]           = useState('');

  // ── Step 2: Employment Information state ──
  const [employer,          setEmployer]          = useState('');
  const [natureOfBusiness,  setNatureOfBusiness]  = useState('');
  const [employmentSector,  setEmploymentSector]  = useState('');
  const [employmentStatus,  setEmploymentStatus]  = useState('');
  const [jobTitle,          setJobTitle]          = useState('');
  const [rank,              setRank]              = useState('');
  const [salaryRange,       setSalaryRange]       = useState('');
  const [workMobileCode,    setWorkMobileCode]    = useState('+63');
  const [workMobile,        setWorkMobile]        = useState('');
  const [workLandline,      setWorkLandline]      = useState('');
  const [workEmail,         setWorkEmail]         = useState('');

  // ── Step 2: Work Address state ──
  const [workCountry,          setWorkCountry]          = useState('Philippines');
  const [workRegionProvince,   setWorkRegionProvince]   = useState('');
  const [workCityMunicipality, setWorkCityMunicipality] = useState('');
  const [workBarangay,         setWorkBarangay]         = useState('');
  const [workStreet,           setWorkStreet]           = useState('');
  const [workBuildingUnit,     setWorkBuildingUnit]     = useState('');
  const [mailingType,          setMailingType]          = useState('');
  const [mailingOther,         setMailingOther]         = useState('');

  // Derived mailing address text
  const homeAddressText   = [unitNo, barangayLine1, streetLine2, cityMunicipality, regionProvince, country].filter(Boolean).join(', ');
  const officeAddressText = [workBuildingUnit, workBarangay, workStreet, workCityMunicipality, workRegionProvince, workCountry].filter(Boolean).join(', ');
  const mailingDisplay    = mailingType === 'Home Address' ? homeAddressText
                          : mailingType === 'Office Address' ? officeAddressText
                          : mailingOther;

  // Load reservation, existing co-owner data, and atty-in-fact flag
  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (raw) {
      const r = JSON.parse(raw);
      setReservation(r);
      if (r.reservation_id) {
        fetchSpouseInfo(r.reservation_id)
          .then(s => { if (s) setSpouseInfo(s); })
          .catch(() => {});
        fetchCoOwner(r.reservation_id).then(info => {
          console.log('[co-owner] fetchCoOwner result:', info);
          if (!info) { console.log('[co-owner] no data returned'); return; }
          setIsSaved(true);
          supabase.from('reservations').update({ co_owner_info_saved: true }).eq('reservation_id', r.reservation_id).then(() => {});
          setLastName(info.last_name ?? '');
          setFirstName(info.first_name ?? '');
          setMiddleName(info.middle_name ?? '');
          setSuffix(info.suffix ?? '');
          setGender(info.gender ?? '');
          setCivilStatus(info.civil_status ?? '');
          setCitizenship(info.citizenship ?? '');
          setDateOfBirth(info.date_of_birth ?? '');
          setMobileCode(info.mobile_code ?? '+63');
          setMobile(info.mobile ?? '');
          setLandline(info.landline ?? '');
          setEmail(info.email ?? '');
          setTin(info.tin ?? '');
          setNoTin(info.no_tin ?? false);
          setHomeOwnership(info.home_ownership ?? '');
          setCountry(info.home_country ?? 'Philippines');
          setRegionProvince(info.home_region_province ?? '');
          setCityMunicipality(info.home_city_municipality ?? '');
          setBarangayLine1(info.home_barangay ?? '');
          setStreetLine2(info.home_street ?? '');
          setUnitNo(info.home_unit ?? '');
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
          setWorkCountry(info.work_country ?? 'Philippines');
          setWorkRegionProvince(info.work_region_province ?? '');
          setWorkCityMunicipality(info.work_city_municipality ?? '');
          setWorkBarangay(info.work_barangay ?? '');
          setWorkStreet(info.work_street ?? '');
          setWorkBuildingUnit(info.work_building_unit ?? '');
          setMailingType(info.mailing_type ?? '');
          setMailingOther(info.mailing_other ?? '');
        }).catch(err => { console.error('[co-owner] fetchCoOwner error:', err); });
      }
    }
    const atty = sessionStorage.getItem('coowner_hasAttyInFact');
    setHasAttyInFact(atty === '1');
  }, []);

  // ── Copy spouse fields into co-owner form ────────────────────────────────
  function populateFromSpouse(checked: boolean) {
    setSameAsSpouse(checked);
    if (!checked || !spouseInfo) return;
    setLastName(spouseInfo.last_name ?? '');
    setFirstName(spouseInfo.first_name ?? '');
    setMiddleName(spouseInfo.middle_name ?? '');
    setSuffix(spouseInfo.suffix ?? '');
    setGender(spouseInfo.gender ?? '');
    setCivilStatus(spouseInfo.civil_status ?? '');
    setCitizenship(spouseInfo.citizenship ?? '');
    setDateOfBirth(spouseInfo.date_of_birth ?? '');
    setMobileCode(spouseInfo.mobile_code ?? '+63');
    setMobile(spouseInfo.mobile ?? '');
    setLandline(spouseInfo.landline ?? '');
    setEmail(spouseInfo.email ?? '');
    setTin(spouseInfo.tin ?? '');
    setNoTin(spouseInfo.no_tin ?? false);
    setHomeOwnership(spouseInfo.home_ownership ?? '');
    setCountry(spouseInfo.home_country ?? 'Philippines');
    setRegionProvince(spouseInfo.home_region_province ?? '');
    setCityMunicipality(spouseInfo.home_city_municipality ?? '');
    setBarangayLine1(spouseInfo.home_barangay ?? '');
    setStreetLine2(spouseInfo.home_street ?? '');
    setUnitNo(spouseInfo.home_unit ?? '');
    setEmployer(spouseInfo.employer ?? '');
    setNatureOfBusiness(spouseInfo.nature_of_business ?? '');
    setEmploymentSector(spouseInfo.employment_sector ?? '');
    setEmploymentStatus(spouseInfo.employment_status ?? '');
    setJobTitle(spouseInfo.job_title ?? '');
    setRank(spouseInfo.rank ?? '');
    setSalaryRange(spouseInfo.salary_range ?? '');
    setWorkMobileCode(spouseInfo.work_mobile_code ?? '+63');
    setWorkMobile(spouseInfo.work_mobile ?? '');
    setWorkLandline(spouseInfo.work_landline ?? '');
    setWorkEmail(spouseInfo.work_email ?? '');
    setWorkCountry(spouseInfo.work_country ?? 'Philippines');
    setWorkRegionProvince(spouseInfo.work_region_province ?? '');
    setWorkCityMunicipality(spouseInfo.work_city_municipality ?? '');
    setWorkBarangay(spouseInfo.work_barangay ?? '');
    setWorkStreet(spouseInfo.work_street ?? '');
    setWorkBuildingUnit(spouseInfo.work_building_unit ?? '');
    setMailingType(spouseInfo.mailing_type ?? '');
    setMailingOther(spouseInfo.mailing_other ?? '');
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (isSaved) { router.push('/sales/booking/detail'); return; }
    setIsSaving(true);
    try {
      await saveCoOwner({
        reservation_id: reservation?.reservation_id ?? '',
        last_name: lastName, first_name: firstName, middle_name: middleName, suffix,
        gender, civil_status: civilStatus, citizenship, date_of_birth: dateOfBirth,
        mobile_code: mobileCode, mobile, landline, email,
        tin: noTin ? '' : tin, no_tin: noTin,
        home_ownership: homeOwnership, home_country: country,
        home_region_province: regionProvince, home_city_municipality: cityMunicipality,
        home_barangay: barangayLine1, home_street: streetLine2, home_unit: unitNo,
        employer, nature_of_business: natureOfBusiness,
        employment_sector: employmentSector, employment_status: employmentStatus,
        job_title: jobTitle, rank, salary_range: salaryRange,
        work_mobile_code: workMobileCode, work_mobile: workMobile,
        work_landline: workLandline, work_email: workEmail,
        work_country: workCountry, work_region_province: workRegionProvince,
        work_city_municipality: workCityMunicipality, work_barangay: workBarangay,
        work_street: workStreet, work_building_unit: workBuildingUnit,
        mailing_type: mailingType, mailing_other: mailingOther,
        co_owner_is_spouse: sameAsSpouse,
      });
      if (reservation?.reservation_id) {
        await supabase
          .from('reservations')
          .update({ co_owner_info_saved: true })
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


  // ── Step 0: Personal Information ─────────────────────────────────────────
  if (step === 0) return (
    <PageShell title="Co-Owner Information" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="space-y-4 pb-6">

        {/* Same as Spouse checkbox — only shown when spouse info exists and form not yet saved */}
        {spouseInfo && !isSaved && (
          <GlassCard className="px-4 py-1">
            <button type="button" onClick={() => populateFromSpouse(!sameAsSpouse)}
              className="w-full flex items-center gap-3 py-3.5 text-left active:opacity-70">
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                sameAsSpouse ? 'bg-[#E8634A] border-[#E8634A]' : 'border-[#C7C7CC] bg-white'
              }`}>
                {sameAsSpouse && <Check size={12} className="text-white" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1C1C1E]">Co-owner is the same as Spouse</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">Auto-fill form with saved spouse details</p>
              </div>
            </button>
          </GlassCard>
        )}

        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>

          <InputRow label="Last Name" icon={<User size={11} />} required>
            <TextInput value={lastName} onChange={setLastName} placeholder="e.g. Santos" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="First Name" icon={<User size={11} />} required>
            <TextInput value={firstName} onChange={setFirstName} placeholder="e.g. Maria" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Middle Name" icon={<User size={11} />}>
            <TextInput value={middleName} onChange={setMiddleName} placeholder="e.g. Cruz" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Suffix" icon={<User size={11} />}>
            <TextInput value={suffix} onChange={setSuffix} placeholder="e.g. Jr." disabled={isSaved || sameAsSpouse} />
          </InputRow>

          <InputRow label="Gender" icon={<User size={11} />} required>
            <SelectInput value={gender} options={GENDER_OPTIONS} onChange={setGender} placeholder="Select gender" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Civil Status" icon={<Heart size={11} />} required>
            <SelectInput value={civilStatus} options={CIVIL_STATUS_OPTIONS} onChange={setCivilStatus} placeholder="Select civil status" disabled={isSaved || sameAsSpouse} />
          </InputRow>

          <InputRow label="Citizenship" icon={<Globe size={11} />}>
            <TextInput value={citizenship} onChange={setCitizenship} placeholder="e.g. Filipino" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Date of Birth" icon={<Calendar size={11} />}>
            <div className={`w-full flex items-center px-3 py-2.5 rounded-xl border overflow-hidden transition-colors ${isSaved ? 'border-black/[0.06] bg-[#F2F2F7]/50' : 'border-black/[0.1] bg-[#F2F2F7] focus-within:border-[#E8634A]/50 focus-within:bg-white'}`}>
              <input type="date" value={dateOfBirth} onChange={e => !isSaved && !sameAsSpouse && setDateOfBirth(e.target.value)}
                disabled={isSaved || sameAsSpouse}
                className="w-full min-w-0 bg-transparent text-sm text-[#1C1C1E] outline-none disabled:text-[#6C6C70]" />
            </div>
          </InputRow>
          <InputRow label="Mobile No." icon={<Phone size={11} />}>
            <PhoneInputField code={mobileCode} onCodeChange={setMobileCode} number={mobile} onNumberChange={setMobile} disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            <input type="tel" value={landline}
              onChange={e => setLandline(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 028XXXXXXX"
              disabled={isSaved || sameAsSpouse}
              className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70]" />
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />}>
            <TextInput value={email} onChange={setEmail} placeholder="email@example.com" disabled={isSaved || sameAsSpouse} />
          </InputRow>

          <InputRow label="Tax ID No. (TIN)" icon={<CreditCard size={11} />} required={!noTin}>
            <TextInput value={noTin ? '' : tin} onChange={setTin}
              placeholder={noTin ? 'No TIN' : 'XXX-XXX-XXX'} disabled={noTin || isSaved} />
          </InputRow>

          {!isSaved && (
            <button type="button" onClick={() => { if (sameAsSpouse) return; setNoTin(p => !p); if (!noTin) setTin(''); }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                noTin ? 'bg-[#E8634A] border-[#E8634A] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
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
                The co-owner agrees to fill the BIR Form 1904 and register with BIR within 30 days from the reservation of payment.
              </p>
            </div>
          )}
        </GlassCard>

        <NextButton onClick={() => setStep(1)} />
      </div>
    </PageShell>
  );

  // ── Step 1: Address Information ───────────────────────────────────────────
  if (step === 1) return (
    <PageShell title="Co-Owner Information" backButton onBack={() => setStep(0)}>
      <div className="space-y-4 pb-6">
        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Address Information</p>

          <InputRow label="Home Ownership" icon={<Home size={11} />}>
            <SelectInput value={homeOwnership} options={HOME_OWNERSHIP_OPTIONS} onChange={setHomeOwnership} placeholder="Select home ownership" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Country" icon={<Globe size={11} />}>
            <SearchableSelect value={country} options={COUNTRY_OPTIONS} onChange={setCountry} placeholder="Select country" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Region / Province" icon={<MapPin size={11} />}>
            <TextInput value={regionProvince} onChange={setRegionProvince} placeholder="e.g. Metro Manila" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="City / Municipality" icon={<MapPin size={11} />}>
            <TextInput value={cityMunicipality} onChange={setCityMunicipality} placeholder="e.g. Quezon City" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Barangay / Address Line 1" icon={<MapPin size={11} />}>
            <TextInput value={barangayLine1} onChange={setBarangayLine1} placeholder="e.g. Brgy. Commonwealth" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Street / Subdivision / Village / Address Line 2" icon={<MapPin size={11} />}>
            <TextInput value={streetLine2} onChange={setStreetLine2} placeholder="e.g. Batangas St." disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Unit / Building / House / Block No." icon={<Building2 size={11} />}>
            <TextInput value={unitNo} onChange={setUnitNo} placeholder="e.g. Unit 12B" disabled={isSaved || sameAsSpouse} />
          </InputRow>
        </GlassCard>

        <NextButton onClick={() => setStep(2)} />
      </div>
    </PageShell>
  );

  // ── Step 2: Employment + Work Address ─────────────────────────────────────
  return (
    <PageShell title="Co-Owner Information" backButton onBack={() => setStep(1)}>
      <div className="space-y-4 pb-6">

        {/* Employment Information */}
        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Employment Information</p>

          <InputRow label="Employer / Business" icon={<Briefcase size={11} />}>
            <TextInput value={employer} onChange={setEmployer} placeholder="e.g. Megawide Construction" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Nature of Business" icon={<Briefcase size={11} />}>
            <SelectInput value={natureOfBusiness} options={NATURE_OF_BUSINESS_OPTS} onChange={setNatureOfBusiness} placeholder="Select nature of business" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Employment Sector" icon={<Briefcase size={11} />}>
            <SelectInput value={employmentSector} options={EMPLOYMENT_SECTOR_OPTS} onChange={setEmploymentSector} placeholder="Select employment sector" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Employment Status" icon={<Briefcase size={11} />}>
            <SelectInput value={employmentStatus} options={EMPLOYMENT_STATUS_OPTS} onChange={setEmploymentStatus} placeholder="Select employment status" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Job Title / Position" icon={<User size={11} />}>
            <TextInput value={jobTitle} onChange={setJobTitle} placeholder="e.g. Software Engineer" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Rank" icon={<User size={11} />}>
            <SelectInput value={rank} options={RANK_OPTS} onChange={setRank} placeholder="Select rank" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Salary Range" icon={<DollarSign size={11} />}>
            <SelectInput value={salaryRange} options={SALARY_RANGE_OPTS} onChange={setSalaryRange} placeholder="Select salary range" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Mobile No." icon={<Phone size={11} />}>
            <PhoneInputField code={workMobileCode} onCodeChange={setWorkMobileCode} number={workMobile} onNumberChange={setWorkMobile} disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            <input type="tel" value={workLandline}
              onChange={e => setWorkLandline(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 028XXXXXXX"
              disabled={isSaved || sameAsSpouse}
              className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC] disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70]" />
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />}>
            <TextInput value={workEmail} onChange={setWorkEmail} placeholder="work@email.com" disabled={isSaved || sameAsSpouse} />
          </InputRow>
        </GlassCard>

        {/* Work Address Information */}
        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Work Address Information</p>

          <InputRow label="Country" icon={<Globe size={11} />}>
            <SearchableSelect value={workCountry} options={COUNTRY_OPTIONS} onChange={setWorkCountry} placeholder="Select country" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Region / Province" icon={<MapPin size={11} />}>
            <TextInput value={workRegionProvince} onChange={setWorkRegionProvince} placeholder="e.g. Metro Manila" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="City / Municipality" icon={<MapPin size={11} />}>
            <TextInput value={workCityMunicipality} onChange={setWorkCityMunicipality} placeholder="e.g. Makati City" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Barangay" icon={<MapPin size={11} />}>
            <TextInput value={workBarangay} onChange={setWorkBarangay} placeholder="e.g. Brgy. Poblacion" disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Street / Subdivision / Village" icon={<MapPin size={11} />}>
            <TextInput value={workStreet} onChange={setWorkStreet} placeholder="e.g. Ayala Ave." disabled={isSaved || sameAsSpouse} />
          </InputRow>
          <InputRow label="Building / Unit No." icon={<Building2 size={11} />}>
            <TextInput value={workBuildingUnit} onChange={setWorkBuildingUnit} placeholder="e.g. 28F Tower 1" disabled={isSaved || sameAsSpouse} />
          </InputRow>

          {/* Mailing Address */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
              <Mail size={11} /> Mailing Address
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MAILING_OPTS.map(opt => (
                <button key={opt} type="button"
                  onClick={() => !isSaved && !sameAsSpouse && setMailingType(p => p === opt ? '' : opt)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-semibold transition-all leading-tight text-center ${
                    mailingType === opt
                      ? 'bg-[#E8634A] border-[#E8634A] text-white'
                      : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                  } ${isSaved || sameAsSpouse ? 'opacity-60 cursor-default' : ''}`}>
                  {mailingType === opt && <Check size={11} />}
                  {opt}
                </button>
              ))}
            </div>

            {mailingType && mailingType !== 'Others' && (
              <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70] leading-relaxed">
                {mailingDisplay || '—'}
              </div>
            )}
            {mailingType === 'Others' && (
              <textarea
                value={mailingOther}
                onChange={e => !isSaved && !sameAsSpouse && setMailingOther(e.target.value)}
                placeholder="Enter mailing address..."
                rows={3}
                disabled={isSaved || sameAsSpouse}
                className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] resize-none disabled:border-black/[0.06] disabled:bg-[#F2F2F7]/50 disabled:text-[#6C6C70]"
              />
            )}
          </div>
        </GlassCard>

        {/* Save button */}
        <button type="button"
          onClick={() => isSaved ? handleSave() : setShowConfirmModal(true)}
          disabled={isSaving}
          className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold shadow-[0_4px_16px_rgba(232,99,74,0.35)] active:opacity-80 transition-opacity disabled:opacity-60">
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
              <div className="w-12 h-12 rounded-2xl bg-[rgba(232,99,74,0.12)] flex items-center justify-center">
                <CheckCircle2 size={24} className="text-[#E8634A]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Confirm Details</p>
              <p className="text-sm text-[#6C6C70] leading-relaxed">
                Please make sure all the information provided is correct before saving. This will be used for official booking documents.
              </p>
            </div>
            <button type="button"
              onClick={() => { setShowConfirmModal(false); handleSave(); }}
              className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80">
              Confirm & Save
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
