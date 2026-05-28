import { supabase } from '@/lib/supabase';

export interface BrokerRecord {
  seller_name:            string; // mapped from Full Name — used to match commission records
  bir_registered_name:   string | null;
  broker_network_officer: string | null;
  sales_director_head:   string | null;
  sales_head:            string | null;
  position_rank:         string | null;
}

export async function fetchAllBrokers(): Promise<BrokerRecord[]> {
  const { data, error } = await supabase.rpc('get_all_brokers');
  if (error) throw error;
  return (data ?? []) as BrokerRecord[];
}
