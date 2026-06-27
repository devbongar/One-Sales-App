'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  Building2, ChevronRight, FolderOpen, Loader2,
  Search, SlidersHorizontal, User, X,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface Reservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  seller_name: string | null;
  status: string;
  proof_of_billing_urls:             string | null;
  proof_of_income_urls:              string | null;
  additional_proof_of_income_urls:   string | null;
  existing_loan_disclosure_urls:     string | null;
  signed_floor_layout_urls:          string | null;
  proof_of_valid_id_urls:            string | null;
  co_owner_id_urls:                  string[] | null;
  atty_in_fact_id_urls:              string[] | null;
  spouse_id_urls:                    string[] | null;
}

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseJson(s: string | null): string[] {
  try { return JSON.parse(s ?? '[]') as string[]; } catch { return []; }
}

function countCategories(r: Reservation): number {
  return [
    parseJson(r.proof_of_billing_urls).length > 0,
    parseJson(r.proof_of_income_urls).length > 0,
    parseJson(r.additional_proof_of_income_urls).length > 0,
    parseJson(r.existing_loan_disclosure_urls).length > 0,
    parseJson(r.signed_floor_layout_urls).length > 0,
    parseJson(r.proof_of_valid_id_urls).length > 0,
    (r.co_owner_id_urls ?? []).length > 0,
    (r.atty_in_fact_id_urls ?? []).length > 0,
    (r.spouse_id_urls ?? []).length > 0,
  ].filter(Boolean).length;
}

function folderBadgeStyle(count: number): { style: React.CSSProperties; label: string } {
  if (count === 9) return { style: { background: 'rgba(52,199,89,0.12)',  color: '#1A7F37' }, label: 'Complete' };
  if (count === 0) return { style: { background: 'rgba(142,142,147,0.12)', color: '#6C6C70' }, label: 'Empty' };
  return { style: { background: 'rgba(255,159,10,0.12)', color: '#A05A00' }, label: `${count}/9` };
}

async function paginateQuery(baseQuery: any): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];
  while (true) {
    const { data, error } = await baseQuery.range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export default function BuyersFolderingPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterOpen, setFilterOpen]     = useState(false);

  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  const [sellerFilter,            setSellerFilter]            = useState('');
  const [projectFilter,           setProjectFilter]           = useState('');
  const [statusFilter,            setStatusFilter]            = useState('');
  const [reservationStatusFilter, setReservationStatusFilter] = useState('');

  const activeFilterCount = [sellerFilter, projectFilter, statusFilter].filter(Boolean).length;

  useEffect(() => {
    (async () => {
      const rows = await paginateQuery(
        supabase.from('reservations').select('seller_name, project').in('status', ['Reserved', 'Booked'])
      );
      setSellerOptions([...new Set(rows.map((r: any) => r.seller_name).filter(Boolean))] as string[]);
      setProjectOptions([...new Set(rows.map((r: any) => r.project).filter(Boolean))] as string[]);
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      let q = supabase
        .from('reservations')
        .select(`reservation_id, client_name, project, inventory_code, unit_type, seller_name, status,
          proof_of_billing_urls, proof_of_income_urls, additional_proof_of_income_urls,
          existing_loan_disclosure_urls, signed_floor_layout_urls, proof_of_valid_id_urls,
          co_owner_id_urls, atty_in_fact_id_urls, spouse_id_urls`)
        .order('created_at', { ascending: false });

      if (reservationStatusFilter) {
        q = q.eq('status', reservationStatusFilter);
      } else {
        q = q.in('status', ['Reserved', 'Booked']);
      }

      if (sellerFilter)  q = q.eq('seller_name', sellerFilter);
      if (projectFilter) q = q.eq('project', projectFilter);

      const data = await paginateQuery(q);
      setReservations(data as Reservation[]);
      setLoading(false);
    })();
  }, [reservationStatusFilter, sellerFilter, projectFilter]);

  const filtered = reservations.filter(r => {
    if (statusFilter) {
      const c = countCategories(r);
      if (statusFilter === 'Empty'      && c !== 0) return false;
      if (statusFilter === 'Incomplete' && (c === 0 || c === 9)) return false;
      if (statusFilter === 'Complete'   && c !== 9) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.client_name.toLowerCase().includes(q) &&
          !r.reservation_id.toLowerCase().includes(q) &&
          !(r.inventory_code ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <PageShell title="Buyer's Foldering">
      <div className="space-y-3 pb-6">

        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm">
            <Search size={15} className="text-[#8E8E93] shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by client, ID or unit…"
              className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]" />
            {search && <button type="button" onClick={() => setSearch('')}><X size={13} className="text-[#8E8E93]" /></button>}
          </div>
          <button type="button" onClick={() => setFilterOpen(true)}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
              activeFilterCount > 0 ? 'bg-[#C03D25] text-white shadow-md' : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
            }`}>
            <SlidersHorizontal size={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[#C03D25] text-[9px] font-bold flex items-center justify-center shadow">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Reservation status quick filters */}
        <div className="flex gap-2">
          {([['', 'All'], ['Reserved', 'For Booking'], ['Booked', 'Booked']] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setReservationStatusFilter(val)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                reservationStatusFilter === val
                  ? 'bg-[#C03D25] text-white shadow-sm'
                  : 'bg-white/80 border border-black/[0.08] text-[#6C6C70]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <FolderOpen size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
            <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const count = countCategories(r);
              const { style, label } = folderBadgeStyle(count);
              return (
                <GlassCard key={r.reservation_id}
                  className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => { sessionStorage.setItem('selectedReservation', JSON.stringify(r)); router.push('/account/buyers-foldering/detail'); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}>
                      <span className="text-sm font-bold text-white">{getInitials(r.client_name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#1C1C1E] truncate">{r.reservation_id}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={style}>{label}</span>
                      </div>
                      <p className="text-xs text-[#6C6C70] truncate mt-0.5">{r.client_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#6C6C70] truncate">{r.project}</span>
                        {r.inventory_code && <><span className="text-[#D1D1D6]">·</span><span className="text-xs font-medium text-[#6C6C70]">{r.inventory_code}</span></>}
                      </div>
                      {r.seller_name && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <User size={10} className="text-[#C7C7CC] shrink-0" />
                          <span className="text-[11px] text-[#8E8E93] truncate">{r.seller_name}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setFilterOpen(false)} />
      )}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button type="button" onClick={() => setFilterOpen(false)} className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>
          <div className="px-5 space-y-4 pb-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Folder Status</p>
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={['Empty', 'Incomplete', 'Complete']}
                placeholder="All Statuses"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
              <SearchableSelect
                value={projectFilter}
                onChange={setProjectFilter}
                options={projectOptions}
                placeholder="All Projects"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
              <SearchableSelect
                value={sellerFilter}
                onChange={setSellerFilter}
                options={sellerOptions}
                placeholder="All Sellers"
              />
            </div>
          </div>
          <div className="px-5 pb-10 pt-2 flex gap-3">
            <button type="button" onClick={() => { setSellerFilter(''); setProjectFilter(''); setStatusFilter(''); }}
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
    </PageShell>
  );
}
