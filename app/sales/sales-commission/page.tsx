'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { getSession } from '@/lib/auth';
import { fetchAllSalespersons, SalespersonRecord } from '@/lib/salesperson';
import { fetchAllBrokers, BrokerRecord } from '@/lib/broker';
import { User, Search, DollarSign, CalendarRange, X, Building2, Briefcase } from 'lucide-react';
import FilterSelect from '@/components/ui/FilterSelect';

const POSITION_RANKS = ['PS', 'SM', 'SD', 'SDH', 'SH'];

function positionLabel(rank: string | null) {
  const map: Record<string, string> = {
    PS:  'Property Specialist',
    SM:  'Sales Manager',
    SD:  'Sales Director',
    SDH: 'Sales Division Head',
    SH:  'Sales Head',
  };
  return map[rank ?? ''] ?? rank ?? '—';
}

export default function SalesCommissionPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [mode, setMode] = useState<'my' | 'search'>('my');
  const [sellerType, setSellerType] = useState<'inhouse' | 'broker'>('inhouse');
  const [positionRankFilter, setPositionRankFilter] = useState<string>('');

  const [salespersons, setSalespersons] = useState<SalespersonRecord[]>([]);
  const [brokers, setBrokers] = useState<BrokerRecord[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(true);

  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<SalespersonRecord | null>(null);
  const [selectedBroker, setSelectedBroker] = useState<BrokerRecord | null>(null);

  const canSearch = role === 'All Access' || role === 'Sales Director';

  // Restore UI state when coming back from schedule/slip page
  useEffect(() => {
    const saved = sessionStorage.getItem('salesCommissionState');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.mode)              setMode(s.mode);
        if (s.sellerType)        setSellerType(s.sellerType);
        if (s.positionRankFilter !== undefined) setPositionRankFilter(s.positionRankFilter);
        if (s.query !== undefined)              setQuery(s.query);
        if (s.selectedSeller)   setSelectedSeller(s.selectedSeller);
        if (s.selectedBroker)   setSelectedBroker(s.selectedBroker);
      } catch {}
      sessionStorage.removeItem('salesCommissionState');
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchAllSalespersons(), fetchAllBrokers()])
      .then(([sp, br]) => { setSalespersons(sp); setBrokers(br); })
      .catch(console.error)
      .finally(() => setLoadingSellers(false));
  }, []);

  // Load role + auto-match My Commission
  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) return;
      setRole(session.role_name);
      if (mode !== 'my' || salespersons.length === 0 || selectedSeller) return;
      const match = salespersons.find(
        s => s.seller_name.toLowerCase() === session.full_name.toLowerCase()
      );
      setSelectedSeller(match ?? null);
      setSelectedBroker(null);
    })();
  }, [mode, salespersons]);

  const filteredSalespersons = useMemo(() => {
    return salespersons.filter(s => {
      if (positionRankFilter && s.position_rank !== positionRankFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          s.seller_name.toLowerCase().includes(q) ||
          (s.sales_manager ?? '').toLowerCase().includes(q) ||
          (s.position_rank ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [salespersons, query, positionRankFilter]);

  const filteredBrokers = useMemo(() => {
    if (!query) return brokers;
    const q = query.toLowerCase();
    return brokers.filter(b =>
      (b.bir_registered_name ?? '').toLowerCase().includes(q)
    );
  }, [brokers, query]);

  function navigate(path: 'slip' | 'schedule') {
    const seller = selectedSeller ?? (selectedBroker
      ? { seller_name: selectedBroker.seller_name, position_rank: selectedBroker.position_rank } as SalespersonRecord
      : null);
    if (!seller) return;
    // Save UI state so it's restored when coming back
    sessionStorage.setItem('salesCommissionState', JSON.stringify({
      mode, sellerType, positionRankFilter, query, selectedSeller, selectedBroker,
    }));
    sessionStorage.setItem('selectedSeller', JSON.stringify(seller));
    router.push(`/sales/sales-commission/${path}`);
  }

  function switchMode(m: 'my' | 'search') {
    setMode(m);
    setSelectedSeller(null);
    setSelectedBroker(null);
    setQuery('');
    setPositionRankFilter('');
    setSearchFocused(false);
  }

  function switchSellerType(t: 'inhouse' | 'broker') {
    setSellerType(t);
    setSelectedSeller(null);
    setSelectedBroker(null);
    setQuery('');
    setPositionRankFilter('');
    setSearchFocused(false);
  }

  const isSelected = selectedSeller !== null || selectedBroker !== null;

  return (
    <PageShell title="Sales Commission">

      {/* Mode toggle */}
      <GlassCard className="p-1.5 flex gap-1">
        <button
          onClick={() => switchMode('my')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mode === 'my' ? 'bg-[#C03D25] text-white shadow-sm' : 'text-[#6C6C70]'
          }`}
        >
          <User size={14} /> My Commission
        </button>
        {canSearch && (
          <button
            onClick={() => switchMode('search')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'search' ? 'bg-[#C03D25] text-white shadow-sm' : 'text-[#6C6C70]'
            }`}
          >
            <Search size={14} /> Search Sellers
          </button>
        )}
      </GlassCard>

      {/* Search mode */}
      {mode === 'search' && canSearch && (
        <GlassCard className="p-4 space-y-3">

          {/* In-house | Broker sub-toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => switchSellerType('inhouse')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all border ${
                sellerType === 'inhouse'
                  ? 'bg-[#C03D25] text-white border-[#C03D25]'
                  : 'bg-[#F2F2F7] text-[#6C6C70] border-transparent'
              }`}
            >
              In-house
            </button>
            <button
              onClick={() => switchSellerType('broker')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all border ${
                sellerType === 'broker'
                  ? 'bg-[#C03D25] text-white border-[#C03D25]'
                  : 'bg-[#F2F2F7] text-[#6C6C70] border-transparent'
              }`}
            >
              Broker
            </button>
          </div>

          {/* Position Rank filter (In-house only) */}
          {sellerType === 'inhouse' && (
            <FilterSelect
              label="Position Rank"
              value={positionRankFilter}
              options={POSITION_RANKS}
              onChange={setPositionRankFilter}
              icon={<Briefcase size={16} />}
            />
          )}

          {/* Search input */}
          <div className="flex items-center gap-2 bg-[#F2F2F7] rounded-xl px-3 py-2.5">
            <Search size={14} className="text-[#C7C7CC] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder={sellerType === 'broker' ? 'Search broker name…' : 'Search seller name…'}
              className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder:text-[#C7C7CC]"
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={13} className="text-[#C7C7CC]" />
              </button>
            )}
          </div>

          {/* Results list — shown only when search bar is focused */}
          {searchFocused && <div className="max-h-60 overflow-y-auto space-y-0.5" onMouseDown={e => e.preventDefault()}>
            {loadingSellers && (
              <p className="text-center text-sm text-[#8E8E93] py-4">Loading…</p>
            )}

            {/* In-house list */}
            {!loadingSellers && sellerType === 'inhouse' && filteredSalespersons.length === 0 && (
              <p className="text-center text-sm text-[#8E8E93] py-4">No sellers found</p>
            )}
            {!loadingSellers && sellerType === 'inhouse' && filteredSalespersons.map(s => (
              <button
                key={s.seller_name}
                onClick={() => { setSelectedSeller(s); setSelectedBroker(null); setSearchFocused(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  selectedSeller?.seller_name === s.seller_name ? 'bg-[#C03D25]/10' : 'active:bg-gray-100'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-[rgba(192,61,37,0.10)] flex items-center justify-center shrink-0">
                  <User size={14} className="text-[#C03D25]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${
                    selectedSeller?.seller_name === s.seller_name ? 'text-[#C03D25]' : 'text-[#1C1C1E]'
                  }`}>
                    {s.seller_name}
                  </p>
                  <p className="text-xs text-[#8E8E93]">{positionLabel(s.position_rank)}</p>
                  {s.seller_group && (
                    <p className="text-[10px] text-[#C7C7CC] truncate">{s.seller_group}</p>
                  )}
                </div>
              </button>
            ))}

            {/* Broker list */}
            {!loadingSellers && sellerType === 'broker' && filteredBrokers.length === 0 && (
              <p className="text-center text-sm text-[#8E8E93] py-4">No brokers found</p>
            )}
            {!loadingSellers && sellerType === 'broker' && filteredBrokers.map((b, i) => (
              <button
                key={b.seller_name ?? i}
                onClick={() => { setSelectedBroker(b); setSelectedSeller(null); setSearchFocused(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  selectedBroker?.seller_name === b.seller_name ? 'bg-[#C03D25]/10' : 'active:bg-gray-100'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-[rgba(192,61,37,0.10)] flex items-center justify-center shrink-0">
                  <Building2 size={14} className="text-[#C03D25]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${
                    selectedBroker?.seller_name === b.seller_name ? 'text-[#C03D25]' : 'text-[#1C1C1E]'
                  }`}>
                    {b.bir_registered_name ?? b.seller_name}
                  </p>
                  {b.seller_name && (
                    <p className="text-xs text-[#8E8E93] truncate">{b.seller_name}</p>
                  )}
                </div>
              </button>
            ))}
          </div>}
        </GlassCard>
      )}

      {/* In-house seller card */}
      {selectedSeller && (
        <GlassCard strong className="overflow-hidden">
          <div className="bg-[#C03D25] px-5 pt-5 pb-6">
            <p className="text-white/70 text-[10px] font-bold tracking-widest uppercase mb-1">
              {positionLabel(selectedSeller.position_rank)}
            </p>
            <p className="text-white font-bold text-2xl leading-tight mb-5">
              {selectedSeller.seller_name}
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedSeller.seller_group && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Seller Group</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedSeller.seller_group}</p>
                  </div>
                </div>
              )}
              {selectedSeller.sales_manager && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Manager</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedSeller.sales_manager}</p>
                  </div>
                </div>
              )}
              {selectedSeller.sales_director && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Director</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedSeller.sales_director}</p>
                  </div>
                </div>
              )}
              {selectedSeller.sales_division_head && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Division Head</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedSeller.sales_division_head}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <button onClick={() => navigate('slip')} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[rgba(192,61,37,0.08)] active:bg-[rgba(192,61,37,0.15)] transition-colors border border-[rgba(192,61,37,0.12)]">
              <DollarSign size={22} className="text-[#C03D25]" />
              <span className="text-xs font-semibold text-[#C03D25] text-center leading-tight">Commission{'\n'}Payout Slip</span>
            </button>
            <button onClick={() => navigate('schedule')} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[rgba(192,61,37,0.08)] active:bg-[rgba(192,61,37,0.15)] transition-colors border border-[rgba(192,61,37,0.12)]">
              <CalendarRange size={22} className="text-[#C03D25]" />
              <span className="text-xs font-semibold text-[#C03D25] text-center leading-tight">Commission{'\n'}Schedule</span>
            </button>
          </div>
        </GlassCard>
      )}

      {/* Broker card */}
      {selectedBroker && (
        <GlassCard strong className="overflow-hidden">
          <div className="bg-[#C03D25] px-5 pt-5 pb-6">
            <p className="text-white/70 text-[10px] font-bold tracking-widest uppercase mb-1">Broker</p>
            <p className="text-white font-bold text-2xl leading-tight mb-5">
              {selectedBroker.bir_registered_name ?? selectedBroker.seller_name}
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedBroker.broker_network_officer && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Network Officer</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedBroker.broker_network_officer}</p>
                  </div>
                </div>
              )}
              {selectedBroker.sales_director_head && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Director Head</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedBroker.sales_director_head}</p>
                  </div>
                </div>
              )}
              {selectedBroker.sales_head && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2">
                  <User size={11} className="text-white/70 shrink-0" />
                  <div>
                    <p className="text-white/60 text-[8px] font-bold tracking-wider uppercase leading-none mb-0.5">Sales Head</p>
                    <p className="text-white text-xs font-semibold leading-none">{selectedBroker.sales_head}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <button onClick={() => navigate('slip')} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[rgba(192,61,37,0.08)] active:bg-[rgba(192,61,37,0.15)] transition-colors border border-[rgba(192,61,37,0.12)]">
              <DollarSign size={22} className="text-[#C03D25]" />
              <span className="text-xs font-semibold text-[#C03D25] text-center leading-tight">Commission{'\n'}Payout Slip</span>
            </button>
            <button onClick={() => navigate('schedule')} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-[rgba(192,61,37,0.08)] active:bg-[rgba(192,61,37,0.15)] transition-colors border border-[rgba(192,61,37,0.12)]">
              <CalendarRange size={22} className="text-[#C03D25]" />
              <span className="text-xs font-semibold text-[#C03D25] text-center leading-tight">Commission{'\n'}Schedule</span>
            </button>
          </div>
        </GlassCard>
      )}

      {/* My Commission — no match */}
      {mode === 'my' && !loadingSellers && !selectedSeller && (
        <GlassCard className="p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#F2F2F7] flex items-center justify-center mx-auto mb-3">
            <User size={22} className="text-[#C7C7CC]" />
          </div>
          <p className="text-sm font-semibold text-[#1C1C1E]">No seller record found</p>
          <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
            Your account name doesn't match any active salesperson.
          </p>
        </GlassCard>
      )}

    </PageShell>
  );
}
