import { supabase } from '@/lib/supabase';

/*
  Required Supabase migrations (run once):

  create table if not exists public.reservation_fees (
    unit_type text primary key,
    fee       numeric not null default 0
  );

  create table if not exists public.vat_settings (
    product_type  text    primary key,
    vat_threshold numeric not null default 0
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


/* ─── VAT Settings ───────────────────────────────────────────────────────── */

export interface VatSettingRecord {
  product_type:  string;
  vat_threshold: number;
}

export async function fetchVatSettings(): Promise<VatSettingRecord[]> {
  const { data, error } = await supabase
    .from('vat_settings')
    .select('product_type, vat_threshold')
    .order('product_type');
  if (error) throw error;
  return (data ?? []) as VatSettingRecord[];
}

export async function saveVatSettings(records: VatSettingRecord[]): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase
    .from('vat_settings')
    .upsert(records, { onConflict: 'product_type' });
  if (error) throw error;
}

export async function deleteVatSettings(productTypes: string[]): Promise<void> {
  if (productTypes.length === 0) return;
  const { error } = await supabase
    .from('vat_settings')
    .delete()
    .in('product_type', productTypes);
  if (error) throw error;
}

/**
 * Returns the VAT threshold for a product type.
 * Returns null if no entry exists — caller must treat this as a config error.
 */
export async function fetchVatThreshold(productType: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('vat_settings')
    .select('vat_threshold')
    .eq('product_type', productType)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (data as any).vat_threshold ?? null;
}

/**
 * Computes VAT amount given net list price, product type threshold.
 * NLP > threshold → 12% VAT; NLP <= threshold → 0 (exempt).
 */
export function computeVat(netListPrice: number, vatThreshold: number): number {
  return netListPrice > vatThreshold ? Math.round(netListPrice * 0.12) : 0;
}

/* ─── HIC Settings ───────────────────────────────────────────────────────── */

export interface HicSettingRecord {
  product_type: string;
  hic_target:   number;
}

export async function fetchHicSettings(): Promise<HicSettingRecord[]> {
  const { data, error } = await supabase
    .from('hic_settings')
    .select('product_type, hic_target')
    .order('product_type');
  if (error) throw error;
  return (data ?? []) as HicSettingRecord[];
}

export async function saveHicSettings(records: HicSettingRecord[]): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase
    .from('hic_settings')
    .upsert(records, { onConflict: 'product_type' });
  if (error) throw error;
}

export async function deleteHicSettings(productTypes: string[]): Promise<void> {
  if (productTypes.length === 0) return;
  const { error } = await supabase
    .from('hic_settings')
    .delete()
    .in('product_type', productTypes);
  if (error) throw error;
}

/**
 * Returns the HIC target amount for a product type.
 * Returns null if no entry exists — caller should disable HIC for that unit.
 */
export async function fetchHicTarget(productType: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('hic_settings')
    .select('hic_target')
    .eq('product_type', productType)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (data as any).hic_target ?? null;
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

/* ─── Access Roles ───────────────────────────────────────────────────────── */

/*
  Required Supabase migration (run once):

  create table if not exists public.access_roles (
    id          serial primary key,
    role_name   text not null,
    description text,
    color       text not null default '#C7C7CC',
    sort_order  int  not null default 0
  );

  insert into public.access_roles (role_name, description, color, sort_order) values
    ('Sales Manager',        'Front-line sales lead. Registers clients and handles reservations. Can view their team''s sales commission.',                                          '#3B82F6', 1),
    ('Sales Director',       'Senior sales role. Everything a Sales Manager does, plus Booking approval and HIC discount rights.',                                                  '#6366F1', 2),
    ('Seller Recruitment',   'Manages onboarding of new sellers. Also sees the Seller Organization Chart in the Vibe app.',                                                         '#10B981', 3),
    ('Finance Verification', 'Finance & accounting. Verifies payments, posts collections, runs payouts, aging and delinquency.',                                                    '#F59E0B', 4),
    ('Broker Network',       'External broker channel. Registers clients & reservations, broker accreditation. Flagged for Canvas Admin User.',                                     '#8B5CF6', 5),
    ('Account Management',   'Post-sale account handling: buyer verification, foldering, billing, delinquency.',                                                                    '#14B8A6', 6),
    ('PD Access',            'Project Development. Manages inventory and monitors reservations, delinquency and the seller org chart.',                                             '#F97316', 7),
    ('All Access',           'Admin-level. Full access to every feature in both apps, including Admin User.',                                                                       '#C03D25', 8);
*/

export interface AccessRoleRecord {
  id:          number;
  role_name:   string;
  description: string | null;
  color:       string;
  sort_order:  number;
}

export async function fetchAccessRoles(): Promise<AccessRoleRecord[]> {
  const { data, error } = await supabase
    .from('access_roles')
    .select('id, role_name, description, color, sort_order')
    .order('sort_order')
    .order('id');
  if (error) throw error;
  return (data ?? []) as AccessRoleRecord[];
}

export async function saveAccessRole(
  record: Omit<AccessRoleRecord, 'id'> & { id?: number }
): Promise<AccessRoleRecord> {
  if (record.id) {
    const { data, error } = await supabase
      .from('access_roles')
      .update({
        role_name:   record.role_name,
        description: record.description,
        color:       record.color,
        sort_order:  record.sort_order,
      })
      .eq('id', record.id)
      .select()
      .single();
    if (error) throw error;
    return data as AccessRoleRecord;
  } else {
    const { data, error } = await supabase
      .from('access_roles')
      .insert({
        role_name:   record.role_name,
        description: record.description ?? '',
        color:       record.color,
        sort_order:  record.sort_order,
      })
      .select()
      .single();
    if (error) throw error;
    return data as AccessRoleRecord;
  }
}

export async function deleteAccessRole(id: number): Promise<void> {
  const { error } = await supabase
    .from('access_roles')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
