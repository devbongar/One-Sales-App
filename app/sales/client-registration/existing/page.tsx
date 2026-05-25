'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import FilterSelect from '@/components/ui/FilterSelect';
import SearchInput from '@/components/ui/SearchInput';
import {
  Loader2, Users, Phone, Mail, Heart,
  Briefcase, Calendar, User, Globe,
  X, Check, ChevronDown, Search, Edit2, UserCog,
} from 'lucide-react';
import { fetchAllClients, updateClient, ClientRecord } from '@/lib/clients';
import {
  COUNTRY_CODES, CITIZENSHIP_LIST,
  REASON_OPTIONS, SOURCE_OPTIONS, INCOME_OPTIONS,
} from '@/lib/client-form-options';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchAllBrokers, BrokerRecord } from '@/lib/brokers';

// ── Helpers ───────────────────────────────────────────────────
function toProperCase(str: string) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Form components ───────────────────────────────────────────
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

function SelectInput({ value, options, onChange, placeholder, disabled }: {
  value: string; options: string[]; onChange: (v: string) => void;
  placeholder: string; disabled?: boolean;
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
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        onClick={() => !disabled && setOpen(p => !p)}
        onKeyDown={e => !disabled && e.key === 'Enter' && setOpen(p => !p)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm ${
          disabled
            ? 'border-transparent bg-[#F2F2F7] cursor-default'
            : 'border-black/[0.1] bg-[#F2F2F7] cursor-pointer'
        }`}
      >
        <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || placeholder}
        </span>
        {!disabled && (value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      {open && !disabled && (
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

function TextInput({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      readOnly={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors placeholder:text-[#C7C7CC] ${
        disabled
          ? 'border-transparent bg-[#F2F2F7] text-[#1C1C1E] cursor-default'
          : 'border-black/[0.1] bg-[#F2F2F7] text-[#1C1C1E] focus:border-[#E8634A]/50 focus:bg-white'
      }`}
    />
  );
}

// ── Types ─────────────────────────────────────────────────────
type FormState = {
  clientType: 'Local' | 'International';
  lastName: string; firstName: string; middleName: string; suffix: string;
  dateOfBirth: string; citizenship: string;
  countryCode: string; mobileNumber: string; landlineNo: string; email: string;
  reasonForBuying: string; sourceOfSale: string; monthlyHouseholdIncome: string;
  sellerType: 'In House' | 'Broker';
};

function mapClientToForm(c: ClientRecord): FormState {
  return {
    clientType:             (c.client_type as 'Local' | 'International') ?? 'Local',
    lastName:               c.last_name,
    firstName:              c.first_name,
    middleName:             c.middle_name              ?? '',
    suffix:                 c.suffix                   ?? '',
    dateOfBirth:            c.date_of_birth            ?? '',
    citizenship:            c.citizenship              ?? '',
    countryCode:            c.country_code             ?? '+63',
    mobileNumber:           c.mobile_number            ?? '',
    landlineNo:             c.landline_no              ?? '',
    email:                  c.email                    ?? '',
    reasonForBuying:        c.reason_for_buying        ?? '',
    sourceOfSale:           c.source_of_sale           ?? '',
    monthlyHouseholdIncome: c.monthly_household_income ?? '',
    sellerType:             (c.seller_type as 'In House' | 'Broker') ?? 'In House',
  };
}

const EMPTY_FORM: FormState = {
  clientType: 'Local', lastName: '', firstName: '', middleName: '', suffix: '',
  dateOfBirth: '', citizenship: '', countryCode: '+63',
  mobileNumber: '', landlineNo: '', email: '',
  reasonForBuying: '', sourceOfSale: '', monthlyHouseholdIncome: '',
  sellerType: 'In House',
};

