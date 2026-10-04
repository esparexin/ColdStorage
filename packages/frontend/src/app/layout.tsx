import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@/lib/branding';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import { FacilityProvider } from '@/context/FacilityContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { ResponsiveShell } from '@/components/layout/ResponsiveShell';
import '@/styles/tokens.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: 'Operational dashboard for cold storage facility management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          <FacilityProvider>
            <SettingsProvider>
              <ResponsiveShell>
                {children}
              </ResponsiveShell>
            </SettingsProvider>
          </FacilityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
