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
  SlidersHorizontal, Plus, PenLine, Upload, RotateCcw,
} from 'lucide-react';
import { fetchAllClients, updateClient, updateClientSignature, checkEmailExists, ClientRecord } from '@/lib/clients';
import {
  COUNTRY_CODES, CITIZENSHIP_LIST,
  REASON_OPTIONS, SOURCE_OPTIONS, INCOME_OPTIONS,
} from '@/lib/client-form-options';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchAllBrokers, BrokerRecord } from '@/lib/brokers';

// ── iOS 26 design tokens ──────────────────────────────────────
const PAGE_GRADIENT = 'linear-gradient(to bottom, #FFFFFF 0%, #8E8E93 50%, #3A3A3C 100%)';

const dInputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white/90 transition-colors placeholder:text-[#C7C7CC]';
const dReadCls  = 'w-full px-3 py-2.5 rounded-xl bg-white/60 text-sm text-[#1C1C1E]';

function DarkInputRow({ label, icon, error, required, children }: {
  label: string; icon: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#6C6C70] flex items-center gap-1.5">
        {icon} {label}
        {required && <span className="text-red-500 font-bold">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function DarkSelectInput({ value, options, onChange, placeholder, disabled }: {
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
            ? 'border-transparent bg-white/60 cursor-default'
            : 'border-black/[0.10] bg-white/70 cursor-pointer'
        }`}
      >
        <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || placeholder}
        </span>
        {!disabled && (value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#8E8E93]" />
            </button>
          : <ChevronDown size={14} className={`text-[#8E8E93] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      {open && !disabled && (
        <div ref={optionsRef} className="mt-1 rounded-xl overflow-hidden" style={{
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(0,0,0,0.08)',
        }}>
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-black/[0.04] ${
                o === value ? 'text-[#C03D25] font-semibold bg-black/[0.03]' : 'text-[#3C3C43]'
              }`}>
              {o}
              {o === value && <Check size={13} className="shrink-0 text-[#C03D25]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DarkSectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-4 space-y-4" style={{
      background: 'rgba(255, 255, 255, 0.88)',
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      border: '1px solid rgba(0, 0, 0, 0.06)',
      boxShadow: '0 2px 16px rgba(0, 0, 0, 0.08)',
    }}>
      <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">{title}</p>
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
export default function ClientRegistrationPage() {
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
  const [filterCitizenshipOpen, setFilterCitizenshipOpen]     = useState(false);

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

  // Signature state
  const [sigMode, setSigMode]         = useState<'idle' | 'draw' | 'upload'>('idle');
  const [sigPreview, setSigPreview]   = useState<string | null>(null);
  const [sigSaving, setSigSaving]     = useState(false);
  const sigCanvasRef                  = useRef<HTMLCanvasElement>(null);
  const sigDrawing                    = useRef(false);
  const sigLastPos                    = useRef<{ x: number; y: number } | null>(null);
  const sigFileRef                    = useRef<HTMLInputElement>(null);

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
    setSigMode('idle');
    setSigPreview(null);
  }

  function cancelEdit() {
    setEditMode(false);
    setForm(mapClientToForm(selectedClient!));
    loadSellerFromClient(selectedClient!);
    setErrors({});
    setSigMode('idle');
    setSigPreview(null);
  }

  const set = (key: keyof FormState) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  function validate() {
    const e: Record<string, string> = {};
    if (!form.lastName.trim())        e.lastName               = 'Last name is required';
    if (!form.firstName.trim())       e.firstName              = 'First name is required';
    if (!form.dateOfBirth) {
      e.dateOfBirth = 'Date of birth is required';
    } else {
      const dob = new Date(form.dateOfBirth);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      if (dob > cutoff) e.dateOfBirth = 'Client must be at least 18 years old';
    }
    if (!form.citizenship)            e.citizenship            = 'Citizenship is required';
    if (!form.mobileNumber.trim())    e.mobileNumber           = 'Mobile number is required';
    if (!form.email.trim())           e.email                  = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                      e.email                  = 'Enter a valid email address';
    else if (
      form.email.trim().toLowerCase() !== (selectedClient?.email ?? '').toLowerCase() &&
      allClients.some(c => c.email?.toLowerCase() === form.email.trim().toLowerCase())
    )                                 e.email                  = 'This email is already registered';
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
    if (clientTypeFilter && c.client_type !== clientTypeFilter) return false;
    if (citizenshipFilter && c.citizenship !== citizenshipFilter) return false;
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      const searchable = [
        c.last_name, c.first_name, c.middle_name, c.suffix,
        c.client_id,
        c.email,
        c.mobile_number,
        c.citizenship,
        c.property_specialist,
        c.broker_network_associate,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      {/* Search / List View */}
      <PageShell title="Client Registration">
        <div className="space-y-3 pb-6">

          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SearchInput
                value={clientSearch}
                onChange={setClientSearch}
                placeholder="Search by name, email, mobile, ID…"
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
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
                  >
                    <span className="text-sm font-bold text-white">
                      {c.first_name.charAt(0)}{c.last_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E] truncate">
                      {c.last_name}, {c.first_name}
                      {c.middle_name ? ` ${c.middle_name}` : ''}
                      {c.suffix ? ` ${c.suffix}` : ''}
                    </p>
                    <p className="text-xs text-[#8E8E93] truncate">
                      {c.email ?? (c.mobile_number ? `${c.country_code ?? '+63'} ${c.mobile_number}` : null) ?? c.citizenship ?? '—'}
                    </p>
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
        className="fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        style={{ background: 'rgba(192, 61, 37, 0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        <Plus size={24} className="text-white" />
      </button>

      {/* Detail Overlay */}
      {selectedClient && (
        <div className="fixed inset-0 z-50" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.38s cubic-bezier(0.22,1,0.36,1) both' }}>
          <style>{`
            @keyframes overlaySlideUp {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
          `}</style>

          {/* Floating nav */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button
              type="button"
              onClick={() => editMode ? cancelEdit() : setSelectedClient(null)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10 backdrop-blur-sm border border-black/10"
            >
              {editMode
                ? <X size={16} className="text-[#1C1C1E]" />
                : <ChevronLeft size={18} className="text-[#1C1C1E]" />
              }
            </button>
            {editMode ? (
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 rounded-full bg-[#1C1C1E] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <button type="button" onClick={() => setEditMode(true)}
                className="px-4 py-1.5 rounded-full bg-black/10 backdrop-blur-sm border border-black/10 text-[#1C1C1E] text-sm font-semibold flex items-center gap-1.5">
                <Edit2 size={13} /> Edit
              </button>
            )}
          </div>

          {/* Scrollable content */}
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12 max-w-lg mx-auto w-full">

              {/* Hero */}
              <div className="flex flex-col items-center pt-4 pb-8 gap-2">
                <div
                  className="w-24 h-24 rounded-3xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)',
                    boxShadow: '0 8px 32px rgba(192,61,37,0.40)',
                  }}
                >
                  <span className="text-3xl font-bold text-white">
                    {selectedClient.first_name.charAt(0)}{selectedClient.last_name.charAt(0)}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-[#6C6C70] uppercase tracking-widest mt-1">
                  {selectedClient.client_id ?? '—'}
                </p>
                <p className="text-[26px] font-bold text-[#1C1C1E] text-center leading-tight">
                  {selectedClient.first_name}{selectedClient.middle_name ? ` ${selectedClient.middle_name}` : ''}{' '}
                  {selectedClient.last_name}{selectedClient.suffix ? ` ${selectedClient.suffix}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {selectedClient.citizenship && (
                    <span className="text-xs text-[#6C6C70]">{selectedClient.citizenship}</span>
                  )}
                  <span className={`text-[11px] font-semibold px-3 py-0.5 rounded-full ${
                    selectedClient.client_type === 'Local'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>{selectedClient.client_type}</span>
                </div>
              </div>

              {errors._global && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">{errors._global}</p>
              )}

              <div className="space-y-4">

                <DarkSectionCard title="Client Type">
                  <div className="grid grid-cols-2 gap-2">
                    {(['Local', 'International'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => editMode && set('clientType')(t)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          form.clientType === t
                            ? 'bg-[#C03D25] border-[#C03D25]/50 text-white'
                            : editMode
                              ? 'bg-white/60 border-black/[0.08] text-[#6C6C70]'
                              : 'bg-white/40 border-black/[0.04] text-[#8E8E93]'
                        } ${!editMode ? 'cursor-default' : ''}`}>
                        {form.clientType === t && <Check size={13} />}
                        {t}
                      </button>
                    ))}
                  </div>
                </DarkSectionCard>

                <DarkSectionCard title="Personal Information">
                  <DarkInputRow label="Last Name" icon={<User size={11} />} error={errors.lastName} required={editMode}>
                    <input type="text" value={form.lastName} readOnly={!editMode}
                      onChange={e => set('lastName')(toProperCase(e.target.value))}
                      placeholder="e.g. Dela Cruz" className={editMode ? dInputCls : dReadCls} />
                  </DarkInputRow>
                  <DarkInputRow label="First Name" icon={<User size={11} />} error={errors.firstName} required={editMode}>
                    <input type="text" value={form.firstName} readOnly={!editMode}
                      onChange={e => set('firstName')(toProperCase(e.target.value))}
                      placeholder="e.g. Juan" className={editMode ? dInputCls : dReadCls} />
                  </DarkInputRow>
                  <DarkInputRow label="Middle Name" icon={<User size={11} />}>
                    <input type="text" value={form.middleName} readOnly={!editMode}
                      onChange={e => set('middleName')(toProperCase(e.target.value))}
                      placeholder="e.g. Santos" className={editMode ? dInputCls : dReadCls} />
                  </DarkInputRow>
                  <DarkInputRow label="Suffix" icon={<User size={11} />}>
                    <input type="text" value={form.suffix} readOnly={!editMode}
                      onChange={e => set('suffix')(toProperCase(e.target.value))}
                      placeholder="e.g. Jr., Sr., III" className={editMode ? dInputCls : dReadCls} />
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
                      !editMode ? 'border-transparent bg-white/60' : 'border-black/[0.10] bg-white/70 focus-within:border-black/20'
                    }`}>
                      <input type="date" value={form.dateOfBirth} readOnly={!editMode}
                        max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().split('T')[0]; })()}
                        onChange={e => editMode && set('dateOfBirth')(e.target.value)}
                        className="w-full min-w-0 bg-transparent text-sm text-[#1C1C1E] outline-none"
                        style={{ colorScheme: 'light' }} />
                    </div>
                  </DarkInputRow>
                  <DarkInputRow label="Citizenship" icon={<Globe size={11} />} error={errors.citizenship} required={editMode}>
                    {editMode ? (
                      <div role="button" tabIndex={0}
                        onClick={() => { setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
                        onKeyDown={e => e.key === 'Enter' && (setCitizenshipSearch(''), setCitizenshipPickerOpen(true))}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70 cursor-pointer">
                        <span className={`text-sm ${form.citizenship ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                          {form.citizenship || 'Select citizenship'}
                        </span>
                        {form.citizenship
                          ? <button type="button" onClick={e => { e.stopPropagation(); set('citizenship')(''); }}>
                              <X size={13} className="text-[#8E8E93]" />
                            </button>
                          : <ChevronDown size={14} className="text-[#8E8E93] shrink-0" />
                        }
                      </div>
                    ) : (
                      <div className={dReadCls}>{form.citizenship || '—'}</div>
                    )}
                  </DarkInputRow>
                </DarkSectionCard>

                <DarkSectionCard title="Contact Details">
                  <DarkInputRow label="Mobile Number" icon={<Phone size={11} />} error={errors.mobileNumber} required={editMode}>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => { if (editMode) { setCountrySearch(''); setCountryPickerOpen(true); } }}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm shrink-0 ${
                          editMode ? 'border-black/[0.10] bg-white/70 active:opacity-70' : 'border-transparent bg-white/60 cursor-default'
                        }`}>
                        <span>{selectedCountry.flag}</span>
                        <span className="font-medium text-[#1C1C1E]">{selectedCountry.dial}</span>
                        {editMode && <ChevronDown size={12} className="text-[#8E8E93]" />}
                      </button>
                      <input type="tel" inputMode="numeric" readOnly={!editMode}
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
                          !editMode ? 'border-transparent bg-white/60 cursor-default' : 'border-black/[0.10] bg-white/70 focus:border-black/20 focus:bg-white/90'
                        }`}
                      />
                    </div>
                  </DarkInputRow>
                  <DarkInputRow label="Landline No." icon={<Phone size={11} />}>
                    <input type="tel" inputMode="numeric" readOnly={!editMode}
                      value={form.landlineNo}
                      onChange={e => editMode && set('landlineNo')(e.target.value.replace(/[^0-9\-\s()]/g, ''))}
                      placeholder="02-8123-4567" className={editMode ? dInputCls : dReadCls} />
                  </DarkInputRow>
                  <DarkInputRow label="Email Address" icon={<Mail size={11} />} error={errors.email} required={editMode}>
                    <input type="email" inputMode="email" readOnly={!editMode}
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
                          setErrors(prev =>
                            prev.email === 'Enter a valid email address' ? { ...prev, email: '' } : prev
                          );
                      }}
                      placeholder="juan@email.com"
                      className={
                        !editMode ? dReadCls
                          : errors.email
                            ? 'w-full px-3 py-2.5 rounded-xl border border-red-400 bg-white/70 text-sm text-[#1C1C1E] outline-none focus:border-red-500 transition-colors placeholder:text-[#C7C7CC]'
                            : dInputCls
                      }
                    />
                  </DarkInputRow>
                </DarkSectionCard>

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

                <DarkSectionCard title="Seller Information">
                  <div className="grid grid-cols-2 gap-2">
                    {(['In House', 'Broker'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => { if (editMode) { set('sellerType')(t); resetSellerSelections(); } }}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          form.sellerType === t
                            ? 'bg-[#C03D25] border-[#C03D25]/50 text-white'
                            : editMode ? 'bg-white/60 border-black/[0.08] text-[#6C6C70]'
                                       : 'bg-white/40 border-black/[0.04] text-[#8E8E93]'
                        } ${!editMode ? 'cursor-default' : ''}`}>
                        {form.sellerType === t && <Check size={13} />}
                        {t}
                      </button>
                    ))}
                  </div>

                  {form.sellerType === 'In House' && (
                    <>
                      <DarkInputRow label="Sales Director" icon={<UserCog size={11} />}>
                        <DarkSelectInput value={sellerDirector} options={directors.map(s => s.seller_name)}
                          onChange={v => { if (editMode) { setSellerDirector(v); setSellerManager(''); setSellerSpecialist(''); } }}
                          placeholder="Select Sales Director" disabled={!editMode} />
                      </DarkInputRow>
                      <DarkInputRow label="Sales Manager" icon={<Users size={11} />}>
                        <DarkSelectInput value={sellerManager} options={managers.map(s => s.seller_name)}
                          onChange={v => { if (editMode) { setSellerManager(v); setSellerSpecialist(''); } }}
                          placeholder="Select Sales Manager" disabled={!editMode} />
                      </DarkInputRow>
                      <DarkInputRow label="Property Specialist" icon={<User size={11} />}>
                        <DarkSelectInput value={sellerSpecialist} options={specialists.map(s => s.seller_name)}
                          onChange={v => { if (editMode) setSellerSpecialist(v); }}
                          placeholder="Select Property Specialist" disabled={!editMode} />
                      </DarkInputRow>
                    </>
                  )}

                  {form.sellerType === 'Broker' && (
                    <>
                      <DarkInputRow label="Sales Director Head" icon={<UserCog size={11} />}>
                        <DarkSelectInput value={brokerDirectorHead} options={brokerDirectorHeads}
                          onChange={v => { if (editMode) { setBrokerDirectorHead(v); setBrokerNetworkOfficer(''); setBrokerBirName(''); setBrokerNetworkAssociate(''); } }}
                          placeholder="Select Sales Director Head" disabled={!editMode} />
                      </DarkInputRow>
                      <DarkInputRow label="Broker Network Officer" icon={<Users size={11} />}>
                        <DarkSelectInput value={brokerNetworkOfficer} options={brokerNetworkOfficers}
                          onChange={v => { if (editMode) { setBrokerNetworkOfficer(v); setBrokerBirName(''); setBrokerNetworkAssociate(''); } }}
                          placeholder="Select Network Officer" disabled={!editMode} />
                      </DarkInputRow>
                      <DarkInputRow label="BIR Registered Name" icon={<Briefcase size={11} />}>
                        <DarkSelectInput value={brokerBirName} options={brokerBirNames}
                          onChange={v => { if (editMode) { setBrokerBirName(v); setBrokerNetworkAssociate(''); } }}
                          placeholder="Select BIR Registered Name" disabled={!editMode} />
                      </DarkInputRow>
                      <DarkInputRow label="Broker Network Associate" icon={<User size={11} />}>
                        <DarkSelectInput value={brokerNetworkAssociate} options={brokerNetworkAssociates}
                          onChange={v => { if (editMode) setBrokerNetworkAssociate(v); }}
                          placeholder="Select Network Associate" disabled={!editMode} />
                      </DarkInputRow>
                    </>
                  )}
                </DarkSectionCard>

                {/* Signature Section */}
                <DarkSectionCard title="Client Signature">
                  {(() => {
                    const currentSig = sigPreview ?? selectedClient.signature_base64 ?? null;

                    const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
                      const canvas = sigCanvasRef.current!;
                      const rect = canvas.getBoundingClientRect();
                      const scaleX = canvas.width / rect.width;
                      const scaleY = canvas.height / rect.height;
                      const src = 'touches' in e ? e.touches[0] : e;
                      return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
                    };
                    const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
                      e.preventDefault(); sigDrawing.current = true; sigLastPos.current = getPos(e);
                    };
                    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
                      e.preventDefault();
                      if (!sigDrawing.current || !sigCanvasRef.current) return;
                      const ctx = sigCanvasRef.current.getContext('2d')!;
                      const pos = getPos(e);
                      ctx.beginPath(); ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y);
                      ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1C1C1E'; ctx.lineWidth = 2;
                      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
                      sigLastPos.current = pos;
                    };
                    const stopDraw = () => { sigDrawing.current = false; sigLastPos.current = null; };
                    const clearCanvas = () => {
                      const canvas = sigCanvasRef.current;
                      if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
                    };

                    const handleSave = async (b64: string) => {
                      setSigSaving(true);
                      try {
                        await updateClientSignature(selectedClient.id, b64);
                        setSelectedClient(prev => prev ? { ...prev, signature_base64: b64 } : prev);
                        setSigPreview(null);
                        setSigMode('idle');
                      } catch (err) { console.error(err); }
                      finally { setSigSaving(false); }
                    };
                    const saveDrawn = async () => {
                      const b64 = sigCanvasRef.current?.toDataURL('image/png') ?? '';
                      await handleSave(b64);
                    };
                    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => setSigPreview(reader.result as string);
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    };

                    return (
                      <div className="space-y-3">
                        {/* Current signature display */}
                        {currentSig && sigMode === 'idle' ? (
                          <div className="rounded-2xl border border-black/[0.08] bg-white/60 p-3 flex items-center justify-center min-h-[100px]">
                            <img src={currentSig} alt="Client Signature" className="max-h-[90px] object-contain" />
                          </div>
                        ) : sigMode === 'idle' ? (
                          <div className="rounded-2xl border border-dashed border-black/[0.15] bg-white/40 p-4 flex items-center justify-center min-h-[80px]">
                            <p className="text-xs text-[#8E8E93]">No signature on file</p>
                          </div>
                        ) : null}

                        {/* Draw mode */}
                        {sigMode === 'draw' && (
                          <div className="space-y-2">
                            <canvas
                              ref={sigCanvasRef} width={600} height={180}
                              className="w-full rounded-2xl border border-black/[0.12] bg-white touch-none"
                              style={{ cursor: 'crosshair' }}
                              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                            />
                            <div className="flex gap-2">
                              <button type="button" onClick={clearCanvas}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#6C6C70] active:opacity-70">
                                <RotateCcw size={13} /> Clear
                              </button>
                              <button type="button" onClick={saveDrawn} disabled={sigSaving}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1C1C1E] text-white text-xs font-semibold active:opacity-70 disabled:opacity-50">
                                {sigSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Signature
                              </button>
                              <button type="button" onClick={() => { setSigMode('idle'); setSigPreview(null); }}
                                className="w-9 flex items-center justify-center rounded-xl border border-black/[0.10] bg-white/60 active:opacity-70">
                                <X size={14} className="text-[#8E8E93]" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Upload preview */}
                        {sigMode === 'upload' && sigPreview && (
                          <div className="space-y-2">
                            <div className="rounded-2xl border border-black/[0.08] bg-white/60 p-3 flex items-center justify-center min-h-[100px]">
                              <img src={sigPreview} alt="Preview" className="max-h-[90px] object-contain" />
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => { setSigPreview(null); sigFileRef.current?.click(); }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#6C6C70] active:opacity-70">
                                <Upload size={13} /> Choose Different
                              </button>
                              <button type="button" onClick={() => handleSave(sigPreview)} disabled={sigSaving}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1C1C1E] text-white text-xs font-semibold active:opacity-70 disabled:opacity-50">
                                {sigSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Signature
                              </button>
                              <button type="button" onClick={() => { setSigMode('idle'); setSigPreview(null); }}
                                className="w-9 flex items-center justify-center rounded-xl border border-black/[0.10] bg-white/60 active:opacity-70">
                                <X size={14} className="text-[#8E8E93]" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Upload mode waiting for file */}
                        {sigMode === 'upload' && !sigPreview && (
                          <div className="rounded-2xl border border-dashed border-black/[0.15] bg-white/40 p-4 flex flex-col items-center justify-center gap-2 min-h-[80px]">
                            <p className="text-xs text-[#8E8E93]">Select an image file</p>
                            <button type="button" onClick={() => sigFileRef.current?.click()}
                              className="px-4 py-1.5 rounded-xl bg-[#1C1C1E] text-white text-xs font-medium active:opacity-70">
                              Browse
                            </button>
                            <button type="button" onClick={() => setSigMode('idle')}
                              className="text-xs text-[#8E8E93] underline">Cancel</button>
                          </div>
                        )}

                        {/* Action buttons (idle mode) */}
                        {sigMode === 'idle' && editMode && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setSigMode('draw')}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                              <PenLine size={13} /> {selectedClient.signature_base64 ? 'Redraw' : 'Draw Signature'}
                            </button>
                            <button type="button" onClick={() => { setSigMode('upload'); sigFileRef.current?.click(); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                              <Upload size={13} /> Upload
                            </button>
                          </div>
                        )}

                        <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      </div>
                    );
                  })()}
                </DarkSectionCard>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citizenship Picker */}
      {selectedClient && citizenshipPickerOpen && (
        <div className="fixed inset-0 z-[60]" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.32s cubic-bezier(0.22,1,0.36,1) both' }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button type="button" onClick={() => setCitizenshipPickerOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10 backdrop-blur-sm border border-black/10">
              <ChevronLeft size={18} className="text-[#1C1C1E]" />
            </button>
            <p className="text-[#1C1C1E] font-semibold text-sm">Select Citizenship</p>
            <div className="w-9" />
          </div>
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70">
                <Search size={14} className="text-[#8E8E93] shrink-0" />
                <input autoFocus type="text" value={citizenshipSearch}
                  onChange={e => setCitizenshipSearch(e.target.value)}
                  placeholder="Search citizenship…"
                  className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]" />
                {citizenshipSearch && (
                  <button type="button" onClick={() => setCitizenshipSearch('')}>
                    <X size={12} className="text-[#8E8E93]" />
                  </button>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden" style={{
                background: 'rgba(255, 255, 255, 0.88)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}>
                {filteredCitizenships.map(c => (
                  <button key={c} type="button"
                    onClick={() => { set('citizenship')(c); setCitizenshipPickerOpen(false); setCitizenshipSearch(''); }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-black/[0.05] last:border-0 text-left active:bg-black/[0.04] ${
                      form.citizenship === c ? 'bg-black/[0.04]' : ''
                    }`}>
                    <span className="text-sm text-[#1C1C1E]">{c}</span>
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
        <div className="fixed inset-0 z-[60]" style={{ background: PAGE_GRADIENT, animation: 'overlaySlideUp 0.32s cubic-bezier(0.22,1,0.36,1) both' }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button type="button" onClick={() => setCountryPickerOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10 backdrop-blur-sm border border-black/10">
              <ChevronLeft size={18} className="text-[#1C1C1E]" />
            </button>
            <p className="text-[#1C1C1E] font-semibold text-sm">Select Country</p>
            <div className="w-9" />
          </div>
          <div className="absolute inset-0 overflow-y-auto">
            <div className="px-4 pt-[88px] pb-12 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/70">
                <Search size={14} className="text-[#8E8E93] shrink-0" />
                <input autoFocus type="text" value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  placeholder="Search country or dial code…"
                  className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]" />
                {countrySearch && (
                  <button type="button" onClick={() => setCountrySearch('')}>
                    <X size={12} className="text-[#8E8E93]" />
                  </button>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden" style={{
                background: 'rgba(255, 255, 255, 0.88)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}>
                {filteredCountries.map(c => (
                  <button key={`${c.name}-${c.dial}`} type="button"
                    onClick={() => { set('countryCode')(c.dial); setCountryPickerOpen(false); setCountrySearch(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.05] last:border-0 text-left active:bg-black/[0.04] ${
                      form.countryCode === c.dial && selectedCountry.name === c.name ? 'bg-black/[0.04]' : ''
                    }`}>
                    <span className="text-xl shrink-0">{c.flag}</span>
                    <span className="flex-1 text-sm text-[#1C1C1E]">{c.name}</span>
                    <span className="text-sm font-semibold text-[#8E8E93]">{c.dial}</span>
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
        <div className="fixed inset-0 z-[45] bg-black/40"
          onClick={() => { setFilterOpen(false); setFilterCitizenshipOpen(false); }} />
      )}

      {/* Filter bottom sheet */}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button type="button"
              onClick={() => { setFilterOpen(false); setFilterCitizenshipOpen(false); }}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>
          <div className="px-5 space-y-5 pb-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Client Type</p>
              <div className="flex gap-2">
                {(['', 'Local', 'International'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setClientTypeFilter(t)}
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
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Citizenship</p>
              <div role="button" tabIndex={0}
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
                    <input autoFocus type="text" value={filterCitizenshipSearch}
                      onChange={e => setFilterCitizenshipSearch(e.target.value)}
                      placeholder="Search citizenship…"
                      className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]" />
                    {filterCitizenshipSearch && (
                      <button type="button" onClick={() => setFilterCitizenshipSearch('')}>
                        <X size={12} className="text-[#C7C7CC]" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white">
                    <button type="button"
                      onClick={() => { setCitizenshipFilter(''); setFilterCitizenshipOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.04] text-left active:bg-gray-50 ${citizenshipFilter === '' ? 'bg-[#C03D25]/5' : ''}`}>
                      <span className={`text-sm ${citizenshipFilter === '' ? 'text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}>All</span>
                      {citizenshipFilter === '' && <Check size={13} className="text-[#C03D25] shrink-0" />}
                    </button>
                    {citizenshipOptions
                      .filter(c => !filterCitizenshipSearch || c.toLowerCase().includes(filterCitizenshipSearch.toLowerCase()))
                      .map(c => (
                        <button key={c} type="button"
                          onClick={() => { setCitizenshipFilter(c); setFilterCitizenshipOpen(false); }}
                          className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.04] last:border-0 text-left active:bg-gray-50 ${citizenshipFilter === c ? 'bg-[#C03D25]/5' : ''}`}>
                          <span className={`text-sm ${citizenshipFilter === c ? 'text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'}`}>{c}</span>
                          {citizenshipFilter === c && <Check size={13} className="text-[#C03D25] shrink-0" />}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="px-5 pb-10 pt-2 flex gap-3">
            <button type="button"
              onClick={() => { setClientTypeFilter(''); setCitizenshipFilter(''); }}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Clear All
            </button>
            <button type="button" onClick={() => setFilterOpen(false)}
              className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80">
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
