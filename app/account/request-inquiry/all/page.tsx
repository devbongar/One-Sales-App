'use client';

import { useEffect, useState, useMemo } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/lib/supabase';
import { Search, X, ListChecks } from 'lucide-react';
import { RequestCard, RequestDetailSheet } from '../page';

interface RequestRecord {
  id:               string;
  reservation_id:   string | null;
  client_id:        string | null;
  client_name:      string | null;
  project_name:     string | null;
  inventory_code:   string | null;
  type_of_request:  string;
  sub_type:         string | null;
  request_category: string;
  turnaround_days:  number;
  description:      string | null;
  status:           string;
  submitted_at:     string;
}

export default function AllRequestsPage() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<RequestRecord | null>(null);

  useEffect(() => {
    supabase
      .from('requests_and_inquiries')
      .select('id, reservation_id, client_id, client_name, project_name, inventory_code, type_of_request, sub_type, request_category, turnaround_days, description, status, submitted_at')
      .order('submitted_at', { ascending: false })
      .then(({ data }) => {
        setRequests((data as RequestRecord[]) ?? []);
        setLoading(false);
      });
  }, []);

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

      {selected && <RequestDetailSheet r={selected} onClose={() => setSelected(null)} />}
    </PageShell>
  );
}
