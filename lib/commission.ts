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
