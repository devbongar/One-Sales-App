'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { ChevronDown, Check, Search, X, Tag, User, Building2, LayoutGrid, Hash, ChevronRight } from 'lucide-react';

interface Reservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  status: string;
  seller_name: string | null;
  payment_proof_url: string | null;
}

function FilterSelect({ label, value, options, onChange, icon }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <div role="button" tabIndex={0} onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        className="w-full flex items-center gap-3 py-3 px-1 cursor-pointer">
        {icon && <span className="text-[#E8634A] shrink-0">{icon}</span>}
        <span className="flex-1 text-sm font-medium text-[#1C1C1E] text-left">{label}</span>
        <span className={`text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || 'All'}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <div className="pb-2 max-h-44 overflow-y-auto space-y-0.5">
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                o === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E] active:bg-gray-100'
              }`}>
              {o}
              {o === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchSelect({ label, value, options, onChange, icon }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <div role="button" tabIndex={0} onClick={() => { setOpen(p => !p); setQuery(''); }}
        onKeyDown={e => e.key === 'Enter' && (setOpen(p => !p), setQuery(''))}
        className="w-full flex items-center gap-3 py-3 px-1 cursor-pointer">
        {icon && <span className="text-[#E8634A] shrink-0">{icon}</span>}
        <span className="flex-1 text-sm font-medium text-[#1C1C1E] text-left">{label}</span>
        <span className={`text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'}`}>
          {value || 'All'}
        </span>
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}>
              <X size={13} className="text-[#C7C7CC]" />
            </button>
          : <ChevronDown size={14} className={`text-[#C7C7CC] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <div className="pb-2">
          <div className="flex items-center gap-2 mx-1 mb-2 px-3 py-2 bg-[#F2F2F7] rounded-xl">
            <Search size={13} className="text-[#C7C7CC] shrink-0" />
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search..." className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]" />
            {query && <button type="button" onClick={() => setQuery('')}><X size={11} className="text-[#C7C7CC]" /></button>}
          </div>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtered.length > 0 ? filtered.map(o => (
              <button key={o} type="button"
                onClick={() => { onChange(o); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${
                  o === value ? 'bg-[#E8634A]/10 text-[#E8634A] font-semibold' : 'text-[#1C1C1E] active:bg-gray-100'
                }`}>
                {o}
                {o === value && <Check size={13} />}
              </button>
            )) : <p className="text-center text-xs text-[#8E8E93] py-3">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function statusColor(status: string) {
  if (status === 'Reserved-paid') return 'bg-green-100 text-green-700';
  if (status === 'Reserved-unpaid') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

export default function ReservationPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter options
  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [clientOptions,  setClientOptions]  = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const statusOptions = ['Reserved-unpaid', 'Reserved-paid'];

  // Selected filters
  const [sellerFilter,  setSellerFilter]  = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [clientFilter,  setClientFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  useEffect(() => {
    async function loadOptions() {
      const { data } = await supabase
        .from('reservations')
        .select('seller_name, client_name, project');
      if (!data) return;
      setSellerOptions([...new Set(data.map(r => r.seller_name).filter(Boolean))] as string[]);
      setClientOptions([...new Set(data.map(r => r.client_name).filter(Boolean))] as string[]);
      setProjectOptions([...new Set(data.map(r => r.project).filter(Boolean))] as string[]);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    async function loadReservations() {
      setLoading(true);
      let query = supabase
        .from('reservations')
        .select('reservation_id, client_name, project, inventory_code, unit_type, status, seller_name, payment_proof_url')
        .order('created_at', { ascending: false });

      if (sellerFilter)  query = query.eq('seller_name', sellerFilter);
      if (statusFilter)  query = query.eq('status', statusFilter);
      if (clientFilter)  query = query.eq('client_name', clientFilter);
      if (projectFilter) query = query.eq('project', projectFilter);

      const { data } = await query;
      setReservations((data ?? []) as Reservation[]);
      setLoading(false);
    }
    loadReservations();
  }, [sellerFilter, statusFilter, clientFilter, projectFilter]);

  return (
    <PageShell title="Reservation">

      {/* Filters */}
      <GlassCard className="px-4 py-1">
        <FilterSelect  label="Seller"       value={sellerFilter}  options={sellerOptions}  onChange={setSellerFilter}  icon={<User size={16} />} />
        <FilterSelect  label="Status"       value={statusFilter}  options={statusOptions}  onChange={setStatusFilter}  icon={<Check size={16} />} />
        <SearchSelect  label="Client Name"  value={clientFilter}  options={clientOptions}  onChange={setClientFilter}  icon={<User size={16} />} />
        <FilterSelect  label="Project"      value={projectFilter} options={projectOptions} onChange={setProjectFilter} icon={<Building2 size={16} />} />
      </GlassCard>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
        </div>
      ) : reservations.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm font-semibold text-[#1C1C1E]">No reservations found</p>
          <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your filters</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {reservations.map(r => (
            <GlassCard
              key={r.reservation_id}
              className="px-4 py-3 space-y-2 active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => {
                sessionStorage.setItem('currentReservationId', r.reservation_id);
                sessionStorage.setItem('selectedReservation', JSON.stringify(r));
                sessionStorage.setItem('proofEntrySource', 'list');
                router.push('/sales/reservation/proof');
              }}
            >
              {/* Top row: reservation ID + status + chevron */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash size={12} className="text-[#E8634A]" />
                  <span className="text-xs font-bold text-[#E8634A] tracking-wider">{r.reservation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(r.status)}`}>
                    {r.status}
                  </span>
                  <ChevronRight size={14} className="text-[#C7C7CC]" />
                </div>
              </div>
              {/* Details */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-sm font-semibold text-[#1C1C1E]">{r.client_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-xs text-[#6C6C70]">{r.project}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Tag size={11} className="text-[#C7C7CC] shrink-0" />
                    <span className="text-xs text-[#6C6C70]">{r.inventory_code ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <LayoutGrid size={11} className="text-[#C7C7CC] shrink-0" />
                    <span className="text-xs text-[#6C6C70]">{r.unit_type}</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

    </PageShell>
  );
}
