'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchInput from '@/components/ui/SearchInput';
import {
  Loader2, Users, Phone, Mail, Heart,
  Briefcase, Calendar, User, Globe,
  X, Check, ChevronDown, ChevronLeft, Search, Edit2, UserCog,
  SlidersHorizontal, Plus,
} from 'lucide-react';
import { fetchAllClients, updateClient, ClientRecord } from '@/lib/clients';
import {
  COUNTRY_CODES, CITIZENSHIP_LIST,
  REASON_OPTIONS, SOURCE_OPTIONS, INCOME_OPTIONS,
} from '@/lib/client-form-options';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchAllBrokers, BrokerRecord } from '@/lib/brokers';

// ── iOS 26 design tokens ──────────────────────────────────────
const PAGE_GRADIENT = 'linear-gradient(to bottom, #FFFFFF 0%, #FFB8A8 18%, #C03D25 52%, #2A0800 100%)';

const dInputCls = 'w-full px-3 py-2.5 rounded-xl border border-white/20 bg-white/10 text-sm text-white outline-none focus:border-white/40 focus:bg-white/15 transition-colors placeholder:text-white/30';
const dReadCls  = 'w-full px-3 py-2.5 rounded-xl bg-white/10 text-sm text-white';

function DarkInputRow({ label, icon, error, required, children }: {
  label: string; icon: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-white/50 flex items-center gap-1.5">
        {icon} {label}
        {required && <span className="text-red-300 font-bold">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-300 mt-0.5">{error}</p>}
    </div>
  );
}

function DarkSelectInput({ value, options, onChange, placeholder, disabled, searchable }: {
  value: string; options: string[]; onChange: (v: string) => void;
  placeholder: string; disabled?: boolean; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const optionsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (searchable) searchRef.current?.focus();
      }, 30);
    } else {
      setQuery('');
    }
  }, [open, searchable]);

  const filtered = searchable && query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div>
      <div
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        onClick={() => !disabled && setOpen(p => !p)}
        onKeyDown={e => !disabled && e.key === 'Enter' && setOpen(p => !p)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm ${
          disabled
            ? 'border-transparent bg-white/10 cursor-default'
            : 'border-white/20 bg-white/10 cursor-pointer'
        }`}
      >
        <span className={`text-sm ${value ? 'text-white' : 'text-white/30'}`}>
          {value || placeholder}
        </span>
        {!disabled && (value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-white/40" />
            </button>
          : <ChevronDown size={14} className={`text-white/40 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      {open && !disabled && (
        <div ref={optionsRef} className="mt-1 rounded-xl overflow-hidden" style={{
          background: 'rgba(18, 10, 45, 0.96)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}>
          {searchable && (
            <div className="px-2 py-2 border-b border-white/[0.08]">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Search…"
                className="w-full px-2 py-1.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/30 outline-none"
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2.5 text-sm text-white/30">No results</p>
              : filtered.map(o => (
                <button key={o} type="button"
                  onClick={() => { onChange(o); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-white/[0.06] last:border-0 active:bg-white/10 ${
                    o === value ? 'text-[#C03D25] font-semibold' : 'text-white/80'
                  }`}>
                  {o}
                  {o === value && <Check size={13} className="shrink-0" />}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

function DarkSearchableCombobox({ value, options, onChange, placeholder, disabled }: {
  value: string; options: string[]; onChange: (v: string) => void;
  placeholder: string; disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(name: string) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm ${
        disabled ? 'border-transparent bg-white/10 cursor-default' : 'border-white/20 bg-white/10 cursor-text'
      }`}>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value}
          readOnly={disabled}
          placeholder={value || placeholder}
          onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/30 min-w-0"
        />
        {!disabled && value && !open && (
          <button type="button" onClick={clear}>
            <X size={13} className="text-white/40" />
          </button>
        )}
        {!disabled && !value && (
          <ChevronDown size={14} className="text-white/40 shrink-0" />
        )}
      </div>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl overflow-hidden" style={{
            background: 'rgba(18, 10, 45, 0.96)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0
                ? <p className="px-3 py-2.5 text-sm text-white/30">No results</p>
                : filtered.map(o => (
                  <button key={o} type="button"
                    onMouseDown={e => { e.preventDefault(); select(o); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-white/[0.06] last:border-0 active:bg-white/10 ${
                      o === value ? 'text-[#C03D25] font-semibold' : 'text-white/80'
                    }`}>
                    {o}
                    {o === value && <Check size={13} className="shrink-0" />}
                  </button>
                ))
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DarkSectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-4 space-y-4" style={{
      background: 'rgba(160, 45, 25, 0.38)',
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
    }}>
      <p className="text-xs font-bold text-white/40 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function toProperCase(str: string) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const GENDER_OPTIONS       = ['Male', 'Female', 'Non-Binary'];
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'];

// ── Types ─────────────────────────────────────────────────────
type FormState = {
  clientType: 'Local' | 'International';
  lastName: string; firstName: string; middleName: string; suffix: string;
  gender: string; civilStatus: string;
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
    gender:                 c.gender                   ?? '',
    civilStatus:            c.civil_status             ?? '',
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
  gender: '', civilStatus: '',
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
  const [filterOpen, setFilterOpen]               = useState(false);
  const [filterCitizenshipSearch, setFilterCitizenshipSearch] = useState('');
  const [filterCitizenshipOpen, setFilterCitizenshipOpen] = useState(false);

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
  const [allSalespersons, setAllSalespersons]               = useState<SalespersonRecord[]>([]);
  const [allBrokers, setAllBrokers]                         = useState<BrokerRecord[]>([]);
  const [sellerDirector, setSellerDirector]                 = useState('');
  const [sellerManager, setSellerManager]                   = useState('');
  const [sellerSpecialist, setSellerSpecialist]             = useState('');
  const [brokerDirectorHead, setBrokerDirectorHead]         = useState('');
  const [brokerNetworkOfficer, setBrokerNetworkOfficer]     = useState('');
  const [brokerBirName, setBrokerBirName]                   = useState('');
  const [brokerNetworkAssociate, setBrokerNetworkAssociate] = useState('');

  useEffect(() => {
    fetchAllClients()
      .then(data => {
        setAllClients(data);
        const prefillId = sessionStorage.getItem('cr_prefill_client_id');
        if (prefillId) {
          sessionStorage.removeItem('cr_prefill_client_id');
          const match = data.find(c => c.client_id === prefillId);
          if (match) { openClient(match); setEditMode(true); }
        }
      })
      .finally(() => setLoading(false));
    fetchAllSalespersons().then(setAllSalespersons).catch(console.error);
    fetchAllBrokers().then(setAllBrokers).catch(console.error);
  }, []);

  // In House — specialist-first: pick PS, manager+director auto-fill from PS record
  const specialists = allSalespersons.filter(s => s.position_code === 'Property Specialist');
  function handleSpecialistChange(name: string) {
    if (!editMode) return;
    setSellerSpecialist(name);
    const ps = allSalespersons.find(s => s.seller_name === name);
    setSellerManager(ps?.sales_manager ?? '');
    setSellerDirector(ps?.sales_director ?? '');
  }

  // Broker cascading
  function uniqueNonNull(arr: (string | null)[]): string[] {
    return [...new Set(arr.filter(Boolean) as string[])].sort();
  }
  const brokerDirectorHeads     = uniqueNonNull(allBrokers.map(b => b.sales_director_head));
  const brokerNetworkOfficers   = uniqueNonNull(
    allBrokers.filter(b => !brokerDirectorHead || b.sales_director_head === brokerDirectorHead)
      .map(b => b.broker_network_officer)
  );
  const brokerBirNames          = uniqueNonNull(
    allBrokers.filter(b =>
      (!brokerDirectorHead  || b.sales_director_head    === brokerDirectorHead) &&
      (!brokerNetworkOfficer || b.broker_network_officer === brokerNetworkOfficer)
    ).map(b => b.bir_registered_name)
  );
  const brokerNetworkAssociates = uniqueNonNull(
    allBrokers.filter(b =>
      (!brokerDirectorHead  || b.sales_director_head    === brokerDirectorHead) &&
      (!brokerNetworkOfficer || b.broker_network_officer === brokerNetworkOfficer) &&
      (!brokerBirName        || b.bir_registered_name    === brokerBirName)
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
        gender:                   form.gender,
        civil_status:             form.civilStatus,
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
        gender:                   form.gender                 || null,
        civil_status:             form.civilStatus            || null,
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

  return (
    <>
      {/* Search / List View */}
      <PageShell title="Existing Client" backButton onBack={() => router.back()}>
        <div className="space-y-3 pb-6">

          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SearchInput
                value={clientSearch}
                onChange={setClientSearch}
                placeholder="Search by name…"
              />
            </div>
            <button
              type="button"
              onClick={() => { setFilterCitizenshipSearch(''); setFilterCitizenshipOpen(false); setFilterOpen(true); }}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                clientTypeFilter || citizenshipFilter
                  ? 'bg-[#C03D25] text-white shadow-md'
                  : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
              }`}>
              <SlidersHorizontal size={18} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
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
                  <div className="w-10 h-10 rounded-full bg-[#E5E5EA] flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-[#8E8E93]">
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

      {/* FAB */}
      <button
        type="button"
        onClick={() => router.push('/sales/client-registration/new')}
        className="fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full bg-[#C03D25] flex items-center justify-center shadow-xl active:scale-95 transition-transform"
      >
        <Plus size={24} className="text-white" />
      </button>

      {/* Detail Overlay */}
      {selectedClient && (
        <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT }}>

          {/* Floating nav */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button
              type="button"
              onClick={() => editMode ? cancelEdit() : setSelectedClient(null)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/20 backdrop-blur-sm border border-white/10"
            >
              {editMode
                ? <X size={16} className="text-white" />
                : <ChevronLeft size={18} className="text-white" />
              }
            </button>
            {editMode ? (
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 rounded-full bg-white/90 text-[#1C1C1E] text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <button type="button" onClick={() => setEditMode(true)}
                className="px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-sm border border-white/10 text-white text-sm font-semibold flex items-center gap-1.5">
                <Edit2 size={13} /> Edit
              </button>
            )}
          </div>

          {/* Scrollable content */}
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12">

              {/* Hero */}
              <div className="flex flex-col items-center pt-4 pb-8 gap-2">
                <div className="w-24 h-24 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm border-[3px] border-white/15 shadow-2xl">
                  <span className="text-3xl font-bold text-white/70">
                    {selectedClient.first_name.charAt(0)}{selectedClient.last_name.charAt(0)}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mt-1">
                  {selectedClient.client_id ?? '—'}
                </p>
                <p className="text-[26px] font-bold text-white text-center leading-tight">
                  {selectedClient.first_name}{selectedClient.middle_name ? ` ${selectedClient.middle_name}` : ''}{' '}
                  {selectedClient.last_name}{selectedClient.suffix ? ` ${selectedClient.suffix}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {selectedClient.citizenship && (
                    <span className="text-xs text-white/60">{selectedClient.citizenship}</span>
                  )}
                  <span className={`text-[11px] font-semibold px-3 py-0.5 rounded-full ${
                    selectedClient.client_type === 'Local'
                      ? 'bg-green-500/25 text-green-200'
                      : 'bg-blue-500/25 text-blue-200'
                  }`}>{selectedClient.client_type}</span>
                </div>
              </div>

              {errors._global && (
                <p className="text-xs text-red-300 bg-red-500/20 px-3 py-2 rounded-xl mb-4">{errors._global}</p>
              )}

              <div className="space-y-4">

                {/* Client Type */}
                <DarkSectionCard title="Client Type">
                  <div className="grid grid-cols-2 gap-2">
                    {(['Local', 'International'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => editMode && set('clientType')(t)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          form.clientType === t
                            ? 'bg-[#C03D25] border-[#C03D25]/50 text-white'
                            : editMode
                              ? 'bg-white/10 border-white/10 text-white/50'
                              : 'bg-white/5 border-white/5 text-white/30'
                        } ${!editMode ? 'cursor-default' : ''}`}>
                        {form.clientType === t && <Check size={13} />}
                        {t}
                      </button>
                    ))}
                  </div>
                </DarkSectionCard>

                {/* Personal Information */}
                <DarkSectionCard title="Personal Information">
                  <DarkInputRow label="Last Name" icon={<User size={11} />} error={errors.lastName} required={editMode}>
                    <input
                      type="text" value={form.lastName} readOnly={!editMode}
                      onChange={e => set('lastName')(toProperCase(e.target.value))}
                      placeholder="e.g. Dela Cruz"
                      className={editMode ? dInputCls : dReadCls}
                    />
                  </DarkInputRow>
                  <DarkInputRow label="First Name" icon={<User size={11} />} error={errors.firstName} required={editMode}>
                    <input
                      type="text" value={form.firstName} readOnly={!editMode}
                      onChange={e => set('firstName')(toProperCase(e.target.value))}
                      placeholder="e.g. Juan"
                      className={editMode ? dInputCls : dReadCls}
                    />
                  </DarkInputRow>
                  <DarkInputRow label="Middle Name" icon={<User size={11} />}>
                    <input
                      type="text" value={form.middleName} readOnly={!editMode}
                      onChange={e => set('middleName')(toProperCase(e.target.value))}
                      placeholder="e.g. Santos"
                      className={editMode ? dInputCls : dReadCls}
                    />
                  </DarkInputRow>
                  <DarkInputRow label="Suffix" icon={<User size={11} />}>
                    <input
                      type="text" value={form.suffix} readOnly={!editMode}
                      onChange={e => set('suffix')(toProperCase(e.target.value))}
                      placeholder="e.g. Jr., Sr., III"
                      className={editMode ? dInputCls : dReadCls}
                    />
                  </DarkInputRow>
                  <DarkInputRow label="Gender" icon={<User size={11} />}>
                    <DarkSelectInput value={form.gender} options={GENDER_OPTIONS}
                      onChange={set('gender')} placeholder="Select gender" disabled={!editMode} />
                  </DarkInputRow>
                  <DarkInputRow label="Civil Status" icon={<Heart size={11} />}>
                    <DarkSelectInput value={form.civilStatus} options={CIVIL_STATUS_OPTIONS}
                      onChange={set('civilStatus')} placeholder="Select civil status" disabled={!editMode} />
                  </DarkInputRow>
                  <DarkInputRow label="Date of Birth" icon={<Calendar size={11} />} error={errors.dateOfBirth} required={editMode}>
                    <div className={`w-full flex items-center px-3 py-2.5 rounded-xl border overflow-hidden transition-colors ${
                      !editMode
                        ? 'border-transparent bg-white/10'
                        : 'border-white/20 bg-white/10 focus-within:border-white/40'
                    }`}>
                      <input
                        type="date"
                        value={form.dateOfBirth}
                        readOnly={!editMode}
                        onChange={e => editMode && set('dateOfBirth')(e.target.value)}
                        className="w-full min-w-0 bg-transparent text-sm text-white outline-none"
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                  </DarkInputRow>
                  <DarkInputRow label="Citizenship" icon={<Globe size={11} />} error={errors.citizenship} required={editMode}>
                    {editMode ? (
                      <div role="button" tabIndex={0}
                        onClick={() => { setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
                        onKeyDown={e => e.key === 'Enter' && (setCitizenshipSearch(''), setCitizenshipPickerOpen(true))}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/20 bg-white/10 cursor-pointer">
                        <span className={`text-sm ${form.citizenship ? 'text-white' : 'text-white/30'}`}>
                          {form.citizenship || 'Select citizenship'}
                        </span>
                        {form.citizenship
                          ? <button type="button" onClick={e => { e.stopPropagation(); set('citizenship')(''); }}>
                              <X size={13} className="text-white/40" />
                            </button>
                          : <ChevronDown size={14} className="text-white/40 shrink-0" />
                        }
                      </div>
                    ) : (
                      <div className={dReadCls}>{form.citizenship || '—'}</div>
                    )}
                  </DarkInputRow>
                </DarkSectionCard>

                {/* Contact Details */}
                <DarkSectionCard title="Contact Details">
                  <DarkInputRow label="Mobile Number" icon={<Phone size={11} />} error={errors.mobileNumber} required={editMode}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { if (editMode) { setCountrySearch(''); setCountryPickerOpen(true); } }}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm shrink-0 ${
                          editMode
                            ? 'border-white/20 bg-white/10 active:opacity-70'
                            : 'border-transparent bg-white/10 cursor-default'
                        }`}>
                        <span>{selectedCountry.flag}</span>
                        <span className="font-medium text-white">{selectedCountry.dial}</span>
                        {editMode && <ChevronDown size={12} className="text-white/40" />}
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
                        className={`flex-1 px-3 py-2.5 rounded-xl border text-sm text-white outline-none transition-colors placeholder:text-white/30 ${
                          !editMode
                            ? 'border-transparent bg-white/10 cursor-default'
                            : 'border-white/20 bg-white/10 focus:border-white/40 focus:bg-white/15'
                        }`}
                      />
                    </div>
                  </DarkInputRow>
                  <DarkInputRow label="Landline No." icon={<Phone size={11} />}>
                    <input
                      type="tel"
                      inputMode="numeric"
                      readOnly={!editMode}
                      value={form.landlineNo}
                      onChange={e => editMode && set('landlineNo')(e.target.value.replace(/[^0-9\-\s()]/g, ''))}
                      placeholder="02-8123-4567"
                      className={editMode ? dInputCls : dReadCls}
                    />
                  </DarkInputRow>
                  <DarkInputRow label="Email Address" icon={<Mail size={11} />} error={errors.email} required={editMode}>
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
                      className={
                        !editMode
                          ? dReadCls
                          : errors.email
                            ? 'w-full px-3 py-2.5 rounded-xl border border-red-400/70 bg-white/10 text-sm text-white outline-none focus:border-red-400 transition-colors placeholder:text-white/30'
                            : dInputCls
                      }
                    />
                  </DarkInputRow>
                </DarkSectionCard>

                {/* Purchase Information */}
                <DarkSectionCard title="Purchase Information">
                  <DarkInputRow label="Reason for Buying" icon={<Heart size={11} />} error={errors.reasonForBuying} required={editMode}>
                    <DarkSelectInput value={form.reasonForBuying} options={REASON_OPTIONS}
                      onChange={set('reasonForBuying')} placeholder="Select reason" disabled={!editMode} />
                  </DarkInputRow>
                  <DarkInputRow label="Source of Sale" icon={<Briefcase size={11} />} error={errors.sourceOfSale} required={editMode}>
                    <DarkSelectInput value={form.sourceOfSale} options={SOURCE_OPTIONS}
                      onChange={set('sourceOfSale')} placeholder="Select source" disabled={!editMode} />
                  </DarkInputRow>
                  <DarkInputRow label="Est. Monthly Household Income" icon={<span className="text-[11px] font-bold leading-none">₱</span>} error={errors.monthlyHouseholdIncome} required={editMode}>
                    <DarkSelectInput value={form.monthlyHouseholdIncome} options={INCOME_OPTIONS}
                      onChange={set('monthlyHouseholdIncome')} placeholder="Select income range" disabled={!editMode} />
                  </DarkInputRow>
                </DarkSectionCard>

                {/* Seller Information */}
                <DarkSectionCard title="Seller Information">
                  <div className="grid grid-cols-2 gap-2">
                    {(['In House', 'Broker'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => { if (editMode) { set('sellerType')(t); resetSellerSelections(); } }}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          form.sellerType === t
                            ? 'bg-[#C03D25] border-[#C03D25]/50 text-white'
                            : editMode ? 'bg-white/10 border-white/10 text-white/50'
                                       : 'bg-white/5 border-white/5 text-white/30'
                        } ${!editMode ? 'cursor-default' : ''}`}>
                        {form.sellerType === t && <Check size={13} />}
                        {t}
                      </button>
                    ))}
                  </div>

                  {form.sellerType === 'In House' && (
                    <>
                      <DarkInputRow label="Property Specialist" icon={<User size={11} />}>
                        <DarkSearchableCombobox
                          value={sellerSpecialist}
                          options={specialists.map(s => s.seller_name)}
                          onChange={handleSpecialistChange}
                          placeholder="Search property specialist…"
                          disabled={!editMode}
                        />
                      </DarkInputRow>
                      <DarkInputRow label="Sales Manager" icon={<Users size={11} />}>
                        <DarkSelectInput
                          value={sellerManager}
                          options={[]}
                          onChange={() => {}}
                          placeholder="Auto-filled from specialist"
                          disabled
                        />
                      </DarkInputRow>
                      <DarkInputRow label="Sales Director" icon={<UserCog size={11} />}>
                        <DarkSelectInput
                          value={sellerDirector}
                          options={[]}
                          onChange={() => {}}
                          placeholder="Auto-filled from specialist"
                          disabled
                        />
                      </DarkInputRow>
                    </>
                  )}

                  {form.sellerType === 'Broker' && (
                    <>
                      <DarkInputRow label="Sales Director Head" icon={<UserCog size={11} />}>
                        <DarkSelectInput
                          value={brokerDirectorHead}
                          options={brokerDirectorHeads}
                          onChange={v => { if (editMode) { setBrokerDirectorHead(v); setBrokerNetworkOfficer(''); setBrokerBirName(''); setBrokerNetworkAssociate(''); } }}
                          placeholder="Select Sales Director Head"
                          disabled={!editMode}
                        />
                      </DarkInputRow>
                      <DarkInputRow label="Broker Network Officer" icon={<Users size={11} />}>
                        <DarkSelectInput
                          value={brokerNetworkOfficer}
                          options={brokerNetworkOfficers}
                          onChange={v => { if (editMode) { setBrokerNetworkOfficer(v); setBrokerBirName(''); setBrokerNetworkAssociate(''); } }}
                          placeholder="Select Network Officer"
                          disabled={!editMode}
                        />
                      </DarkInputRow>
                      <DarkInputRow label="BIR Registered Name" icon={<Briefcase size={11} />}>
                        <DarkSelectInput
                          value={brokerBirName}
                          options={brokerBirNames}
                          onChange={v => { if (editMode) { setBrokerBirName(v); setBrokerNetworkAssociate(''); } }}
                          placeholder="Select BIR Registered Name"
                          disabled={!editMode}
                        />
                      </DarkInputRow>
                      <DarkInputRow label="Broker Network Associate" icon={<User size={11} />}>
                        <DarkSelectInput
                          value={brokerNetworkAssociate}
                          options={brokerNetworkAssociates}
                          onChange={v => { if (editMode) setBrokerNetworkAssociate(v); }}
                          placeholder="Select Network Associate"
                          disabled={!editMode}
                        />
                      </DarkInputRow>
                    </>
                  )}
                </DarkSectionCard>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citizenship Picker */}
      {selectedClient && citizenshipPickerOpen && (
        <div className="fixed inset-0 z-[60]" style={{ background: PAGE_GRADIENT }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button
              type="button"
              onClick={() => setCitizenshipPickerOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/20 backdrop-blur-sm border border-white/10"
            >
              <ChevronLeft size={18} className="text-white" />
            </button>
            <p className="text-white font-semibold text-sm">Select Citizenship</p>
            <div className="w-9" />
          </div>
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/20 bg-white/10">
                <Search size={14} className="text-white/40 shrink-0" />
                <input autoFocus type="text" value={citizenshipSearch}
                  onChange={e => setCitizenshipSearch(e.target.value)}
                  placeholder="Search citizenship…"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                />
                {citizenshipSearch && (
                  <button type="button" onClick={() => setCitizenshipSearch('')}>
                    <X size={12} className="text-white/40" />
                  </button>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden" style={{
                background: 'rgba(160, 45, 25, 0.38)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                {filteredCitizenships.map(c => (
                  <button key={c} type="button"
                    onClick={() => { set('citizenship')(c); setCitizenshipPickerOpen(false); setCitizenshipSearch(''); }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] last:border-0 text-left active:bg-white/10 ${
                      form.citizenship === c ? 'bg-white/10' : ''
                    }`}>
                    <span className="text-sm text-white">{c}</span>
                    {form.citizenship === c && <Check size={14} className="text-[#C03D25] shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Country Picker */}
      {selectedClient && countryPickerOpen && (
        <div className="fixed inset-0 z-[60]" style={{ background: PAGE_GRADIENT }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button
              type="button"
              onClick={() => setCountryPickerOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/20 backdrop-blur-sm border border-white/10"
            >
              <ChevronLeft size={18} className="text-white" />
            </button>
            <p className="text-white font-semibold text-sm">Select Country</p>
            <div className="w-9" />
          </div>
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/20 bg-white/10">
                <Search size={14} className="text-white/40 shrink-0" />
                <input autoFocus type="text" value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  placeholder="Search country or dial code…"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                />
                {countrySearch && (
                  <button type="button" onClick={() => setCountrySearch('')}>
                    <X size={12} className="text-white/40" />
                  </button>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden" style={{
                background: 'rgba(160, 45, 25, 0.38)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                {filteredCountries.map(c => (
                  <button key={`${c.name}-${c.dial}`} type="button"
                    onClick={() => { set('countryCode')(c.dial); setCountryPickerOpen(false); setCountrySearch(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06] last:border-0 text-left active:bg-white/10 ${
                      form.countryCode === c.dial && selectedCountry.name === c.name ? 'bg-white/10' : ''
                    }`}>
                    <span className="text-xl shrink-0">{c.flag}</span>
                    <span className="flex-1 text-sm text-white">{c.name}</span>
                    <span className="text-sm font-semibold text-white/50">{c.dial}</span>
                    {form.countryCode === c.dial && selectedCountry.name === c.name && (
                      <Check size={14} className="text-[#C03D25] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Filter sheet backdrop */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/40"
          onClick={() => { setFilterOpen(false); setFilterCitizenshipOpen(false); }}
        />
      )}

      {/* Filter bottom sheet */}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl">

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button
              type="button"
              onClick={() => { setFilterOpen(false); setFilterCitizenshipOpen(false); }}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>

          <div className="px-5 space-y-5 pb-4">

            {/* Client Type */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Client Type</p>
              <div className="flex gap-2">
                {(['', 'Local', 'International'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setClientTypeFilter(t)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      clientTypeFilter === t
                        ? 'bg-[#C03D25] border-[#C03D25] text-white'
                        : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                    }`}>
                    {t || 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Citizenship */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Citizenship</p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFilterCitizenshipOpen(p => !p)}
                onKeyDown={e => e.key === 'Enter' && setFilterCitizenshipOpen(p => !p)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] cursor-pointer">
                <span className={`text-sm ${citizenshipFilter ? 'text-[#1C1C1E] font-medium' : 'text-[#C7C7CC]'}`}>
                  {citizenshipFilter || 'Select citizenship'}
                </span>
                {citizenshipFilter
                  ? <button type="button" onClick={e => { e.stopPropagation(); setCitizenshipFilter(''); }}>
                      <X size={13} className="text-[#C7C7CC]" />
                    </button>
                  : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${filterCitizenshipOpen ? 'rotate-180' : ''}`} />
                }
              </div>
              {filterCitizenshipOpen && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#F2F2F7] rounded-xl">
                    <Search size={13} className="text-[#C7C7CC] shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={filterCitizenshipSearch}
                      onChange={e => setFilterCitizenshipSearch(e.target.value)}
                      placeholder="Search citizenship…"
                      className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
                    />
                    {filterCitizenshipSearch && (
                      <button type="button" onClick={() => setFilterCitizenshipSearch('')}>
                        <X size={12} className="text-[#C7C7CC]" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white">
                    <button
                      type="button"
                      onClick={() => { setCitizenshipFilter(''); setFilterCitizenshipOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.04] text-left active:bg-gray-50 ${
                        citizenshipFilter === '' ? 'bg-[#C03D25]/5' : ''
                      }`}>
                      <span className={`text-sm ${citizenshipFilter === '' ? 'text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}>All</span>
                      {citizenshipFilter === '' && <Check size={13} className="text-[#C03D25] shrink-0" />}
                    </button>
                    {citizenshipOptions
                      .filter(c => !filterCitizenshipSearch || c.toLowerCase().includes(filterCitizenshipSearch.toLowerCase()))
                      .map(c => (
                        <button key={c} type="button"
                          onClick={() => { setCitizenshipFilter(c); setFilterCitizenshipOpen(false); }}
                          className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.04] last:border-0 text-left active:bg-gray-50 ${
                            citizenshipFilter === c ? 'bg-[#C03D25]/5' : ''
                          }`}>
                          <span className={`text-sm ${citizenshipFilter === c ? 'text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}>{c}</span>
                          {citizenshipFilter === c && <Check size={13} className="text-[#C03D25] shrink-0" />}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>

          </div>

          {/* Actions */}
          <div className="px-5 pb-10 pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => { setClientTypeFilter(''); setCitizenshipFilter(''); }}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Clear All
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
              Done
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
