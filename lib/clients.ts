import { supabase } from '@/lib/supabase';

export interface ClientPayload {
  client_type: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix: string;
  gender?: string;
  civil_status?: string;
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
  broker_network_associate?: string;
  broker_network_officer?: string;
  broker_director_head?: string;
  broker_sales_head?: string;
  broker_bir_name?: string;
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
  broker_network_associate: string | null;
  broker_network_officer: string | null;
  broker_director_head: string | null;
  broker_sales_head: string | null;
  broker_bir_name: string | null;
  gender: string | null;
  civil_status: string | null;
  signature_base64: string | null;
  created_at: string;
}

export async function checkEmailExists(email: string, excludeId?: string): Promise<boolean> {
  let query = supabase
    .from('clients')
    .select('id')
    .ilike('email', email.trim());
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function fetchClientSignature(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('signature_base64')
    .eq('client_id', clientId)
    .single();
  if (error) return null;
  return (data as { signature_base64: string | null })?.signature_base64 ?? null;
}

export async function updateClientSignature(id: string, signatureBase64: string | null): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ signature_base64: signatureBase64 })
    .eq('id', id);
  if (error) throw error;
}

export async function updateClientSignatureByClientId(clientId: string, signatureBase64: string | null): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ signature_base64: signatureBase64 })
    .eq('client_id', clientId);
  if (error) throw error;
}

export async function saveClient(payload: ClientPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_client', {
    p_client_type:              payload.client_type,
    p_last_name:                payload.last_name,
    p_first_name:               payload.first_name,
    p_middle_name:              payload.middle_name              || null,
    p_suffix:                   payload.suffix                   || null,
    p_gender:                   payload.gender                   || null,
    p_civil_status:             payload.civil_status             || null,
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
    p_broker_network_associate: payload.broker_network_associate || null,
    p_broker_network_officer:   payload.broker_network_officer   || null,
    p_broker_director_head:     payload.broker_director_head     || null,
    p_broker_sales_head:        payload.broker_sales_head        || null,
    p_broker_bir_name:          payload.broker_bir_name          || null,
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
    p_gender:                   payload.gender                   || null,
    p_civil_status:             payload.civil_status             || null,
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
    p_broker_network_associate: payload.broker_network_associate || null,
    p_broker_network_officer:   payload.broker_network_officer   || null,
    p_broker_director_head:     payload.broker_director_head     || null,
    p_broker_sales_head:        payload.broker_sales_head        || null,
    p_broker_bir_name:          payload.broker_bir_name          || null,
  });
  if (error) throw error;
}

export interface BuyerInfoPayload {
  // Personal
  gender: string;
  civil_status: string;
  tin: string;
  no_tin: boolean;
  // Flags (preserve existing values; managed by their own flows)
  has_co_ownership?: boolean;
  has_atty_in_fact?: boolean;
  // Home Address
  home_ownership: string;
  home_country: string;
  home_region_province: string;
  home_city_municipality: string;
  home_barangay: string;
  home_street: string;
  home_unit: string;
  // Employment
  employer: string;
  nature_of_business: string;
  employment_sector: string;
  employment_status: string;
  job_title: string;
  rank: string;
  salary_range: string;
  work_mobile_code: string;
  work_mobile: string;
  work_landline: string;
  work_email: string;
  // Work Address
  work_country: string;
  work_region_province: string;
  work_city_municipality: string;
  work_barangay: string;
  work_street: string;
  work_building_unit: string;
  // Mailing
  mailing_type: string;
  mailing_other: string;
}

export async function updateBuyerInfo(clientUuid: string, payload: BuyerInfoPayload): Promise<void> {
  const { error } = await supabase.rpc('update_buyer_info', {
    p_id:                     clientUuid,
    p_gender:                 payload.gender                || null,
    p_civil_status:           payload.civil_status          || null,
    p_tin:                    payload.tin                   || null,
    p_no_tin:                 payload.no_tin,
    p_has_co_ownership:       payload.has_co_ownership      ?? false,
    p_has_atty_in_fact:       payload.has_atty_in_fact      ?? false,
    p_home_ownership:         payload.home_ownership        || null,
    p_home_country:           payload.home_country          || null,
    p_home_region_province:   payload.home_region_province  || null,
    p_home_city_municipality: payload.home_city_municipality|| null,
    p_home_barangay:          payload.home_barangay         || null,
    p_home_street:            payload.home_street           || null,
    p_home_unit:              payload.home_unit             || null,
    p_employer:               payload.employer              || null,
    p_nature_of_business:     payload.nature_of_business    || null,
    p_employment_sector:      payload.employment_sector     || null,
    p_employment_status:      payload.employment_status     || null,
    p_job_title:              payload.job_title             || null,
    p_rank:                   payload.rank                  || null,
    p_salary_range:           payload.salary_range          || null,
    p_work_mobile_code:       payload.work_mobile_code      || null,
    p_work_mobile:            payload.work_mobile           || null,
    p_work_landline:          payload.work_landline         || null,
    p_work_email:             payload.work_email            || null,
    p_work_country:           payload.work_country          || null,
    p_work_region_province:   payload.work_region_province  || null,
    p_work_city_municipality: payload.work_city_municipality|| null,
    p_work_barangay:          payload.work_barangay         || null,
    p_work_street:            payload.work_street           || null,
    p_work_building_unit:     payload.work_building_unit    || null,
    p_mailing_type:           payload.mailing_type          || null,
    p_mailing_other:          payload.mailing_other         || null,
  });
  if (error) throw error;
}

export interface BuyerInfoRecord {
  buyer_info_saved: boolean | null;
  gender: string | null; civil_status: string | null;
  tin: string | null; no_tin: boolean | null;
  has_co_ownership: boolean | null; has_atty_in_fact: boolean | null;
  home_ownership: string | null; home_country: string | null;
  home_region_province: string | null; home_city_municipality: string | null;
  home_barangay: string | null; home_street: string | null; home_unit: string | null;
  employer: string | null; nature_of_business: string | null;
  employment_sector: string | null; employment_status: string | null;
  job_title: string | null; rank: string | null; salary_range: string | null;
  work_mobile_code: string | null; work_mobile: string | null;
  work_landline: string | null; work_email: string | null;
  work_country: string | null; work_region_province: string | null;
  work_city_municipality: string | null; work_barangay: string | null;
  work_street: string | null; work_building_unit: string | null;
  mailing_type: string | null; mailing_other: string | null;
}

export async function fetchBuyerInfo(clientUuid: string): Promise<BuyerInfoRecord | null> {
  const { data, error } = await supabase.rpc('get_buyer_info', { p_id: clientUuid });
  if (error) throw error;
  return data as BuyerInfoRecord | null;
}

export async function fetchAllClients(): Promise<ClientRecord[]> {
  const PAGE = 1000;
  const rows: ClientRecord[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as ClientRecord[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}
