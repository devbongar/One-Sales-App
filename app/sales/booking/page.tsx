'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { Tag, User, Building2, LayoutGrid, Hash, ChevronRight } from 'lucide-react';
import FilterSelect from '@/components/ui/FilterSelect';

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

export default function BookingPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter options
  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [clientOptions,  setClientOptions]  = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);

  // Selected filters
  const [sellerFilter,  setSellerFilter]  = useState('');
  const [clientFilter,  setClientFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Load filter options from Reserved-paid rows only
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

  // Load reservations — Reserved-paid only
  useEffect(() => {
    async function loadReservations() {
      setLoading(true);
      let query = supabase
        .from('reservations')
        .select('reservation_id, client_name, project, inventory_code, unit_type, status, seller_name, payment_proof_url')
        .eq('status', 'Reserved-paid')
        .order('created_at', { ascending: false });

      if (sellerFilter)  query = query.eq('seller_name', sellerFilter);
      if (clientFilter)  query = query.eq('client_name', clientFilter);
      if (projectFilter) query = query.eq('project', projectFilter);

      const { data } = await query;
      setReservations((data ?? []) as Reservation[]);
      setLoading(false);
    }
    loadReservations();
  }, [sellerFilter, clientFilter, projectFilter]);

  return (
    <PageShell title="Booking">

      {/* Filters */}
      <GlassCard className="px-4 py-1">
        <FilterSelect label="Seller"      value={sellerFilter}  options={sellerOptions}  onChange={setSellerFilter}  icon={<User size={16} />} />
        <FilterSelect label="Client Name" value={clientFilter}  options={clientOptions}  onChange={setClientFilter}  icon={<User size={16} />} searchable />
        <FilterSelect label="Project"     value={projectFilter} options={projectOptions} onChange={setProjectFilter} icon={<Building2 size={16} />} />
      </GlassCard>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
        </div>
      ) : reservations.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm font-semibold text-[#1C1C1E]">No bookings found</p>
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
                router.push('/sales/booking/buyer-info');
              }}
            >
              {/* Top row: reservation ID + status badge + chevron */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash size={12} className="text-[#E8634A]" />
                  <span className="text-xs font-bold text-[#E8634A] tracking-wider">{r.reservation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
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