// ── Page ──────────────────────────────────────────────────────
export default function ExistingClientPage() {
  const router = useRouter();

  // List state
  const [allClients, setAllClients]               = useState<ClientRecord[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [clientTypeFilter, setClientTypeFilter]   = useState('');
  const [citizenshipFilter, setCitizenshipFilter] = useState('');
  const [clientSearch, setClientSearch]           = useState('');
  const [selectedClient, setSelectedClient]       = useState<ClientRecord | null>(null);

  // Detail / edit state
  const [editMode, setEditMode]                           = useState(false);
  const [form, setForm]                                   = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors]                               = useState<Record<string, string>>({});
  const [saving, setSaving]                               = useState(false);
  const [countryPickerOpen, setCountryPickerOpen]         = useState(false);
  const [countrySearch, setCountrySearch]                 = useState('');
  const [citizenshipPickerOpen, setCitizenshipPickerOpen] = useState(false);
  const [citizenshipSearch, setCitizenshipSearch]         = useState('');

  // Seller state
  const [allSalespersons, setAllSalespersons]             = useState<SalespersonRecord[]>([]);
  const [allBrokers, setAllBrokers]                       = useState<BrokerRecord[]>([]);
  const [sellerDirector, setSellerDirector]               = useState('');
  const [sellerManager, setSellerManager]                 = useState('');
  const [sellerSpecialist, setSellerSpecialist]           = useState('');
  const [brokerDirectorHead, setBrokerDirectorHead]       = useState('');
  const [brokerNetworkOfficer, setBrokerNetworkOfficer]   = useState('');
  const [brokerBirName, setBrokerBirName]                 = useState('');
  const [brokerNetworkAssociate, setBrokerNetworkAssociate] = useState('');

  useEffect(() => {
    fetchAllClients()
      .then(data => setAllClients(data))
      .finally(() => setLoading(false));
    fetchAllSalespersons().then(setAllSalespersons).catch(console.error);
    fetchAllBrokers().then(setAllBrokers).catch(console.error);
  }, []);

  // In House cascading
  const directors   = allSalespersons.filter(s => s.position_code === 'Sales Director');
  const managers    = allSalespersons.filter(s =>
    s.position_code === 'Sales Manager' &&
    (!sellerDirector || s.sales_director === sellerDirector)
  );
  const specialists = allSalespersons.filter(s =>
    s.position_code === 'Property Specialist' &&
    (!sellerManager || s.sales_manager === sellerManager)
  );

  // Broker cascading
  function uniqueNonNull(arr: (string | null)[]): string[] {
    return [...new Set(arr.filter(Boolean) as string[])].sort();
  }
  const brokerDirectorHeads    = uniqueNonNull(allBrokers.map(b => b.sales_director_head));
  const brokerNetworkOfficers  = uniqueNonNull(
    allBrokers.filter(b => !brokerDirectorHead || b.sales_director_head === brokerDirectorHead)
      .map(b => b.broker_network_officer)
  );
  const brokerBirNames         = uniqueNonNull(
    allBrokers.filter(b =>
      (!brokerDirectorHead   || b.sales_director_head    === brokerDirectorHead) &&
      (!brokerNetworkOfficer  || b.broker_network_officer === brokerNetworkOfficer)
    ).map(b => b.bir_registered_name)
  );
  const brokerNetworkAssociates = uniqueNonNull(
    allBrokers.filter(b =>
      (!brokerDirectorHead   || b.sales_director_head    === brokerDirectorHead) &&
      (!brokerNetworkOfficer  || b.broker_network_officer === brokerNetworkOfficer) &&
      (!brokerBirName         || b.bir_registered_name    === brokerBirName)
    ).map(b => b.broker_network_associate)
  );

  function resetSellerSelections() {
    setSellerDirector(''); setSellerManager(''); setSellerSpecialist('');
    setBrokerDirectorHead(''); setBrokerNetworkOfficer('');
    setBrokerBirName(''); setBrokerNetworkAssociate('');
  }

  function loadSellerFromClient(c: ClientRecord) {
    setSellerDirector(c.sales_director ?? '');
    setSellerManager(c.sales_manager ?? '');
    setSellerSpecialist(c.property_specialist ?? '');
    setBrokerDirectorHead(c.broker_director_head ?? '');
    setBrokerNetworkOfficer(c.broker_network_officer ?? '');
    setBrokerBirName(c.broker_bir_name ?? '');
    setBrokerNetworkAssociate(c.broker_network_associate ?? '');
  }

  function openClient(client: ClientRecord) {
    setSelectedClient(client);
    setForm(mapClientToForm(client));
    loadSellerFromClient(client);
    setEditMode(false);
    setErrors({});
  }

  function cancelEdit() {
    setEditMode(false);
    setForm(mapClientToForm(selectedClient!));
    loadSellerFromClient(selectedClient!);
    setErrors({});
  }

  const set = (key: keyof FormState) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  function validate() {
    const e: Record<string, string> = {};
    if (!form.lastName.trim())        e.lastName               = 'Last name is required';
    if (!form.firstName.trim())       e.firstName              = 'First name is required';
    if (!form.dateOfBirth)            e.dateOfBirth            = 'Date of birth is required';
    if (!form.citizenship)            e.citizenship            = 'Citizenship is required';
    if (!form.mobileNumber.trim())    e.mobileNumber           = 'Mobile number is required';
    if (!form.email.trim())           e.email                  = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                      e.email                  = 'Enter a valid email address';
    if (!form.reasonForBuying)        e.reasonForBuying        = 'Reason for buying is required';
    if (!form.sourceOfSale)           e.sourceOfSale           = 'Source of sale is required';
    if (!form.monthlyHouseholdIncome) e.monthlyHouseholdIncome = 'Monthly income is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await updateClient(selectedClient!.id, {
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
        sales_director:           form.sellerType === 'In House' ? sellerDirector         : undefined,
        sales_manager:            form.sellerType === 'In House' ? sellerManager          : undefined,
        property_specialist:      form.sellerType === 'In House' ? sellerSpecialist       : undefined,
        broker_director_head:     form.sellerType === 'Broker'   ? brokerDirectorHead     : undefined,
        broker_network_officer:   form.sellerType === 'Broker'   ? brokerNetworkOfficer   : undefined,
        broker_bir_name:          form.sellerType === 'Broker'   ? brokerBirName          : undefined,
        broker_network_associate: form.sellerType === 'Broker'   ? brokerNetworkAssociate : undefined,
      });
      const updated: ClientRecord = {
        ...selectedClient!,
        client_type:              form.clientType,
        last_name:                form.lastName,
        first_name:               form.firstName,
        middle_name:              form.middleName             || null,
        suffix:                   form.suffix                 || null,
        date_of_birth:            form.dateOfBirth            || null,
        citizenship:              form.citizenship            || null,
        country_code:             form.countryCode,
        mobile_number:            form.mobileNumber           || null,
        landline_no:              form.landlineNo             || null,
        email:                    form.email                  || null,
        reason_for_buying:        form.reasonForBuying        || null,
        source_of_sale:           form.sourceOfSale           || null,
        monthly_household_income: form.monthlyHouseholdIncome || null,
        seller_type:              form.sellerType,
        sales_director:           form.sellerType === 'In House' ? sellerDirector         || null : null,
        sales_manager:            form.sellerType === 'In House' ? sellerManager          || null : null,
        property_specialist:      form.sellerType === 'In House' ? sellerSpecialist       || null : null,
        broker_director_head:     form.sellerType === 'Broker'   ? brokerDirectorHead     || null : null,
        broker_network_officer:   form.sellerType === 'Broker'   ? brokerNetworkOfficer   || null : null,
        broker_bir_name:          form.sellerType === 'Broker'   ? brokerBirName          || null : null,
        broker_network_associate: form.sellerType === 'Broker'   ? brokerNetworkAssociate || null : null,
      };
      setSelectedClient(updated);
      setAllClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditMode(false);
    } catch (e: any) {
      setErrors({ _global: e.message ?? 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const filteredCitizenships = citizenshipSearch
    ? CITIZENSHIP_LIST.filter(c => c.toLowerCase().includes(citizenshipSearch.toLowerCase()))
    : CITIZENSHIP_LIST;

  const selectedCountry   = COUNTRY_CODES.find(c => c.dial === form.countryCode) ?? COUNTRY_CODES[0];
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.dial.includes(countrySearch))
    : COUNTRY_CODES;

  const citizenshipOptions = [...new Set(
    allClients.map(c => c.citizenship).filter(Boolean) as string[]
  )].sort();

  const filteredClients = allClients.filter(c => {
    const fullName = `${c.last_name} ${c.first_name} ${c.middle_name ?? ''}`.toLowerCase();
    if (clientTypeFilter && c.client_type !== clientTypeFilter) return false;
    if (citizenshipFilter && c.citizenship !== citizenshipFilter) return false;
    if (clientSearch && !fullName.includes(clientSearch.toLowerCase())) return false;
    return true;
  });

  // ── Citizenship Picker ────────────────────────────────────
  if (selectedClient && citizenshipPickerOpen) {
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

  // ── Country Picker ────────────────────────────────────────
  if (selectedClient && countryPickerOpen) {
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

  // ── Detail / Edit View ────────────────────────────────────
  if (selectedClient) {
    return (
      <PageShell
        title={editMode ? 'Edit Client' : 'Client Details'}
        backButton
        onBack={() => editMode ? cancelEdit() : setSelectedClient(null)}
      >
        <div className="space-y-4 pb-6">

          {/* Client ID badge */}
          <div className="px-6 py-3.5 bg-[#C8F0D8] rounded-2xl flex flex-col items-center gap-1">
            <p className="text-[10px] font-semibold text-green-700/70 uppercase tracking-widest">Client ID</p>
            <p className="text-2xl font-bold text-green-900 tracking-widest">
              {selectedClient.client_id ?? '—'}
            </p>
          </div>

          {errors._global && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{errors._global}</p>
          )}

          {/* Client Type */}
          <GlassCard className="p-4 space-y-3">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Client Type</p>
            <div className="grid grid-cols-2 gap-2">
              {(['Local', 'International'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => editMode && set('clientType')(t)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    form.clientType === t
                      ? 'bg-[#E8634A] border-[#E8634A] text-white'
                      : editMode
                        ? 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                        : 'bg-[#F2F2F7] border-transparent text-[#C7C7CC]'
                  } ${!editMode ? 'cursor-default' : ''}`}>
                  {form.clientType === t && <Check size={13} />}
                  {t}
                </button>
              ))}
            </div>
          </GlassCard>

          {/* Personal Information */}
          <GlassCard className="p-4 space-y-3">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Personal Information</p>
            <InputRow label="Last Name" icon={<User size={11} />} error={errors.lastName} required={editMode}>
              <TextInput value={form.lastName} onChange={v => set('lastName')(toProperCase(v))} placeholder="e.g. Dela Cruz" disabled={!editMode} />
            </InputRow>
            <InputRow label="First Name" icon={<User size={11} />} error={errors.firstName} required={editMode}>
              <TextInput value={form.firstName} onChange={v => set('firstName')(toProperCase(v))} placeholder="e.g. Juan" disabled={!editMode} />
            </InputRow>
            <InputRow label="Middle Name" icon={<User size={11} />}>
              <TextInput value={form.middleName} onChange={v => set('middleName')(toProperCase(v))} placeholder="e.g. Santos" disabled={!editMode} />
            </InputRow>
            <InputRow label="Suffix" icon={<User size={11} />}>
              <TextInput value={form.suffix} onChange={v => set('suffix')(toProperCase(v))} placeholder="e.g. Jr., Sr., III" disabled={!editMode} />
            </InputRow>

            <InputRow label="Date of Birth" icon={<Calendar size={11} />} error={errors.dateOfBirth} required={editMode}>
              <div className={`w-full flex items-center px-3 py-2.5 rounded-xl border overflow-hidden transition-colors ${
                !editMode
                  ? 'border-transparent bg-[#F2F2F7]'
                  : 'border-black/[0.1] bg-[#F2F2F7] focus-within:border-[#E8634A]/50 focus-within:bg-white'
              }`}>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  readOnly={!editMode}
                  onChange={e => editMode && set('dateOfBirth')(e.target.value)}
                  className={`w-full min-w-0 bg-transparent text-sm text-[#1C1C1E] outline-none ${!editMode ? 'cursor-default' : ''}`}
                />
              </div>
            </InputRow>
            <InputRow label="Citizenship" icon={<Globe size={11} />} error={errors.citizenship} required={editMode}>
              {editMode ? (
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
              ) : (
                <div className="w-full px-3 py-2.5 rounded-xl border-transparent bg-[#F2F2F7] text-sm text-[#1C1C1E]">
                  {form.citizenship || '—'}
                </div>
              )}
            </InputRow>
          </GlassCard>

          {/* Contact Details */}
          <GlassCard className="p-4 space-y-3">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Contact Details</p>
            <InputRow label="Mobile Number" icon={<Phone size={11} />} error={errors.mobileNumber} required={editMode}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { if (editMode) { setCountrySearch(''); setCountryPickerOpen(true); } }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm shrink-0 ${
                    editMode
                      ? 'border-black/[0.1] bg-[#F2F2F7] active:opacity-70'
                      : 'border-transparent bg-[#F2F2F7] cursor-default'
                  }`}>
                  <span>{selectedCountry.flag}</span>
                  <span className="font-medium text-[#1C1C1E]">{selectedCountry.dial}</span>
                  {editMode && <ChevronDown size={12} className="text-[#C7C7CC]" />}
                </button>
                <input
                  type="tel"
                  inputMode="numeric"
                  readOnly={!editMode}
                  value={form.mobileNumber}
                  onChange={e => {
                    if (!editMode) return;
                    const digits = e.target.value.replace(/\D/g, '');
                    const max = form.countryCode === '+63' ? 10 : 15;
                    set('mobileNumber')(digits.slice(0, max));
                  }}
                  placeholder={form.countryCode === '+63' ? '9171234567' : ''}
                  maxLength={form.countryCode === '+63' ? 10 : 15}
                  className={`flex-1 px-3 py-2.5 rounded-xl border text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-[#C7C7CC] ${
                    !editMode
                      ? 'border-transparent bg-[#F2F2F7] cursor-default'
                      : 'border-black/[0.1] bg-[#F2F2F7] focus:border-[#E8634A]/50 focus:bg-white'
                  }`}
                />
              </div>
            </InputRow>
            <InputRow label="Landline No." icon={<Phone size={11} />}>
              <input
                type="tel"
                inputMode="numeric"
                readOnly={!editMode}
                value={form.landlineNo}
                onChange={e => editMode && set('landlineNo')(e.target.value.replace(/[^0-9\-\s()]/g, ''))}
                placeholder="02-8123-4567"
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-[#C7C7CC] ${
                  !editMode
                    ? 'border-transparent bg-[#F2F2F7] cursor-default'
                    : 'border-black/[0.1] bg-[#F2F2F7] focus:border-[#E8634A]/50 focus:bg-white'
                }`}
              />
            </InputRow>
            <InputRow label="Email Address" icon={<Mail size={11} />} error={errors.email} required={editMode}>
              <input
                type="email"
                inputMode="email"
                readOnly={!editMode}
                value={form.email}
                onChange={e => {
                  if (!editMode) return;
                  set('email')(e.target.value);
                  if (errors.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value))
                    setErrors(prev => ({ ...prev, email: '' }));
                }}
                onBlur={() => {
                  if (!editMode) return;
                  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                    setErrors(prev => ({ ...prev, email: 'Enter a valid email address' }));
                  else
                    setErrors(prev => ({ ...prev, email: '' }));
                }}
                placeholder="juan@email.com"
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-[#C7C7CC] ${
                  !editMode
                    ? 'border-transparent bg-[#F2F2F7] cursor-default'
                    : errors.email
                      ? 'border-red-400 bg-[#F2F2F7] focus:bg-white focus:border-red-400'
                      : 'border-black/[0.1] bg-[#F2F2F7] focus:border-[#E8634A]/50 focus:bg-white'
                }`}
              />
            </InputRow>
          </GlassCard>

          {/* Purchase Information */}
          <GlassCard className="p-4 space-y-3">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Purchase Information</p>
            <InputRow label="Reason for Buying" icon={<Heart size={11} />} error={errors.reasonForBuying} required={editMode}>
              <SelectInput value={form.reasonForBuying} options={REASON_OPTIONS}
                onChange={set('reasonForBuying')} placeholder="Select reason" disabled={!editMode} />
            </InputRow>
            <InputRow label="Source of Sale" icon={<Briefcase size={11} />} error={errors.sourceOfSale} required={editMode}>
              <SelectInput value={form.sourceOfSale} options={SOURCE_OPTIONS}
                onChange={set('sourceOfSale')} placeholder="Select source" disabled={!editMode} />
            </InputRow>
            <InputRow label="Est. Monthly Household Income" icon={<span className="text-[11px] font-bold leading-none">₱</span>} error={errors.monthlyHouseholdIncome} required={editMode}>
              <SelectInput value={form.monthlyHouseholdIncome} options={INCOME_OPTIONS}
                onChange={set('monthlyHouseholdIncome')} placeholder="Select income range" disabled={!editMode} />
            </InputRow>
          </GlassCard>

          {/* Seller Information */}
          <GlassCard className="p-4 space-y-3">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-wider">Seller Information</p>
            <div className="grid grid-cols-2 gap-2">
              {(['In House', 'Broker'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => { if (editMode) { set('sellerType')(t); resetSellerSelections(); } }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    form.sellerType === t
                      ? 'bg-[#E8634A] border-[#E8634A] text-white'
                      : editMode ? 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                                 : 'bg-[#F2F2F7] border-transparent text-[#C7C7CC]'
                  } ${!editMode ? 'cursor-default' : ''}`}>
                  {form.sellerType === t && <Check size={13} />}
                  {t}
                </button>
              ))}
            </div>

            {/* In House cascading */}
            {form.sellerType === 'In House' && (
              <>
                <InputRow label="Sales Director" icon={<UserCog size={11} />}>
                  <SelectInput
                    value={sellerDirector}
                    options={directors.map(s => s.seller_name)}
                    onChange={v => { if (editMode) { setSellerDirector(v); setSellerManager(''); setSellerSpecialist(''); } }}
                    placeholder="Select Sales Director"
                    disabled={!editMode}
                  />
                </InputRow>
                <InputRow label="Sales Manager" icon={<Users size={11} />}>
                  <SelectInput
                    value={sellerManager}
                    options={managers.map(s => s.seller_name)}
                    onChange={v => { if (editMode) { setSellerManager(v); setSellerSpecialist(''); } }}
                    placeholder="Select Sales Manager"
                    disabled={!editMode}
                  />
                </InputRow>
                <InputRow label="Property Specialist" icon={<User size={11} />}>
                  <SelectInput
                    value={sellerSpecialist}
                    options={specialists.map(s => s.seller_name)}
                    onChange={v => { if (editMode) setSellerSpecialist(v); }}
                    placeholder="Select Property Specialist"
                    disabled={!editMode}
                  />
                </InputRow>
              </>
            )}

            {/* Broker cascading */}
            {form.sellerType === 'Broker' && (
              <>
                <InputRow label="Sales Director Head" icon={<UserCog size={11} />}>
                  <SelectInput
                    value={brokerDirectorHead}
                    options={brokerDirectorHeads}
                    onChange={v => { if (editMode) { setBrokerDirectorHead(v); setBrokerNetworkOfficer(''); setBrokerBirName(''); setBrokerNetworkAssociate(''); } }}
                    placeholder="Select Sales Director Head"
                    disabled={!editMode}
                  />
                </InputRow>
                <InputRow label="Broker Network Officer" icon={<Users size={11} />}>
                  <SelectInput
                    value={brokerNetworkOfficer}
                    options={brokerNetworkOfficers}
                    onChange={v => { if (editMode) { setBrokerNetworkOfficer(v); setBrokerBirName(''); setBrokerNetworkAssociate(''); } }}
                    placeholder="Select Network Officer"
                    disabled={!editMode}
                  />
                </InputRow>
                <InputRow label="BIR Registered Name" icon={<Briefcase size={11} />}>
                  <SelectInput
                    value={brokerBirName}
                    options={brokerBirNames}
                    onChange={v => { if (editMode) { setBrokerBirName(v); setBrokerNetworkAssociate(''); } }}
                    placeholder="Select BIR Registered Name"
                    disabled={!editMode}
                  />
                </InputRow>
                <InputRow label="Broker Network Associate" icon={<User size={11} />}>
                  <SelectInput
                    value={brokerNetworkAssociate}
                    options={brokerNetworkAssociates}
                    onChange={v => { if (editMode) setBrokerNetworkAssociate(v); }}
                    placeholder="Select Network Associate"
                    disabled={!editMode}
                  />
                </InputRow>
              </>
            )}
          </GlassCard>

          {/* Action buttons */}
          {editMode ? (
            <div className="flex gap-3">
              <button type="button" onClick={cancelEdit}
                className="flex-1 py-4 rounded-2xl bg-white border border-black/[0.15] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex-1 py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                  : <><Check size={15} /> Save Changes</>
                }
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditMode(true)}
              className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 active:opacity-80">
              <Edit2 size={15} /> Edit Client
            </button>
          )}

        </div>
      </PageShell>
    );
  }

  // ── Search / List View ────────────────────────────────────
  return (
    <PageShell title="Existing Client" backButton onBack={() => router.back()}>
      <div className="space-y-3 pb-6">

        {/* Filters */}
        <GlassCard className="px-4 py-1">
          <FilterSelect
            label="Client Type"
            value={clientTypeFilter}
            options={['Local', 'International']}
            onChange={setClientTypeFilter}
            icon={<User size={16} />}
          />
          <FilterSelect
            label="Citizenship"
            value={citizenshipFilter}
            options={citizenshipOptions}
            onChange={setCitizenshipFilter}
            icon={<Globe size={16} />}
            searchable
          />
        </GlassCard>

        {/* Search */}
        <SearchInput
          value={clientSearch}
          onChange={setClientSearch}
          placeholder="Search by name…"
        />

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#5856D6] animate-spin" />
          </div>
        ) : filteredClients.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Users size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No clients found</p>
            <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filteredClients.map(c => (
              <GlassCard key={c.id}
                className="flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => openClient(c)}>
                <div className="w-10 h-10 rounded-full bg-[#5856D6]/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-[#5856D6]">
                    {c.first_name.charAt(0)}{c.last_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1C1C1E] truncate">
                    {c.last_name}, {c.first_name}
                    {c.middle_name ? ` ${c.middle_name}` : ''}
                    {c.suffix ? ` ${c.suffix}` : ''}
                  </p>
                  <p className="text-xs text-[#8E8E93]">{c.citizenship ?? '—'}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  c.client_type === 'Local' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>{c.client_type}</span>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
