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

  // Look up seller's Salesperson row to get the full hierarchy chain
  const { data: sellerRow } = await supabase
    .from('Salesperson')
    .select('"Seller Id", "Sales Manager", "Sales Director", "Sales Division Head", "Sales Head"')
    .eq('"Seller Name"', rec.seller_name)
    .maybeSingle();

  const sm  = (sellerRow as any)?.['Sales Manager']       as string | null ?? null;
  const sd  = (sellerRow as any)?.['Sales Director']      as string | null ?? null;
  const sdh = (sellerRow as any)?.['Sales Division Head'] as string | null ?? null;
  const sh  = (sellerRow as any)?.['Sales Head']          as string | null ?? null;

  // Build targets: { name, positionRank }
  // positionRank controls which tranche row is fetched from Commission_Tranching
  type Target = { name: string; positionRank: string };
  const targets: Target[] = [];

  if (rec.position_rank === 'PS') {
    targets.push({ name: rec.seller_name!, positionRank: 'PS' });
    if (sm)  targets.push({ name: sm,  positionRank: 'SM'  });
    if (sd)  targets.push({ name: sd,  positionRank: 'SD'  });
    if (sdh) targets.push({ name: sdh, positionRank: 'SDH' });
    if (sh)  targets.push({ name: sh,  positionRank: 'SH'  });
  } else if (rec.position_rank === 'SM') {
    // SM acts as direct seller — gets PS rates
    targets.push({ name: rec.seller_name!, positionRank: 'PS' });
    if (sd)  targets.push({ name: sd,  positionRank: 'SD'  });
    if (sdh) targets.push({ name: sdh, positionRank: 'SDH' });
    if (sh)  targets.push({ name: sh,  positionRank: 'SH'  });
  }

  if (targets.length === 0) return { ok: false, reason: 'missing-fields' };

  // Use pre-HIC NLP as commission base (hic_discount was deducted from net_list_price)
  const nlp = (Number(rec.net_list_price) || 0) + hic_discount;
  const allLines: object[] = [];

  for (const target of targets) {
    // Look up seller_id for this person (chain members are always In-house)
    const { data: targetRow } = await supabase
      .from('Salesperson')
      .select('"Seller Id"')
      .eq('"Seller Name"', target.name)
      .maybeSingle();
    const targetSellerId = (targetRow as any)?.['Seller Id'] ?? null;

    // Direct seller uses their own seller_type (could be Broker); chain members are always In-house
    const sellerType = target.name === rec.seller_name ? rec.seller_type : 'In-house';

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

export async function fetchSellerCommissionSummaries(sellerName: string): Promise<SellerCommissionSummary[]> {
  const { data: lines, error } = await supabase
    .from('commission_schedule')
    .select('reservation_id, client_name, project, inventory_code, commission_rate, gross_commission, created_at')
    .eq('seller_name', sellerName)
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

export async function fetchCommissionScheduleLines(reservationId: string, sellerName?: string): Promise<CommissionScheduleLine[]> {
  let query = supabase
    .from('commission_schedule')
    .select('id, tranche, percentage_collection, commission_release_rate, commission_rate, gross_commission, status, vat_amount, ewt_amount, net_commission')
    .eq('reservation_id', reservationId)
    .neq('status', 'Superseded');
  if (sellerName) query = query.eq('seller_name', sellerName);
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

const SCHEDULE_FULL_SELECT = 'id, reservation_id, seller_name, client_name, project, inventory_code, tranche, percentage_collection, commission_release_rate, commission_rate, gross_commission, status, vat_amount, ewt_amount, net_commission';

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

export async function fetchSellerCommissionLines(sellerName: string): Promise<CommissionScheduleFullLine[]> {
  const { data, error } = await supabase
    .from('commission_schedule')
    .select(SCHEDULE_FULL_SELECT)
    .eq('seller_name', sellerName)
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

// Same as generateCommissionSchedule but skips the already-exists guard.
// Used by BRF after superseding the old commission lines.
export async function regenerateCommissionSchedule(reservationId: string): Promise<CommissionGenerateResult> {
  const rec = await fetchCommissionRecord(reservationId);
  if (!rec) return { ok: false, reason: 'no-commission-record' };
  if (!rec.product_type || !rec.seller_type) return { ok: false, reason: 'missing-fields' };
  if (rec.position_rank && ['SD', 'SDH', 'SH'].includes(rec.position_rank)) return { ok: true };

  const { data: ids } = await supabase
    .from('reservations')
    .select('client_id, hic_discount')
    .eq('reservation_id', reservationId)
    .single();
  const client_id    = (ids as any)?.client_id    ?? null;
  const hic_discount = Number((ids as any)?.hic_discount) || 0;

  const { data: sellerRow } = await supabase
    .from('Salesperson')
    .select('"Seller Id", "Sales Manager", "Sales Director", "Sales Division Head", "Sales Head"')
    .eq('"Seller Name"', rec.seller_name)
    .maybeSingle();

  const sm  = (sellerRow as any)?.['Sales Manager']       as string | null ?? null;
  const sd  = (sellerRow as any)?.['Sales Director']      as string | null ?? null;
  const sdh = (sellerRow as any)?.['Sales Division Head'] as string | null ?? null;
  const sh  = (sellerRow as any)?.['Sales Head']          as string | null ?? null;

  type Target = { name: string; positionRank: string };
  const targets: Target[] = [];
  if (rec.position_rank === 'PS') {
    targets.push({ name: rec.seller_name!, positionRank: 'PS' });
    if (sm)  targets.push({ name: sm,  positionRank: 'SM'  });
    if (sd)  targets.push({ name: sd,  positionRank: 'SD'  });
    if (sdh) targets.push({ name: sdh, positionRank: 'SDH' });
    if (sh)  targets.push({ name: sh,  positionRank: 'SH'  });
  } else if (rec.position_rank === 'SM') {
    targets.push({ name: rec.seller_name!, positionRank: 'PS' });
    if (sd)  targets.push({ name: sd,  positionRank: 'SD'  });
    if (sdh) targets.push({ name: sdh, positionRank: 'SDH' });
    if (sh)  targets.push({ name: sh,  positionRank: 'SH'  });
  }
  if (targets.length === 0) return { ok: false, reason: 'missing-fields' };

  const nlp = (Number(rec.net_list_price) || 0) + hic_discount;
  const allLines: object[] = [];

  for (const target of targets) {
    const { data: targetRow } = await supabase
      .from('Salesperson')
      .select('"Seller Id"')
      .eq('"Seller Name"', target.name)
      .maybeSingle();
    const targetSellerId = (targetRow as any)?.['Seller Id'] ?? null;
    const sellerType = target.name === rec.seller_name ? rec.seller_type : 'In-house';
    const tranches = await fetchCommissionTranches(rec.project, target.positionRank, rec.product_type, sellerType);
    if (!tranches || tranches.length === 0) continue;
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
