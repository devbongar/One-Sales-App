import { supabase } from '@/lib/supabase';

export interface PaytermRecord {
  payterm_code:   string | null;
  payterm_scheme: string | null;
  project:        string | null;
  tower:          string | null;
  dp_percent:     string | null;
  discount:       number | null;
  term:           string | null;
  payment_term:   string | null;
  status:         string | null;
}

export async function fetchAllPayterms(): Promise<PaytermRecord[]> {
  const { data, error } = await supabase.rpc('get_all_paytems');
  if (error) throw error;
  return (data ?? []) as PaytermRecord[];
}
