'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PUBLIC_PATHS = ['/login', '/set-password', '/welcome', '/seller-onboarding'];

export default function AuthWatcher() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        const isPublic = PUBLIC_PATHS.some(p => pathname?.startsWith(p));
        if (!isPublic) {
          router.replace('/login');
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [router, pathname]);

  return null;
}
