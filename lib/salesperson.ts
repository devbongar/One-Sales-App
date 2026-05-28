import { supabase } from '@/lib/supabase';

export interface SalespersonRecord {
  seller_name: string;
  position_code: string;
  position_rank: string | null;
  seller_group: string | null;
  sales_manager: string | null;
  sales_director: string | null;
  sales_division_head: string | null;
}

export async function fetchAllSalespersons(): Promise<SalespersonRecord[]> {
  const { data, error } = await supabase.rpc('get_all_salespersons');
  console.log('[fetchAllSalespersons] data:', data, 'error:', error);
  if (error) throw error;
  return (data ?? []) as SalespersonRecord[];
}
