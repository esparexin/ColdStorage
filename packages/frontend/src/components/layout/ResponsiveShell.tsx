'use client';

import { AppHeader } from './AppHeader';
import { SidebarNav } from './SidebarNav';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import styles from './ResponsiveShell.module.css';

interface ResponsiveShellProps {
  children: React.ReactNode;
}

/**
 * ResponsiveShell — responsive application layout with loading gate.
 *
 * While AuthContext.isLoading is true (bootstrap not yet resolved),
 * renders a full-page loading spinner. Child routes are NOT mounted.
 * This prevents any protected API requests from executing before the
 * access token is available.
 */
export function ResponsiveShell({ children }: ResponsiveShellProps) {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <FeedbackStates.Loading fullPage label="Checking authentication…" />;
  }

  if (!user) {
    // Auth-gated: redirect to login handled by middleware or login page
    return null;
  }

  return (
    <div className={styles.shell}>
      <SidebarNav />
      <div className={styles.main}>
        <AppHeader />
        <main className={styles.content} id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
