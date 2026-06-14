'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import DatePickerInput from '@/components/ui/DatePickerInput';
import { fetchAllClients, updateBuyerInfo, fetchBuyerInfo, updateClient, ClientRecord } from '@/lib/clients';
import { supabase } from '@/lib/supabase';
import { COUNTRY_CODES } from '@/lib/client-form-options';
import {
  Hash, Building2, Tag, User, Users, UserCheck,
  Check, CheckCircle2, ChevronDown, X, Phone, Mail, CreditCard,
  AlertCircle, FileText, Gavel, Globe, Heart, Calendar,
  Home, MapPin, Search, Briefcase, DollarSign, Loader2,
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
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] disabled:opacity-40"
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
                  o.label === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
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
const LOCKED_STATUSES          = ['submitted', 'director-approved', 'amd-approved'];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BuyerInfoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  const [reservation, setReservation] = useState<{
    reservation_id?: string; project?: string; inventory_code?: string; client_name?: string;
  } | null>(null);

  // ── Step 0: Personal Information state ──
  const [isSaving,          setIsSaving]          = useState(false);
  const [isSaved,           setIsSaved]           = useState(false);
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [hasCoOwnership,    setHasCoOwnership]    = useState(false);
  const [hasAttyInFact,     setHasAttyInFact]     = useState(false);
  const [step0Error,        setStep0Error]        = useState('');
  const [clientRecord, setClientRecord] = useState<ClientRecord | null>(null);
  const [clientUuid,   setClientUuid]   = useState('');
  const [clientId,    setClientId]    = useState('');
  const [lastName,    setLastName]    = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [middleName,  setMiddleName]  = useState('');
  const [suffix,      setSuffix]      = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [mobileCode,  setMobileCode]  = useState('+63');
  const [mobileNumber,setMobileNumber]= useState('');
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

  // Load reservation + auto-fill from client record
  useEffect(() => {
    const raw = sessionStorage.getItem('selectedReservation');
    if (!raw) { setLoading(false); return; }
    const r = JSON.parse(raw);
    setReservation(r);

    if (!r.reservation_id) { setLoading(false); return; }

    // Fetch clients list and reservation row in parallel
    Promise.all([
      fetchAllClients().catch(() => [] as ClientRecord[]),
      supabase
        .from('reservations')
        .select('client_id, booking_review_status')
        .eq('reservation_id', r.reservation_id)
        .single(),
    ]).then(async ([clients, { data: resRow }]) => {
      const clientIdFromRes = (resRow as any)?.client_id ?? null;
      const brs             = (resRow as any)?.booking_review_status ?? null;

      // Match by display client_id first, fall back to name for legacy records
      const match: ClientRecord | null =
        (clientIdFromRes ? clients.find(c => c.client_id === clientIdFromRes) : null)
        ?? clients.find(c =>
            [c.first_name, c.last_name, c.suffix].filter(Boolean).join(' ') === r.client_name
          )
        ?? null;

      if (!match) return; // client not found — fields stay blank but spinner clears via finally

      setClientRecord(match);
      setClientUuid(match.id);
      setClientId(match.client_id ?? '');
      setLastName(match.last_name ?? '');
      setFirstName(match.first_name ?? '');
      setMiddleName(match.middle_name ?? '');
      setSuffix(match.suffix ?? '');
      setCitizenship(match.citizenship ?? '');
      setDateOfBirth(match.date_of_birth ?? '');
      setMobileCode(match.country_code ?? '+63');
      setMobileNumber(match.mobile_number ?? '');
      setLandline(match.landline_no ?? '');
      setEmail(match.email ?? '');

      // Fetch previously saved buyer info
      const info = await fetchBuyerInfo(match.id).catch(() => null);

      setIsSaved(LOCKED_STATUSES.includes(brs ?? ''));

      if (!info?.buyer_info_saved) return; // first time filling out — client fields already set above

      setHasCoOwnership(info.has_co_ownership ?? false);
      setHasAttyInFact(info.has_atty_in_fact ?? false);
      setGender(info.gender ?? '');
      setCivilStatus(info.civil_status ?? '');

      // Sync has_spouse on the reservation so the spouse step stays correct
      await supabase
        .from('reservations')
        .update({ has_spouse: info.civil_status === 'Married' })
        .eq('reservation_id', r.reservation_id);

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
    })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Validate Step 0 before advancing ─────────────────────────────────────
  function handleNextFromStep0() {
    if (isSaved) { setStep(1); return; }
    if (!lastName.trim())  { setStep0Error('Please enter a last name.'); return; }
    if (!firstName.trim()) { setStep0Error('Please enter a first name.'); return; }
    if (!gender)           { setStep0Error('Please select a gender.'); return; }
    if (!civilStatus)      { setStep0Error('Please select civil status.'); return; }
    if (!noTin && !tin.trim()) { setStep0Error('Please enter a TIN or check "No TIN".'); return; }
    setStep0Error('');
    setStep(1);
  }

  // ── Save + confirmation flow ──────────────────────────────────────────────
  async function handleSave() {
    if (!clientUuid) return;
    setIsSaving(true);
    try {
      await updateBuyerInfo(clientUuid, {
        gender, civil_status: civilStatus,
        tin: noTin ? '' : tin, no_tin: noTin,
        has_co_ownership: hasCoOwnership,
        has_atty_in_fact: hasAttyInFact,
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
      });
      // Save editable personal fields back to the clients record
      if (clientRecord) {
        await updateClient(clientUuid, {
          client_type: clientRecord.client_type,
          last_name: lastName, first_name: firstName,
          middle_name: middleName, suffix: suffix,
          gender, civil_status: civilStatus,
          date_of_birth: dateOfBirth,
          citizenship,
          country_code: mobileCode,
          mobile_number: mobileNumber,
          landline_no: landline,
          email,
          reason_for_buying: clientRecord.reason_for_buying ?? '',
          source_of_sale: clientRecord.source_of_sale ?? '',
          monthly_household_income: clientRecord.monthly_household_income ?? '',
          seller_type: clientRecord.seller_type ?? undefined,
          sales_director: clientRecord.sales_director ?? undefined,
          sales_manager: clientRecord.sales_manager ?? undefined,
          property_specialist: clientRecord.property_specialist ?? undefined,
          broker_director_head: clientRecord.broker_director_head ?? undefined,
          broker_network_officer: clientRecord.broker_network_officer ?? undefined,
          broker_bir_name: clientRecord.broker_bir_name ?? undefined,
          broker_network_associate: clientRecord.broker_network_associate ?? undefined,
        });
      }
      // Sync reservation: has_spouse + client_name (denormalized — keep in sync with name edits)
      if (reservation?.reservation_id) {
        const fullName = [firstName.trim(), lastName.trim(), suffix.trim()].filter(Boolean).join(' ');
        await supabase
          .from('reservations')
          .update({ has_spouse: civilStatus === 'Married', client_name: fullName })
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
    <PageShell title="Buyer Information" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="text-[#C03D25] animate-spin" />
      </div>
    </PageShell>
  );

  // ── Step 0: Personal Information ─────────────────────────────────────────
  if (step === 0) return (
    <PageShell title="Buyer Information" backButton onBack={() => router.push('/sales/booking/detail')}>
      <div className="space-y-4 pb-6">

        <StepIndicator current={1} total={3} />

        {isSaved && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#F2F2F7] border border-black/[0.06]">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E5E5EA] text-[#6C6C70]">View Only</span>
            <p className="text-xs text-[#8E8E93]">Submitted for review — no edits allowed</p>
          </div>
        )}

        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>

          <ReadOnlyField label="Client ID" icon={<UserCheck size={11} />} value={clientId} />
          <InputRow label="Last Name" icon={<User size={11} />} required={!isSaved}>
            <TextInput value={lastName} onChange={setLastName} placeholder="e.g. Santos" disabled={isSaved} />
          </InputRow>
          <InputRow label="First Name" icon={<User size={11} />} required={!isSaved}>
            <TextInput value={firstName} onChange={setFirstName} placeholder="e.g. Maria" disabled={isSaved} />
          </InputRow>
          <InputRow label="Middle Name" icon={<User size={11} />}>
            <TextInput value={middleName} onChange={setMiddleName} placeholder="e.g. Cruz" disabled={isSaved} />
          </InputRow>
          <InputRow label="Suffix" icon={<User size={11} />}>
            <TextInput value={suffix} onChange={setSuffix} placeholder="e.g. Jr., Sr., III" disabled={isSaved} />
          </InputRow>

          <InputRow label="Gender" icon={<User size={11} />} required={!isSaved}>
            <SelectInput value={gender} options={GENDER_OPTIONS} onChange={v => { setGender(v); setStep0Error(''); }} placeholder="Select gender" disabled={isSaved} />
          </InputRow>
          <InputRow label="Civil Status" icon={<Heart size={11} />} required={!isSaved}>
            <SelectInput value={civilStatus} options={CIVIL_STATUS_OPTIONS} onChange={v => { setCivilStatus(v); setStep0Error(''); }} placeholder="Select civil status" disabled={isSaved} />
          </InputRow>

          <InputRow label="Citizenship" icon={<Globe size={11} />}>
            <SearchableSelect value={citizenship} options={COUNTRY_OPTIONS} onChange={setCitizenship} placeholder="Select citizenship" disabled={isSaved} />
          </InputRow>
          <InputRow label="Date of Birth" icon={<Calendar size={11} />}>
            <DatePickerInput value={dateOfBirth} onChange={setDateOfBirth} disabled={isSaved} />
          </InputRow>
          <InputRow label="Mobile No." icon={<Phone size={11} />} required={!isSaved}>
            <PhoneInputField code={mobileCode} onCodeChange={setMobileCode} number={mobileNumber} onNumberChange={setMobileNumber} disabled={isSaved} />
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            <TextInput value={landline} onChange={setLandline} placeholder="e.g. 028XXXXXXX" disabled={isSaved} />
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />}>
            <TextInput value={email} onChange={setEmail} placeholder="e.g. name@email.com" disabled={isSaved} />
          </InputRow>

          <InputRow label="Tax ID No. (TIN)" icon={<CreditCard size={11} />} required={!noTin && !isSaved}>
            <TextInput value={noTin ? '' : tin} onChange={v => { setTin(v); setStep0Error(''); }}
              placeholder={noTin ? 'No TIN' : 'XXX-XXX-XXX'} disabled={noTin || isSaved} />
          </InputRow>

          {!isSaved && (
            <button type="button" onClick={() => { setNoTin(p => !p); if (!noTin) setTin(''); setStep0Error(''); }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                noTin ? 'bg-[#C03D25] border-[#C03D25] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
              }`}>
              {noTin && <Check size={13} />}<FileText size={14} />No TIN
            </button>
          )}
          {isSaved && (
            <div className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold opacity-50 ${
              noTin ? 'bg-[#C03D25] border-[#C03D25] text-white' : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
            }`}>
              {noTin && <Check size={13} />}<FileText size={14} />No TIN
            </div>
          )}

          {noTin && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                The buyer agrees to fill the BIR Form 1904 and register with BIR within 30 days from the reservation of payment.
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

  // ── Step 1: Address Information ───────────────────────────────────────────
  if (step === 1) return (
    <PageShell title="Buyer Information" backButton onBack={() => setStep(0)}>
      <div className="space-y-4 pb-6">

        <StepIndicator current={2} total={3} />

        {isSaved && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#F2F2F7] border border-black/[0.06]">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E5E5EA] text-[#6C6C70]">View Only</span>
            <p className="text-xs text-[#8E8E93]">Submitted for review — no edits allowed</p>
          </div>
        )}

        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Address Information</p>

          <InputRow label="Home Ownership" icon={<Home size={11} />}>
            <SelectInput value={homeOwnership} options={HOME_OWNERSHIP_OPTIONS} onChange={setHomeOwnership} placeholder="Select home ownership" disabled={isSaved} />
          </InputRow>
          <InputRow label="Country" icon={<Globe size={11} />}>
            <SearchableSelect value={country} options={COUNTRY_OPTIONS} onChange={setCountry} placeholder="Select country" disabled={isSaved} />
          </InputRow>
          <InputRow label="Region / Province" icon={<MapPin size={11} />}>
            <TextInput value={regionProvince} onChange={setRegionProvince} placeholder="e.g. Metro Manila" disabled={isSaved} />
          </InputRow>
          <InputRow label="City / Municipality" icon={<MapPin size={11} />}>
            <TextInput value={cityMunicipality} onChange={setCityMunicipality} placeholder="e.g. Quezon City" disabled={isSaved} />
          </InputRow>
          <InputRow label="Barangay / Address Line 1" icon={<MapPin size={11} />}>
            <TextInput value={barangayLine1} onChange={setBarangayLine1} placeholder="e.g. Brgy. Commonwealth" disabled={isSaved} />
          </InputRow>
          <InputRow label="Street / Subdivision / Village / Address Line 2" icon={<MapPin size={11} />}>
            <TextInput value={streetLine2} onChange={setStreetLine2} placeholder="e.g. Batangas St." disabled={isSaved} />
          </InputRow>
          <InputRow label="Unit / Building / House / Block No." icon={<Building2 size={11} />}>
            <TextInput value={unitNo} onChange={setUnitNo} placeholder="e.g. Unit 12B" disabled={isSaved} />
          </InputRow>
        </GlassCard>

        <button type="button" onClick={() => setStep(2)}
          className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity">
          Next
        </button>
      </div>
    </PageShell>
  );

  // ── Step 2: Employment + Work Address ─────────────────────────────────────
  return (
    <PageShell title="Buyer Information" backButton onBack={() => setStep(1)}>
      <div className="space-y-4 pb-6">

        <StepIndicator current={3} total={3} />

        {isSaved && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#F2F2F7] border border-black/[0.06]">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E5E5EA] text-[#6C6C70]">View Only</span>
            <p className="text-xs text-[#8E8E93]">Submitted for review — no edits allowed</p>
          </div>
        )}

        {/* Employment Information */}
        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Employment Information</p>

          <InputRow label="Employer / Business" icon={<Briefcase size={11} />}>
            <TextInput value={employer} onChange={setEmployer} placeholder="e.g. Megawide Construction" disabled={isSaved} />
          </InputRow>
          <InputRow label="Nature of Business" icon={<Briefcase size={11} />}>
            <SelectInput value={natureOfBusiness} options={NATURE_OF_BUSINESS_OPTS} onChange={setNatureOfBusiness} placeholder="Select nature of business" disabled={isSaved} />
          </InputRow>
          <InputRow label="Employment Sector" icon={<Briefcase size={11} />}>
            <SelectInput value={employmentSector} options={EMPLOYMENT_SECTOR_OPTS} onChange={setEmploymentSector} placeholder="Select employment sector" disabled={isSaved} />
          </InputRow>
          <InputRow label="Employment Status" icon={<Briefcase size={11} />}>
            <SelectInput value={employmentStatus} options={EMPLOYMENT_STATUS_OPTS} onChange={setEmploymentStatus} placeholder="Select employment status" disabled={isSaved} />
          </InputRow>
          <InputRow label="Job Title / Position" icon={<User size={11} />}>
            <TextInput value={jobTitle} onChange={setJobTitle} placeholder="e.g. Software Engineer" disabled={isSaved} />
          </InputRow>
          <InputRow label="Rank" icon={<User size={11} />}>
            <SelectInput value={rank} options={RANK_OPTS} onChange={setRank} placeholder="Select rank" disabled={isSaved} />
          </InputRow>
          <InputRow label="Salary Range" icon={<DollarSign size={11} />}>
            <SelectInput value={salaryRange} options={SALARY_RANGE_OPTS} onChange={setSalaryRange} placeholder="Select salary range" disabled={isSaved} />
          </InputRow>
          <InputRow label="Mobile No." icon={<Phone size={11} />}>
            <PhoneInputField code={workMobileCode} onCodeChange={setWorkMobileCode} number={workMobile} onNumberChange={setWorkMobile} disabled={isSaved} />
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            {isSaved
              ? <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70]">{workLandline || '—'}</div>
              : <input type="tel" value={workLandline}
                  onChange={e => setWorkLandline(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 028XXXXXXX"
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]" />
            }
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />}>
            <TextInput value={workEmail} onChange={setWorkEmail} placeholder="work@email.com" disabled={isSaved} />
          </InputRow>
        </GlassCard>

        {/* Work Address Information */}
        <GlassCard className="p-4 space-y-4">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Work Address Information</p>

          <InputRow label="Country" icon={<Globe size={11} />}>
            <SearchableSelect value={workCountry} options={COUNTRY_OPTIONS} onChange={setWorkCountry} placeholder="Select country" disabled={isSaved} />
          </InputRow>
          <InputRow label="Region / Province" icon={<MapPin size={11} />}>
            <TextInput value={workRegionProvince} onChange={setWorkRegionProvince} placeholder="e.g. Metro Manila" disabled={isSaved} />
          </InputRow>
          <InputRow label="City / Municipality" icon={<MapPin size={11} />}>
            <TextInput value={workCityMunicipality} onChange={setWorkCityMunicipality} placeholder="e.g. Makati City" disabled={isSaved} />
          </InputRow>
          <InputRow label="Barangay" icon={<MapPin size={11} />}>
            <TextInput value={workBarangay} onChange={setWorkBarangay} placeholder="e.g. Brgy. Poblacion" disabled={isSaved} />
          </InputRow>
          <InputRow label="Street / Subdivision / Village" icon={<MapPin size={11} />}>
            <TextInput value={workStreet} onChange={setWorkStreet} placeholder="e.g. Ayala Ave." disabled={isSaved} />
          </InputRow>
          <InputRow label="Building / Unit No." icon={<Building2 size={11} />}>
            <TextInput value={workBuildingUnit} onChange={setWorkBuildingUnit} placeholder="e.g. 28F Tower 1" disabled={isSaved} />
          </InputRow>

          {/* Mailing Address */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
              <Mail size={11} /> Mailing Address
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MAILING_OPTS.map(opt => (
                <button key={opt} type="button"
                  onClick={() => !isSaved && setMailingType(p => p === opt ? '' : opt)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-semibold transition-all leading-tight text-center ${
                    mailingType === opt
                      ? 'bg-[#C03D25] border-[#C03D25] text-white'
                      : isSaved ? 'bg-[#F2F2F7]/50 border-transparent text-[#C7C7CC]'
                      : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                  }`}>
                  {mailingType === opt && <Check size={11} />}
                  {opt}
                </button>
              ))}
            </div>

            {/* Mailing address display / input */}
            {mailingType && mailingType !== 'Others' && (
              <div className="w-full px-3 py-2.5 rounded-xl border border-black/[0.06] bg-[#F2F2F7]/50 text-sm text-[#6C6C70] leading-relaxed">
                {mailingDisplay || '—'}
              </div>
            )}
            {mailingType === 'Others' && (
              <textarea
                value={mailingOther}
                onChange={e => setMailingOther(e.target.value)}
                placeholder="Enter mailing address..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC] resize-none"
              />
            )}
          </div>
        </GlassCard>

        {/* Save / Back button */}
        {isSaved ? (
          <button type="button"
            onClick={() => router.push('/sales/booking/detail')}
            className="w-full py-4 rounded-2xl bg-[#F2F2F7] text-[#6C6C70] text-sm font-bold active:opacity-80 transition-opacity">
            Back to Booking
          </button>
        ) : (
          <button type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={isSaving}
            className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-[0_4px_16px_rgba(192,61,37,0.35)] active:opacity-80 transition-opacity disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        )}

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
            <button type="button"
              onClick={() => { setShowConfirmModal(false); handleSave(); }}
              className="w-full py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
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
