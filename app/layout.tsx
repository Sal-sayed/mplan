import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { validateEnv } from '@/lib/env-validation';

// Runs once at server module load — fails fast if required vars are missing.
validateEnv();

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Web Analytics Measurement Plan Agent',
  description: 'Generate production-ready analytics measurement plans for any website.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="h-screen w-screen overflow-hidden">
        <div className="h-screen w-screen overflow-hidden relative">{children}</div>
      </body>
    </html>
  );
}
