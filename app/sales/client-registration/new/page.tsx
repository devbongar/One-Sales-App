'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import {
  X, Check, ChevronDown, Search, Loader2,
  Phone, Mail, Globe, User, Calendar,
  Heart, Briefcase, UserCog, Users, PenLine, Upload, RotateCcw,
  Building2,
} from 'lucide-react';
import {
  COUNTRY_CODES, CITIZENSHIP_LIST,
  REASON_OPTIONS, SOURCE_OPTIONS, INCOME_OPTIONS,
} from '@/lib/client-form-options';
import { saveClient, updateClientSignatureByClientId, fetchAllClients, checkEmailExists, ClientRecord } from '@/lib/clients';
import { triggerClientEmail } from '@/lib/email';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchAllBrokers, BrokerRecord as BrokersTableRecord, fetchAllBrokerRecruits, BrokerRecruitRecord } from '@/lib/brokers';
import { getSession } from '@/lib/auth';
import type { AppUser } from '@/types';
import SearchableCombobox from '@/components/ui/SearchableCombobox';

const GENDER_OPTIONS    = ['Male', 'Female', 'Non-Binary'];
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'];

const EMPTY_FORM = {
  clientType: 'Local' as 'Local' | 'International',
  lastName: '', firstName: '', middleName: '', suffix: '',
  gender: '', civilStatus: '',
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
function ReadOnlyInput({ value, placeholder }: { value: string; placeholder: string }) {
  return (
    <div className="w-full flex items-center px-3 py-2.5 rounded-xl border border-black/[0.06] bg-black/[0.03]">
      <span className={`text-sm ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
        {value || placeholder}
      </span>
    </div>
  );
}

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

function SelectInput({ value, options, onChange, placeholder, searchable }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder: string; searchable?: boolean;
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
        role="button" tabIndex={0}
        onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 cursor-pointer"
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
          {searchable && (
            <div className="px-2 py-2 border-b border-black/[0.05]">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Search…"
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-black/[0.10] bg-white/80 outline-none placeholder:text-[#C7C7CC]"
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2.5 text-sm text-[#C7C7CC]">No results</p>
              : filtered.map(o => (
                <button key={o} type="button"
                  onClick={() => { onChange(o); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-black/[0.05] last:border-0 active:bg-gray-50 ${
                    o === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E]'
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


function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
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
  const [citizenshipPickerTarget, setCitizenshipPickerTarget] = useState<'primary' | number>('primary');

  // Multiple citizenship
  const [hasMultipleCitizenship, setHasMultipleCitizenship] = useState(false);
  const [otherCitizenships, setOtherCitizenships]           = useState<string[]>([]);

  const [allClients, setAllClients] = useState<ClientRecord[]>([]);

  // Session + auto-fill
  const [user,              setUser]              = useState<AppUser | null>(null);
  const [userSalesperson,   setUserSalesperson]   = useState<SalespersonRecord | null>(null);
  const [userBroker,        setUserBroker]        = useState<BrokerRecruitRecord | null>(null);

  // Seller state
  const [allSalespersons,    setAllSalespersons]    = useState<SalespersonRecord[]>([]);
  const [allBrokers,         setAllBrokers]         = useState<BrokersTableRecord[]>([]);
  const [allBrokerRecruits,  setAllBrokerRecruits]  = useState<BrokerRecruitRecord[]>([]);
  const [sellerDirector, setSellerDirector]   = useState('');
  const [sellerManager, setSellerManager]     = useState('');
  const [sellerSpecialist, setSellerSpecialist] = useState('');
  const [brokerNetworkAssociate, setBrokerNetworkAssociate] = useState('');
  const [brokerNetworkOfficer, setBrokerNetworkOfficer]     = useState('');
  const [brokerDirectorHead, setBrokerDirectorHead]         = useState('');
  const [brokerSalesHead, setBrokerSalesHead]               = useState('');
  const [brokerBirName, setBrokerBirName]                   = useState('');
  const [brokerCascadeSource, setBrokerCascadeSource] = useState<'bir' | 'associate' | 'officer' | 'sdh' | null>(null);

  // Megawide employee
  const [isMegawideEmployee, setIsMegawideEmployee] = useState(false);

  // Signature state
  const [sigMode, setSigMode]       = useState<'idle' | 'draw' | 'upload'>('idle');
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const sigCanvasRef                = useRef<HTMLCanvasElement>(null);
  const sigDrawing                  = useRef(false);
  const sigLastPos                  = useRef<{ x: number; y: number } | null>(null);
  const sigFileRef                  = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof EMPTY_FORM) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  useEffect(() => {
    fetchAllClients().then(setAllClients).catch(console.error);
    fetchAllSalespersons().then(setAllSalespersons).catch(console.error);
    fetchAllBrokers().then(setAllBrokers).catch(console.error);
    fetchAllBrokerRecruits().then(setAllBrokerRecruits).catch(console.error);
    getSession().then(setUser).catch(console.error);
  }, []);

  // Auto-fill seller fields based on logged-in user's rank
  useEffect(() => {
    if (!user?.seller_id || !allSalespersons.length) return;
    const sp = allSalespersons.find(s => s.seller_id === user.seller_id) ?? null;
    const br = allBrokerRecruits.find(r => r.broker_id === user.seller_id) ?? null;
    setUserSalesperson(sp);
    setUserBroker(br);
    if (sp) {
      set('sellerType')('In House');
      if (sp.position_rank === 'PS') {
        setSellerSpecialist(sp.seller_name);
        setSellerManager(sp.sales_manager ?? '');
        setSellerDirector(sp.sales_director ?? '');
      } else if (sp.position_rank === 'SM') {
        setSellerManager(sp.seller_name);
        setSellerDirector(sp.sales_director ?? '');
      } else if (sp.position_rank === 'SD') {
        setSellerDirector(sp.seller_name);
      }
    } else if (br && allBrokers.length) {
      set('sellerType')('Broker');
      const birRec = allBrokers.find(b => b.broker_id === br.broker_id);
      setBrokerBirName(birRec ? bName(birRec) : (br.full_name ?? ''));
      setBrokerNetworkAssociate(br.broker_network_associate ?? '');
      setBrokerNetworkOfficer(br.broker_network_officer ?? '');
      setBrokerDirectorHead(br.sales_director_head ?? '');
      setBrokerSalesHead(br.sales_head ?? '');
      setBrokerCascadeSource('bir');
    }
  }, [user?.seller_id, allSalespersons, allBrokerRecruits, allBrokers]);

  // In House — specialist-first: pick PS, manager+director auto-fill from PS record
  const allPsRaw = allSalespersons.filter(s => s.position_code === 'Property Specialist');
  const specialists = (() => {
    if (!userSalesperson) return allPsRaw;
    const rank = userSalesperson.position_rank;
    if (rank === 'PS')  return allPsRaw.filter(s => s.seller_id === userSalesperson.seller_id);
    if (rank === 'SM')  return allPsRaw.filter(s => s.sales_manager === userSalesperson.seller_name);
    if (rank === 'SD')  return allPsRaw.filter(s => s.sales_director === userSalesperson.seller_name);
    if (rank === 'SDH') return allPsRaw.filter(s => s.sales_division_head === userSalesperson.seller_name);
    if (rank === 'SH')  return allPsRaw.filter(s => s.sales_head === userSalesperson.seller_name);
    return allPsRaw;
  })();
  function handleSpecialistChange(name: string) {
    setSellerSpecialist(name);
    const ps = allSalespersons.find(s => s.seller_name === name);
    setSellerManager(ps?.sales_manager ?? '');
    setSellerDirector(ps?.sales_director ?? '');
  }

  // Broker cascade — uses Brokers table (BIR → Associate → Officer → SDH → SH)
  const bName = (b: BrokersTableRecord) => b.seller_name || b.full_name || '';

  // Rank-lock helpers for broker cascade — fields at or above the user's in-house rank stay locked
  const spRank = userSalesperson?.position_rank ?? '';
  const brokerRankLocks = {
    bna: ['SM', 'SDH', 'SH'].includes(spRank),
    bno: ['SM', 'SD', 'SDH', 'SH'].includes(spRank),
    sdh: ['SM', 'SD', 'SDH', 'SH'].includes(spRank),
    sh:  ['SM', 'SD', 'SDH', 'SH'].includes(spRank),
  };

  function handleBrokerBirChange(name: string) {
    const rec = name ? allBrokers.find(b => bName(b) === name) : null;
    setBrokerBirName(name);
    if (!brokerRankLocks.bna) setBrokerNetworkAssociate(rec?.broker_network_associate ?? '');
    if (!brokerRankLocks.bno) setBrokerNetworkOfficer(rec?.broker_network_officer    ?? '');
    if (!brokerRankLocks.sdh) setBrokerDirectorHead(rec?.sales_director_head         ?? '');
    if (!brokerRankLocks.sh)  setBrokerSalesHead(rec?.sales_head                     ?? '');
    setBrokerCascadeSource(name ? 'bir' : null);
  }

  function handleBrokerAssociateChange(name: string) {
    const rec = name ? allBrokers.find(b => b.broker_network_associate === name) : null;
    setBrokerNetworkAssociate(name);
    setBrokerBirName(rec ? bName(rec) : '');
    if (!brokerRankLocks.bno) setBrokerNetworkOfficer(rec?.broker_network_officer ?? '');
    if (!brokerRankLocks.sdh) setBrokerDirectorHead(rec?.sales_director_head     ?? '');
    if (!brokerRankLocks.sh)  setBrokerSalesHead(rec?.sales_head                 ?? '');
    setBrokerCascadeSource(name ? 'associate' : null);
  }

  function handleBrokerOfficerChange(name: string) {
    const rec = name ? allBrokers.find(b => b.broker_network_officer === name) : null;
    setBrokerNetworkOfficer(name);
    if (!brokerRankLocks.sdh) setBrokerDirectorHead(rec?.sales_director_head ?? '');
    if (!brokerRankLocks.sh)  setBrokerSalesHead(rec?.sales_head             ?? '');
    setBrokerCascadeSource(name ? 'officer' : null);
  }

  function handleBrokerSdhChange(name: string) {
    const rec = name ? allBrokers.find(b => b.sales_director_head === name) : null;
    setBrokerDirectorHead(name);
    if (!brokerRankLocks.sh) setBrokerSalesHead(rec?.sales_head ?? '');
    setBrokerCascadeSource(name ? 'sdh' : null);
  }

  const birOptions = [...new Set(allBrokers.map(bName).filter(Boolean))];
  const brokerAssociateOptions = [...new Set(
    (brokerBirName && brokerCascadeSource !== 'associate'
      ? allBrokers.filter(b => bName(b) === brokerBirName)
      : allBrokers
    ).map(b => b.broker_network_associate).filter((v): v is string => !!v)
  )];
  const brokerOfficerOptions = [...new Set(
    (brokerCascadeSource !== 'bir' && brokerCascadeSource !== 'associate' && brokerNetworkAssociate
      ? allBrokers.filter(b => b.broker_network_associate === brokerNetworkAssociate)
      : allBrokers
    ).map(b => b.broker_network_officer).filter((v): v is string => !!v)
  )];
  const brokerSdhOptions = [...new Set(
    (brokerCascadeSource !== 'bir' && brokerCascadeSource !== 'associate' && brokerCascadeSource !== 'officer' && brokerNetworkOfficer
      ? allBrokers.filter(b => b.broker_network_officer === brokerNetworkOfficer)
      : allBrokers
    ).map(b => b.sales_director_head).filter((v): v is string => !!v)
  )];
  const brokerShOptions = [...new Set(
    (brokerCascadeSource === null && brokerDirectorHead
      ? allBrokers.filter(b => b.sales_director_head === brokerDirectorHead)
      : allBrokers
    ).map(b => b.sales_head).filter((v): v is string => !!v)
  )];

  function resetSellerSelections() {
    setSellerDirector(''); setSellerManager(''); setSellerSpecialist('');
    setBrokerNetworkAssociate(''); setBrokerNetworkOfficer('');
    setBrokerDirectorHead(''); setBrokerSalesHead(''); setBrokerBirName('');
    setBrokerCascadeSource(null);
  }

  async function validate() {
    const e: Record<string, string> = {};
    if (!form.lastName.trim())              e.lastName              = 'Last name is required';
    if (!form.firstName.trim())             e.firstName             = 'First name is required';
    if (!form.gender)                       e.gender                = 'Gender is required';
    if (!form.civilStatus)                  e.civilStatus           = 'Civil status is required';
    if (!form.dateOfBirth) {
      e.dateOfBirth = 'Date of birth is required';
    } else {
      const dob = new Date(form.dateOfBirth);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      if (dob > cutoff) e.dateOfBirth = 'Client must be at least 18 years old';
    }
    if (!form.citizenship)                  e.citizenship           = 'Citizenship is required';
    if (!form.mobileNumber.trim())          e.mobileNumber          = 'Mobile number is required';
    if (!form.email.trim())                 e.email                 = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                            e.email                 = 'Enter a valid email address';
    else {
      const taken = await checkEmailExists(form.email);
      if (taken)                            e.email                 = 'This email is already registered';
    }
    if (!form.reasonForBuying)              e.reasonForBuying       = 'Reason for buying is required';
    if (!form.sourceOfSale)                 e.sourceOfSale          = 'Source of sale is required';
    if (!form.monthlyHouseholdIncome)       e.monthlyHouseholdIncome = 'Monthly income is required';
    if (!sigPreview)                        e.signature              = 'Client signature is required';
    if (form.sellerType === 'In House') {
      if (isMegawideEmployee && !sellerDirector)   e.sellerDirector    = 'Sales Director is required';
      if (!isMegawideEmployee && !sellerSpecialist) e.sellerSpecialist = 'Property Specialist is required';
    }
    if (form.sellerType === 'Broker' && !brokerBirName) e.brokerBirName = 'Broker Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!await validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      // Compute seller ID columns for filtering
      let sellerIds: { seller_id?: string | null; sales_manager_id?: string | null; sales_director_id?: string | null; sales_division_head_id?: string | null; sales_head_id?: string | null; broker_id?: string | null; } = {};
      if (form.sellerType === 'In House') {
        if (isMegawideEmployee) {
          const sdRec = allSalespersons.find(s => s.seller_name === sellerDirector);
          sellerIds = { sales_director_id: sdRec?.seller_id ?? null, sales_division_head_id: sdRec?.sales_division_head_id ?? null, sales_head_id: sdRec?.sales_head_id ?? null };
        } else {
          const psRec = allSalespersons.find(s => s.seller_name === sellerSpecialist);
          sellerIds = { seller_id: psRec?.seller_id ?? null, sales_manager_id: psRec?.sales_manager_id ?? null, sales_director_id: psRec?.sales_director_id ?? null, sales_division_head_id: psRec?.sales_division_head_id ?? null, sales_head_id: psRec?.sales_head_id ?? null };
        }
      } else if (form.sellerType === 'Broker') {
        const birRec = allBrokers.find(b => bName(b) === brokerBirName);
        const rRec   = birRec ? allBrokerRecruits.find(r => r.broker_id === birRec.broker_id) : null;
        sellerIds = { broker_id: rRec?.broker_id ?? birRec?.broker_id ?? null, sales_manager_id: rRec?.broker_network_associate_id ?? null, sales_director_id: rRec?.broker_network_officer_id ?? null, sales_division_head_id: rRec?.sales_director_head_id ?? null, sales_head_id: rRec?.sales_head_id ?? null };
      }
      const clientId = await saveClient({
        client_type:              form.clientType,
        last_name:                form.lastName,
        first_name:               form.firstName,
        middle_name:              form.middleName,
        suffix:                   form.suffix,
        gender:                   form.gender,
        civil_status:             form.civilStatus,
        date_of_birth:            form.dateOfBirth,
        citizenship:              [form.citizenship, ...otherCitizenships.filter(Boolean)].join(' | '),
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
        broker_network_associate: form.sellerType === 'Broker'   ? brokerNetworkAssociate   : undefined,
        broker_network_officer:   form.sellerType === 'Broker'   ? brokerNetworkOfficer     : undefined,
        broker_director_head:     form.sellerType === 'Broker'   ? brokerDirectorHead       : undefined,
        broker_sales_head:        form.sellerType === 'Broker'   ? brokerSalesHead          : undefined,
        broker_bir_name:          form.sellerType === 'Broker'   ? brokerBirName            : undefined,
        is_megawide_employee:     isMegawideEmployee,
        ...sellerIds,
      });
      if (sigPreview) {
        try { await updateClientSignatureByClientId(clientId, sigPreview); } catch {}
      }
      triggerClientEmail({
        id: clientId, client_id: null, client_type: form.clientType,
        last_name: form.lastName, first_name: form.firstName, middle_name: form.middleName || null,
        suffix: form.suffix || null, gender: form.gender || null, civil_status: form.civilStatus || null,
        date_of_birth: form.dateOfBirth || null, citizenship: [form.citizenship, ...otherCitizenships.filter(Boolean)].join(' | ') || null,
        country_code: form.countryCode || null, mobile_number: form.mobileNumber || null,
        landline_no: form.landlineNo || null, email: form.email || null,
        reason_for_buying: form.reasonForBuying || null, source_of_sale: form.sourceOfSale || null,
        monthly_household_income: form.monthlyHouseholdIncome || null, is_megawide_employee: isMegawideEmployee,
        seller_type: form.sellerType || null,
        sales_director: form.sellerType === 'In House' ? sellerDirector : null,
        sales_manager: form.sellerType === 'In House' ? sellerManager : null,
        property_specialist: form.sellerType === 'In House' ? sellerSpecialist : null,
        broker_network_associate: form.sellerType === 'Broker' ? brokerNetworkAssociate : null,
        broker_network_officer:   form.sellerType === 'Broker' ? brokerNetworkOfficer : null,
        broker_director_head:     form.sellerType === 'Broker' ? brokerDirectorHead : null,
        broker_sales_head:        form.sellerType === 'Broker' ? brokerSalesHead : null,
        broker_bir_name:          form.sellerType === 'Broker' ? brokerBirName : null,
        signature_base64: sigPreview, created_at: new Date().toISOString(),
      } as ClientRecord, 'on_client_created').catch(e => console.error('[email-trigger]', e));
      setSavedClient({ ...form });
      setSavedClientId(clientId);
      setShowSuccess(true);
    } catch (e: any) {
      console.error('[NewClient] saveClient error:', e);
      setErrors({ _global: e.message ?? 'Failed to save. Please try again.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const successInitials = `${savedClient.firstName.charAt(0)}${savedClient.lastName.charAt(0)}`.toUpperCase();
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{
        background: 'linear-gradient(to bottom, #FFFFFF 0%, #8E8E93 50%, #3A3A3C 100%)',
        animation: 'overlaySlideUp 0.38s cubic-bezier(0.22,1,0.36,1) both',
      }}>
        <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center px-6 pt-20 pb-12 text-center">

            {/* Avatar */}
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center mb-5"
              style={{
                background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)',
                boxShadow: '0 8px 32px rgba(192,61,37,0.40)',
              }}
            >
              <span className="text-3xl font-bold text-white">{successInitials}</span>
            </div>

            <p className="text-[11px] font-semibold text-[#6C6C70] uppercase tracking-widest mb-1">Registration Complete</p>
            <p className="text-[26px] font-bold text-[#1C1C1E] leading-tight">
              {savedClient.firstName}{savedClient.middleName ? ` ${savedClient.middleName}` : ''}{' '}
              {savedClient.lastName}{savedClient.suffix ? ` ${savedClient.suffix}` : ''}
            </p>

            {/* Client ID badge */}
            <div className="mt-5 px-6 py-4 rounded-2xl flex flex-col items-center gap-1" style={{
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
            }}>
              <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-widest">Client ID</p>
              <p className="text-2xl font-bold text-[#C03D25] tracking-widest">{savedClientId}</p>
            </div>

            <p className="text-sm text-[#6C6C70] mt-4 capitalize">
              Registered as a {savedClient.clientType.toLowerCase()} client
            </p>

            <div className="flex flex-col gap-3 w-full max-w-xs mt-10">
              <button type="button"
                onClick={() => { setForm(EMPTY_FORM); setErrors({}); setSavedClient(null); setSavedClientId(''); setShowSuccess(false); setSigPreview(null); setSigMode('idle'); setIsMegawideEmployee(false); resetSellerSelections(); setHasMultipleCitizenship(false); setOtherCitizenships([]); reApplyAutoFill(); }}
                className="w-full py-3.5 rounded-2xl text-white text-sm font-bold active:opacity-80"
                style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
                Register Another Client
              </button>
              <button type="button"
                onClick={() => router.push('/sales/client-registration')}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold active:opacity-70"
                style={{ background: 'rgba(255,255,255,0.80)', color: '#1C1C1E' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
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
                form.countryCode === c.dial && selectedCountry.name === c.name ? 'bg-[#C03D25]/5' : ''
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
          {filteredCitizenships.map(c => {
            const currentVal = citizenshipPickerTarget === 'primary'
              ? form.citizenship
              : otherCitizenships[citizenshipPickerTarget as number] ?? '';
            return (
              <button key={c} type="button"
                onClick={() => {
                  if (citizenshipPickerTarget === 'primary') {
                    set('citizenship')(c);
                  } else {
                    const idx = citizenshipPickerTarget as number;
                    setOtherCitizenships(prev => prev.map((v, i) => i === idx ? c : v));
                  }
                  setCitizenshipPickerOpen(false);
                  setCitizenshipSearch('');
                }}
                className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-black/[0.04] text-left active:bg-gray-50 ${
                  currentVal === c ? 'bg-[#C03D25]/5' : ''
                }`}>
                <span className="text-sm text-[#1C1C1E]">{c}</span>
                {currentVal === c && <Check size={14} className="text-[#C03D25] shrink-0" />}
              </button>
            );
          })}
        </div>
      </PageShell>
    );
  }

  // ── Seller role flags ─────────────────────────────────────
  const isUserPS     = userSalesperson?.position_rank === 'PS';
  const isUserSM     = userSalesperson?.position_rank === 'SM';
  const isUserSD     = userSalesperson?.position_rank === 'SD';
  const isUserBroker = !!userBroker;
  // When an in-house user switches to Broker mode, lock their equivalent rank and above
  const lockBrokerBNA = isUserBroker || brokerRankLocks.bna;
  const lockBrokerBNO = isUserBroker || brokerRankLocks.bno;
  const lockBrokerSDH = isUserBroker || brokerRankLocks.sdh;
  const lockBrokerSH  = isUserBroker || brokerRankLocks.sh;
  const canToggleMegawide = user?.role_name === 'Sales Director' || user?.role_name === 'All Access';
  const sellerTypeOptions = (['In House', 'Broker'] as const).filter(t =>
    !(t === 'Broker' && (isMegawideEmployee || isUserPS)) &&
    !(t === 'In House' && isUserBroker)
  );

  // Helper: re-apply auto-fill after "Register Another Client" reset
  function reApplyAutoFill() {
    if (userSalesperson) {
      set('sellerType')('In House');
      if (userSalesperson.position_rank === 'PS') {
        setSellerSpecialist(userSalesperson.seller_name);
        setSellerManager(userSalesperson.sales_manager ?? '');
        setSellerDirector(userSalesperson.sales_director ?? '');
      } else if (userSalesperson.position_rank === 'SM') {
        setSellerManager(userSalesperson.seller_name);
        setSellerDirector(userSalesperson.sales_director ?? '');
      } else if (userSalesperson.position_rank === 'SD') {
        setSellerDirector(userSalesperson.seller_name);
      }
    } else if (userBroker) {
      set('sellerType')('Broker');
      const birRec = allBrokers.find(b => b.broker_id === userBroker.broker_id);
      setBrokerBirName(birRec ? bName(birRec) : (userBroker.full_name ?? ''));
      setBrokerNetworkAssociate(userBroker.broker_network_associate ?? '');
      setBrokerNetworkOfficer(userBroker.broker_network_officer ?? '');
      setBrokerDirectorHead(userBroker.sales_director_head ?? '');
      setBrokerSalesHead(userBroker.sales_head ?? '');
      setBrokerCascadeSource('bir');
    }
  }

  // ── Form ──────────────────────────────────────────────────
  return (
    <PageShell title="New Client" backButton onBack={() => router.back()}>
      <div className="space-y-4 pb-6">
        {errors._global && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{errors._global}</p>
        )}

        {/* Client Type */}
        <div className="rounded-3xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">Client Type <span className="text-red-500 font-bold">*</span></p>
          <div className="grid grid-cols-2 gap-2">
            {(['Local', 'International'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('clientType')(t)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  form.clientType === t
                    ? 'bg-[#C03D25] border-[#C03D25]/50 text-white'
                    : 'bg-white/60 border-black/[0.08] text-[#6C6C70]'
                }`}>
                {form.clientType === t && <Check size={13} />}
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Personal Information */}
        <div className="rounded-3xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">Personal Information</p>
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
          <InputRow label="Gender" icon={<User size={11} />} error={errors.gender} required>
            <SelectInput value={form.gender} options={GENDER_OPTIONS}
              onChange={set('gender')} placeholder="Select gender" />
          </InputRow>
          <InputRow label="Civil Status" icon={<Heart size={11} />} error={errors.civilStatus} required>
            <SelectInput value={form.civilStatus} options={CIVIL_STATUS_OPTIONS}
              onChange={set('civilStatus')} placeholder="Select civil status" />
          </InputRow>

          <InputRow label="Date of Birth" icon={<Calendar size={11} />} error={errors.dateOfBirth} required>
            <div className="w-full flex items-center px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 overflow-hidden focus-within:border-black/20 focus-within:bg-white transition-colors">
              <input
                type="date"
                value={form.dateOfBirth}
                max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().split('T')[0]; })()}
                onChange={e => set('dateOfBirth')(e.target.value)}
                className="w-full min-w-0 bg-transparent text-sm text-[#1C1C1E] outline-none"
              />
            </div>
          </InputRow>
          <InputRow label={hasMultipleCitizenship ? 'Citizenship 1' : 'Citizenship'} icon={<Globe size={11} />} error={errors.citizenship} required>
            <div role="button" tabIndex={0}
              onClick={() => { setCitizenshipPickerTarget('primary'); setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
              onKeyDown={e => e.key === 'Enter' && (setCitizenshipPickerTarget('primary'), setCitizenshipSearch(''), setCitizenshipPickerOpen(true))}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 active:opacity-70 cursor-pointer">
              <span className={`text-sm ${form.citizenship ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
                {form.citizenship || 'Select citizenship'}
              </span>
              {form.citizenship
                ? <button type="button" onClick={e => { e.stopPropagation(); set('citizenship')(''); }}>
                    <X size={13} className="text-[#C7C7CC]" />
                  </button>
                : <ChevronDown size={14} className="text-[#C7C7CC] shrink-0" />
              }
            </div>
          </InputRow>

          {/* Multiple citizenship toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
              <Globe size={11} /> Multiple Citizenship
            </label>
            <button
              type="button"
              onClick={() => {
                setHasMultipleCitizenship(p => {
                  if (p) setOtherCitizenships([]);
                  return !p;
                });
              }}
              className="relative rounded-full shrink-0 transition-all duration-300 focus:outline-none"
              style={{
                width: 52, height: 28,
                background: hasMultipleCitizenship ? 'linear-gradient(90deg, #E05A3A 0%, #C03D25 100%)' : 'rgba(0,0,0,0.15)',
              }}
            >
              <span
                className="absolute bg-white rounded-full transition-all duration-300"
                style={{ width: 24, height: 24, top: 2, left: hasMultipleCitizenship ? 26 : 2, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
              />
            </button>
          </div>

          {/* Secondary citizenships */}
          {hasMultipleCitizenship && (
            <>
              {otherCitizenships.map((c, i) => (
                <InputRow key={i} label={`Citizenship ${i + 2}`} icon={<Globe size={11} />}>
                  <div className="flex gap-2">
                    <div role="button" tabIndex={0}
                      onClick={() => { setCitizenshipPickerTarget(i); setCitizenshipSearch(''); setCitizenshipPickerOpen(true); }}
                      onKeyDown={e => e.key === 'Enter' && (setCitizenshipPickerTarget(i), setCitizenshipSearch(''), setCitizenshipPickerOpen(true))}
                      className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 active:opacity-70 cursor-pointer">
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
                      className="w-10 flex items-center justify-center rounded-xl border border-black/[0.10] bg-white/60 active:opacity-70 shrink-0">
                      <X size={14} className="text-[#8E8E93]" />
                    </button>
                  </div>
                </InputRow>
              ))}
              <button type="button"
                onClick={() => setOtherCitizenships(prev => [...prev, ''])}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-black/[0.15] bg-white/40 text-xs font-medium text-[#6C6C70] active:opacity-70">
                + Add Citizenship
              </button>
            </>
          )}
        </div>

        {/* Contact Details */}
        <div className="rounded-3xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">Contact Details</p>
          <InputRow label="Mobile Number" icon={<Phone size={11} />} error={errors.mobileNumber} required>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCountrySearch(''); setCountryPickerOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 text-sm shrink-0 active:opacity-70">
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
                className="flex-1 px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
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
              className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white/80 text-sm text-[#1C1C1E] outline-none focus:border-black/20 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
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
              className={`w-full px-3 py-2.5 rounded-xl border bg-white/80 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-[#C7C7CC] focus:bg-white ${
                errors.email ? 'border-red-400 focus:border-red-400' : 'border-black/[0.10] focus:border-black/20'
              }`}
            />
            {!errors.email && form.email.trim().length > 0 &&
              allClients.some(c => c.email?.toLowerCase() === form.email.trim().toLowerCase()) && (
              <p className="text-xs text-amber-500 mt-0.5">This email is already registered.</p>
            )}
          </InputRow>
        </div>

        {/* Purchase Information */}
        <div className="rounded-3xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">Purchase Information</p>
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
        </div>

        {/* Megawide Employee — only for Sales Director and All Access */}
        {canToggleMegawide && <div className="rounded-3xl p-4" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300"
                style={{
                  background: isMegawideEmployee
                    ? 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)'
                    : 'rgba(0,0,0,0.06)',
                  boxShadow: isMegawideEmployee ? '0 4px 16px rgba(192,61,37,0.35)' : 'none',
                }}
              >
                <Building2 size={18} className={isMegawideEmployee ? 'text-white' : 'text-[#8E8E93]'} />
              </div>
              <p className="text-sm font-semibold text-[#1C1C1E]">Megawide Employee</p>
            </div>
            <button
              type="button"
              onClick={() => { setIsMegawideEmployee(p => { if (!p) set('sellerType')('In House'); return !p; }); resetSellerSelections(); }}
              className="relative rounded-full shrink-0 transition-all duration-300 focus:outline-none"
              style={{
                width: 52, height: 28,
                background: isMegawideEmployee ? 'linear-gradient(90deg, #E05A3A 0%, #C03D25 100%)' : 'rgba(0,0,0,0.15)',
              }}
            >
              <span
                className="absolute bg-white rounded-full transition-all duration-300"
                style={{ width: 24, height: 24, top: 2, left: isMegawideEmployee ? 26 : 2, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
              />
            </button>
          </div>
        </div>}

        {/* Seller Information */}
        <div className="rounded-3xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', position: 'relative', zIndex: 2 }}>
          <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">Seller Information</p>

          {/* Seller Type toggle — hidden if only one option */}
          {sellerTypeOptions.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {sellerTypeOptions.map(t => (
                <button key={t} type="button"
                  onClick={() => {
                    set('sellerType')(t);
                    resetSellerSelections();
                    if (t === 'In House' && userSalesperson) {
                      if (userSalesperson.position_rank === 'SM') { setSellerManager(userSalesperson.seller_name); setSellerDirector(userSalesperson.sales_director ?? ''); }
                      else if (userSalesperson.position_rank === 'SD') { setSellerDirector(userSalesperson.seller_name); }
                    } else if (t === 'Broker' && userSalesperson) {
                      const rank = userSalesperson.position_rank;
                      if (rank === 'SM') {
                        setBrokerNetworkAssociate(userSalesperson.seller_name);
                        setBrokerNetworkOfficer(userSalesperson.sales_director ?? '');
                        setBrokerDirectorHead(userSalesperson.sales_division_head ?? '');
                        setBrokerSalesHead(userSalesperson.sales_head ?? '');
                      } else if (rank === 'SD') {
                        setBrokerNetworkOfficer(userSalesperson.seller_name);
                        setBrokerDirectorHead(userSalesperson.sales_division_head ?? '');
                        setBrokerSalesHead(userSalesperson.sales_head ?? '');
                      } else if (rank === 'SDH') {
                        setBrokerDirectorHead(userSalesperson.seller_name);
                        setBrokerSalesHead(userSalesperson.sales_head ?? '');
                      } else if (rank === 'SH') {
                        setBrokerSalesHead(userSalesperson.seller_name);
                      }
                    }
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    form.sellerType === t
                      ? 'bg-[#C03D25] border-[#C03D25]/50 text-white'
                      : 'bg-white/60 border-black/[0.08] text-[#6C6C70]'
                  }`}>
                  {form.sellerType === t && <Check size={13} />}
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* In House — Megawide employee: SD only */}
          {form.sellerType === 'In House' && isMegawideEmployee && (
            <InputRow label="Sales Director" icon={<UserCog size={11} />} error={errors.sellerDirector} required>
              {isUserSD ? (
                <ReadOnlyInput value={sellerDirector} placeholder="Auto-filled" />
              ) : (
                <SearchableCombobox
                  value={sellerDirector}
                  options={allSalespersons.filter(s => s.position_rank === 'SD').map(s => s.seller_name)}
                  onChange={setSellerDirector}
                  placeholder="Search sales director…"
                />
              )}
            </InputRow>
          )}

          {/* In House — specialist-first, manager+director auto-fill */}
          {form.sellerType === 'In House' && !isMegawideEmployee && (
            <>
              <InputRow label="Property Specialist" icon={<User size={11} />} error={errors.sellerSpecialist} required>
                {isUserPS ? (
                  <ReadOnlyInput value={sellerSpecialist} placeholder="Auto-filled" />
                ) : (
                  <SearchableCombobox
                    value={sellerSpecialist}
                    options={specialists.map(s => s.seller_name)}
                    onChange={handleSpecialistChange}
                    placeholder={specialists.length === 0 ? 'Loading…' : 'Search property specialist…'}
                  />
                )}
              </InputRow>
              <InputRow label="Sales Manager" icon={<Users size={11} />}>
                <ReadOnlyInput value={sellerManager} placeholder={isUserSM ? 'Auto-filled' : 'Auto-filled from specialist'} />
              </InputRow>
              <InputRow label="Sales Director" icon={<UserCog size={11} />}>
                <ReadOnlyInput value={sellerDirector} placeholder={isUserSD ? 'Auto-filled' : 'Auto-filled from specialist'} />
              </InputRow>
            </>
          )}

          {/* Broker — cascading searchable dropdowns (BIR → Associate → Officer → SDH → SH) */}
          {form.sellerType === 'Broker' && (
            <>
              <InputRow label="Broker Name" icon={<User size={11} />} error={errors.brokerBirName} required>
                {isUserBroker ? (
                  <ReadOnlyInput value={brokerBirName} placeholder="Auto-filled" />
                ) : (
                  <SearchableCombobox
                    value={brokerBirName}
                    options={birOptions}
                    onChange={handleBrokerBirChange}
                    placeholder={allBrokers.length === 0 ? 'Loading…' : 'Search broker…'}
                  />
                )}
              </InputRow>
              <InputRow label="Broker Network Associate" icon={<User size={11} />}>
                {lockBrokerBNA ? (
                  <ReadOnlyInput value={brokerNetworkAssociate} placeholder="Auto-filled" />
                ) : (
                  <SearchableCombobox
                    value={brokerNetworkAssociate}
                    options={brokerAssociateOptions}
                    onChange={handleBrokerAssociateChange}
                    placeholder="Search associate…"
                    disabled={brokerCascadeSource === 'bir'}
                  />
                )}
              </InputRow>
              <InputRow label="Broker Network Officer" icon={<Users size={11} />}>
                {lockBrokerBNO ? (
                  <ReadOnlyInput value={brokerNetworkOfficer} placeholder="Auto-filled" />
                ) : (
                  <SearchableCombobox
                    value={brokerNetworkOfficer}
                    options={brokerOfficerOptions}
                    onChange={handleBrokerOfficerChange}
                    placeholder="Search network officer…"
                    disabled={brokerCascadeSource === 'bir' || brokerCascadeSource === 'associate'}
                  />
                )}
              </InputRow>
              <InputRow label="Sales Division Head" icon={<UserCog size={11} />}>
                {lockBrokerSDH ? (
                  <ReadOnlyInput value={brokerDirectorHead} placeholder="Auto-filled" />
                ) : (
                  <SearchableCombobox
                    value={brokerDirectorHead}
                    options={brokerSdhOptions}
                    onChange={handleBrokerSdhChange}
                    placeholder="Search division head…"
                    disabled={brokerCascadeSource === 'bir' || brokerCascadeSource === 'associate' || brokerCascadeSource === 'officer'}
                  />
                )}
              </InputRow>
              <InputRow label="Sales Head" icon={<UserCog size={11} />}>
                {lockBrokerSH ? (
                  <ReadOnlyInput value={brokerSalesHead} placeholder="Auto-filled" />
                ) : (
                  <SearchableCombobox
                    value={brokerSalesHead}
                    options={brokerShOptions}
                    onChange={v => { setBrokerSalesHead(v); setBrokerCascadeSource(null); }}
                    placeholder="Search sales head…"
                    disabled={brokerCascadeSource !== null}
                  />
                )}
              </InputRow>
            </>
          )}
        </div>

        {/* Signature */}
        <div className="rounded-3xl p-4 space-y-3" style={{
          background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        }}>
          <p className="text-xs font-bold text-[#6C6C70] uppercase tracking-wider">Client Signature <span className="text-red-500 font-bold">*</span></p>
          {errors.signature && <p className="text-xs text-red-500 -mt-1">{errors.signature}</p>}

          {/* Preview */}
          {sigPreview && sigMode !== 'draw' && (
            <div className="rounded-2xl border border-black/[0.08] bg-white/60 p-3 flex items-center justify-center min-h-[100px]">
              <img src={sigPreview} alt="Signature" className="max-h-[90px] object-contain" />
            </div>
          )}
          {!sigPreview && sigMode === 'idle' && (
            <div className="rounded-2xl border border-dashed border-black/[0.15] bg-white/40 p-4 flex items-center justify-center min-h-[72px]">
              <p className="text-xs text-[#8E8E93]">No signature added</p>
            </div>
          )}

          {/* Draw canvas */}
          {sigMode === 'draw' && (
            <div className="space-y-2">
              <canvas
                ref={sigCanvasRef} width={600} height={180}
                className="w-full rounded-2xl border border-black/[0.12] bg-white touch-none"
                style={{ cursor: 'crosshair' }}
                onMouseDown={e => { sigDrawing.current = true; const r = sigCanvasRef.current!.getBoundingClientRect(); const sx = sigCanvasRef.current!.width/r.width, sy = sigCanvasRef.current!.height/r.height; sigLastPos.current = { x: (e.clientX-r.left)*sx, y: (e.clientY-r.top)*sy }; }}
                onMouseMove={e => { if (!sigDrawing.current || !sigCanvasRef.current) return; const r = sigCanvasRef.current.getBoundingClientRect(); const sx = sigCanvasRef.current.width/r.width, sy = sigCanvasRef.current.height/r.height; const pos = { x: (e.clientX-r.left)*sx, y: (e.clientY-r.top)*sy }; const ctx = sigCanvasRef.current.getContext('2d')!; ctx.beginPath(); ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y); ctx.lineTo(pos.x, pos.y); ctx.strokeStyle='#1C1C1E'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); sigLastPos.current=pos; }}
                onMouseUp={() => { sigDrawing.current = false; }}
                onMouseLeave={() => { sigDrawing.current = false; }}
                onTouchStart={e => { e.preventDefault(); sigDrawing.current = true; const r = sigCanvasRef.current!.getBoundingClientRect(); const sx = sigCanvasRef.current!.width/r.width, sy = sigCanvasRef.current!.height/r.height; sigLastPos.current = { x: (e.touches[0].clientX-r.left)*sx, y: (e.touches[0].clientY-r.top)*sy }; }}
                onTouchMove={e => { e.preventDefault(); if (!sigDrawing.current || !sigCanvasRef.current) return; const r = sigCanvasRef.current.getBoundingClientRect(); const sx = sigCanvasRef.current.width/r.width, sy = sigCanvasRef.current.height/r.height; const pos = { x: (e.touches[0].clientX-r.left)*sx, y: (e.touches[0].clientY-r.top)*sy }; const ctx = sigCanvasRef.current.getContext('2d')!; ctx.beginPath(); ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y); ctx.lineTo(pos.x, pos.y); ctx.strokeStyle='#1C1C1E'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); sigLastPos.current=pos; }}
                onTouchEnd={() => { sigDrawing.current = false; }}
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => sigCanvasRef.current?.getContext('2d')?.clearRect(0,0,600,180)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#6C6C70] active:opacity-70">
                  <RotateCcw size={13} /> Clear
                </button>
                <button type="button" onClick={() => { const b64 = sigCanvasRef.current?.toDataURL('image/png') ?? ''; setSigPreview(b64); setSigMode('idle'); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1C1C1E] text-white text-xs font-semibold active:opacity-70">
                  <Check size={13} /> Use Signature
                </button>
                <button type="button" onClick={() => setSigMode('idle')}
                  className="w-9 flex items-center justify-center rounded-xl border border-black/[0.10] bg-white/60 active:opacity-70">
                  <X size={14} className="text-[#8E8E93]" />
                </button>
              </div>
            </div>
          )}

          {/* Upload waiting */}
          {sigMode === 'upload' && !sigPreview && (
            <div className="rounded-2xl border border-dashed border-black/[0.15] bg-white/40 p-4 flex flex-col items-center gap-2 min-h-[72px]">
              <p className="text-xs text-[#8E8E93]">Select an image file</p>
              <button type="button" onClick={() => sigFileRef.current?.click()}
                className="px-4 py-1.5 rounded-xl bg-[#1C1C1E] text-white text-xs font-medium active:opacity-70">Browse</button>
              <button type="button" onClick={() => setSigMode('idle')} className="text-xs text-[#8E8E93] underline">Cancel</button>
            </div>
          )}

          {/* Action buttons */}
          {sigMode === 'idle' && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setSigMode('draw')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                <PenLine size={13} /> {sigPreview ? 'Redraw' : 'Draw Signature'}
              </button>
              <button type="button" onClick={() => { setSigMode('upload'); sigFileRef.current?.click(); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-black/[0.10] bg-white/60 text-xs font-medium text-[#1C1C1E] active:opacity-70">
                <Upload size={13} /> Upload
              </button>
              {sigPreview && (
                <button type="button" onClick={() => setSigPreview(null)}
                  className="w-9 flex items-center justify-center rounded-xl border border-black/[0.10] bg-white/60 active:opacity-70">
                  <X size={14} className="text-[#8E8E93]" />
                </button>
              )}
            </div>
          )}

          <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onloadend = () => { setSigPreview(reader.result as string); setSigMode('idle'); };
            reader.readAsDataURL(file);
            e.target.value = '';
          }} />
        </div>

        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full py-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80"
          style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
            : <><Check size={15} /> Register Client</>
          }
        </button>
      </div>
    </PageShell>
  );
}
