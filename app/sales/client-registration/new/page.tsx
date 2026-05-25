'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  X, Check, ChevronDown, Search, Loader2,
  Phone, Mail, Globe, User, Calendar, CheckCircle2,
  Heart, Briefcase, UserCog, Users,
} from 'lucide-react';
import {
  COUNTRY_CODES, CITIZENSHIP_LIST,
  REASON_OPTIONS, SOURCE_OPTIONS, INCOME_OPTIONS,
} from '@/lib/client-form-options';
import { saveClient } from '@/lib/clients';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchAllBrokers, BrokerRecord } from '@/lib/brokers';

const EMPTY_FORM = {
  clientType: 'Local' as 'Local' | 'International',
  lastName: '', firstName: '', middleName: '', suffix: '',
  dateOfBirth: '', citizenship: '', countryCode: '+63',
  mobileNumber: '', landlineNo: '', email: '',
  reasonForBuying: '', sourceOfSale: '', monthlyHouseholdIncome: '',
  sellerType: 'In House' as 'In House' | 'Broker',
};

// ── Helpers ───────────────────────────────────────────────────
function toProperCase(str: string) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Reusable components ───────────────────────────────────────
function InputRow({ label, icon, error, required, children }: {
  label: string; icon: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
        {icon} {label}
        {required && <span className="text-red-500 font-bold">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function SelectInput({ value, options, onChange, placeholder }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && optionsRef.current) {
      setTimeout(() => {
        optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 30);
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
          : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <div ref={optionsRef} className="mt-1 rounded-xl border border-black/[0.08] bg-white shadow-md overflow-hidden">
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

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
    />
  );
}

// ─────────────────────────────────────────────────────────────
export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm]               = useState(EMPTY_FORM);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [saving, setSaving]           = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedClient, setSavedClient] = useState<typeof EMPTY_FORM | null>(null);
  const [savedClientId, setSavedClientId] = useState<string>('');
  const [countryPickerOpen, setCountryPickerOpen]             = useState(false);
  const [countrySearch, setCountrySearch]                     = useState('');
  const [citizenshipPickerOpen, setCitizenshipPickerOpen]     = useState(false);
  const [citizenshipSearch, setCitizenshipSearch]             = useState('');

  // Seller state
  const [allSalespersons, setAllSalespersons] = useState<SalespersonRecord[]>([]);
  const [allBrokers, setAllBrokers]           = useState<BrokerRecord[]>([]);
  const [sellerDirector, setSellerDirector]   = useState('');
  const [sellerManager, setSellerManager]     = useState('');
  const [sellerSpecialist, setSellerSpecialist] = useState('');
  const [brokerDirectorHead, setBrokerDirectorHead]           = useState('');
  const [brokerNetworkOfficer, setBrokerNetworkOfficer]       = useState('');
  const [brokerBirName, setBrokerBirName]                     = useState('');
  const [brokerNetworkAssociate, setBrokerNetworkAssociate]   = useState('');

  const set = (key: keyof typeof EMPTY_FORM) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  useEffect(() => {
    fetchAllSalespersons().then(setAllSalespersons).catch(console.error);
    fetchAllBrokers().then(setAllBrokers).catch(console.error);
  }, []);

  // In House cascading filter logic
  const directors   = allSalespersons.filter(s => s.position_code === 'Sales Director');
  const managers    = allSalespersons.filter(s =>
    s.position_code === 'Sales Manager' &&
    (!sellerDirector || s.sales_director === sellerDirector)
  );
  const specialists = allSalespersons.filter(s =>
    s.position_code === 'Property Specialist' &&
    (!sellerManager || s.sales_manager === sellerManager)
  );

  // Broker cascading filter logic — unique values per level
  function uniqueNonNull(arr: (string | null)[]): string[] {
    return [...new Set(arr.filter(Boolean) as string[])].sort();
  }
  const brokerDirectorHeads = uniqueNonNull(allBrokers.map(b => b.sales_director_head));
  const brokerNetworkOfficers = uniqueNonNull(
    allBrokers
      .filter(b => !brokerDirectorHead || b.sales_director_head === brokerDirectorHead)
      .map(b => b.broker_network_officer)
  );
  const brokerBirNames = uniqueNonNull(
    allBrokers
      .filter(b =>
        (!brokerDirectorHead  || b.sales_director_head    === brokerDirectorHead) &&
        (!brokerNetworkOfficer || b.broker_network_officer === brokerNetworkOfficer)
      )
      .map(b => b.bir_registered_name)
  );
  const brokerNetworkAssociates = uniqueNonNull(
    allBrokers
      .filter(b =>
        (!brokerDirectorHead   || b.sales_director_head    === brokerDirectorHead) &&
        (!brokerNetworkOfficer  || b.broker_network_officer === brokerNetworkOfficer) &&
        (!brokerBirName         || b.bir_registered_name    === brokerBirName)
      )
      .map(b => b.broker_network_associate)
  );

  function resetSellerSelections() {
    setSellerDirector(''); setSellerManager(''); setSellerSpecialist('');
    setBrokerDirectorHead(''); setBrokerNetworkOfficer('');
    setBrokerBirName(''); setBrokerNetworkAssociate('');
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.lastName.trim())              e.lastName              = 'Last name is required';
    if (!form.firstName.trim())             e.firstName             = 'First name is required';
    if (!form.dateOfBirth)                  e.dateOfBirth           = 'Date of birth is required';
    if (!form.citizenship)                  e.citizenship           = 'Citizenship is required';
    if (!form.mobileNumber.trim())          e.mobileNumber          = 'Mobile number is required';
    if (!form.email.trim())                 e.email                 = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                            e.email                 = 'Enter a valid email address';
    if (!form.reasonForBuying)              e.reasonForBuying       = 'Reason for buying is required';
    if (!form.sourceOfSale)                 e.sourceOfSale          = 'Source of sale is required';
    if (!form.monthlyHouseholdIncome)       e.monthlyHouseholdIncome = 'Monthly income is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const clientId = await saveClient({
        client_type:              form.clientType,
        last_name:                form.lastName,
        first_name:               form.firstName,
        middle_name:              form.middleName,
        suffix:                   form.suffix,
        date_of_birth:            form.dateOfBirth,
        citizenship:              form.citizenship,
        country_code:             form.countryCode,
        mobile_number:            form.mobileNumber,
        landline_no:              form.landlineNo,
        email:                    form.email,
        reason_for_buying:        form.reasonForBuying,
        source_of_sale:           form.sourceOfSale,
        monthly_household_income: form.monthlyHouseholdIncome,
        seller_type:              form.sellerType,
        sales_director:           form.sellerType === 'In House' ? sellerDirector           : undefined,
        sales_manager:            form.sellerType === 'In House' ? sellerManager            : undefined,
        property_specialist:      form.sellerType === 'In House' ? sellerSpecialist         : undefined,
        broker_director_head:     form.sellerType === 'Broker'   ? brokerDirectorHead       : undefined,
        broker_network_officer:   form.sellerType === 'Broker'   ? brokerNetworkOfficer     : undefined,
        broker_bir_name:          form.sellerType === 'Broker'   ? brokerBirName            : undefined,
        broker_network_associate: form.sellerType === 'Broker'   ? brokerNetworkAssociate   : undefined,
      });
      setSavedClient({ ...form });
      setSavedClientId(clientId);
      setShowSuccess(true);
    } catch (e: any) {
      setErrors({ _global: e.message ?? 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const filteredCitizenships = citizenshipSearch
    ? CITIZENSHIP_LIST.filter(c => c.toLowerCase().includes(citizenshipSearch.toLowerCase()))
    : CITIZENSHIP_LIST;

  const selectedCountry = COUNTRY_CODES.find(c => c.dial === form.countryCode) ?? COUNTRY_CODES[0];
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.dial.includes(countrySearch))
    : COUNTRY_CODES;

  // ── Success Screen ────────────────────────────────────────
  if (showSuccess && savedClient) {
    return (
      <PageShell title="Client Registration" backButton onBack={() => router.push('/sales/client-registration')}>
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <p className="text-xl font-bold text-[#1C1C1E]">Client Registered!</p>
          <p className="text-lg font-bold text-[#E8634A] mt-1">
            {savedClient.lastName}, {savedClient.firstName}
            {savedClient.middleName ? ` ${savedClient.middleName}` : ''}
            {savedClient.suffix ? ` ${savedClient.suffix}` : ''}
          </p>

          {/* Client ID badge */}
          <div className="mt-5 px-6 py-3.5 bg-[#C8F0D8] rounded-2xl flex flex-col items-center gap-1">
            <p className="text-[10px] font-semibold text-green-700/70 uppercase tracking-widest">Client ID</p>
            <p className="text-2xl font-bold text-green-900 tracking-widest">{savedClientId}</p>
          </div>

          <p className="text-sm text-[#8E8E93] mt-4">
            Registered as a {savedClient.clientType.toLowerCase()} client.
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs mt-8">
            <button type="button"
              onClick={() => { setForm(EMPTY_FORM); setErrors({}); setSavedClient(null); setSavedClientId(''); setShowSuccess(false); resetSellerSelections(); }}
              className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80">
              Register Another Client
            </button>
            <button type="button"
              onClick={() => router.push('/sales/client-registration')}
              className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Done
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Country Picker ────────────────────────────────────────
  if (countryPickerOpen) {
    return (
      <PageShell title="Select Country" backButton onBack={() => setCountryPickerOpen(false)}>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-black/[0.08]">
          <Search size={14} className="text-[#C7C7CC] shrink-0" />
          <input autoFocus type="text" value={countrySearch}
            onChange={e => setCountrySearch(e.target.value)}
            placeholder="Search country or dial code…"
            className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
          />
          {countrySearch && (
            <button type="button" onClick={() => setCountrySearch('')}>
              <X size={12} className="text-[#C7C7CC]" />
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl overflow-hidden border border-black/[0.06]">
          {filteredCountries.map(c => (
            <button key={`${c.name}-${c.dial}`} type="button"
              onClick={() => { set('countryCode')(c.dial); setCountryPickerOpen(false); setCountrySearch(''); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.04] text-left active:bg-gray-50 ${
                form.countryCode === c.dial && selectedCountry.name === c.name ? 'bg-[#E8634A]/5' : ''
              }`}>
              <span className="text-xl shrink-0">{c.flag}</span>
              <span className="flex-1 text-sm text-[#1C1C1E]">{c.name}</span>
              <span className="text-sm font-semibold text-[#8E8E93]">{c.dial}</span>
              {form.countryCode === c.dial && selectedCountry.name === c.name && (
                <Check size={14} className="text-[#E8634A] shrink-0" />
              )}
            </button>
          ))}
        </div>
      </PageShell>
    );
  }

  // ── Citizenship Picker ────────────────────────────────────
  if (citizenshipPickerOpen) {
    return (
      <PageShell title="Select Citizenship" backButton onBack={() => setCitizenshipPickerOpen(false)}>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-black/[0.08]">
          <Search size={14} className="text-[#C7C7CC] shrink-0" />
          <input autoFocus type="text" value={citizenshipSearch}
            onChange={e => setCitizenshipSearch(e.target.value)}
            placeholder="Search citizenship…"
            className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
          />
          {citizenshipSearch && (
            <button type="button" onClick={() => setCitizenshipSearch('')}>
              <X size={12} className="text-[#C7C7CC]" />
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl overflow-hidden border border-black/[0.06]">
          {filteredCitizenships.map(c => (
            <button key={c} type="button"
              onClick={() => { set('citizenship')(c); setCitizenshipPickerOpen(false); setCitizenshipSearch(''); }}
              className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-black/[0.04] text-left active:bg-gray-50 ${
                form.citizenship === c ? 'bg-[#E8634A]/5' : ''
              }`}>
              <span className="text-sm text-[#1C1C1E]">{c}</span>
              {form.citizenship === c && <Check size={14} className="text-[#E8634A] shrink-0" />}
            </button>
          ))}
        </div>
      </PageShell>
    );
  }

  // ── Form ──────────────────────────────────────────────────
  return (
    <PageShell title="New Client" backButton onBack={() => router.back()}>
      <div className="space-y-4 pb-6">
        {errors._global && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{errors._global}</p>
        )}

        {/* Client Type */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Client Type</p>
          <div className="grid grid-cols-2 gap-2">
            {(['Local', 'International'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('clientType')(t)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  form.clientType === t
                    ? 'bg-[#E8634A] border-[#E8634A] text-white'
                    : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                }`}>
                {form.clientType === t && <Check size={13} />}
                {t}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Personal Information */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>
          <InputRow label="Last Name" icon={<User size={11} />} error={errors.lastName} required>
            <TextInput value={form.lastName} onChange={v => set('lastName')(toProperCase(v))} placeholder="e.g. Dela Cruz" />
          </InputRow>
          <InputRow label="First Name" icon={<User size={11} />} error={errors.firstName} required>
            <TextInput value={form.firstName} onChange={v => set('firstName')(toProperCase(v))} placeholder="e.g. Juan" />
          </InputRow>
          <InputRow label="Middle Name" icon={<User size={11} />}>
            <TextInput value={form.middleName} onChange={v => set('middleName')(toProperCase(v))} placeholder="e.g. Santos" />
          </InputRow>
          <InputRow label="Suffix" icon={<User size={11} />}>
            <TextInput value={form.suffix} onChange={v => set('suffix')(toProperCase(v))} placeholder="e.g. Jr., Sr., III" />
          </InputRow>

          <InputRow label="Date of Birth" icon={<Calendar size={11} />} error={errors.dateOfBirth} required>
            <div className="w-full flex items-center px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] overflow-hidden focus-within:border-[#E8634A]/50 focus-within:bg-white transition-colors">
              <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth')(e.target.value)}
                className="w-full min-w-0 bg-transparent text-sm text-[#1C1C1E] outline-none"
              />
            </div>
          </InputRow>
          <InputRow label="Citizenship" icon={<Globe size={11} />} error={errors.citizenship} required>
            <button type="button" onClick={() => { setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] active:opacity-70">
              <span className={`text-sm ${form.citizenship ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                {form.citizenship || 'Select citizenship'}
              </span>
              {form.citizenship
                ? <button type="button" onClick={e => { e.stopPropagation(); set('citizenship')(''); }}>
                    <X size={13} className="text-[#C7C7CC]" />
                  </button>
                : <ChevronDown size={14} className="text-[#C7C7CC] shrink-0" />
              }
            </button>
          </InputRow>
        </GlassCard>

        {/* Contact Details */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Contact Details</p>
          <InputRow label="Mobile Number" icon={<Phone size={11} />} error={errors.mobileNumber} required>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCountrySearch(''); setCountryPickerOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm shrink-0 active:opacity-70">
                <span>{selectedCountry.flag}</span>
                <span className="font-medium text-[#1C1C1E]">{selectedCountry.dial}</span>
                <ChevronDown size={12} className="text-[#C7C7CC]" />
              </button>
              <input
                type="tel"
                inputMode="numeric"
                value={form.mobileNumber}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '');
                  const max = form.countryCode === '+63' ? 10 : 15;
                  set('mobileNumber')(digits.slice(0, max));
                }}
                placeholder={form.countryCode === '+63' ? '9171234567' : ''}
                maxLength={form.countryCode === '+63' ? 10 : 15}
                className="flex-1 px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
              />
            </div>
          </InputRow>
          <InputRow label="Landline No." icon={<Phone size={11} />}>
            <input
              type="tel"
              inputMode="numeric"
              value={form.landlineNo}
              onChange={e => set('landlineNo')(e.target.value.replace(/[^0-9\-\s()]/g, ''))}
              placeholder="02-8123-4567"
              className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
            />
          </InputRow>
          <InputRow label="Email Address" icon={<Mail size={11} />} error={errors.email} required>
            <input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={e => {
                set('email')(e.target.value);
                if (errors.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value))
                  setErrors(prev => ({ ...prev, email: '' }));
              }}
              onBlur={() => {
                if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                  setErrors(prev => ({ ...prev, email: 'Enter a valid email address' }));
                else
                  setErrors(prev => ({ ...prev, email: '' }));
              }}
              placeholder="juan@email.com"
              className={`w-full px-3 py-2.5 rounded-xl border bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-[#C7C7CC] focus:bg-white ${
                errors.email ? 'border-red-400 focus:border-red-400' : 'border-black/[0.1] focus:border-[#E8634A]/50'
              }`}
            />
          </InputRow>
        </GlassCard>

        {/* Purchase Information */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Purchase Information</p>
          <InputRow label="Reason for Buying" icon={<Heart size={11} />} error={errors.reasonForBuying} required>
            <SelectInput value={form.reasonForBuying} options={REASON_OPTIONS}
              onChange={set('reasonForBuying')} placeholder="Select reason" />
          </InputRow>
          <InputRow label="Source of Sale" icon={<Briefcase size={11} />} error={errors.sourceOfSale} required>
            <SelectInput value={form.sourceOfSale} options={SOURCE_OPTIONS}
              onChange={set('sourceOfSale')} placeholder="Select source" />
          </InputRow>
          <InputRow label="Est. Monthly Household Income" icon={<span className="text-[11px] font-bold leading-none">₱</span>} error={errors.monthlyHouseholdIncome} required>
            <SelectInput value={form.monthlyHouseholdIncome} options={INCOME_OPTIONS}
              onChange={set('monthlyHouseholdIncome')} placeholder="Select income range" />
          </InputRow>
        </GlassCard>

        {/* Seller Information */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Seller Information</p>

          {/* Seller Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(['In House', 'Broker'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => { set('sellerType')(t); resetSellerSelections(); }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  form.sellerType === t
                    ? 'bg-[#E8634A] border-[#E8634A] text-white'
                    : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                }`}>
                {form.sellerType === t && <Check size={13} />}
                {t}
              </button>
            ))}
          </div>

          {/* In House — cascading dropdowns */}
          {form.sellerType === 'In House' && (
            <>
              <InputRow label="Sales Director" icon={<UserCog size={11} />}>
                <SelectInput
                  value={sellerDirector}
                  options={directors.map(s => s.seller_name)}
                  onChange={v => { setSellerDirector(v); setSellerManager(''); setSellerSpecialist(''); }}
                  placeholder={directors.length === 0 ? 'Loading…' : 'Select Sales Director'}
                />
              </InputRow>
              <InputRow label="Sales Manager" icon={<Users size={11} />}>
                <SelectInput
                  value={sellerManager}
                  options={managers.map(s => s.seller_name)}
                  onChange={v => { setSellerManager(v); setSellerSpecialist(''); }}
                  placeholder={managers.length === 0 ? 'No results' : 'Select Sales Manager'}
                />
              </InputRow>
              <InputRow label="Property Specialist" icon={<User size={11} />}>
                <SelectInput
                  value={sellerSpecialist}
                  options={specialists.map(s => s.seller_name)}
                  onChange={setSellerSpecialist}
                  placeholder={specialists.length === 0 ? 'No results' : 'Select Property Specialist'}
                />
              </InputRow>
            </>
          )}

          {/* Broker — cascading dropdowns */}
          {form.sellerType === 'Broker' && (
            <>
              <InputRow label="Sales Director Head" icon={<UserCog size={11} />}>
                <SelectInput
                  value={brokerDirectorHead}
                  options={brokerDirectorHeads}
                  onChange={v => { setBrokerDirectorHead(v); setBrokerNetworkOfficer(''); setBrokerBirName(''); setBrokerNetworkAssociate(''); }}
                  placeholder={allBrokers.length === 0 ? 'Loading…' : 'Select Sales Director Head'}
                />
              </InputRow>
              <InputRow label="Broker Network Officer" icon={<Users size={11} />}>
                <SelectInput
                  value={brokerNetworkOfficer}
                  options={brokerNetworkOfficers}
                  onChange={v => { setBrokerNetworkOfficer(v); setBrokerBirName(''); setBrokerNetworkAssociate(''); }}
                  placeholder={brokerNetworkOfficers.length === 0 ? 'No results' : 'Select Network Officer'}
                />
              </InputRow>
              <InputRow label="BIR Registered Name" icon={<Briefcase size={11} />}>
                <SelectInput
                  value={brokerBirName}
                  options={brokerBirNames}
                  onChange={v => { setBrokerBirName(v); setBrokerNetworkAssociate(''); }}
                  placeholder={brokerBirNames.length === 0 ? 'No results' : 'Select BIR Registered Name'}
                />
              </InputRow>
              <InputRow label="Broker Network Associate" icon={<User size={11} />}>
                <SelectInput
                  value={brokerNetworkAssociate}
                  options={brokerNetworkAssociates}
                  onChange={setBrokerNetworkAssociate}
                  placeholder={brokerNetworkAssociates.length === 0 ? 'No results' : 'Select Network Associate'}
                />
              </InputRow>
            </>
          )}
        </GlassCard>

        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
            : <><Check size={15} /> Register Client</>
          }
        </button>
      </div>
    </PageShell>
  );
}
