import { supabase } from '@/lib/supabase';

export interface SalespersonRecord {
  seller_name: string;
  seller_id: string | null;
  position_code: string;
  position_rank: string | null;
  seller_group: string | null;
  sales_manager: string | null;
  sales_director: string | null;
  sales_division_head: string | null;
}

export interface SellerTaxInfo {
  vat_registration_type: string | null;
  ewt_rate_raw:          string | null;
  vat_rate:              number; // 0.12 if VAT, else 0
  ewt_rate:              number; // decimal, e.g. 0.10
}

function parseRate(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace('%', '').trim());
  if (isNaN(n)) return 0;
  return n > 1 ? n / 100 : n;
}

export async function fetchSellerTaxInfo(sellerName: string): Promise<SellerTaxInfo> {
  // Try in-house Salesperson table first
  const { data: sp } = await supabase
    .from('Salesperson')
    .select('"VAT Registration Type", "EWT/WT Rate"')
    .eq('Seller Name', sellerName)
    .maybeSingle();

  if (sp) {
    const vatType = (sp as any)['VAT Registration Type'] as string | null;
    const ewtRaw  = (sp as any)['EWT/WT Rate']           as string | null;
    return {
      vat_registration_type: vatType,
      ewt_rate_raw:          ewtRaw,
      vat_rate:              vatType?.toUpperCase() === 'VAT' ? 0.12 : 0,
      ewt_rate:              parseRate(ewtRaw),
    };
  }

  // Fall back to Brokers table
  const { data: br } = await supabase
    .from('Brokers')
    .select('"VAT Registration Type", "EWT / CWT"')
    .eq('Full Name', sellerName)
    .maybeSingle();

  const vatType = (br as any)?.['VAT Registration Type'] as string | null ?? null;
  const ewtRaw  = (br as any)?.['EWT / CWT']             as string | null ?? null;
  return {
    vat_registration_type: vatType,
    ewt_rate_raw:          ewtRaw,
    vat_rate:              vatType?.toUpperCase() === 'VAT' ? 0.12 : 0,
    ewt_rate:              parseRate(ewtRaw),
  };
}

export async function fetchAllSalespersons(): Promise<SalespersonRecord[]> {
  const PAGE = 1000;
  const rows: SalespersonRecord[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.rpc('get_all_salespersons').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SalespersonRecord[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export interface SellerRecruitRecord {
  seller_name:            string;
  seller_id:              string | null;
  position_code:          string | null;
  position_rank:          string | null;
  seller_status:          string | null;
  first_name:             string | null;
  middle_name:            string | null;
  last_name:              string | null;
  email_address:          string | null;
  hired_date:             string | null;
  business_units:         string | null;
  focus_project:          string | null;
  sales_manager:          string | null;
  sales_director:         string | null;
  sales_division_head:    string | null;
  sales_head:             string | null;
  sales_team:             string | null;
  payroll_code:           string | null;
  payroll_account_number: string | null;
  vat_registration_type:  string | null;
  tin:                    string | null;
  ewt_rate:               string | null;
  bir_cor_address:        string | null;
  signature_base64:       string | null;
}

export async function fetchAllSellerRecruits(): Promise<SellerRecruitRecord[]> {
  const PAGE = 1000;
  const rows: SellerRecruitRecord[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.rpc('get_seller_recruits').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SellerRecruitRecord[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function addSellerRecruit(rec: SellerRecruitRecord): Promise<void> {
  const { error } = await supabase
    .from('Salesperson')
    .insert({
      'Seller Name':            rec.seller_name,
      'Seller Id':              rec.seller_id,
      'POSITION CODE':          rec.position_code,
      'position_rank':          rec.position_rank,
      'Seller Status':          rec.seller_status,
      'FIRST NAME':             rec.first_name,
      'MIDDLE NAME':            rec.middle_name,
      'LAST NAME':              rec.last_name,
      'Email Address':          rec.email_address,
      'Hired Date':             rec.hired_date,
      'Business Units':         rec.business_units,
      'Focus Project':          rec.focus_project,
      'Sales Manager':          rec.sales_manager,
      'Sales Director':         rec.sales_director,
      'Sales Division Head':    rec.sales_division_head,
      'Sales Head':             rec.sales_head,
      'Sales Team':             rec.sales_team,
      'Payroll Code':           rec.payroll_code,
      'Payroll Account Number': rec.payroll_account_number,
      'VAT Registration Type':  rec.vat_registration_type,
      'TIN':                    rec.tin,
      'EWT/WT Rate':            rec.ewt_rate,
      'BIR COR Address':        rec.bir_cor_address,
    });
  if (error) throw error;
}

export async function updateSellerRecruit(
  originalSellerName: string,
  rec: SellerRecruitRecord,
): Promise<void> {
  const { error } = await supabase
    .from('Salesperson')
    .update({
      'Seller Name':            rec.seller_name,
      'Seller Id':              rec.seller_id,
      'POSITION CODE':          rec.position_code,
      'position_rank':          rec.position_rank,
      'Seller Status':          rec.seller_status,
      'FIRST NAME':             rec.first_name,
      'MIDDLE NAME':            rec.middle_name,
      'LAST NAME':              rec.last_name,
      'Email Address':          rec.email_address,
      'Hired Date':             rec.hired_date,
      'Business Units':         rec.business_units,
      'Focus Project':          rec.focus_project,
      'Sales Manager':          rec.sales_manager,
      'Sales Director':         rec.sales_director,
      'Sales Division Head':    rec.sales_division_head,
      'Sales Head':             rec.sales_head,
      'Sales Team':             rec.sales_team,
      'Payroll Code':           rec.payroll_code,
      'Payroll Account Number': rec.payroll_account_number,
      'VAT Registration Type':  rec.vat_registration_type,
      'TIN':                    rec.tin,
      'EWT/WT Rate':            rec.ewt_rate,
      'BIR COR Address':        rec.bir_cor_address,
    })
    .eq('Seller Name', originalSellerName);
  if (error) throw error;
}

export async function fetchSellerSignature(sellerName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('Salesperson')
    .select('signature_base64')
    .eq('Seller Name', sellerName)
    .single();
  if (error) return null;
  return (data as { signature_base64: string | null })?.signature_base64 ?? null;
}

export async function updateSellerSignature(sellerName: string, signatureBase64: string | null): Promise<void> {
  const { error } = await supabase
    .from('Salesperson')
    .update({ signature_base64: signatureBase64 })
    .eq('Seller Name', sellerName);
  if (error) throw error;
}
