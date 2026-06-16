'use client';

import { supabase } from './supabase';
import type { AppUser } from '@/types';

export async function getSession(): Promise<AppUser | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const p = profile as any;

  let role_name: string | null = null;
  if (p?.role_id) {
    const { data: role } = await supabase
      .from('access_roles')
      .select('role_name')
      .eq('id', p.role_id)
      .maybeSingle();
    role_name = (role as any)?.role_name ?? null;
  }

  return {
    id: user.id,
    email: user.email!,
    full_name:    p?.full_name    ?? '',
    display_name: p?.display_name ?? null,
    role_id:      p?.role_id      ?? null,
    role_name,
    seller_id:    p?.seller_id    ?? null,
  };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
