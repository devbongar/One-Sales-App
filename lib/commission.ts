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

export async function generateCommissionSchedule(reservationId: string): Promise<void> {
  // Guard: skip if already generated
  const { count } = await supabase
    .from('commission_schedule')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_id', reservationId);
  if (count && count > 0) return;

  // Fetch commission data for this reservation only (targeted RPC — no full-table scan)
  const rec = await fetchCommissionRecord(reservationId);
  if (!rec) return;

  // client_id and seller_id are new columns on reservations
  const { data: ids } = await supabase
    .from('reservations')
    .select('client_id, seller_id')
    .eq('reservation_id', reservationId)
    .single();

  const client_id = (ids as any)?.client_id ?? null;
  const seller_id = (ids as any)?.seller_id ?? null;

  // Can't build schedule without tranche lookup keys
  if (!rec.position_rank || !rec.product_type || !rec.seller_type) return;

  const tranches = await fetchCommissionTranches(
    rec.project, rec.position_rank, rec.product_type, rec.seller_type,
  );
  if (!tranches || tranches.length === 0) return;

  const rate = Number(rec.commission_rate) || 0;
  const nlp  = Number(rec.net_list_price)  || 0;

  const lines = tranches.map((t) => ({
    reservation_id:          reservationId,
    client_id,
    client_name:             rec.client_name,
    seller_id,
    seller_name:             rec.seller_name,
    inventory_code:          rec.inventory_code,
    project:                 rec.project,
    tower:                   rec.tower,
    tranche:                 t.tranche,
    percentage_collection:   t.percentage_collection,
    commission_release_rate: t.commission_release_rate,
    commission_rate:         t.commission_rate,
    gross_commission:
      Math.round(nlp * (rate / 100) * (t.commission_release_rate / 100) * 100) / 100,
    status: 'Pending',
  }));

  const { error: insertError } = await supabase
    .from('commission_schedule')
    .insert(lines);
  if (insertError) throw insertError;
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

export async function fetchCommissionScheduleLines(reservationId: string): Promise<CommissionScheduleLine[]> {
  const { data, error } = await supabase
    .from('commission_schedule')
    .select('id, tranche, percentage_collection, commission_release_rate, commission_rate, gross_commission, status, vat_amount, ewt_amount, net_commission')
    .eq('reservation_id', reservationId)
    .order('tranche', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommissionScheduleLine[];
}

export async function fetchReservationCollected(reservationId: string): Promise<number> {
  const { data, error } = await supabase
    .from('receivables_database')
    .select('amount_paid')
    .eq('reservation_id', reservationId);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0);
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
    .order('reservation_id', { ascending: true })
    .order('tranche',        { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommissionScheduleFullLine[];
}

export async function fetchAllCollectedByReservation(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('receivables_database')
    .select('reservation_id, amount_paid')
    .limit(10000);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { reservation_id: string; amount_paid: number | null }[]) {
    map[row.reservation_id] = (map[row.reservation_id] ?? 0) + (Number(row.amount_paid) || 0);
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
