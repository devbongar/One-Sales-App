import { supabase } from '@/lib/supabase';

export interface BrokerRecord {
  broker_id:                string | null;
  full_name:                string | null;
  broker_status:            string | null;
  broker_category:          string | null;
  sales_director_head:      string | null;
  broker_network_officer:   string | null;
  bir_registered_name:      string | null;
  broker_network_associate: string | null;
}

export async function fetchAllBrokers(): Promise<BrokerRecord[]> {
  const { data, error } = await supabase.rpc('get_all_brokers');
  if (error) throw error;
  return (data ?? []) as BrokerRecord[];
}
