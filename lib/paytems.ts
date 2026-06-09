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
  const { data, error } = await supabase
    .from('Payterm')
    .select('"Payterm Code","Payterm Scheme","Project","Tower","DP (%)","Discount","Term","PaymentTerm","Status"');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    payterm_code:   r['Payterm Code']   ?? null,
    payterm_scheme: r['Payterm Scheme'] ?? null,
    project:        r['Project']        ?? null,
    tower:          r['Tower']          ?? null,
    dp_percent:     r['DP (%)']         ?? null,
    discount:       r['Discount']       ?? null,
    term:           r['Term']           ?? null,
    payment_term:   r['PaymentTerm']    ?? null,
    status:         r['Status']         ?? null,
  }));
}
