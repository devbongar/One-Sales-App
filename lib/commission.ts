import { supabase } from '@/lib/supabase';
import { fetchSellerTaxInfo } from '@/lib/salesperson';

export interface CommissionRecord {
  reservation_id:       string;
  client_name:          string;
  project:              string;
  tower:                string | null;
  floor:                string | null;
  unit_no:              string | null;
  inventory_code:       string | null;
  unit_type:            string;
  product_type:         string;
  seller_name:          string | null;
  seller_id:            string | null;
  seller_type:          string | null;
  position_rank:        string | null;
  total_contract_price: number | null;
  net_list_price:       number | null;
  commission_rate:      number | null;
  total_commission:     number | null;
  status:               string;
  created_at:           string | null;
}

export interface CommissionTranche {
  tranche:                 number;
  percentage_collection:   number;
  commission_release_rate: number;
  commission_rate:         number;
  seller_type:             string;
}

export async function fetchCommissionRecords(): Promise<CommissionRecord[]> {
  const { data, error } = await supabase.rpc('get_commission_summary');
  if (error) throw error;
  return (data ?? []) as CommissionRecord[];
}

export async function fetchCommissionRecord(reservationId: string): Promise<CommissionRecord | null> {
  const { data, error } = await supabase.rpc('get_commission_for_reservation', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  const rows = (data ?? []) as CommissionRecord[];
  return rows[0] ?? null;
}

export type CommissionGenerateResult =
  | { ok: true }
  | { ok: false; reason: 'already-exists' | 'no-commission-record' | 'missing-fields' | 'no-tranches' };

export async function generateCommissionSchedule(reservationId: string): Promise<CommissionGenerateResult> {
  // Guard: skip if already generated
  const { count } = await supabase
    .from('commission_schedule')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_id', reservationId);
  if (count && count > 0) return { ok: false, reason: 'already-exists' };

  // Fetch commission data for this reservation
  const rec = await fetchCommissionRecord(reservationId);
  if (!rec) return { ok: false, reason: 'no-commission-record' };

  if (!rec.product_type || !rec.seller_type)
    return { ok: false, reason: 'missing-fields' };

  // Case 3: SD or higher — no commission generated
  if (rec.position_rank && ['SD', 'SDH', 'SH'].includes(rec.position_rank))
    return { ok: true };

  const { data: ids } = await supabase
    .from('reservations')
    .select('client_id, hic_discount')
    .eq('reservation_id', reservationId)
    .single();
  const client_id    = (ids as any)?.client_id    ?? null;
  const hic_discount = Number((ids as any)?.hic_discount) || 0;

  // No commission for Megawide employee clients
  if (client_id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('is_megawide_employee')
      .eq('client_id', client_id)
      .maybeSingle();
    if ((clientRow as any)?.is_megawide_employee === true) return { ok: true };
  }

  // Build hierarchy chain using IDs from the DB — no name-based secondary lookups needed.
  type Target = { name: string; sellerId: string | null; positionRank: string };
  const targets: Target[] = [];

  if (rec.seller_type === 'In-house') {
    const { data: rows, error: hierarchyError } = await supabase.rpc('get_salesperson_hierarchy', { p_seller_id: rec.seller_id });
    if (hierarchyError) throw hierarchyError;
    const h = (rows ?? [])[0] as any ?? null;

    const smName  = h?.sales_manager          as string | null ?? null;
    const smId    = h?.sales_manager_id       as string | null ?? null;
    const sdName  = h?.sales_director         as string | null ?? null;
    const sdId    = h?.sales_director_id      as string | null ?? null;
    const sdhName = h?.sales_division_head    as string | null ?? null;
    const sdhId   = h?.sales_division_head_id as string | null ?? null;
    const shName  = h?.sales_head             as string | null ?? null;
    const shId    = h?.sales_head_id          as string | null ?? null;

    if (rec.position_rank === 'PS') {
      targets.push({ name: rec.seller_name!, sellerId: rec.seller_id, positionRank: 'PS' });
      if (smId)  targets.push({ name: smName  ?? smId,  sellerId: smId,  positionRank: 'SM'  });
      if (sdId)  targets.push({ name: sdName  ?? sdId,  sellerId: sdId,  positionRank: 'SD'  });
      if (sdhId) targets.push({ name: sdhName ?? sdhId, sellerId: sdhId, positionRank: 'SDH' });
      if (shId)  targets.push({ name: shName  ?? shId,  sellerId: shId,  positionRank: 'SH'  });
    } else if (rec.position_rank === 'SM') {
      targets.push({ name: rec.seller_name!, sellerId: rec.seller_id, positionRank: 'PS' });
      if (sdId)  targets.push({ name: sdName  ?? sdId,  sellerId: sdId,  positionRank: 'SD'  });
      if (sdhId) targets.push({ name: sdhName ?? sdhId, sellerId: sdhId, positionRank: 'SDH' });
      if (shId)  targets.push({ name: shName  ?? shId,  sellerId: shId,  positionRank: 'SH'  });
    }
  } else {
    const { data: rows, error: hierarchyError } = await supabase.rpc('get_broker_hierarchy', { p_broker_id: rec.seller_id });
    if (hierarchyError) throw hierarchyError;
    const h = (rows ?? [])[0] as any ?? null;

    const smName  = h?.broker_network_officer    as string | null ?? null;
    const smId    = h?.broker_network_officer_id as string | null ?? null;
    const sdName  = h?.sales_director            as string | null ?? null;
    const sdId    = h?.sales_director_id         as string | null ?? null;
    const sdhName = h?.sales_director_head       as string | null ?? null;
    const sdhId   = h?.sales_director_head_id    as string | null ?? null;
    const shName  = h?.sales_head                as string | null ?? null;
    const shId    = h?.sales_head_id             as string | null ?? null;

    // Brokers are treated as PS in tranching
    targets.push({ name: rec.seller_name!, sellerId: rec.seller_id, positionRank: 'PS' });
    if (smId)  targets.push({ name: smName  ?? smId,  sellerId: smId,  positionRank: 'SM'  });
    if (sdId)  targets.push({ name: sdName  ?? sdId,  sellerId: sdId,  positionRank: 'SD'  });
    if (sdhId) targets.push({ name: sdhName ?? sdhId, sellerId: sdhId, positionRank: 'SDH' });
    if (shId)  targets.push({ name: shName  ?? shId,  sellerId: shId,  positionRank: 'SH'  });
  }

  if (targets.length === 0) return { ok: false, reason: 'missing-fields' };

  // Resolve project_id once for the commission_schedule rows
  const { data: projRow } = await supabase
    .from('projects').select('project_id').eq('name', rec.project).maybeSingle();
  const commProjectId = (projRow as any)?.project_id ?? null;

  // Use pre-HIC NLP as commission base (hic_discount was deducted from net_list_price)
  const nlp = (Number(rec.net_list_price) || 0) + hic_discount;
  const allLines: object[] = [];

  for (const target of targets) {
    const targetSellerId = target.sellerId;

    // Whole chain uses the direct seller's type — chain members have two tranching rows
    // (one for in-house sales, one for broker sales) and must use the correct one
    const sellerType = rec.seller_type!;

    const tranches = await fetchCommissionTranches(
      rec.project, target.positionRank, rec.product_type, sellerType,
      sellerType === 'Broker' ? (rec.seller_id ?? undefined) : undefined,
    );
    if (!tranches || tranches.length === 0) continue; // skip levels with no tranching configured

    for (const t of tranches) {
      allLines.push({
        reservation_id:          reservationId,
        client_id,
        client_name:             rec.client_name,
        seller_id:               targetSellerId,
        seller_name:             target.name,
        inventory_code:          rec.inventory_code,
        project:                 rec.project,
        project_id:              commProjectId,
        tower:                   rec.tower,
        tranche:                 t.tranche,
        percentage_collection:   t.percentage_collection,
        commission_release_rate: t.commission_release_rate,
        commission_rate:         t.commission_rate,
        gross_commission:
          Math.round(nlp * (Number(t.commission_rate) / 100) * (Number(t.commission_release_rate) / 100) * 100) / 100,
        status: 'Pending',
      });
    }
  }

  if (allLines.length === 0) return { ok: false, reason: 'no-tranches' };

  const { error: insertError } = await supabase
    .from('commission_schedule')
    .insert(allLines);
  if (insertError) throw insertError;
  return { ok: true };
}

export interface CommissionScheduleLine {
  id:                      number;
  tranche:                 number;
  percentage_collection:   number;
  commission_release_rate: number;
  commission_rate:         number;
  gross_commission:        number;
  status:                  string;
  vat_amount:              number | null;
  ewt_amount:              number | null;
  net_commission:          number | null;
}

// Summary record built from commission_schedule + reservations — works for chain members (SD/SDH/SH)
// that have rows in commission_schedule but are not the direct reservation seller.
export interface SellerCommissionSummary {
  reservation_id:       string;
  client_name:          string;
  project:              string;
  inventory_code:       string | null;
  total_contract_price: number | null;
  net_list_price:       number | null;
  commission_rate:      number | null;
  total_commission:     number;
  created_at:           string | null;
  reservation_status:   string | null;
}

export async function fetchSellerCommissionSummaries(sellerId: string): Promise<SellerCommissionSummary[]> {
  const { data: lines, error } = await supabase
    .from('commission_schedule')
    .select('reservation_id, client_name, project, inventory_code, commission_rate, gross_commission, created_at')
    .eq('seller_id', sellerId)
    .neq('status', 'Superseded');
  if (error) throw error;

  // Group by reservation
  const map: Record<string, SellerCommissionSummary> = {};
  for (const l of (lines ?? []) as any[]) {
    if (!map[l.reservation_id]) {
      map[l.reservation_id] = {
        reservation_id:       l.reservation_id,
        client_name:          l.client_name,
        project:              l.project,
        inventory_code:       l.inventory_code ?? null,
        total_contract_price: null,
        net_list_price:       null,
        commission_rate:      Number(l.commission_rate) || null,
        total_commission:     0,
        created_at:           l.created_at ?? null,
        reservation_status:   null,
      };
    }
    map[l.reservation_id].total_commission += Number(l.gross_commission) || 0;
  }

  const summaries = Object.values(map);
  if (summaries.length === 0) return [];

  // Enrich with TCP / NLP / status from reservations
  const { data: resRows } = await supabase
    .from('reservations')
    .select('reservation_id, total_contract_price, net_list_price, status')
    .in('reservation_id', summaries.map(s => s.reservation_id));

  for (const res of (resRows ?? []) as any[]) {
    if (map[res.reservation_id]) {
      map[res.reservation_id].total_contract_price = Number(res.total_contract_price) || null;
      map[res.reservation_id].net_list_price       = Number(res.net_list_price) || null;
      map[res.reservation_id].reservation_status   = res.status ?? null;
    }
  }

  return summaries.sort((a, b) => a.reservation_id.localeCompare(b.reservation_id));
}

export async function fetchCommissionScheduleLines(reservationId: string, sellerId?: string): Promise<CommissionScheduleLine[]> {
  let query = supabase
    .from('commission_schedule')
    .select('id, tranche, percentage_collection, commission_release_rate, commission_rate, gross_commission, status, vat_amount, ewt_amount, net_commission')
    .eq('reservation_id', reservationId)
    .neq('status', 'Superseded');
  if (sellerId) query = query.eq('seller_id', sellerId);
  const { data, error } = await query.order('tranche', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommissionScheduleLine[];
}

export async function fetchReservationCollected(reservationId: string): Promise<number> {
  const { data, error } = await supabase
    .from('receivables_database')
    .select('amount_paid, total_amount_due, payment_status')
    .eq('reservation_id', reservationId);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, r: any) => {
    // Paid lines approved via finance verify have payment_status='Paid' but amount_paid=null
    // Fall back to total_amount_due so the full line value is counted as collected
    if (r.payment_status === 'Paid' && (r.amount_paid == null || Number(r.amount_paid) === 0)) {
      return sum + (Number(r.total_amount_due) || 0);
    }
    return sum + (Number(r.amount_paid) || 0);
  }, 0);
}

