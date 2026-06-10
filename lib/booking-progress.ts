import { supabase } from '@/lib/supabase';

export interface BookingProgress {
  privacy_consent: boolean;
  signature_base64: string | null;
  buyer_info_saved: boolean;
  has_spouse: boolean;
  has_co_ownership: boolean;
  has_atty_in_fact: boolean;
  co_owner_is_spouse: boolean;
  spouse_saved: boolean;
  co_owner_saved: boolean;
  atty_saved: boolean;
  documents_saved: boolean;
  booking_review_status: string | null;
  director_notes: string | null;
}

export type BookingStatus =
  | 'not-started'
  | 'in-progress'
  | 'stage1-complete'
  | 'fully-complete'
  | 'submitted'
  | 'director-rejected'
  | 'director-approved'
  | 'finance-verified'
  | 'Booked';

export async function getBookingProgress(reservationId: string): Promise<BookingProgress> {
  const { data, error } = await supabase.rpc('get_booking_progress', { p_reservation_id: reservationId });
  if (error) throw error;
  return (data as BookingProgress) ?? {
    privacy_consent: false,
    signature_base64: null,
    buyer_info_saved: false,
    has_spouse: false,
    has_co_ownership: false,
    has_atty_in_fact: false,
    co_owner_is_spouse: false,
    spouse_saved: false,
    co_owner_saved: false,
    atty_saved: false,
    documents_saved: false,
    booking_review_status: null,
    director_notes: null,
  };
}

export interface BookingProgressEntry extends BookingProgress {
  reservation_id: string;
}

export async function getBookingFlags(reservationId: string): Promise<{ has_co_ownership: boolean; has_atty_in_fact: boolean }> {
  const { data, error } = await supabase.rpc('get_booking_flags', { p_reservation_id: reservationId });
  if (error) throw error;
  return (data as { has_co_ownership: boolean; has_atty_in_fact: boolean }) ?? { has_co_ownership: false, has_atty_in_fact: false };
}

export async function saveBookingFlags(reservationId: string, hasCoOwnership: boolean, hasAttyInFact: boolean): Promise<void> {
  const { error } = await supabase.rpc('save_booking_flags', {
    p_reservation_id:   reservationId,
    p_has_co_ownership: hasCoOwnership,
    p_has_atty_in_fact: hasAttyInFact,
  });
  if (error) throw error;
}

export async function savePrivacyConsent(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('save_privacy_consent', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function getAllBookingProgress(): Promise<Record<string, BookingProgress>> {
  const { data, error } = await supabase.rpc('get_all_booking_progress');
  if (error) throw error;
  const entries = (data as BookingProgressEntry[]) ?? [];
  return Object.fromEntries(entries.map(e => [e.reservation_id, e]));
}

export function computeBookingStatus(p?: BookingProgress): BookingStatus {
  if (!p || !p.buyer_info_saved) return 'not-started';
  const stage1Done = (!p.has_co_ownership || p.co_owner_saved)
                  && (!p.has_atty_in_fact  || p.atty_saved);
  if (!stage1Done) return 'in-progress';
  if (!p.documents_saved) return 'stage1-complete';
  if (p.booking_review_status === 'Booked')            return 'Booked';
  if (p.booking_review_status === 'finance-verified')  return 'finance-verified';
  if (p.booking_review_status === 'director-approved') return 'director-approved';
  if (p.booking_review_status === 'director-rejected') return 'director-rejected';
  if (p.booking_review_status === 'submitted')         return 'submitted';
  return 'fully-complete';
}
