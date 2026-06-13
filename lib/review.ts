import { supabase } from '@/lib/supabase';

export async function withdrawSubmission(reservationId: string): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .update({ booking_review_status: null })
    .eq('reservation_id', reservationId);
  if (error) throw error;
}

export async function submitForReview(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_for_review', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function directorReview(
  reservationId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('director_review', {
    p_reservation_id: reservationId,
    p_approved:       approved,
    p_notes:          notes ?? null,
  });
  if (error) throw error;
}

export async function submitToAmd(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_to_amd', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function amdReview(
  reservationId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('amd_review', {
    p_reservation_id: reservationId,
    p_approved:       approved,
    p_notes:          notes ?? null,
  });
  if (error) throw error;
}

export async function financeVerify(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('finance_verify', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}