export interface CommissionScheduleFullLine {
  id:                      number;
  reservation_id:          string;
  seller_id:               string | null;
  seller_name:             string | null;
  client_name:             string;
  project:                 string;
  inventory_code:          string | null;
  tranche:                 number;
  percentage_collection:   number;
  commission_release_rate: number;
  commission_rate:         number;
  gross_commission:        number;
  status:                  string;
  vat_amount:              number | null;
  ewt_amount:              number | null;
  net_commission:          number | null;
}

const SCHEDULE_FULL_SELECT = 'id, reservation_id, seller_id, seller_name, client_name, project, inventory_code, tranche, percentage_collection, commission_release_rate, commission_rate, gross_commission, status, vat_amount, ewt_amount, net_commission';

export async function fetchAllCommissionScheduleLines(): Promise<CommissionScheduleFullLine[]> {
  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('commission_schedule')
      .select(SCHEDULE_FULL_SELECT)
      .neq('status', 'Superseded')
      .order('seller_name', { ascending: true })
      .order('reservation_id', { ascending: true })
      .order('tranche',        { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows as CommissionScheduleFullLine[];
}

export async function fetchSellerCommissionLines(sellerId: string): Promise<CommissionScheduleFullLine[]> {
  const { data, error } = await supabase
    .from('commission_schedule')
    .select(SCHEDULE_FULL_SELECT)
    .eq('seller_id', sellerId)
    .neq('status', 'Superseded')
    .order('reservation_id', { ascending: true })
    .order('tranche',        { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommissionScheduleFullLine[];
}

export async function fetchAllCollectedByReservation(): Promise<Record<string, number>> {
  const PAGE = 1000;
  let from = 0;
  const allRows: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('receivables_database')
      .select('reservation_id, amount_paid, total_amount_due, payment_status')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const map: Record<string, number> = {};
  for (const row of allRows as { reservation_id: string; amount_paid: number | null; total_amount_due: number | null; payment_status: string }[]) {
    const amount = (row.payment_status === 'Paid' && (row.amount_paid == null || Number(row.amount_paid) === 0))
      ? Number(row.total_amount_due || 0)
      : Number(row.amount_paid || 0);
    map[row.reservation_id] = (map[row.reservation_id] ?? 0) + amount;
  }
  return map;
}

export async function markPendingTranchesForRelease(
  lines:                CommissionScheduleFullLine[],
  collectionsMap:       Record<string, number>,
  nlpMap:               Record<string, number>,
  reservationStatusMap: Record<string, string> = {},
): Promise<void> {
  // Revert any "For Release" lines whose reservation is no longer / not yet Booked
  const toRevert = lines.filter(line =>
    line.status === 'For Release' &&
    (reservationStatusMap[line.reservation_id] ?? '') !== 'Booked'
  );
  if (toRevert.length > 0) {
    await Promise.all(toRevert.map(line =>
      supabase.from('commission_schedule')
        .update({ status: 'Pending', vat_amount: null, ewt_amount: null, net_commission: null })
        .eq('id', line.id)
    ));
    toRevert.forEach(line => { line.status = 'Pending'; });
  }

  const qualifying = lines.filter(line => {
    if (line.status !== 'Pending') return false;
    if ((reservationStatusMap[line.reservation_id] ?? '') !== 'Booked') return false;
    const nlp          = nlpMap[line.reservation_id] ?? 0;
    const collected    = collectionsMap[line.reservation_id] ?? 0;
    const pctCollected = nlp > 0 ? (collected / nlp) * 100 : 0;
    return pctCollected >= line.percentage_collection;
  });

  if (qualifying.length === 0) return;

  // Fetch tax info per unique seller in parallel
  const sellerNames = [...new Set(qualifying.map(l => l.seller_name).filter(Boolean))] as string[];
  const taxInfoMap: Record<string, { vat_rate: number; ewt_rate: number }> = {};
  await Promise.all(
    sellerNames.map(async name => {
      const info = await fetchSellerTaxInfo(name);
      taxInfoMap[name] = { vat_rate: info.vat_rate, ewt_rate: info.ewt_rate };
    }),
  );

  // Write status + tax amounts per tranche
  await Promise.all(
    qualifying.map(line => {
      const tax = line.seller_name ? (taxInfoMap[line.seller_name] ?? { vat_rate: 0, ewt_rate: 0 }) : { vat_rate: 0, ewt_rate: 0 };
      const base   = tax.vat_rate > 0 ? line.gross_commission / (1 + tax.vat_rate) : line.gross_commission;
      const vatAmt = base * tax.vat_rate;
      const ewtAmt = base * tax.ewt_rate;
      return supabase
        .from('commission_schedule')
        .update({
          status:         'For Release',
          vat_amount:     vatAmt,
          ewt_amount:     ewtAmt,
          net_commission: line.gross_commission - ewtAmt,
        })
        .eq('id', line.id);
    }),
  );
}

export async function releaseCommissionTranches(ids: number[]): Promise<void> {
  const { error } = await supabase
    .from('commission_schedule')
    .update({ status: 'Released' })
    .in('id', ids);
  if (error) throw error;
}

// Used by BRF after superseding the old commission lines.
// Reads rates/hierarchy/tranches from the Superseded lines (original reservation-time values)
// and only recalculates gross_commission using the new NLP + hic_discount.
// Deduplicates by (seller_id, tranche) taking the oldest row so multiple restructurings
// always derive from the original reservation-time commission configuration.
export async function regenerateCommissionSchedule(reservationId: string): Promise<CommissionGenerateResult> {
  const { data: superseded, error: supErr } = await supabase
    .from('commission_schedule')
    .select('id, seller_id, seller_name, client_id, client_name, inventory_code, project, tower, tranche, percentage_collection, commission_release_rate, commission_rate')
    .eq('reservation_id', reservationId)
    .eq('status', 'Superseded')
    .order('id', { ascending: true }); // oldest first = original reservation-time values

  if (supErr) throw supErr;
  if (!superseded || superseded.length === 0) return { ok: false, reason: 'no-tranches' };

  // Deduplicate: one entry per (seller_id, tranche) — oldest row wins
  const seen = new Set<string>();
  const uniqueLines = (superseded as any[]).filter(l => {
    const key = `${l.seller_id}__${l.tranche}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // New NLP from the already-updated reservation; HIC added back (commission base is pre-HIC NLP)
  const { data: res } = await supabase
    .from('reservations')
    .select('net_list_price, hic_discount, client_id')
    .eq('reservation_id', reservationId)
    .single();

  if (!res) return { ok: false, reason: 'no-commission-record' };

  // No commission for Megawide employee clients
  const regenClientId = (res as any).client_id ?? null;
  if (regenClientId) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('is_megawide_employee')
      .eq('client_id', regenClientId)
      .maybeSingle();
    if ((clientRow as any)?.is_megawide_employee === true) return { ok: true };
  }

  const nlp = (Number((res as any).net_list_price) || 0) + (Number((res as any).hic_discount) || 0);

  // Resolve project_id from the first superseded line (all lines share the same project)
  const regenProjectName = uniqueLines[0]?.project ?? null;
  let regenProjectId: string | null = null;
  if (regenProjectName) {
    const { data: regenProjRow } = await supabase
      .from('projects').select('project_id').eq('name', regenProjectName).maybeSingle();
    regenProjectId = (regenProjRow as any)?.project_id ?? null;
  }

  const allLines = uniqueLines.map(l => ({
    reservation_id:          reservationId,
    client_id:               l.client_id,
    client_name:             l.client_name,
    seller_id:               l.seller_id,
    seller_name:             l.seller_name,
    inventory_code:          l.inventory_code,
    project:                 l.project,
    project_id:              regenProjectId,
    tower:                   l.tower,
    tranche:                 l.tranche,
    percentage_collection:   l.percentage_collection,
    commission_release_rate: l.commission_release_rate,
    commission_rate:         l.commission_rate,
    gross_commission:
      Math.round(nlp * (Number(l.commission_rate) / 100) * (Number(l.commission_release_rate) / 100) * 100) / 100,
    status: 'Pending',
  }));

  const { error: insertError } = await supabase.from('commission_schedule').insert(allLines);
  if (insertError) throw insertError;
  return { ok: true };
}

export async function fetchCommissionTranches(
  project:      string,
  positionRank: string,
  productType:  string,
  sellerType:   string,
  brokerId?:    string,
): Promise<CommissionTranche[]> {
  const params: Record<string, string> = {
    p_project:       project,
    p_position_rank: positionRank,
    p_product_type:  productType,
    p_seller_type:   sellerType,
  };
  if (brokerId) params.p_broker_id = brokerId;
  const { data, error } = await supabase.rpc('get_commission_tranching_schedule', params);
  if (error) throw error;
  return (data ?? []) as CommissionTranche[];
}

export async function recomputeSellerTaxes(
  sellerId:    string,
  ewtRateRaw:  string,
  vatType:     string | null,
): Promise<void> {
  const n = parseFloat(String(ewtRateRaw).replace('%', '').trim());
  const ewtRate = isNaN(n) ? 0 : n > 1 ? n / 100 : n;
  const vatRate = vatType?.toUpperCase() === 'VAT' ? 0.12 : 0;

  const { data: lines, error } = await supabase
    .from('commission_schedule')
    .select('id, gross_commission')
    .eq('seller_id', sellerId)
    .eq('status', 'For Release');
  if (error) throw error;
  if (!lines || lines.length === 0) return;

  await Promise.all(
    (lines as { id: number; gross_commission: number }[]).map(line => {
      const base   = vatRate > 0 ? line.gross_commission / (1 + vatRate) : line.gross_commission;
      const vatAmt = base * vatRate;
      const ewtAmt = base * ewtRate;
      return supabase
        .from('commission_schedule')
        .update({
          vat_amount:     vatAmt,
          ewt_amount:     ewtAmt,
          net_commission: line.gross_commission - ewtAmt,
        })
        .eq('id', line.id);
    }),
  );
}
