import { supabase } from './supabase';
import { getSession } from './auth';

export interface QuotationSaveData {
  inventoryCode: string | null;
  project: string;
  tower: string;
  floor: string;
  unitNo: string;
  unitType: string;
  unitArea: number;
  unitCategory: string;
  paymentScheme: string;
  schemeName: string;
  dpRate: string;
  paymentTerm: string;
  termMonths: number;
  listPrice: number;
  promoAmount: number;
  promoPct: number;
  employeeAmount: number;
  paytermAmount: number;
  hicDiscount: number;
  netListPrice: number;
  vat: number;
  otherCharges: number;
  totalContractPrice: number;
  netAmount: number;
  monthlyDeferred: number;
  dpAmount: number;
  netSpotDP: number;
  balanceForFinancing: number;
  monthlyStretchedDP: number;
  bankMonthly: number;
  hdmfMonthly: number;
  reservationFee: number;
  clientLastName: string;
  clientFirstName: string;
  clientMiddleName: string;
  clientSuffix: string;
  clientMobile: string;
  clientEmail: string;
}

export interface SavedQuotationRecord {
  id: string;
  name: string;
  inventory_code: string | null;
  project: string;
  tower: string;
  floor: string;
  unit_no: string;
  unit_type: string;
  unit_category: string;
  payment_scheme: string;
  scheme_name: string;
  dp_rate: string;
  payment_term: string;
  term_months: number;
  list_price: number;
  promo_amount: number;
  promo_pct: number;
  employee_amount: number;
  payterm_amount: number;
  hic_discount: number;
  net_list_price: number;
  vat: number;
  other_charges: number;
  total_contract_price: number;
  net_amount: number;
  monthly_deferred: number;
  dp_amount: number;
  net_spot_dp: number;
  balance_for_financing: number;
  monthly_stretched_dp: number;
  bank_monthly: number;
  hdmf_monthly: number;
  reservation_fee: number;
  client_last_name: string;
  client_first_name: string;
  client_middle_name: string;
  client_suffix: string;
  client_mobile: string;
  client_email: string;
  seller_name: string | null;
  status: string;
  created_at: string;
}

function makeQuotationName(d: QuotationSaveData): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const code = d.inventoryCode ?? `${d.floor}${d.unitNo}`;
  const parts: string[] = [code, d.schemeName];
  if (['spot_dp', 'stretched_dp'].includes(d.paymentScheme) && d.dpRate) {
    parts.push(`${d.dpRate}DP`);
  }
  if (d.termMonths > 0 && ['stretched_dp', 'deferred_cash'].includes(d.paymentScheme)) {
    parts.push(`${d.termMonths}mos`);
  }
  parts.push(date);
  return parts.join('.');
}

export async function saveQuotation(data: QuotationSaveData): Promise<{ id: string; name: string }> {
  const session = await getSession();
  const name = makeQuotationName(data);
  const { data: row, error } = await supabase
    .from('quotations')
    .insert({
      name,
      inventory_code: data.inventoryCode,
      project: data.project,
      tower: data.tower,
      floor: data.floor,
      unit_no: data.unitNo,
      unit_type: data.unitType,
      unit_area: data.unitArea,
      unit_category: data.unitCategory,
      payment_scheme: data.paymentScheme,
      scheme_name: data.schemeName,
      dp_rate: data.dpRate,
      payment_term: data.paymentTerm,
      term_months: data.termMonths,
      list_price: data.listPrice,
      promo_amount: data.promoAmount,
      promo_pct: data.promoPct,
      employee_amount: data.employeeAmount,
      payterm_amount: data.paytermAmount,
      hic_discount: data.hicDiscount,
      net_list_price: data.netListPrice,
      vat: data.vat,
      other_charges: data.otherCharges,
      total_contract_price: data.totalContractPrice,
      net_amount: data.netAmount,
      monthly_deferred: data.monthlyDeferred,
      dp_amount: data.dpAmount,
      net_spot_dp: data.netSpotDP,
      balance_for_financing: data.balanceForFinancing,
      monthly_stretched_dp: data.monthlyStretchedDP,
      bank_monthly: data.bankMonthly,
      hdmf_monthly: data.hdmfMonthly,
      reservation_fee: data.reservationFee,
      client_last_name: data.clientLastName,
      client_first_name: data.clientFirstName,
      client_middle_name: data.clientMiddleName,
      client_suffix: data.clientSuffix,
      client_mobile: data.clientMobile,
      client_email: data.clientEmail,
      status: 'active',
      created_by_uuid: session?.id ?? null,
      seller_name: session?.full_name ?? null,
    })
    .select('id, name')
    .single();
  if (error) throw error;
  return { id: row.id, name: row.name };
}

export async function fetchMyQuotations(): Promise<SavedQuotationRecord[]> {
  const session = await getSession();
  const isPrivileged = ['All Access', 'Sales Director', 'Account Management'].includes(session?.role_name ?? '');
  let query = supabase
    .from('quotations')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (!isPrivileged && session?.id) {
    query = query.eq('created_by_uuid', session.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SavedQuotationRecord[];
}

export async function markQuotationConverted(id: string): Promise<void> {
  const { error } = await supabase
    .from('quotations')
    .update({ status: 'converted' })
    .eq('id', id);
  if (error) throw error;
}
