import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from('app_settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const upserts = Object.entries(body).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
