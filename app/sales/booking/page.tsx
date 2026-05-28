'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { Tag, User, Building2, LayoutGrid, Hash, ChevronRight } from 'lucide-react';
import FilterSelect from '@/components/ui/FilterSelect';
import { getAllBookingProgress, BookingProgress, BookingStatus, computeBookingStatus } from '@/lib/booking-progress';

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

function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { label: string; cls: string }> = {
    'finance-verified':  { label: 'Finance Verified', cls: 'bg-green-100 text-green-700' },
    'director-approved': { label: 'Dir. Approved',    cls: 'bg-teal-100 text-teal-700' },
    'director-rejected': { label: 'Dir. Rejected',    cls: 'bg-red-100 text-red-700' },
    'submitted':         { label: 'Submitted',         cls: 'bg-blue-100 text-blue-700' },
    'fully-complete':    { label: 'Docs Complete',     cls: 'bg-purple-100 text-purple-700' },
    'stage1-complete':   { label: 'Docs Pending',      cls: 'bg-blue-100 text-blue-700' },
    'in-progress':       { label: 'In Progress',       cls: 'bg-amber-100 text-amber-700' },
    'not-started':       { label: 'Not Started',       cls: 'bg-[#F2F2F7] text-[#8E8E93]' },
  };
  const { label, cls } = map[status] ?? map['not-started'];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
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
  const [statusFilter,  setStatusFilter]  = useState('');
  const [progressMap, setProgressMap] = useState<Record<string, BookingProgress>>({});

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

      const [{ data }, progress] = await Promise.all([
        query,
        getAllBookingProgress().catch(() => ({}) as Record<string, BookingProgress>),
      ]);
      setReservations((data ?? []) as Reservation[]);
      setProgressMap(progress);
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
        <FilterSelect label="Status" value={statusFilter} options={['Not Started','In Progress','Docs Pending','Docs Complete','Submitted','Dir. Rejected','Dir. Approved','Finance Verified']} onChange={setStatusFilter} icon={<Tag size={16} />} />
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
          {reservations.filter(r => {
            if (!statusFilter) return true;
            const s = computeBookingStatus(progressMap[r.reservation_id]);
            const map: Record<string, BookingStatus> = {
              'Not Started':      'not-started',
              'In Progress':      'in-progress',
              'Docs Pending':     'stage1-complete',
              'Docs Complete':    'fully-complete',
              'Submitted':        'submitted',
              'Dir. Rejected':    'director-rejected',
              'Dir. Approved':    'director-approved',
              'Finance Verified': 'finance-verified',
            };
            return s === (map[statusFilter] ?? '');
          }).map(r => (
            <GlassCard
              key={r.reservation_id}
              className="px-4 py-3 space-y-2 active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => {
                sessionStorage.setItem('currentReservationId', r.reservation_id);
                sessionStorage.setItem('selectedReservation', JSON.stringify(r));
                router.push('/sales/booking/detail');
              }}
            >
              {/* Top row: reservation ID + status badge + chevron */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash size={12} className="text-[#E8634A]" />
                  <span className="text-xs font-bold text-[#E8634A] tracking-wider">{r.reservation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookingStatusBadge status={computeBookingStatus(progressMap[r.reservation_id])} />
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
