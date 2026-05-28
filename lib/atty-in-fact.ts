import { supabase } from '@/lib/supabase';

export interface AttyInFactRecord {
  reservation_id: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  suffix: string | null;
  mobile_code: string | null;
  mobile: string | null;
  landline: string | null;
  email: string | null;
}

export async function fetchAttyInFact(reservationId: string): Promise<AttyInFactRecord | null> {
  const { data, error } = await supabase.rpc('get_atty_in_fact', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as AttyInFactRecord | null;
}

export interface AttyInFactPayload {
  reservation_id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix: string;
  mobile_code: string;
  mobile: string;
  landline: string;
  email: string;
}

export async function checkAttyInFactExists(reservationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_atty_in_fact_exists', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as boolean;
}

export async function saveAttyInFact(payload: AttyInFactPayload): Promise<void> {
  const { error } = await supabase.rpc('save_atty_in_fact', {
    p_reservation_id: payload.reservation_id,
    p_last_name:      payload.last_name   || null,
    p_first_name:     payload.first_name  || null,
    p_middle_name:    payload.middle_name || null,
    p_suffix:         payload.suffix      || null,
    p_mobile_code:    payload.mobile_code || null,
    p_mobile:         payload.mobile      || null,
    p_landline:       payload.landline    || null,
    p_email:          payload.email       || null,
  });
  if (error) throw error;
}
