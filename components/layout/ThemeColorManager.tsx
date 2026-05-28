'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Pages that use the dark full-screen carousel
const DARK_ROUTES = new Set(['/', '/home', '/login', '/welcome']);

export default function ThemeColorManager() {
  const pathname = usePathname();

  useEffect(() => {
    const color = DARK_ROUTES.has(pathname) ? '#000000' : '#ffffff';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) {
      meta.setAttribute('content', color);
    } else {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }
  }, [pathname]);

  return null;
}
