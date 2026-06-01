import { supabase } from '@/lib/supabase';

/*
  Required Supabase migration (run once):

  create table if not exists public.reservation_fees (
    unit_type text primary key,
    fee       numeric not null default 0
  );
*/

export interface ReservationFeeRecord {
  unit_type: string;
  fee: number;
}

export async function fetchAllUnitTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('reservation_fees')
    .select('unit_type')
    .order('unit_type');
  if (error) throw error;
  return (data ?? []).map((r: any) => r.unit_type as string);
}

export async function fetchReservationFees(): Promise<ReservationFeeRecord[]> {
  const { data, error } = await supabase
    .from('reservation_fees')
    .select('unit_type, fee');
  if (error) throw error;
  return (data ?? []) as ReservationFeeRecord[];
}

export async function saveReservationFees(fees: ReservationFeeRecord[]): Promise<void> {
  const { error } = await supabase
    .from('reservation_fees')
    .upsert(fees, { onConflict: 'unit_type' });
  if (error) throw error;
}

export async function deleteReservationFees(unitTypes: string[]): Promise<void> {
  if (unitTypes.length === 0) return;
  const { error } = await supabase
    .from('reservation_fees')
    .delete()
    .in('unit_type', unitTypes);
  if (error) throw error;
}

export interface SalesPositionRecord {
  position: string;
  position_code: string;
}

export async function fetchSalesPositions(): Promise<SalesPositionRecord[]> {
  const { data, error } = await supabase
    .from('sales_positions')
    .select('position, position_code')
    .order('position');
  if (error) throw error;
  return (data ?? []) as SalesPositionRecord[];
}

export async function saveSalesPositions(records: SalesPositionRecord[]): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase
    .from('sales_positions')
    .upsert(records, { onConflict: 'position' });
  if (error) throw error;
}

export async function deleteSalesPositions(positions: string[]): Promise<void> {
  if (positions.length === 0) return;
  const { error } = await supabase
    .from('sales_positions')
    .delete()
    .in('position', positions);
  if (error) throw error;
}

export async function fetchDropdownOptions(category: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('dropdown_options')
    .select('value')
    .eq('category', category)
    .order('value');
  if (error) throw error;
  return (data ?? []).map((r: any) => r.value as string);
}

export async function saveDropdownOptions(category: string, values: string[]): Promise<void> {
  if (values.length === 0) return;
  const { error } = await supabase
    .from('dropdown_options')
    .upsert(values.map((v) => ({ category, value: v })), { onConflict: 'category,value' });
  if (error) throw error;
}

export async function deleteDropdownOptions(category: string, values: string[]): Promise<void> {
  if (values.length === 0) return;
  const { error } = await supabase
    .from('dropdown_options')
    .delete()
    .eq('category', category)
    .in('value', values);
  if (error) throw error;
}

/* ─── Project / Tower settings ───────────────────────────────────────────── */
export interface ProjectTowerRecord {
  project: string;
  tower: string;
  turnover_date: string | null; // 'YYYY-MM-DD'
}

export async function fetchProjectTowers(): Promise<ProjectTowerRecord[]> {
  const { data, error } = await supabase
    .from('project_towers')
    .select('project, tower, turnover_date')
    .order('project')
    .order('tower');
  if (error) throw error;
  return (data ?? []) as ProjectTowerRecord[];
}

export async function saveProjectTowers(records: ProjectTowerRecord[]): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase
    .from('project_towers')
    .upsert(records, { onConflict: 'project,tower' });
  if (error) throw error;
}

export async function deleteProjectTowers(
  keys: { project: string; tower: string }[]
): Promise<void> {
  for (const { project, tower } of keys) {
    const { error } = await supabase
      .from('project_towers')
      .delete()
      .eq('project', project)
      .eq('tower', tower);
    if (error) throw error;
  }
}

export async function fetchTurnoverDate(
  project: string,
  tower: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_towers')
    .select('turnover_date')
    .eq('project', project)
    .eq('tower', tower)
    .maybeSingle();
  if (error || !data) return null;
  return (data as any).turnover_date ?? null;
}

export async function fetchReservationFee(productType: string): Promise<number> {
  const { data, error } = await supabase
    .from('reservation_fees')
    .select('fee')
    .eq('unit_type', productType)
    .maybeSingle();
  if (error || !data) return 0;
  return (data as any).fee ?? 0;
}


export async function resolveDueDate(reservationDay: number): Promise<{ dueDay: number; sameMonth: boolean }> {
  const { data, error } = await supabase
    .from('due_date_assignments')
    .select('due_date, same_month')
    .eq('day', reservationDay)
    .maybeSingle();
  if (error || !data) return { dueDay: 30, sameMonth: false };
  return { dueDay: (data as any).due_date, sameMonth: (data as any).same_month ?? false };
}

export interface DueDateAssignment {
  day: number;
  due_date: number;
  same_month: boolean;
}

export async function fetchDueDateAssignments(): Promise<DueDateAssignment[]> {
  const { data, error } = await supabase
    .from('due_date_assignments')
    .select('day, due_date, same_month')
    .order('day');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, same_month: r.same_month ?? false })) as DueDateAssignment[];
}

export async function saveDueDateAssignments(
  assignments: DueDateAssignment[],
  removedDays: number[]
): Promise<void> {
  if (removedDays.length > 0) {
    const { error } = await supabase.from('due_date_assignments').delete().in('day', removedDays);
    if (error) throw error;
  }
  if (assignments.length > 0) {
    const { error } = await supabase
      .from('due_date_assignments')
      .upsert(assignments, { onConflict: 'day' });
    if (error) throw error;
  }
}
