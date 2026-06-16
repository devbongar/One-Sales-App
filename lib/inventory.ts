import { supabase } from '@/lib/supabase';

export async function fetchProjects() {
  try {
    const { data, error } = await supabase.rpc('get_distinct_projects');

    if (error) throw error;

    console.log('Projects:', data);

    // Extract project names from the result
    const projects = data?.map((row: any) => row.project_name).filter(Boolean) as string[];
    return projects;
  } catch (err) {
    console.error('Error fetching projects:', err);
    throw err;
  }
}

export async function fetchTowers(projectName: string) {
  try {
    const { data, error } = await supabase.rpc('get_distinct_towers', {
      p_project: projectName,
    });

    if (error) throw error;

    console.log('Towers for', projectName, ':', data);

    // Extract tower names from the result
    const towers = data?.map((row: any) => row.tower).filter(Boolean) as string[];
    return towers;
  } catch (err) {
    console.error('Error fetching towers:', err);
    throw err;
  }
}

export async function fetchFloors(projectName: string, tower: string) {
  try {
    const { data, error } = await supabase.rpc('get_distinct_floors', {
      p_project: projectName,
      p_tower: tower,
    });

    if (error) throw error;

    console.log('Floors for', projectName, tower, ':', data);

    const floors = (data?.map((row: any) => row.floor).filter(Boolean) as string[])
      .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    return floors;
  } catch (err) {
    console.error('Error fetching floors:', err);
    throw err;
  }
}

export async function fetchFloorsByCategory(projectName: string, tower: string, category: string) {
  try {
    const { data, error } = await supabase.rpc('get_floors_by_category', {
      p_project: projectName,
      p_tower: tower,
      p_category: category,
    });

    if (error) throw error;

    console.log('Floors for', projectName, tower, 'category', category, ':', data);

    const floors = (data?.map((row: any) => row.floor).filter(Boolean) as string[])
      .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    return floors;
  } catch (err) {
    console.error('Error fetching floors by category:', err);
    throw err;
  }
}

export interface InventoryUnit {
  floor: string;
  unit_no: string;
  inventory_code: string | null;
  unit_type: string;
  unit_area: number;
  total_list_price: string;
  promo_discount: string;
  status: string;
  product_type: string | null;
  hic: boolean | null;
}

export async function fetchInventoryUnits(projectName: string, tower: string): Promise<InventoryUnit[]> {
  const PAGE = 1000;
  const rows: InventoryUnit[] = [];
  let from = 0;
  try {
    while (true) {
      const { data, error } = await supabase.rpc('get_inventory_units', {
        p_project: projectName,
        p_tower: tower,
      }).range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...((data as InventoryUnit[]) ?? []));
      if ((data ?? []).length < PAGE) break;
      from += PAGE;
    }
    return rows;
  } catch (err) {
    console.error('Error fetching inventory units:', err);
    throw err;
  }
}

export async function updateInventoryUnitStatus(inventoryCode: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('update_inventory_status', {
    p_inventory_code: inventoryCode,
    p_status: status,
  });
  if (error) throw error;
}

export async function fetchUnitTypes(projectName: string, tower: string) {
  try {
    const { data, error } = await supabase.rpc('get_distinct_unit_types', {
      p_project: projectName,
      p_tower: tower,
    });

    if (error) throw error;

    console.log('Unit types for', projectName, tower, ':', data);

    // Extract unit type names from the result
    const unitTypes = data?.map((row: any) => row.unit_type).filter(Boolean) as string[];
    return unitTypes;
  } catch (err) {
    console.error('Error fetching unit types:', err);
    throw err;
  }
}
