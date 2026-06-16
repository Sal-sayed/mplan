import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { validateEnv } from '@/lib/env-validation';
import ThemeToggle from '@/components/ThemeToggle';

// Applies the theme before first paint (no flash): dark is the default; switch to
// light only if the user chose it (or the OS prefers light and they never chose).
// Mirrors ThemeToggle's logic. Kept as a raw string so it runs during HTML parse.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

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
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="h-screen w-screen overflow-hidden">
        <div className="h-screen w-screen overflow-hidden relative">{children}</div>
        {/* Always-available theme switch, above every screen. */}
        <ThemeToggle className="fixed bottom-4 right-4 z-[100] shadow-lg" />
      </body>
    </html>
  );
}
