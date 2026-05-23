'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import {
  UserPlus, Users, X, Check, ChevronDown, Search,
  Loader2, Phone, Mail, Globe, User, Calendar,
  CheckCircle2, ChevronLeft, ArrowLeft,
  DollarSign, Heart, Briefcase,
} from 'lucide-react';
import { saveClient, fetchAllClients, ClientRecord } from '@/lib/clients';

// ── Country codes ─────────────────────────────────────────────
const COUNTRY_CODES = [
  { flag: '🇵🇭', dial: '+63',   name: 'Philippines' },
  { flag: '🇦🇫', dial: '+93',   name: 'Afghanistan' },
  { flag: '🇦🇱', dial: '+355',  name: 'Albania' },
  { flag: '🇩🇿', dial: '+213',  name: 'Algeria' },
  { flag: '🇦🇩', dial: '+376',  name: 'Andorra' },
  { flag: '🇦🇴', dial: '+244',  name: 'Angola' },
  { flag: '🇦🇬', dial: '+1268', name: 'Antigua and Barbuda' },
  { flag: '🇦🇷', dial: '+54',   name: 'Argentina' },
  { flag: '🇦🇲', dial: '+374',  name: 'Armenia' },
  { flag: '🇦🇺', dial: '+61',   name: 'Australia' },
  { flag: '🇦🇹', dial: '+43',   name: 'Austria' },
  { flag: '🇦🇿', dial: '+994',  name: 'Azerbaijan' },
  { flag: '🇧🇸', dial: '+1242', name: 'Bahamas' },
  { flag: '🇧🇭', dial: '+973',  name: 'Bahrain' },
  { flag: '🇧🇩', dial: '+880',  name: 'Bangladesh' },
  { flag: '🇧🇧', dial: '+1246', name: 'Barbados' },
  { flag: '🇧🇾', dial: '+375',  name: 'Belarus' },
  { flag: '🇧🇪', dial: '+32',   name: 'Belgium' },
  { flag: '🇧🇿', dial: '+501',  name: 'Belize' },
  { flag: '🇧🇯', dial: '+229',  name: 'Benin' },
  { flag: '🇧🇹', dial: '+975',  name: 'Bhutan' },
  { flag: '🇧🇴', dial: '+591',  name: 'Bolivia' },
  { flag: '🇧🇦', dial: '+387',  name: 'Bosnia and Herzegovina' },
  { flag: '🇧🇼', dial: '+267',  name: 'Botswana' },
  { flag: '🇧🇷', dial: '+55',   name: 'Brazil' },
  { flag: '🇧🇳', dial: '+673',  name: 'Brunei' },
  { flag: '🇧🇬', dial: '+359',  name: 'Bulgaria' },
  { flag: '🇧🇫', dial: '+226',  name: 'Burkina Faso' },
  { flag: '🇧🇮', dial: '+257',  name: 'Burundi' },
  { flag: '🇰🇭', dial: '+855',  name: 'Cambodia' },
  { flag: '🇨🇲', dial: '+237',  name: 'Cameroon' },
  { flag: '🇨🇦', dial: '+1',    name: 'Canada' },
  { flag: '🇨🇫', dial: '+236',  name: 'Central African Republic' },
  { flag: '🇹🇩', dial: '+235',  name: 'Chad' },
  { flag: '🇨🇱', dial: '+56',   name: 'Chile' },
  { flag: '🇨🇳', dial: '+86',   name: 'China' },
  { flag: '🇨🇴', dial: '+57',   name: 'Colombia' },
  { flag: '🇨🇬', dial: '+242',  name: 'Congo' },
  { flag: '🇨🇷', dial: '+506',  name: 'Costa Rica' },
  { flag: '🇭🇷', dial: '+385',  name: 'Croatia' },
  { flag: '🇨🇺', dial: '+53',   name: 'Cuba' },
  { flag: '🇨🇾', dial: '+357',  name: 'Cyprus' },
  { flag: '🇨🇿', dial: '+420',  name: 'Czech Republic' },
  { flag: '🇩🇰', dial: '+45',   name: 'Denmark' },
  { flag: '🇩🇯', dial: '+253',  name: 'Djibouti' },
  { flag: '🇩🇴', dial: '+1809', name: 'Dominican Republic' },
  { flag: '🇪🇨', dial: '+593',  name: 'Ecuador' },
  { flag: '🇪🇬', dial: '+20',   name: 'Egypt' },
  { flag: '🇸🇻', dial: '+503',  name: 'El Salvador' },
  { flag: '🇪🇷', dial: '+291',  name: 'Eritrea' },
  { flag: '🇪🇪', dial: '+372',  name: 'Estonia' },
  { flag: '🇸🇿', dial: '+268',  name: 'Eswatini' },
  { flag: '🇪🇹', dial: '+251',  name: 'Ethiopia' },
  { flag: '🇫🇯', dial: '+679',  name: 'Fiji' },
  { flag: '🇫🇮', dial: '+358',  name: 'Finland' },
  { flag: '🇫🇷', dial: '+33',   name: 'France' },
  { flag: '🇬🇦', dial: '+241',  name: 'Gabon' },
  { flag: '🇬🇲', dial: '+220',  name: 'Gambia' },
  { flag: '🇬🇪', dial: '+995',  name: 'Georgia' },
  { flag: '🇩🇪', dial: '+49',   name: 'Germany' },
  { flag: '🇬🇭', dial: '+233',  name: 'Ghana' },
  { flag: '🇬🇷', dial: '+30',   name: 'Greece' },
  { flag: '🇬🇹', dial: '+502',  name: 'Guatemala' },
  { flag: '🇬🇳', dial: '+224',  name: 'Guinea' },
  { flag: '🇬🇾', dial: '+592',  name: 'Guyana' },
  { flag: '🇭🇹', dial: '+509',  name: 'Haiti' },
  { flag: '🇭🇳', dial: '+504',  name: 'Honduras' },
  { flag: '🇭🇰', dial: '+852',  name: 'Hong Kong' },
  { flag: '🇭🇺', dial: '+36',   name: 'Hungary' },
  { flag: '🇮🇸', dial: '+354',  name: 'Iceland' },
  { flag: '🇮🇳', dial: '+91',   name: 'India' },
  { flag: '🇮🇩', dial: '+62',   name: 'Indonesia' },
  { flag: '🇮🇷', dial: '+98',   name: 'Iran' },
  { flag: '🇮🇶', dial: '+964',  name: 'Iraq' },
  { flag: '🇮🇪', dial: '+353',  name: 'Ireland' },
  { flag: '🇮🇱', dial: '+972',  name: 'Israel' },
  { flag: '🇮🇹', dial: '+39',   name: 'Italy' },
  { flag: '🇯🇲', dial: '+1876', name: 'Jamaica' },
  { flag: '🇯🇵', dial: '+81',   name: 'Japan' },
  { flag: '🇯🇴', dial: '+962',  name: 'Jordan' },
  { flag: '🇰🇿', dial: '+7',    name: 'Kazakhstan' },
  { flag: '🇰🇪', dial: '+254',  name: 'Kenya' },
  { flag: '🇰🇮', dial: '+686',  name: 'Kiribati' },
  { flag: '🇰🇼', dial: '+965',  name: 'Kuwait' },
  { flag: '🇰🇬', dial: '+996',  name: 'Kyrgyzstan' },
  { flag: '🇱🇦', dial: '+856',  name: 'Laos' },
  { flag: '🇱🇻', dial: '+371',  name: 'Latvia' },
  { flag: '🇱🇧', dial: '+961',  name: 'Lebanon' },
  { flag: '🇱🇸', dial: '+266',  name: 'Lesotho' },
  { flag: '🇱🇷', dial: '+231',  name: 'Liberia' },
  { flag: '🇱🇾', dial: '+218',  name: 'Libya' },
  { flag: '🇱🇮', dial: '+423',  name: 'Liechtenstein' },
  { flag: '🇱🇹', dial: '+370',  name: 'Lithuania' },
  { flag: '🇱🇺', dial: '+352',  name: 'Luxembourg' },
  { flag: '🇲🇴', dial: '+853',  name: 'Macau' },
  { flag: '🇲🇬', dial: '+261',  name: 'Madagascar' },
  { flag: '🇲🇼', dial: '+265',  name: 'Malawi' },
  { flag: '🇲🇾', dial: '+60',   name: 'Malaysia' },
  { flag: '🇲🇻', dial: '+960',  name: 'Maldives' },
  { flag: '🇲🇱', dial: '+223',  name: 'Mali' },
  { flag: '🇲🇹', dial: '+356',  name: 'Malta' },
  { flag: '🇲🇷', dial: '+222',  name: 'Mauritania' },
  { flag: '🇲🇺', dial: '+230',  name: 'Mauritius' },
  { flag: '🇲🇽', dial: '+52',   name: 'Mexico' },
  { flag: '🇫🇲', dial: '+691',  name: 'Micronesia' },
  { flag: '🇲🇩', dial: '+373',  name: 'Moldova' },
  { flag: '🇲🇨', dial: '+377',  name: 'Monaco' },
  { flag: '🇲🇳', dial: '+976',  name: 'Mongolia' },
  { flag: '🇲🇪', dial: '+382',  name: 'Montenegro' },
  { flag: '🇲🇦', dial: '+212',  name: 'Morocco' },
  { flag: '🇲🇿', dial: '+258',  name: 'Mozambique' },
  { flag: '🇲🇲', dial: '+95',   name: 'Myanmar' },
  { flag: '🇳🇦', dial: '+264',  name: 'Namibia' },
  { flag: '🇳🇵', dial: '+977',  name: 'Nepal' },
  { flag: '🇳🇱', dial: '+31',   name: 'Netherlands' },
  { flag: '🇳🇿', dial: '+64',   name: 'New Zealand' },
  { flag: '🇳🇮', dial: '+505',  name: 'Nicaragua' },
  { flag: '🇳🇪', dial: '+227',  name: 'Niger' },
  { flag: '🇳🇬', dial: '+234',  name: 'Nigeria' },
  { flag: '🇰🇵', dial: '+850',  name: 'North Korea' },
  { flag: '🇲🇰', dial: '+389',  name: 'North Macedonia' },
  { flag: '🇳🇴', dial: '+47',   name: 'Norway' },
  { flag: '🇴🇲', dial: '+968',  name: 'Oman' },
  { flag: '🇵🇰', dial: '+92',   name: 'Pakistan' },
  { flag: '🇵🇼', dial: '+680',  name: 'Palau' },
  { flag: '🇵🇸', dial: '+970',  name: 'Palestine' },
  { flag: '🇵🇦', dial: '+507',  name: 'Panama' },
  { flag: '🇵🇬', dial: '+675',  name: 'Papua New Guinea' },
  { flag: '🇵🇾', dial: '+595',  name: 'Paraguay' },
  { flag: '🇵🇪', dial: '+51',   name: 'Peru' },
  { flag: '🇵🇱', dial: '+48',   name: 'Poland' },
  { flag: '🇵🇹', dial: '+351',  name: 'Portugal' },
  { flag: '🇶🇦', dial: '+974',  name: 'Qatar' },
  { flag: '🇷🇴', dial: '+40',   name: 'Romania' },
  { flag: '🇷🇺', dial: '+7',    name: 'Russia' },
  { flag: '🇷🇼', dial: '+250',  name: 'Rwanda' },
  { flag: '🇸🇦', dial: '+966',  name: 'Saudi Arabia' },
  { flag: '🇸🇳', dial: '+221',  name: 'Senegal' },
  { flag: '🇷🇸', dial: '+381',  name: 'Serbia' },
  { flag: '🇸🇨', dial: '+248',  name: 'Seychelles' },
  { flag: '🇸🇱', dial: '+232',  name: 'Sierra Leone' },
  { flag: '🇸🇬', dial: '+65',   name: 'Singapore' },
  { flag: '🇸🇰', dial: '+421',  name: 'Slovakia' },
  { flag: '🇸🇮', dial: '+386',  name: 'Slovenia' },
  { flag: '🇸🇧', dial: '+677',  name: 'Solomon Islands' },
  { flag: '🇸🇴', dial: '+252',  name: 'Somalia' },
  { flag: '🇿🇦', dial: '+27',   name: 'South Africa' },
  { flag: '🇸🇸', dial: '+211',  name: 'South Sudan' },
  { flag: '🇰🇷', dial: '+82',   name: 'South Korea' },
  { flag: '🇪🇸', dial: '+34',   name: 'Spain' },
  { flag: '🇱🇰', dial: '+94',   name: 'Sri Lanka' },
  { flag: '🇸🇩', dial: '+249',  name: 'Sudan' },
  { flag: '🇸🇷', dial: '+597',  name: 'Suriname' },
  { flag: '🇸🇪', dial: '+46',   name: 'Sweden' },
  { flag: '🇨🇭', dial: '+41',   name: 'Switzerland' },
  { flag: '🇸🇾', dial: '+963',  name: 'Syria' },
  { flag: '🇹🇼', dial: '+886',  name: 'Taiwan' },
  { flag: '🇹🇯', dial: '+992',  name: 'Tajikistan' },
  { flag: '🇹🇿', dial: '+255',  name: 'Tanzania' },
  { flag: '🇹🇭', dial: '+66',   name: 'Thailand' },
  { flag: '🇹🇱', dial: '+670',  name: 'Timor-Leste' },
  { flag: '🇹🇬', dial: '+228',  name: 'Togo' },
  { flag: '🇹🇴', dial: '+676',  name: 'Tonga' },
  { flag: '🇹🇹', dial: '+1868', name: 'Trinidad and Tobago' },
  { flag: '🇹🇳', dial: '+216',  name: 'Tunisia' },
  { flag: '🇹🇷', dial: '+90',   name: 'Turkey' },
  { flag: '🇹🇲', dial: '+993',  name: 'Turkmenistan' },
  { flag: '🇹🇻', dial: '+688',  name: 'Tuvalu' },
  { flag: '🇺🇬', dial: '+256',  name: 'Uganda' },
  { flag: '🇺🇦', dial: '+380',  name: 'Ukraine' },
  { flag: '🇦🇪', dial: '+971',  name: 'United Arab Emirates' },
  { flag: '🇬🇧', dial: '+44',   name: 'United Kingdom' },
  { flag: '🇺🇸', dial: '+1',    name: 'United States' },
  { flag: '🇺🇾', dial: '+598',  name: 'Uruguay' },
  { flag: '🇺🇿', dial: '+998',  name: 'Uzbekistan' },
  { flag: '🇻🇺', dial: '+678',  name: 'Vanuatu' },
  { flag: '🇻🇪', dial: '+58',   name: 'Venezuela' },
  { flag: '🇻🇳', dial: '+84',   name: 'Vietnam' },
  { flag: '🇾🇪', dial: '+967',  name: 'Yemen' },
  { flag: '🇿🇲', dial: '+260',  name: 'Zambia' },
  { flag: '🇿🇼', dial: '+263',  name: 'Zimbabwe' },
];

