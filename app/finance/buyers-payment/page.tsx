'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import {
  Banknote, Building2, Check, ChevronRight,
  Loader2, Search, SlidersHorizontal, X,
} from 'lucide-react';

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
  payment_proof_url:          string | null;
  proof_of_valid_id_urls:     string | null;
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
  proof_of_1st_dp_urls:         string | null;
  dp_acknowledgement_receipt_no: string | null;
  dp_sales_invoice_no:          string | null;
  date_of_1st_dp:               string | null;
  dp_verified_at:               string | null;
  finance_status:               string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function financeBadgeStyle(financeStatus: string | null, overallStatus: string | null): { style: React.CSSProperties; label: string } {
  if (overallStatus === 'Booked')
    return { style: { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }, label: 'Booked' };
  if (financeStatus === 'dp-verified')
    return { style: { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }, label: '1st DP Verified' };
  if (financeStatus === 'rf-verified')
    return { style: { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }, label: 'RF Verified' };
  if (financeStatus === 'rf-rejected')
    return { style: { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }, label: 'RF Rejected' };
  return { style: { background: 'rgba(255,159,10,0.12)', color: '#A05A00' }, label: 'Pending RF' };
}

function fmt(n: number | null) {
  if (n == null) return '—';
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyersPaymentPage() {
  const router = useRouter();
  const [bookings,       setBookings]       = useState<FinanceBooking[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [filterOpen,     setFilterOpen]     = useState(false);

  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [sellerOptions,  setSellerOptions]  = useState<string[]>([]);

  const [projectFilter,  setProjectFilter]  = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [sellerFilter,   setSellerFilter]   = useState('');

  const activeFilterCount = [projectFilter, statusFilter, sellerFilter].filter(Boolean).length;

  useEffect(() => {
    async function loadOptions() {
      const { data } = await supabase
        .from('reservations')
        .select('project, seller_name')
        .not('finance_status', 'is', null)
        .limit(5000);
      const rows = data ?? [];
      setProjectOptions([...new Set(rows.map(r => r.project).filter(Boolean))] as string[]);
      setSellerOptions([...new Set(rows.map(r => r.seller_name).filter(Boolean))] as string[]);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    setLoading(true);

    const SELECT = `
      reservation_id, client_name, project, inventory_code, unit_type,
      seller_name, status, booking_review_status, director_reviewed_at,
      net_list_price, vat, other_charges, total_contract_price,
      scheme_name, payment_term, signature_base64, created_at,
      tower, floor, unit_no, unit_area, payment_proof_url, proof_of_valid_id_urls,
      finance_verified_at, acknowledgement_receipt_no, sales_invoice_no, date_of_reservation_fee,
      proof_of_1st_dp_urls, dp_acknowledgement_receipt_no, dp_sales_invoice_no, date_of_1st_dp, dp_verified_at,
      finance_status, rf_payment_mode, subsequent_mode, ada_bank, first_payment_agreed, proof_of_fdp_urls
    `;

    let q;
    if (!statusFilter) {
      q = supabase
        .from('reservations')
        .select(SELECT)
        .not('finance_status', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);
    } else if (statusFilter === 'Pending RF') {
      q = supabase
        .from('reservations')
        .select(SELECT)
        .eq('finance_status', 'proof-submitted')
        .order('created_at', { ascending: false })
        .limit(5000);
    } else if (statusFilter === 'RF Rejected') {
      q = supabase
        .from('reservations')
        .select(SELECT)
        .eq('finance_status', 'rf-rejected')
        .order('created_at', { ascending: false })
        .limit(5000);
    } else if (statusFilter === 'RF Verified') {
      q = supabase
        .from('reservations')
        .select(SELECT)
        .eq('finance_status', 'rf-verified')
        .order('created_at', { ascending: false })
        .limit(5000);
    } else {
      q = supabase
        .from('reservations')
        .select(SELECT)
        .or('finance_status.eq.dp-verified,status.eq.Booked')
        .order('created_at', { ascending: false })
        .limit(5000);
    }

    if (projectFilter) q = q.eq('project',     projectFilter);
    if (sellerFilter)  q = q.eq('seller_name', sellerFilter);

    q.then(({ data }) => {
      setBookings((data ?? []) as FinanceBooking[]);
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
    <PageShell title="Buyer's Payment">
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
            <Banknote size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
            <p className="text-xs text-[#8E8E93] mt-1">Try adjusting your search or filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(b => {
              const { style, label } = financeBadgeStyle(b.finance_status, b.status);
              const dateLabel = b.director_reviewed_at
                ? `Dir. Approved ${fmtDate(b.director_reviewed_at)}`
                : `Created ${fmtDate(b.created_at)}`;
              return (
                <GlassCard
                  key={b.reservation_id}
                  className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => {
                    sessionStorage.setItem('financeBooking', JSON.stringify(b));
                    router.push('/finance/buyers-payment/verify');
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
                      <p className="text-xs text-[#8E8E93] mt-0.5 truncate">{b.client_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#6C6C70] truncate">{b.project}</span>
                        {b.inventory_code && (
                          <><span className="text-[#D1D1D6]">·</span>
                          <span className="text-xs font-medium text-[#6C6C70]">{b.inventory_code}</span></>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-[#8E8E93]">
                          {dateLabel}{b.seller_name ? ` · ${b.seller_name}` : ''}
                        </p>
                        <p className="text-xs font-bold text-[#1C1C1E] shrink-0">{fmt(b.total_contract_price)}</p>
                      </div>
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

          <div className="px-5 space-y-5 pb-4 max-h-[60vh] overflow-y-auto">
            {/* Payment Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Payment Status</p>
              <div className="flex gap-2 flex-wrap">
                {(['', 'Pending RF', 'RF Rejected', 'RF Verified', 'DP Verified']).map(s => (
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
                <select
                  value={projectFilter}
                  onChange={e => setProjectFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 appearance-none"
                >
                  <option value="">All Projects</option>
                  {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}

            {/* Seller */}
            {sellerOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Seller</p>
                <select
                  value={sellerFilter}
                  onChange={e => setSellerFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 appearance-none"
                >
                  <option value="">All Sellers</option>
                  {sellerOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
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
