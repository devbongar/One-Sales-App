'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import FilterSelect from '@/components/ui/FilterSelect';
import { supabase } from '@/lib/supabase';
import { Hash, User, Building2, Tag, ChevronRight, ShieldCheck } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingBooking {
  reservation_id:        string;
  client_name:           string;
  project:               string;
  inventory_code:        string | null;
  unit_type:             string;
  seller_name:           string | null;
  booking_review_status: string | null;
  director_notes:        string | null;
  submitted_at:          string | null;
  director_reviewed_at:  string | null;
  net_list_price:        number | null;
  total_contract_price:  number | null;
  scheme_name:           string | null;
  payment_term:          string | null;
  payment_proof_url:          string | null;
  proof_of_billing_urls:      string | null;
  proof_of_income_urls:       string | null;
  proof_of_valid_id_urls:     string | null;
  co_owner_id_urls:           string[] | null;
  atty_in_fact_id_urls:       string[] | null;
  spouse_id_urls:             string[] | null;
  has_co_ownership:           boolean | null;
  has_atty_in_fact:           boolean | null;
  has_spouse:                 boolean | null;
  tower:                 string | null;
  floor:                 string | null;
  unit_no:               string | null;
  unit_area:             number | null;
  vat:                   number | null;
  other_charges:         number | null;
  signature_base64:      string | null;
  created_at:            string | null;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function ReviewBadge({ status }: { status: string | null }) {
  if (!status || status === 'submitted')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Pending Review</span>;
  if (status === 'director-approved')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approved</span>;
  if (status === 'director-rejected')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rejected</span>;
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersVerificationPage() {
  const router  = useRouter();
  const [bookings,        setBookings]        = useState<PendingBooking[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [projectOptions,  setProjectOptions]  = useState<string[]>([]);
  const [sellerOptions,   setSellerOptions]   = useState<string[]>([]);
  const [projectFilter,   setProjectFilter]   = useState('');
  const [sellerFilter,    setSellerFilter]    = useState('');
  const [statusFilter,    setStatusFilter]    = useState('Pending Review');

  useEffect(() => {
    async function loadOptions() {
      const { data } = await supabase
        .from('reservations')
        .select('project, seller_name')
        .eq('documents_saved', true);
      if (!data) return;
      setProjectOptions([...new Set(data.map(r => r.project).filter(Boolean))] as string[]);
      setSellerOptions([...new Set(data.map(r => r.seller_name).filter(Boolean))] as string[]);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      let q = supabase
        .from('reservations')
        .select(`
          reservation_id, client_name, project, inventory_code, unit_type,
          seller_name, booking_review_status, director_notes,
          submitted_at, director_reviewed_at,
          net_list_price, vat, other_charges, total_contract_price,
          scheme_name, payment_term, signature_base64, created_at,
          tower, floor, unit_no, unit_area,
          list_price, promo_discount_pct, promo_discount_amount,
          payterm_discount_pct, payterm_discount_amount, employee_discount_amount,
          dp_rate, term_months, dp_amount, net_spot_dp,
          monthly_stretched_dp, monthly_deferred, bank_monthly, hdmf_monthly,
          balance_for_financing, reservation_fee,
          payment_proof_url, proof_of_billing_urls, proof_of_income_urls,
          proof_of_valid_id_urls, co_owner_id_urls, atty_in_fact_id_urls,
          spouse_id_urls, has_co_ownership, has_atty_in_fact, has_spouse
        `)
        .eq('documents_saved', true)
        .order('created_at', { ascending: false });

      // Status sub-filter
      if (statusFilter === 'Pending Review') {
        q = q.or('booking_review_status.is.null,booking_review_status.eq.submitted');
      } else if (statusFilter === 'Approved') {
        q = q.eq('booking_review_status', 'director-approved');
      } else if (statusFilter === 'Rejected') {
        q = q.eq('booking_review_status', 'director-rejected');
      } else {
        // 'All' — exclude finance-verified (NULL-safe)
        q = q.or('booking_review_status.is.null,booking_review_status.in.(submitted,director-approved,director-rejected)');
      }

      if (projectFilter) q = q.eq('project', projectFilter);
      if (sellerFilter)  q = q.eq('seller_name', sellerFilter);

      const { data } = await q;
      setBookings((data ?? []) as PendingBooking[]);
      setLoading(false);
    }
    load();
  }, [projectFilter, sellerFilter, statusFilter]);

  function fmt(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <PageShell title="Buyer's Verification">

      <GlassCard className="px-4 py-1">
        <FilterSelect label="Project" value={projectFilter} options={projectOptions} onChange={setProjectFilter} icon={<Building2 size={16} />} />
        <FilterSelect label="Seller"  value={sellerFilter}  options={sellerOptions}  onChange={setSellerFilter}  icon={<User size={16} />} />
        <FilterSelect label="Status"  value={statusFilter}  options={['Pending Review', 'Approved', 'Rejected', 'All']} onChange={setStatusFilter} icon={<ShieldCheck size={16} />} />
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
                sessionStorage.setItem('reviewBooking', JSON.stringify(b));
                router.push('/account/buyers-verification/review');
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash size={12} className="text-[#E8634A]" />
                  <span className="text-xs font-bold text-[#E8634A] tracking-wider">{b.reservation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ReviewBadge status={b.booking_review_status} />
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
                <p className="text-[10px] text-[#8E8E93] pt-0.5">
                  {b.submitted_at ? `Submitted ${fmt(b.submitted_at)}` : `Booked ${fmt(b.created_at)}`}
                  {b.seller_name ? ` · ${b.seller_name}` : ''}
                </p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

    </PageShell>
  );
}
