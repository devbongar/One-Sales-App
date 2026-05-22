import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'One Sales App',
    short_name: 'OneSales',
    description: 'Sales management platform',
    start_url: '/home',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#080810',
    theme_color: '#E8634A',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
