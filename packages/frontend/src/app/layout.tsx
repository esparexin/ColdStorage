import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import { FacilityProvider } from '@/context/FacilityContext';
import { ResponsiveShell } from '@/components/layout/ResponsiveShell';
import '@/styles/tokens.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cold Storage Management',
  description: 'Operational dashboard for cold storage facility management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          <FacilityProvider>
            <ResponsiveShell>
              {children}
            </ResponsiveShell>
          </FacilityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
