import { supabase } from '@/lib/supabase';

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
