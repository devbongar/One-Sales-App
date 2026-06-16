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
  const PAGE = 1000;
  const rows: BrokerRecord[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.rpc('get_all_brokers').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as BrokerRecord[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ─── Broker Recruit Record ─────────────────────────────────────────────────────

export interface BrokerRecruitRecord {
  full_name:                string;
  broker_id:                string | null;
  business_unit:            string | null;
  broker_status:            string | null;
  broker_category:          string | null;
  broker_type:              string | null;
  last_name:                string | null;
  first_name:               string | null;
  middle_name:              string | null;
  suffix:                   string | null;
  email_address:            string | null;
  sales_head:               string | null;
  sales_director_head:      string | null;
  broker_network_officer:   string | null;
  broker_network_associate: string | null;
  bir_registered_name:      string | null;
  vat_registration_type:    string | null;
  tin:                      string | null;
  ewt_cwt_rate:             string | null;
  bir_cor_address:          string | null;
}

export async function fetchAllBrokerRecruits(): Promise<BrokerRecruitRecord[]> {
  const PAGE = 1000;
  const rows: BrokerRecruitRecord[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.rpc('get_broker_recruits').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as BrokerRecruitRecord[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function addBrokerRecruit(rec: BrokerRecruitRecord): Promise<void> {
  const { error } = await supabase
    .from('Brokers')
    .insert({
      'Full Name':                rec.full_name,
      'Broker ID':                rec.broker_id,
      'Business Unit':            rec.business_unit,
      'Broker Status':            rec.broker_status,
      'Broker Category':          rec.broker_category,
      'Broker Type':              rec.broker_type,
      'Last Name':                rec.last_name,
      'First Name':               rec.first_name,
      'Middle Name':              rec.middle_name,
      'Suffix':                   rec.suffix,
      'Broker Email Address':     rec.email_address,
      'Sales Head':               rec.sales_head,
      'Sales Director Head':      rec.sales_director_head,
      'Broker Network Officer':   rec.broker_network_officer,
      'Broker Network Associate': rec.broker_network_associate,
      'BIR Registered Name':      rec.bir_registered_name,
      'VAT Registration Type':    rec.vat_registration_type,
      'TIN':                      rec.tin,
      'EWT / CWT':                rec.ewt_cwt_rate,
      'BIR COR Address':          rec.bir_cor_address,
    });
  if (error) throw error;
}

export async function updateBrokerRecruit(
  originalFullName: string,
  rec: BrokerRecruitRecord,
): Promise<void> {
  const { error } = await supabase
    .from('Brokers')
    .update({
      'Full Name':                rec.full_name,
      'Broker ID':                rec.broker_id,
      'Business Unit':            rec.business_unit,
      'Broker Status':            rec.broker_status,
      'Broker Category':          rec.broker_category,
      'Broker Type':              rec.broker_type,
      'Last Name':                rec.last_name,
      'First Name':               rec.first_name,
      'Middle Name':              rec.middle_name,
      'Suffix':                   rec.suffix,
      'Broker Email Address':     rec.email_address,
      'Sales Head':               rec.sales_head,
      'Sales Director Head':      rec.sales_director_head,
      'Broker Network Officer':   rec.broker_network_officer,
      'Broker Network Associate': rec.broker_network_associate,
      'BIR Registered Name':      rec.bir_registered_name,
      'VAT Registration Type':    rec.vat_registration_type,
      'TIN':                      rec.tin,
      'EWT / CWT':                rec.ewt_cwt_rate,
      'BIR COR Address':          rec.bir_cor_address,
    })
    .eq('Full Name', originalFullName);
  if (error) throw error;
}
