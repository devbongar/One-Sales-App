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

  // Build hierarchy chain using IDs from the DB — no name-based secondary lookups needed.
  type Target = { name: string; sellerId: string | null; positionRank: string };
  const targets: Target[] = [];

  if (rec.seller_type === 'In-house') {
    // Look up chain by seller_id (stable, name-independent)
    const { data: sellerRow } = await supabase
      .from('Salesperson')
      .select('"Sales Manager", "Sales Manager ID", "Sales Director", "Sales Director ID", "Sales Division Head", "Sales Division Head ID", "Sales Head", "Sales Head ID"')
      .eq('"Seller Id"', rec.seller_id)
      .maybeSingle();

    const smName  = (sellerRow as any)?.['Sales Manager']         as string | null ?? null;
    const smId    = (sellerRow as any)?.['Sales Manager ID']      as string | null ?? null;
    const sdName  = (sellerRow as any)?.['Sales Director']        as string | null ?? null;
    const sdId    = (sellerRow as any)?.['Sales Director ID']     as string | null ?? null;
    const sdhName = (sellerRow as any)?.['Sales Division Head']   as string | null ?? null;
    const sdhId   = (sellerRow as any)?.['Sales Division Head ID'] as string | null ?? null;
    const shName  = (sellerRow as any)?.['Sales Head']            as string | null ?? null;
    const shId    = (sellerRow as any)?.['Sales Head ID']         as string | null ?? null;

    if (rec.position_rank === 'PS') {
      targets.push({ name: rec.seller_name!, sellerId: rec.seller_id, positionRank: 'PS' });
      if (smName)  targets.push({ name: smName,  sellerId: smId,  positionRank: 'SM'  });
      if (sdName)  targets.push({ name: sdName,  sellerId: sdId,  positionRank: 'SD'  });
      if (sdhName) targets.push({ name: sdhName, sellerId: sdhId, positionRank: 'SDH' });
      if (shName)  targets.push({ name: shName,  sellerId: shId,  positionRank: 'SH'  });
    } else if (rec.position_rank === 'SM') {
      targets.push({ name: rec.seller_name!, sellerId: rec.seller_id, positionRank: 'PS' });
      if (sdName)  targets.push({ name: sdName,  sellerId: sdId,  positionRank: 'SD'  });
      if (sdhName) targets.push({ name: sdhName, sellerId: sdhId, positionRank: 'SDH' });
      if (shName)  targets.push({ name: shName,  sellerId: shId,  positionRank: 'SH'  });
    }
  } else {
    // Broker: look up chain from Brokers table by Broker ID (resolved by commission RPC)
    const { data: brokerRow } = await supabase
      .from('Brokers')
      .select('"Broker ID", "Broker Network Associate", "Broker Network Associate ID", "Broker Network Officer", "Broker Network Officer ID", "Sales Director Head", "Sales Director Head ID", "Sales Head", "Sales Head ID"')
      .eq('"Broker ID"', rec.seller_id)
      .maybeSingle();

    const smName  = (brokerRow as any)?.['Broker Network Associate']    as string | null ?? null;
    const smId    = (brokerRow as any)?.['Broker Network Associate ID'] as string | null ?? null;
    const sdName  = (brokerRow as any)?.['Broker Network Officer']      as string | null ?? null;
    const sdId    = (brokerRow as any)?.['Broker Network Officer ID']   as string | null ?? null;
    const sdhName = (brokerRow as any)?.['Sales Director Head']         as string | null ?? null;
    const sdhId   = (brokerRow as any)?.['Sales Director Head ID']      as string | null ?? null;
    const shName  = (brokerRow as any)?.['Sales Head']                  as string | null ?? null;
    const shId    = (brokerRow as any)?.['Sales Head ID']               as string | null ?? null;

    // Brokers are treated as PS in tranching
    targets.push({ name: rec.seller_name!, sellerId: rec.seller_id, positionRank: 'PS' });
    if (smName)  targets.push({ name: smName,  sellerId: smId,  positionRank: 'SM'  });
    if (sdName)  targets.push({ name: sdName,  sellerId: sdId,  positionRank: 'SD'  });
    if (sdhName) targets.push({ name: sdhName, sellerId: sdhId, positionRank: 'SDH' });
    if (shName)  targets.push({ name: shName,  sellerId: shId,  positionRank: 'SH'  });
  }

  if (targets.length === 0) return { ok: false, reason: 'missing-fields' };

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
      };
    }
    map[l.reservation_id].total_commission += Number(l.gross_commission) || 0;
  }

  const summaries = Object.values(map);
  if (summaries.length === 0) return [];

  // Enrich with TCP / NLP from reservations
  const { data: resRows } = await supabase
    .from('reservations')
    .select('reservation_id, total_contract_price, net_list_price')
    .in('reservation_id', summaries.map(s => s.reservation_id));

  for (const res of (resRows ?? []) as any[]) {
    if (map[res.reservation_id]) {
      map[res.reservation_id].total_contract_price = Number(res.total_contract_price) || null;
      map[res.reservation_id].net_list_price       = Number(res.net_list_price) || null;
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
  const { data, error } = await supabase
    .from('commission_schedule')
    .select(SCHEDULE_FULL_SELECT)
    .neq('status', 'Superseded')
    .order('seller_name', { ascending: true })
    .order('reservation_id', { ascending: true })
    .order('tranche',        { ascending: true })
    .limit(10000);
  if (error) throw error;
  return (data ?? []) as CommissionScheduleFullLine[];
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
  const { data, error } = await supabase
    .from('receivables_database')
    .select('reservation_id, amount_paid, total_amount_due, payment_status')
    .limit(10000);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { reservation_id: string; amount_paid: number | null; total_amount_due: number | null; payment_status: string }[]) {
    const amount = (row.payment_status === 'Paid' && (row.amount_paid == null || Number(row.amount_paid) === 0))
      ? Number(row.total_amount_due || 0)
      : Number(row.amount_paid || 0);
    map[row.reservation_id] = (map[row.reservation_id] ?? 0) + amount;
  }
  return map;
}

export async function markPendingTranchesForRelease(
  lines:          CommissionScheduleFullLine[],
  collectionsMap: Record<string, number>,
  nlpMap:         Record<string, number>,
): Promise<void> {
  const qualifying = lines.filter(line => {
    if (line.status !== 'Pending') return false;
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
      const vatAmt = line.gross_commission * tax.vat_rate;
      const ewtAmt = line.gross_commission * tax.ewt_rate;
      return supabase
        .from('commission_schedule')
        .update({
          status:         'For Release',
          vat_amount:     vatAmt,
          ewt_amount:     ewtAmt,
          net_commission: line.gross_commission - vatAmt - ewtAmt,
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
    .select('net_list_price, hic_discount')
    .eq('reservation_id', reservationId)
    .single();

  if (!res) return { ok: false, reason: 'no-commission-record' };
  const nlp = (Number((res as any).net_list_price) || 0) + (Number((res as any).hic_discount) || 0);

  const allLines = uniqueLines.map(l => ({
    reservation_id:          reservationId,
    client_id:               l.client_id,
    client_name:             l.client_name,
    seller_id:               l.seller_id,
    seller_name:             l.seller_name,
    inventory_code:          l.inventory_code,
    project:                 l.project,
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
): Promise<CommissionTranche[]> {
  const { data, error } = await supabase.rpc('get_commission_tranching_schedule', {
    p_project:       project,
    p_position_rank: positionRank,
    p_product_type:  productType,
    p_seller_type:   sellerType,
  });
  if (error) throw error;
  return (data ?? []) as CommissionTranche[];
}