const CITIZENSHIP_OPTIONS = ['Filipino', 'Others'];
const REASON_OPTIONS = [
  'Gift', 'Relocation', 'Primary Home', 'Investment',
  'Secondary / Vacation / Retirement Home', 'Upgrade',
];
const SOURCE_OPTIONS = [
  'Sales Boosting', 'Company Initiated Activities', 'Online Ads / Website',
  'Showroom Walk-in', 'Personal', 'Referral', 'Repeat Buyer',
];
const INCOME_OPTIONS = [
  'Php 50,000 to Php 100,000',
  'Php 100,001 to Php 150,000',
  'Above Php 150,000',
];

const EMPTY_FORM = {
  clientType: 'Local' as 'Local' | 'International',
  lastName: '', firstName: '', middleName: '', suffix: '',
  dateOfBirth: '', citizenship: '', countryCode: '+63',
  mobileNumber: '', landlineNo: '', email: '',
  reasonForBuying: '', sourceOfSale: '', monthlyHouseholdIncome: '',
};

// ── Reusable components ───────────────────────────────────────
function InputRow({ label, icon, error, children }: {
  label: string; icon: React.ReactNode; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function SelectInput({ value, options, onChange, placeholder }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 pr-8 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none appearance-none focus:border-[#E8634A]/50 focus:bg-white transition-colors">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C7C7CC] pointer-events-none" />
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors placeholder:text-[#C7C7CC]"
    />
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/[0.05] last:border-0">
      <span className="text-[#E8634A] mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">{label}</p>
        <p className="text-sm text-[#1C1C1E] font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function ClientRegistrationPage() {
  type ModalView = null | 'new' | 'existing';
  const [modalView, setModalView]         = useState<ModalView>(null);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [errors, setErrors]               = useState<Record<string, string>>({});
  const [saving, setSaving]               = useState(false);
  const [savedClient, setSavedClient]     = useState<typeof EMPTY_FORM | null>(null);
  const [showSuccess, setShowSuccess]     = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Existing client state
  const [allClients, setAllClients]               = useState<ClientRecord[]>([]);
  const [loadingClients, setLoadingClients]       = useState(false);
  const [clientTypeFilter, setClientTypeFilter]   = useState<'All' | 'Local' | 'International'>('All');
  const [citizenshipFilter, setCitizenshipFilter] = useState('');
  const [clientSearch, setClientSearch]           = useState('');
  const [selectedClient, setSelectedClient]       = useState<ClientRecord | null>(null);
  const [existingView, setExistingView]           = useState<'search' | 'detail'>('search');

  const set = (key: keyof typeof EMPTY_FORM) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  useEffect(() => {
    if (modalView === 'existing') {
      setLoadingClients(true);
      setSelectedClient(null);
      setExistingView('search');
      setClientSearch('');
      setClientTypeFilter('All');
      setCitizenshipFilter('');
      fetchAllClients()
        .then(data => setAllClients(data))
        .finally(() => setLoadingClients(false));
    }
  }, [modalView]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.lastName.trim())  e.lastName  = 'Last name is required';
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Enter a valid email address';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveClient({
        client_type: form.clientType, last_name: form.lastName,
        first_name: form.firstName,   middle_name: form.middleName,
        suffix: form.suffix,          date_of_birth: form.dateOfBirth,
        citizenship: form.citizenship, country_code: form.countryCode,
        mobile_number: form.mobileNumber, landline_no: form.landlineNo,
        email: form.email,            reason_for_buying: form.reasonForBuying,
        source_of_sale: form.sourceOfSale,
        monthly_household_income: form.monthlyHouseholdIncome,
      });
      setSavedClient({ ...form });
      setModalView(null);
      setShowSuccess(true);
    } catch (e: any) {
      setErrors({ _global: e.message ?? 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setErrors({});
    setSavedClient(null);
  }

  const filteredClients = allClients.filter(c => {
    const fullName = `${c.last_name} ${c.first_name} ${c.middle_name ?? ''}`.toLowerCase();
    if (clientTypeFilter !== 'All' && c.client_type !== clientTypeFilter) return false;
    if (citizenshipFilter && c.citizenship !== citizenshipFilter) return false;
    if (clientSearch && !fullName.includes(clientSearch.toLowerCase())) return false;
    return true;
  });

  const selectedCountry = COUNTRY_CODES.find(c => c.dial === form.countryCode) ?? COUNTRY_CODES[0];
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.dial.includes(countrySearch))
    : COUNTRY_CODES;

  // ── Render ────────────────────────────────────────────────
  return (
    <PageShell title="Client Registration">

      {/* ── Two cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => { resetForm(); setModalView('new'); }}>
          <div className="w-14 h-14 rounded-2xl bg-[#E8634A]/10 flex items-center justify-center">
            <UserPlus size={26} className="text-[#E8634A]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1C1C1E]">New Client</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Register a new client</p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => setModalView('existing')}>
          <div className="w-14 h-14 rounded-2xl bg-[#5856D6]/10 flex items-center justify-center">
            <Users size={26} className="text-[#5856D6]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1C1C1E]">Existing Client</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Search client records</p>
          </div>
        </GlassCard>
      </div>

      {/* ── New Client Modal ──────────────────────────── */}
      {modalView === 'new' && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalView(null)} />
          <div className="relative bg-white rounded-t-[2.5rem] flex flex-col" style={{ maxHeight: '92dvh' }}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-black/10" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#E8634A]/10 flex items-center justify-center">
                  <UserPlus size={16} className="text-[#E8634A]" />
                </div>
                <p className="text-lg font-bold text-[#1C1C1E]">New Client</p>
              </div>
              <button type="button" onClick={() => setModalView(null)}
                className="p-2 rounded-2xl bg-[#F2F2F7] text-[#6C6C70] active:opacity-70">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
              {errors._global && (
                <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{errors._global}</p>
              )}

              {/* Client Type */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                  <Globe size={11} /> Client Type
                </p>
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
              </div>

              <InputRow label="Last Name *" icon={<User size={11} />} error={errors.lastName}>
                <TextInput value={form.lastName} onChange={set('lastName')} placeholder="e.g. dela Cruz" />
              </InputRow>
              <InputRow label="First Name *" icon={<User size={11} />} error={errors.firstName}>
                <TextInput value={form.firstName} onChange={set('firstName')} placeholder="e.g. Juan" />
              </InputRow>
              <InputRow label="Middle Name" icon={<User size={11} />}>
                <TextInput value={form.middleName} onChange={set('middleName')} placeholder="e.g. Santos" />
              </InputRow>
              <InputRow label="Suffix" icon={<User size={11} />}>
                <TextInput value={form.suffix} onChange={set('suffix')} placeholder="e.g. Jr., Sr., III" />
              </InputRow>

              <InputRow label="Date of Birth" icon={<Calendar size={11} />}>
                <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth')(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors"
                />
              </InputRow>

              <InputRow label="Citizenship" icon={<Globe size={11} />}>
                <SelectInput value={form.citizenship} options={CITIZENSHIP_OPTIONS}
                  onChange={set('citizenship')} placeholder="Select citizenship" />
              </InputRow>

              <InputRow label="Mobile Number" icon={<Phone size={11} />}>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setCountrySearch(''); setCountryPickerOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm shrink-0 active:opacity-70">
                    <span>{selectedCountry.flag}</span>
                    <span className="font-medium text-[#1C1C1E]">{selectedCountry.dial}</span>
                    <ChevronDown size={12} className="text-[#C7C7CC]" />
                  </button>
                  <TextInput value={form.mobileNumber} onChange={set('mobileNumber')} placeholder="9171234567" />
                </div>
              </InputRow>

              <InputRow label="Landline No." icon={<Phone size={11} />}>
                <TextInput value={form.landlineNo} onChange={set('landlineNo')} placeholder="02-8123-4567" />
              </InputRow>

              <InputRow label="Email Address" icon={<Mail size={11} />} error={errors.email}>
                <TextInput value={form.email} onChange={set('email')}
                  placeholder="juan@email.com" type="email" />
              </InputRow>

              <InputRow label="Reason for Buying" icon={<Heart size={11} />}>
                <SelectInput value={form.reasonForBuying} options={REASON_OPTIONS}
                  onChange={set('reasonForBuying')} placeholder="Select reason" />
              </InputRow>

              <InputRow label="Source of Sale" icon={<Briefcase size={11} />}>
                <SelectInput value={form.sourceOfSale} options={SOURCE_OPTIONS}
                  onChange={set('sourceOfSale')} placeholder="Select source" />
              </InputRow>

              <InputRow label="Est. Monthly Household Income" icon={<DollarSign size={11} />}>
                <SelectInput value={form.monthlyHouseholdIncome} options={INCOME_OPTIONS}
                  onChange={set('monthlyHouseholdIncome')} placeholder="Select income range" />
              </InputRow>
            </div>

            <div className="px-5 pt-3 pb-8 shrink-0 border-t border-black/[0.06]">
              <button type="button" onClick={handleSave} disabled={saving}
                className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                  : <><Check size={15} /> Register Client</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Country Code Picker ───────────────────────── */}
      {countryPickerOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white">
          <div className="flex items-center gap-3 px-4 pt-14 pb-3 border-b border-black/[0.06] shrink-0">
            <button type="button" onClick={() => setCountryPickerOpen(false)}
              className="p-2 rounded-xl bg-[#F2F2F7] text-[#1C1C1E] active:opacity-70">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-[#F2F2F7] rounded-xl">
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
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredCountries.map(c => (
              <button key={`${c.name}-${c.dial}`} type="button"
                onClick={() => { set('countryCode')(c.dial); setCountryPickerOpen(false); }}
                className={`w-full flex items-center gap-3 px-5 py-3.5 border-b border-black/[0.04] text-left active:bg-gray-50 ${
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
        </div>
      )}

      {/* ── Existing Client Modal ─────────────────────── */}
      {modalView === 'existing' && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalView(null)} />
          <div className="relative bg-white rounded-t-[2.5rem] flex flex-col" style={{ maxHeight: '92dvh' }}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-black/10" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                {existingView === 'detail' && (
                  <button type="button" onClick={() => setExistingView('search')}
                    className="p-2 rounded-xl bg-[#F2F2F7] text-[#6C6C70] active:opacity-70 mr-1">
                    <ChevronLeft size={18} />
                  </button>
                )}
                <div className="w-8 h-8 rounded-xl bg-[#5856D6]/10 flex items-center justify-center">
                  <Users size={16} className="text-[#5856D6]" />
                </div>
                <p className="text-lg font-bold text-[#1C1C1E]">
                  {existingView === 'detail' ? 'Client Details' : 'Existing Client'}
                </p>
              </div>
              <button type="button" onClick={() => setModalView(null)}
                className="p-2 rounded-2xl bg-[#F2F2F7] text-[#6C6C70] active:opacity-70">
                <X size={18} />
              </button>
            </div>

            {existingView === 'search' ? (
              <>
                <div className="px-5 pb-3 space-y-3 shrink-0 border-b border-black/[0.06]">
                  <div className="flex items-center gap-2">
                    {(['All', 'Local', 'International'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setClientTypeFilter(t)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                          clientTypeFilter === t
                            ? 'bg-[#5856D6] text-white'
                            : 'bg-[#F2F2F7] text-[#6C6C70]'
                        }`}>
                        {t}
                      </button>
                    ))}
                    <div className="flex-1 relative">
                      <select value={citizenshipFilter} onChange={e => setCitizenshipFilter(e.target.value)}
                        className="w-full pl-3 pr-7 py-1.5 rounded-full border border-black/[0.08] bg-[#F2F2F7] text-xs text-[#6C6C70] outline-none appearance-none">
                        <option value="">All Citizenship</option>
                        {CITIZENSHIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#C7C7CC] pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-[#F2F2F7] rounded-xl">
                    <Search size={14} className="text-[#C7C7CC] shrink-0" />
                    <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      placeholder="Search by name…"
                      className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
                    />
                    {clientSearch && (
                      <button type="button" onClick={() => setClientSearch('')}>
                        <X size={12} className="text-[#C7C7CC]" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3 pb-8">
                  {loadingClients ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="text-[#5856D6] animate-spin" />
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-[#C7C7CC]">
                      <Users size={28} />
                      <p className="text-sm">No clients found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredClients.map(c => (
                        <button key={c.id} type="button"
                          onClick={() => { setSelectedClient(c); setExistingView('detail'); }}
                          className="w-full flex items-center gap-3 p-3 rounded-2xl border border-black/[0.06] bg-white active:bg-gray-50 text-left">
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
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : selectedClient ? (
              <div className="flex-1 overflow-y-auto px-5 pb-8 pt-2 space-y-4">
                {/* Name card */}
                <div className="flex items-center gap-4 p-4 bg-[#F9F9F9] rounded-2xl border border-black/[0.06]">
                  <div className="w-14 h-14 rounded-full bg-[#5856D6]/10 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-[#5856D6]">
                      {selectedClient.first_name.charAt(0)}{selectedClient.last_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[#1C1C1E] leading-tight">
                      {selectedClient.last_name}, {selectedClient.first_name}
                      {selectedClient.middle_name ? ` ${selectedClient.middle_name}` : ''}
                      {selectedClient.suffix ? ` ${selectedClient.suffix}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        selectedClient.client_type === 'Local' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>{selectedClient.client_type}</span>
                      {selectedClient.citizenship && (
                        <span className="text-xs text-[#8E8E93]">{selectedClient.citizenship}</span>
                      )}
                    </div>
                  </div>
                </div>

                <GlassCard className="px-4 py-1">
                  <DetailRow icon={<Calendar size={14} />} label="Date of Birth"
                    value={selectedClient.date_of_birth
                      ? new Date(selectedClient.date_of_birth).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
                      : null} />
                  <DetailRow icon={<Phone size={14} />} label="Mobile"
                    value={selectedClient.mobile_number
                      ? `${selectedClient.country_code ?? ''} ${selectedClient.mobile_number}`.trim()
                      : null} />
                  <DetailRow icon={<Phone size={14} />}    label="Landline"          value={selectedClient.landline_no} />
                  <DetailRow icon={<Mail size={14} />}     label="Email"             value={selectedClient.email} />
                  <DetailRow icon={<Heart size={14} />}    label="Reason for Buying" value={selectedClient.reason_for_buying} />
                  <DetailRow icon={<Briefcase size={14} />} label="Source of Sale"   value={selectedClient.source_of_sale} />
                  <DetailRow icon={<DollarSign size={14} />} label="Monthly Income"  value={selectedClient.monthly_household_income} />
                </GlassCard>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Success Screen ────────────────────────────── */}
      {showSuccess && savedClient && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}>
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <p className="text-xl font-bold text-[#1C1C1E] text-center">Client Registered!</p>
          <p className="text-2xl font-bold text-[#E8634A] text-center mt-2">
            {savedClient.lastName}, {savedClient.firstName}
            {savedClient.middleName ? ` ${savedClient.middleName}` : ''}
            {savedClient.suffix ? ` ${savedClient.suffix}` : ''}
          </p>
          <p className="text-sm text-[#8E8E93] text-center mt-2 leading-relaxed">
            Successfully registered as a {savedClient.clientType.toLowerCase()} client.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs mt-8">
            <button type="button"
              onClick={() => { setShowSuccess(false); resetForm(); setModalView('new'); }}
              className="w-full py-3.5 rounded-2xl bg-[#E8634A] text-white text-sm font-bold active:opacity-80">
              Register Another Client
            </button>
            <button type="button"
              onClick={() => { setShowSuccess(false); resetForm(); }}
              className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
              Done
            </button>
          </div>
        </div>
      )}

    </PageShell>
  );
}
