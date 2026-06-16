import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COLS = `"Project ID","Project Name","Tower","Floor","Unit No.","Inventory Code","Unit Type","Unit Area","Total List Price","Promo Discount","Status","HIC"`;

const PAGE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(baseQuery: any) {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (baseQuery as any).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function mapRow(row: Record<string, unknown>) {
  return {
    project_id:        row['Project ID']        ?? null,
    project_name:      row['Project Name']      ?? null,
    tower:             row['Tower']             ?? null,
    floor:             row['Floor']             ?? null,
    unit_no:           row['Unit No.']          ?? null,
    inventory_code:    row['Inventory Code']    ?? null,
    unit_type:         row['Unit Type']         ?? null,
    unit_area:         row['Unit Area']         ?? null,
    total_list_price:  row['Total List Price']  ?? null,
    promo_discount:    row['Promo Discount']    ?? null,
    status:            row['Status']            ?? null,
    hic:               row['HIC']              ?? false,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectName = searchParams.get('project_name');
  const tower       = searchParams.get('tower');
  const unitType    = searchParams.get('unit_type');
  const floor       = searchParams.get('floor');

  // No project selected → return distinct project names (available units only)
  if (!projectName) {
    try {
      const data = await fetchAll(supabase.from('Inventory').select('"Project Name"').ilike('Status', 'available'));
      const projects = [...new Set(data.map((r) => r['Project Name']).filter(Boolean))].sort();
      return NextResponse.json({ projects });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const baseQuery = supabase.from('Inventory').select(COLS).eq('Project Name', projectName).ilike('Status', 'available');

  // project + tower → return ALL units (client handles further filtering)
  if (tower) {
    try {
      const data = await fetchAll((baseQuery as any).eq('Tower', tower));
      return NextResponse.json({ units: data.map(mapRow) });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // project only → distinct towers
  try {
    const data = await fetchAll(baseQuery);
    const towers = [...new Set(data.map((r) => r['Tower']).filter(Boolean))].sort();
    return NextResponse.json({ towers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
