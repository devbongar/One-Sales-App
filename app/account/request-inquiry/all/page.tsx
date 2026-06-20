'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { Search, X, ListChecks } from 'lucide-react';
import { RequestCard, RequestDetailSheet, type RequestRecord } from '../page';

const SELECT_FIELDS = 'id, reservation_id, client_id, client_name, project_name, inventory_code, type_of_request, sub_type, request_category, turnaround_days, description, status, submitted_at, approval_status, resolution_status, approved_by, date_approved, new_inventory_code, new_payterm_code, new_payterm_scheme, new_term_months, remaining_balance, requested_by';

export default function AllRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [isAM,     setIsAM]     = useState(false);

  useEffect(() => {
    async function load() {
      const session = await getSession();
      setIsAM(session?.role_name === 'Account Management');

      const { data } = await supabase
        .from('requests_and_inquiries')
        .select(SELECT_FIELDS)
        .order('submitted_at', { ascending: false });
      setRequests((data as RequestRecord[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function reload() {
    supabase
      .from('requests_and_inquiries')
      .select(SELECT_FIELDS)
      .order('submitted_at', { ascending: false })
      .then(({ data }) => setRequests((data as RequestRecord[]) ?? []));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(r =>
      r.client_name?.toLowerCase().includes(q) ||
      r.reservation_id?.toLowerCase().includes(q) ||
      r.project_name?.toLowerCase().includes(q) ||
      r.type_of_request.toLowerCase().includes(q) ||
      r.sub_type?.toLowerCase().includes(q) ||
      r.inventory_code?.toLowerCase().includes(q)
    );
  }, [requests, query]);

  return (
    <PageShell title="All Requests" backButton>
      <div className="space-y-3 pb-6">

        {/* Search bar */}
        <GlassCard className="flex items-center gap-3 px-4 py-3">
          <Search size={15} className="text-[#C03D25] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, reservation, type…"
            className="flex-1 text-sm bg-transparent outline-none text-[#1C1C1E] placeholder-[#C7C7CC]"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="shrink-0 active:opacity-60">
              <X size={14} className="text-[#8E8E93]" />
            </button>
          )}
        </GlassCard>

        {/* Count label */}
        {!loading && (
          <p className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">
            {query ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : `${requests.length} total`}
          </p>
        )}

        {/* List */}
        {loading ? (
          <GlassCard className="p-6 flex items-center justify-center">
            <p className="text-sm text-[#8E8E93]">Loading…</p>
          </GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 flex flex-col items-center gap-3">
            <ListChecks size={32} className="text-[#D1D1D6]" />
            <p className="text-sm font-semibold text-[#8E8E93]">
              {query ? 'No matching requests' : 'No requests yet'}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <RequestCard key={r.id} r={r} onClick={() => setSelected(r)} />
            ))}
          </div>
        )}

      </div>

      {selected && (
        <RequestDetailSheet
          r={selected}
          onClose={() => setSelected(null)}
          isAM={isAM}
          onApprove={r => {
            setSelected(null);
            router.push(`/account/request-inquiry/approve?id=${r.id}`);
          }}
          onReject={async r => {
            await supabase
              .from('requests_and_inquiries')
              .update({ approval_status: 'Disapproved', resolution_status: 'Rejected', status: 'closed' })
              .eq('id', r.id);
            setSelected(null);
            reload();
          }}
        />
      )}
    </PageShell>
  );
}
