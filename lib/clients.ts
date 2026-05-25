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
  // Seller fields
  seller_type?: string;
  sales_director?: string;
  sales_manager?: string;
  property_specialist?: string;
  broker_director_head?: string;
  broker_network_officer?: string;
  broker_bir_name?: string;
  broker_network_associate?: string;
}

export interface ClientRecord {
  id: string;
  client_id: string | null;
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
  is_megawide_employee: boolean | null;
  seller_type: string | null;
  sales_director: string | null;
  sales_manager: string | null;
  property_specialist: string | null;
  broker_director_head: string | null;
  broker_network_officer: string | null;
  broker_bir_name: string | null;
  broker_network_associate: string | null;
  created_at: string;
}

export async function saveClient(payload: ClientPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_client', {
    p_client_type:              payload.client_type,
    p_last_name:                payload.last_name,
    p_first_name:               payload.first_name,
    p_middle_name:              payload.middle_name              || null,
    p_suffix:                   payload.suffix                   || null,
    p_date_of_birth:            payload.date_of_birth            || null,
    p_citizenship:              payload.citizenship              || null,
    p_country_code:             payload.country_code,
    p_mobile_number:            payload.mobile_number            || null,
    p_landline_no:              payload.landline_no              || null,
    p_email:                    payload.email                    || null,
    p_reason_for_buying:        payload.reason_for_buying        || null,
    p_source_of_sale:           payload.source_of_sale           || null,
    p_monthly_household_income: payload.monthly_household_income || null,
    p_seller_type:              payload.seller_type              || null,
    p_sales_director:           payload.sales_director           || null,
    p_sales_manager:            payload.sales_manager            || null,
    p_property_specialist:      payload.property_specialist      || null,
    p_broker_director_head:     payload.broker_director_head     || null,
    p_broker_network_officer:   payload.broker_network_officer   || null,
    p_broker_bir_name:          payload.broker_bir_name          || null,
    p_broker_network_associate: payload.broker_network_associate || null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateClient(id: string, payload: ClientPayload): Promise<void> {
  const { error } = await supabase.rpc('update_client', {
    p_id:                       id,
    p_client_type:              payload.client_type,
    p_last_name:                payload.last_name,
    p_first_name:               payload.first_name,
    p_middle_name:              payload.middle_name              || null,
    p_suffix:                   payload.suffix                   || null,
    p_date_of_birth:            payload.date_of_birth            || null,
    p_citizenship:              payload.citizenship              || null,
    p_country_code:             payload.country_code,
    p_mobile_number:            payload.mobile_number            || null,
    p_landline_no:              payload.landline_no              || null,
    p_email:                    payload.email                    || null,
    p_reason_for_buying:        payload.reason_for_buying        || null,
    p_source_of_sale:           payload.source_of_sale           || null,
    p_monthly_household_income: payload.monthly_household_income || null,
    p_seller_type:              payload.seller_type              || null,
    p_sales_director:           payload.sales_director           || null,
    p_sales_manager:            payload.sales_manager            || null,
    p_property_specialist:      payload.property_specialist      || null,
    p_broker_director_head:     payload.broker_director_head     || null,
    p_broker_network_officer:   payload.broker_network_officer   || null,
    p_broker_bir_name:          payload.broker_bir_name          || null,
    p_broker_network_associate: payload.broker_network_associate || null,
  });
  if (error) throw error;
}

export async function fetchAllClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabase.rpc('get_all_clients');
  if (error) throw error;
  return (data ?? []) as ClientRecord[];
}
