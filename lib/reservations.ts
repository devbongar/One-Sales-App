import { supabase } from '@/lib/supabase';

export async function generateReservationId(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_reservation_id');
  if (error) throw error;
  return data as string;
}

export interface ReservationPayload {
  reservation_id: string;
  // Client
  client_name: string;
  signature_base64: string;
  // Unit Info
  project: string;
  tower: string;
  floor: string;
  unit_no: string;
  inventory_code: string | null;
  unit_type: string;
  unit_area: number;
  unit_category: string;
  // Payment Scheme
  payment_scheme: string;
  scheme_name: string;
  payment_term: string;
  dp_rate: string;
  term_months: number;
  // Price Computation
  list_price: number;
  promo_discount_pct: number;
  promo_discount_amount: number;
  employee_discount_amount: number;
  payterm_discount_pct: number;
  payterm_discount_amount: number;
  hic_discount: number;
  net_list_price: number;
  // Taxes & Charges
  vat: number;
  other_charges: number;
  total_contract_price: number;
  // Fees & Summary
  reservation_fee: number;
  retention_fee: number;
  net_amount: number;
  dp_amount: number;
  net_spot_dp: number;
  balance_for_financing: number;
  monthly_deferred: number;
  monthly_stretched_dp: number;
  // Financing
  bank_monthly: number;
  hdmf_monthly: number;
  // Client & Seller IDs
  client_id: string | null;
  seller_id: string | null;
  // Seller
  seller_name: string;
  sales_manager: string;
  sales_director: string;
  sales_division_head: string;
  // Status
  status: string;
}

export async function saveReservation(payload: ReservationPayload): Promise<void> {
  const { error } = await supabase.from('reservations').insert(payload);
  if (error) throw error;
}

export async function uploadPaymentProof(reservationId: string, file: Blob, fileName: string): Promise<string> {
  const path = `${reservationId}/${fileName}`;
  const { error } = await supabase.storage.from('payment-proofs').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('payment-proofs').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadDocumentFile(
  reservationId: string,
  folder: string,
  file: Blob,
  fileName: string,
): Promise<string> {
  const path = `${reservationId}/${folder}/${fileName}`;
  const { error } = await supabase.storage.from('payment-proofs').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('payment-proofs').getPublicUrl(path);
  return data.publicUrl;
}

export async function approvePaymentReview(
  reservationId: string,
  acknowledgementReceiptNo: string,
  salesInvoiceNo: string,
  dateOfReservationFee: string,
): Promise<void> {
  // 1. Update reservations table
  const { error } = await supabase
    .from('reservations')
    .update({
      status:                     'Reserved',
      finance_status:             'rf-verified',
      finance_verified_at:        new Date().toISOString(),
      acknowledgement_receipt_no: acknowledgementReceiptNo,
      sales_invoice_no:           salesInvoiceNo,
      date_of_reservation_fee:    dateOfReservationFee,
    })
    .eq('reservation_id', reservationId);
  if (error) throw error;

  // 2. Mark the Reservation Fee line in receivables_database as Paid
  // Non-fatal — lines may not exist yet if proof was submitted before this build
  const { data: rfLine } = await supabase
    .from('receivables_database')
    .select('total_amount_due')
    .eq('reservation_id', reservationId)
    .eq('type_of_payment', 'Reservation Fee')
    .single();
  await supabase
    .from('receivables_database')
    .update({
      payment_status:             'Paid',
      amount_paid:                rfLine?.total_amount_due ?? null,
      acknowledgement_receipt_no: acknowledgementReceiptNo,
      sales_invoice_number:       salesInvoiceNo,
      posting_date:               dateOfReservationFee,
    })
    .eq('reservation_id', reservationId)
    .eq('type_of_payment', 'Reservation Fee');
}

export async function updateReservationStatus(reservationId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .update({ status })
    .eq('reservation_id', reservationId);
  if (error) throw error;
}

export async function updateReservationPayment(
  reservationId: string,
  paymentDate: string,
  paymentProofUrls: string[],
  options?: {
    subsequentMode?: string;
    adaBank?: string;
    billingUrls?: string[];
    incomeUrls?: string[];
    validIdUrls?: string[];
  },
): Promise<void> {
  const { error } = await supabase.rpc('update_reservation_payment', {
    p_reservation_id:         reservationId,
    p_payment_date:           paymentDate,
    p_payment_proof_url:      JSON.stringify(paymentProofUrls),
    p_status:                 'Reserved',
    p_subsequent_mode:        options?.subsequentMode        ?? null,
    p_ada_bank:               options?.adaBank               ?? null,
    p_proof_of_billing_urls:  options?.billingUrls  ? JSON.stringify(options.billingUrls)  : null,
    p_proof_of_income_urls:   options?.incomeUrls   ? JSON.stringify(options.incomeUrls)   : null,
    p_proof_of_valid_id_urls: options?.validIdUrls  ? JSON.stringify(options.validIdUrls)  : null,
  });
  if (error) throw error;
  await supabase.from('reservations')
    .update({ finance_status: 'proof-submitted' })
    .eq('reservation_id', reservationId);
}
