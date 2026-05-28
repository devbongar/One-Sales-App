'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import FilterSelect from '@/components/ui/FilterSelect';
import { supabase } from '@/lib/supabase';
import { Hash, User, Building2, Tag, ChevronRight, Banknote } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceBooking {
  reservation_id:        string;
  client_name:           string;
  project:               string;
  inventory_code:        string | null;
  unit_type:             string;
  seller_name:           string | null;
  status:                string | null;
  booking_review_status: string | null;
  total_contract_price:  number | null;
  net_list_price:        number | null;
  vat:                   number | null;
  other_charges:         number | null;
  scheme_name:           string | null;
  payment_term:          string | null;
  director_reviewed_at:  string | null;
  payment_proof_url:     string | null;
  tower:                 string | null;
  floor:                 string | null;
  unit_no:               string | null;
  unit_area:             number | null;
  signature_base64:      string | null;
  created_at:            string | null;
  finance_verified_at:          string | null;
  acknowledgement_receipt_no:   string | null;
  sales_invoice_no:             string | null;
  date_of_reservation_fee:      string | null;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function FinanceBadge({ bookingStatus, reservationStatus }: { bookingStatus: string | null; reservationStatus: string | null }) {
  if (reservationStatus === 'Pending Review')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Pending Review</span>;
  if (bookingStatus === 'finance-verified')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Verified</span>;
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>;
}

function fmt(n: number | null) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersPaymentPage() {
  const router = useRouter();
  const [bookings,       setBookings]       = useState<FinanceBooking[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);
  const [clientOptions,  setClientOptions]  = useState<string[]>([]);
  const [projectFilter,  setProjectFilter]  = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [sellerFilter,   setSellerFilter]   = useState('');
  const [clientFilter,   setClientFilter]   = useState('');

  useEffect(() => {
    async function loadOptions() {
      const [r1, r2] = await Promise.all([
        supabase.from('reservations').select('project, seller_name, client_name').in('booking_review_status', ['director-approved', 'finance-verified']),
        supabase.from('reservations').select('project, seller_name, client_name').eq('status', 'Pending Review'),
      ]);
      const rows = [...(r1.data ?? []), ...(r2.data ?? [])];
      setProjectOptions([...new Set(rows.map(r => r.project).filter(Boolean))] as string[]);
      setSellerOptions([...new Set(rows.map(r => r.seller_name).filter(Boolean))] as string[]);
      setClientOptions([...new Set(rows.map(r => r.client_name).filter(Boolean))] as string[]);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const SELECT = `
        reservation_id, client_name, project, inventory_code, unit_type,
        seller_name, status, booking_review_status, director_reviewed_at,
        net_list_price, vat, other_charges, total_contract_price,
        scheme_name, payment_term, signature_base64, created_at,
        tower, floor, unit_no, unit_area, payment_proof_url, finance_verified_at,
        acknowledgement_receipt_no, sales_invoice_no, date_of_reservation_fee
      `;

      let q;
      if (!statusFilter) {
        // No filter — show all relevant records
        q = supabase
          .from('reservations')
          .select(SELECT)
          .or('status.eq.Pending Review,booking_review_status.in.(director-approved,finance-verified)')
          .order('created_at', { ascending: false });
      } else if (statusFilter === 'Pending Review') {
        q = supabase
          .from('reservations')
          .select(SELECT)
          .eq('status', 'Pending Review')
          .order('created_at', { ascending: false });
      } else {
        const statusValues: Record<string, string[]> = {
          'Pending':  ['director-approved'],
          'Verified': ['finance-verified'],
        };
        q = supabase
          .from('reservations')
          .select(SELECT)
          .in('booking_review_status', statusValues[statusFilter] ?? ['director-approved'])
          .order('director_reviewed_at', { ascending: false });
      }

      if (projectFilter) q = q.eq('project',     projectFilter);
      if (sellerFilter)  q = q.eq('seller_name', sellerFilter);
      if (clientFilter)  q = q.eq('client_name', clientFilter);

      const { data } = await q;
      setBookings((data ?? []) as FinanceBooking[]);
      setLoading(false);
    }
    load();
  }, [projectFilter, statusFilter, sellerFilter, clientFilter]);

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <PageShell title="Buyer's Payment">

      <GlassCard className="px-4 py-1">
        <FilterSelect label="Project"     value={projectFilter} options={projectOptions} onChange={setProjectFilter} icon={<Building2 size={16} />} />
        <FilterSelect label="Status"      value={statusFilter}  options={['Pending Review', 'Pending', 'Verified']} onChange={setStatusFilter} icon={<Banknote size={16} />} />
        <FilterSelect label="Seller"      value={sellerFilter}  options={sellerOptions}  onChange={setSellerFilter}  icon={<User size={16} />} />
        <FilterSelect label="Client Name" value={clientFilter}  options={clientOptions}  onChange={setClientFilter}  icon={<User size={16} />} searchable />
      </GlassCard>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
          <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your filters</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {bookings.map(b => (
            <GlassCard
              key={b.reservation_id}
              className="px-4 py-3 space-y-2 active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => {
                sessionStorage.setItem('financeBooking', JSON.stringify(b));
                router.push('/finance/buyers-payment/verify');
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash size={12} className="text-[#E8634A]" />
                  <span className="text-xs font-bold text-[#E8634A] tracking-wider">{b.reservation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FinanceBadge bookingStatus={b.booking_review_status} reservationStatus={b.status} />
                  <ChevronRight size={14} className="text-[#C7C7CC]" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-sm font-semibold text-[#1C1C1E]">{b.client_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-xs text-[#6C6C70]">{b.project}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag size={11} className="text-[#C7C7CC] shrink-0" />
                  <span className="text-xs text-[#6C6C70]">{b.inventory_code ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <p className="text-[10px] text-[#8E8E93]">
                    {b.status === 'Pending Review'
                      ? `Submitted ${fmtDate(b.created_at)}`
                      : `Dir. Approved ${fmtDate(b.director_reviewed_at)}`
                    }
                  </p>
                  <p className="text-xs font-bold text-[#1C1C1E]">{fmt(b.total_contract_price)}</p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

    </PageShell>
  );
}
