import { supabase } from '@/lib/supabase';

export interface BookingDocuments {
  co_owner_id_urls:     string[];
  atty_in_fact_id_urls: string[];
  spouse_id_urls:       string[];
}

export async function fetchBookingDocuments(reservationId: string): Promise<BookingDocuments> {
  const { data, error } = await supabase.rpc('get_booking_documents', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  return (data as BookingDocuments) ?? { co_owner_id_urls: [], atty_in_fact_id_urls: [], spouse_id_urls: [] };
}

export async function saveBookingDocuments(
  reservationId: string,
  coOwnerIdUrls: string[],
  attyInFactIdUrls: string[],
  spouseIdUrls: string[],
): Promise<void> {
  const { error } = await supabase.rpc('save_booking_documents', {
    p_reservation_id:        reservationId,
    p_co_owner_id_urls:      coOwnerIdUrls,
    p_atty_in_fact_id_urls:  attyInFactIdUrls,
    p_spouse_id_urls:        spouseIdUrls,
  });
  if (error) throw error;
}

export async function uploadDocumentFile(
  reservationId: string,
  docType: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${reservationId}/${docType}/${uid}.${ext}`;

  const { error } = await supabase.storage
    .from('booking-docs')
    .upload(path, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('booking-docs').getPublicUrl(path);
  return data.publicUrl;
}

export async function removeDocumentFile(url: string): Promise<void> {
  try {
    const marker = '/booking-docs/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
    const { error } = await supabase.storage.from('booking-docs').remove([path]);
    if (error) console.error('[booking-docs] remove error:', error);
  } catch (e) {
    console.error('[booking-docs] remove exception:', e);
  }
}
