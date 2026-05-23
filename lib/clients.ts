import { supabase } from '@/lib/supabase';

export interface ClientPayload {
  client_type: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix: string;
  date_of_birth: string;
  citizenship: string;
  country_code: string;
  mobile_number: string;
  landline_no: string;
  email: string;
  reason_for_buying: string;
  source_of_sale: string;
  monthly_household_income: string;
}

export interface ClientRecord {
  id: string;
  client_type: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;
  date_of_birth: string | null;
  citizenship: string | null;
  country_code: string | null;
  mobile_number: string | null;
  landline_no: string | null;
  email: string | null;
  reason_for_buying: string | null;
  source_of_sale: string | null;
  monthly_household_income: string | null;
  created_at: string;
}

export async function saveClient(payload: ClientPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_client', {
    p_client_type:              payload.client_type,
    p_last_name:                payload.last_name,
    p_first_name:               payload.first_name,
    p_middle_name:              payload.middle_name   || null,
    p_suffix:                   payload.suffix        || null,
    p_date_of_birth:            payload.date_of_birth || null,
    p_citizenship:              payload.citizenship   || null,
    p_country_code:             payload.country_code,
    p_mobile_number:            payload.mobile_number || null,
    p_landline_no:              payload.landline_no   || null,
    p_email:                    payload.email         || null,
    p_reason_for_buying:        payload.reason_for_buying        || null,
    p_source_of_sale:           payload.source_of_sale           || null,
    p_monthly_household_income: payload.monthly_household_income || null,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchAllClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabase.rpc('get_all_clients');
  if (error) throw error;
  return (data ?? []) as ClientRecord[];
}
