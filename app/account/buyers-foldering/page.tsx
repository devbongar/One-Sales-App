'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { Tag, User, Building2, Hash, ChevronRight, FolderOpen } from 'lucide-react';
import FilterSelect from '@/components/ui/FilterSelect';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reservation {
  reservation_id: string;
  client_name: string;
  project: string;
  inventory_code: string | null;
  unit_type: string;
  seller_name: string | null;
  // doc fields (JSON strings from reservation flow)
  payment_proof_url:     string | null;
  proof_of_billing_urls: string | null;
  proof_of_income_urls:  string | null;
  proof_of_valid_id_urls: string | null;
  // doc arrays from booking stage 2
  co_owner_id_urls:      string[] | null;
  atty_in_fact_id_urls:  string[] | null;
  spouse_id_urls:        string[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(s: string | null): string[] {
  try { return JSON.parse(s ?? '[]') as string[]; } catch { return []; }
}

/** Number of doc categories (out of 7) that have at least one file */
function countCategories(r: Reservation): number {
  return [
    parseJson(r.payment_proof_url).length > 0,
    parseJson(r.proof_of_billing_urls).length > 0,
    parseJson(r.proof_of_income_urls).length > 0,
    parseJson(r.proof_of_valid_id_urls).length > 0,
    (r.co_owner_id_urls ?? []).length > 0,
    (r.atty_in_fact_id_urls ?? []).length > 0,
    (r.spouse_id_urls ?? []).length > 0,
  ].filter(Boolean).length;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function FolderBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#8E8E93]">Empty</span>;
  if (count === 7) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Complete</span>;
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{count}/7</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersFolderingPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [clientOptions,  setClientOptions]  = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  const [sellerFilter,  setSellerFilter]  = useState('');
  const [clientFilter,  setClientFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');

  useEffect(() => {
    async function loadOptions() {
      const { data } = await supabase
        .from('reservations')
        .select('seller_name, client_name, project')
        .eq('status', 'Reserved-paid');
      if (!data) return;
      setSellerOptions([...new Set(data.map(r => r.seller_name).filter(Boolean))] as string[]);
      setClientOptions([...new Set(data.map(r => r.client_name).filter(Boolean))] as string[]);
      setProjectOptions([...new Set(data.map(r => r.project).filter(Boolean))] as string[]);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from('reservations')
        .select(`
          reservation_id, client_name, project, inventory_code, unit_type, seller_name,
          payment_proof_url, proof_of_billing_urls, proof_of_income_urls, proof_of_valid_id_urls,
          co_owner_id_urls, atty_in_fact_id_urls, spouse_id_urls
        `)
        .eq('status', 'Reserved-paid')
        .order('created_at', { ascending: false });

      if (sellerFilter)  query = query.eq('seller_name', sellerFilter);
      if (clientFilter)  query = query.eq('client_name', clientFilter);
      if (projectFilter) query = query.eq('project', projectFilter);

      const { data } = await query;
      setReservations((data ?? []) as Reservation[]);
      setLoading(false);
    }
    load();
  }, [sellerFilter, clientFilter, projectFilter]);

  const displayed = reservations.filter(r => {
    if (!statusFilter) return true;
    const c = countCategories(r);
    if (statusFilter === 'Empty')      return c === 0;
    if (statusFilter === 'Incomplete') return c > 0 && c < 7;
    if (statusFilter === 'Complete')   return c === 7;
    return true;
  });

  return (
    <PageShell title="Buyer's Foldering">

      <GlassCard className="px-4 py-1">
        <FilterSelect label="Seller"        value={sellerFilter}  options={sellerOptions}  onChange={setSellerFilter}  icon={<User size={16} />} />
        <FilterSelect label="Client Name"   value={clientFilter}  options={clientOptions}  onChange={setClientFilter}  icon={<User size={16} />} searchable />
        <FilterSelect label="Project"       value={projectFilter} options={projectOptions} onChange={setProjectFilter} icon={<Building2 size={16} />} />
        <FilterSelect label="Folder Status" value={statusFilter}  options={['Empty', 'Incomplete', 'Complete']} onChange={setStatusFilter} icon={<FolderOpen size={16} />} />
      </GlassCard>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
          <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your filters</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {displayed.map(r => (
            <GlassCard
              key={r.reservation_id}
              className="px-4 py-3 space-y-2 active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => {
                sessionStorage.setItem('selectedReservation', JSON.stringify(r));
                router.push('/account/buyers-foldering/detail');
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash size={12} className="text-[#E8634A]" />
                  <span className="text-xs font-bold text-[#E8634A] tracking-wider">{r.reservation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FolderBadge count={countCategories(r)} />
                  <ChevronRight size={14} className="text-[#C7C7CC]" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-sm font-semibold text-[#1C1C1E]">{r.client_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-xs text-[#6C6C70]">{r.project}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-xs text-[#6C6C70]">{r.inventory_code ?? '—'}</span>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

    </PageShell>
  );
}
