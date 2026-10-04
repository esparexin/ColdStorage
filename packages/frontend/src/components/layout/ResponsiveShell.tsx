'use client';

import { useCallback, useState } from 'react';
import { AppHeader } from './AppHeader';
import { SidebarNav } from './SidebarNav';
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { PRODUCT_NAME } from '@/lib/branding';
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
  const { isLoading, user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Stable identities: SidebarNav's route-change effect depends on `onClose`, so an
  // inline arrow would re-fire on every parent render and instantly close the drawer.
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((prev) => !prev), []);

  if (isLoading) {
    return <FeedbackStates.Loading fullPage label="Checking authentication…" />;
  }

  if (!user) {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsSubmitting(true);
      try {
        await login(username, password);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid credentials';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className={styles.loginContainer}>
        <div className={styles.loginCard}>
          <div className={styles.loginHeader}>
            <h1 className={styles.loginTitle}>{PRODUCT_NAME}</h1>
            <p className={styles.loginSubtitle}>Sign in to access your facility dashboard</p>
          </div>

          {error && (
            <div className={styles.loginError} role="alert">
              {error}
            </div>
          )}

          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <Input
              id="username"
              name="username"
              type="text"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              disabled={isSubmitting}
              placeholder="Enter username"
            />

            <Input
              id="current-password"
              name="password"
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              placeholder="Enter password"
            />

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} isLoading={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <SidebarNav isOpen={mobileNavOpen} onClose={closeMobileNav} />
      <div className={styles.main}>
        <AppHeader
          isMobileNavOpen={mobileNavOpen}
          onToggleMobileNav={toggleMobileNav}
        />
        <main className={styles.content} id="main-content">
          {children}
        </main>
      </div>
      {user.mustChangePassword && <ChangePasswordModal isOpen={true} />}
    </div>
  );
}
