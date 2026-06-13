import { supabase } from '@/lib/supabase';

export interface ActivityLogEntry {
  id: number;
  reservation_id: string;
  action: string;
  actor_name: string | null;
  comment: string | null;
  created_at: string;
}

export async function addActivityLog(
  reservationId: string,
  action: string,
  actorName?: string | null,
  comment?: string | null,
): Promise<void> {
  const { error } = await supabase.from('booking_activity_log').insert({
    reservation_id: reservationId,
    action,
    actor_name: actorName ?? null,
    comment: comment ?? null,
  });
  if (error) throw error;
}

export async function getActivityLog(reservationId: string): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('booking_activity_log')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ActivityLogEntry[]) ?? [];
}
