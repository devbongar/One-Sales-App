import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeColorManager from '@/components/layout/ThemeColorManager';

export const metadata: Metadata = {
  title: 'One Sales App',
  description: 'Sales management platform',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OneSales',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" style={{ backgroundColor: '#000000' }}>
      <body className="h-full">
        <ThemeColorManager />
        {children}
      </body>
    </html>
  );
}
