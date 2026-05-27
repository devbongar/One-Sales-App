import { supabase } from '@/lib/supabase';

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

export async function financeVerify(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('finance_verify', {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}
