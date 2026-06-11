'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  Building2, Check, ChevronRight, Loader2,
  Search, ShieldCheck, X, SlidersHorizontal,
} from 'lucide-react';

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
  hic_discount:          number | null;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function reviewBadgeStyle(status: string | null): { style: React.CSSProperties; label: string } {
  if (!status || status === 'submitted')
    return { style: { background: 'rgba(0,122,255,0.12)', color: '#0040A0' }, label: 'Pending Review' };
  if (status === 'director-approved')
    return { style: { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }, label: 'Approved' };
  if (status === 'director-rejected')
    return { style: { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }, label: 'Rejected' };
  return { style: { background: 'rgba(142,142,147,0.12)', color: '#6C6C70' }, label: status };
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersVerificationPage() {
  const router = useRouter();
  const [bookings,        setBookings]        = useState<PendingBooking[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [filterOpen,      setFilterOpen]      = useState(false);

  const [projectOptions,  setProjectOptions]  = useState<string[]>([]);
  const [sellerOptions,   setSellerOptions]   = useState<string[]>([]);

  const [projectFilter,   setProjectFilter]   = useState('');
  const [statusFilter,    setStatusFilter]    = useState('');
  const [sellerFilter,    setSellerFilter]    = useState('');

  const activeFilterCount = [projectFilter, statusFilter, sellerFilter].filter(Boolean).length;

  useEffect(() => {
    supabase.from('reservations').select('project, seller_name').eq('documents_saved', true).limit(5000)
      .then(({ data }) => {
        if (!data) return;
        setProjectOptions([...new Set(data.map(r => r.project).filter(Boolean))] as string[]);
        setSellerOptions([...new Set(data.map(r => r.seller_name).filter(Boolean))] as string[]);
      });
  }, []);

  useEffect(() => {
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
        payterm_discount_pct, payterm_discount_amount, hic_discount, employee_discount_amount,
        dp_rate, term_months, dp_amount, net_spot_dp,
        monthly_stretched_dp, monthly_deferred, bank_monthly, hdmf_monthly,
        balance_for_financing, reservation_fee,
        payment_proof_url, proof_of_billing_urls, proof_of_income_urls,
        proof_of_valid_id_urls, co_owner_id_urls, atty_in_fact_id_urls,
        spouse_id_urls, has_co_ownership, has_atty_in_fact, has_spouse
      `)
      .eq('documents_saved', true)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (!statusFilter) {
      q = q.or('booking_review_status.is.null,booking_review_status.eq.submitted,booking_review_status.eq.director-approved,booking_review_status.eq.director-rejected');
    } else if (statusFilter === 'Pending Review') {
      q = q.or('booking_review_status.is.null,booking_review_status.eq.submitted');
    } else if (statusFilter === 'Approved') {
      q = q.eq('booking_review_status', 'director-approved');
    } else if (statusFilter === 'Rejected') {
      q = q.eq('booking_review_status', 'director-rejected');
    }

    if (projectFilter) q = q.eq('project',     projectFilter);
    if (sellerFilter)  q = q.eq('seller_name', sellerFilter);

    q.then(({ data }) => {
      setBookings((data ?? []) as PendingBooking[]);
      setLoading(false);
    });
  }, [projectFilter, statusFilter, sellerFilter]);

  const filtered = bookings.filter(b => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.client_name.toLowerCase().includes(q) ||
      b.reservation_id.toLowerCase().includes(q) ||
      (b.inventory_code ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <PageShell title="Buyer's Verification">
      <div className="space-y-3 pb-6">

        {/* ── Search + Filter ──────────────────────────────────── */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm">
            <Search size={15} className="text-[#8E8E93] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by client, ID or unit…"
              className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}>
                <X size={13} className="text-[#8E8E93]" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
              activeFilterCount > 0
                ? 'bg-[#C03D25] text-white shadow-md'
                : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
            }`}
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[#C03D25] text-[9px] font-bold flex items-center justify-center shadow">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── List ─────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <ShieldCheck size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
            <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(b => {
              const { style, label } = reviewBadgeStyle(b.booking_review_status);
              const dateLabel = b.submitted_at
                ? `Submitted ${fmtDate(b.submitted_at)}`
                : `Booked ${fmtDate(b.created_at)}`;
              return (
                <GlassCard
                  key={b.reservation_id}
                  className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => {
                    sessionStorage.setItem('reviewBooking', JSON.stringify(b));
                    router.push('/account/buyers-verification/review');
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
                    >
                      <span className="text-sm font-bold text-white">{getInitials(b.client_name)}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#1C1C1E] truncate">{b.reservation_id}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={style}>
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-[#6C6C70] truncate mt-0.5">{b.client_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#6C6C70] truncate">{b.project}</span>
                        {b.inventory_code && (
                          <><span className="text-[#D1D1D6]">·</span>
                          <span className="text-xs font-medium text-[#6C6C70]">{b.inventory_code}</span></>
                        )}
                      </div>
                      <p className="text-[10px] text-[#8E8E93] mt-0.5">
                        {dateLabel}{b.seller_name ? ` · ${b.seller_name}` : ''}
                      </p>
                    </div>

                    <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Filter sheet backdrop ─────────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setFilterOpen(false)} />
      )}

      {/* ── Filter sheet ─────────────────────────────────────── */}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center"
            >
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>

          <div className="px-5 space-y-5 pb-4">
            {/* Review Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Review Status</p>
              <div className="flex gap-2 flex-wrap">
                {(['', 'Pending Review', 'Approved', 'Rejected']).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      statusFilter === s
                        ? 'bg-[#C03D25] border-[#C03D25] text-white'
                        : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                    }`}
                  >
                    {statusFilter === s && s && <Check size={11} />}
                    {s || 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Project */}
            {projectOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
                <div className="flex gap-2 flex-wrap">
                  {(['', ...projectOptions]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProjectFilter(p)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                        projectFilter === p
                          ? 'bg-[#C03D25] border-[#C03D25] text-white'
                          : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                      }`}
                    >
                      {projectFilter === p && p && <Check size={11} />}
                      {p || 'All'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seller */}
            {sellerOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
                <div className="flex gap-2 flex-wrap">
                  {(['', ...sellerOptions]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSellerFilter(s)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                        sellerFilter === s
                          ? 'bg-[#C03D25] border-[#C03D25] text-white'
                          : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                      }`}
                    >
                      {sellerFilter === s && s && <Check size={11} />}
                      {s || 'All'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-10 pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => { setProjectFilter(''); setStatusFilter(''); setSellerFilter(''); }}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
