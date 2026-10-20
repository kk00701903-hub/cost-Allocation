import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '../ui/PwaRegister';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: '공동물류 원가배분',
  description: '손익관리 · 공동물류 원가배분 13개 메뉴',
  applicationName: '공동물류 원가배분',
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '원가배분',
  },
  icons: {
    icon: [
      { url: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { url: `${base}/icons/icon.svg`, type: 'image/svg+xml' },
    ],
    apple: [{ url: `${base}/icons/icon-192.png`, sizes: '192x192' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16325C' },
    { media: '(prefers-color-scheme: dark)', color: '#16325C' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
