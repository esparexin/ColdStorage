'use client';

import { useState } from 'react';
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
  const { isLoading, user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
            <h1 className={styles.loginTitle}>Cold Storage Management</h1>
            <p className={styles.loginSubtitle}>Sign in to access your facility dashboard</p>
          </div>

          {error && (
            <div className={styles.loginError} role="alert">
              {error}
            </div>
          )}

          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <div className={styles.fieldGroup}>
              <label htmlFor="username" className={styles.fieldLabel}>
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                className={styles.fieldInput}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                required
                disabled={isSubmitting}
                placeholder="Enter username"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="current-password" className={styles.fieldLabel}>
                Password
              </label>
              <input
                id="current-password"
                name="password"
                type="password"
                className={styles.fieldInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                placeholder="Enter password"
              />
            </div>

            <button type="submit" className={styles.loginButton} disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <SidebarNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className={styles.main}>
        <AppHeader
          isMobileNavOpen={mobileNavOpen}
          onToggleMobileNav={() => setMobileNavOpen((prev) => !prev)}
        />
        <main className={styles.content} id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
