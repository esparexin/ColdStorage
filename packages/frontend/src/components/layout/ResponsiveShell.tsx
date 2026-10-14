'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from './AppHeader';
import { SidebarNav } from './SidebarNav';
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner, type BannerVariant } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { useNumberInputWheel } from '@/hooks/useNumberInputWheel';
import { formatCountdown, LoginApiError } from '@/lib/auth-errors';
import { LOGIN_BACKGROUND_IMAGE_URL, PRODUCT_NAME } from '@/lib/branding';
import { sanitizeReturnUrl } from '@/lib/safe-url';
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
  useNumberInputWheel();
  const { isLoading, user, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorVariant, setErrorVariant] = useState<BannerVariant>('error');
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Stable identities: SidebarNav's route-change effect depends on `onClose`, so an
  // inline arrow would re-fire on every parent render and instantly close the drawer.
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((prev) => !prev), []);

  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setError('Lockout period ended. You can try signing in again.');
          setErrorVariant('info');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (!isLoading && !user && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const returnUrl = window.location.pathname + window.location.search;
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return <FeedbackStates.Loading fullPage label={LOADING_LABELS.auth} />;
  }

  if (!user) {
    const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;
    const displayError = isLocked
      ? `Too many login attempts. Please wait ${formatCountdown(lockoutSeconds)} before trying again.`
      : error;

    const buttonLabel = isSubmitting
      ? LOADING_LABELS.signingIn
      : isLocked
        ? `Retry in ${formatCountdown(lockoutSeconds)}`
        : 'Sign In';

    const isSessionExpired =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('expired') === 'true';

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setError(null);
      setErrorVariant('error');
      setIsSubmitting(true);
      try {
        await login(username, password);
        if (typeof window !== 'undefined') {
          const rawReturnUrl = new URLSearchParams(window.location.search).get('returnUrl');
          const safeReturnUrl = sanitizeReturnUrl(rawReturnUrl);
          router.replace(safeReturnUrl);
        }
      } catch (err: unknown) {
        if (err instanceof LoginApiError) {
          if (err.isRateLimit && err.retryAfterSeconds) {
            setLockoutSeconds(err.retryAfterSeconds);
            setError(null);
          } else {
            setError(err.message);
            setErrorVariant('error');
          }
        } else {
          const message = err instanceof Error ? err.message : 'Invalid credentials';
          setError(message);
          setErrorVariant('error');
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setUsername(e.target.value);
      if (!isLocked && error) {
        setError(null);
      }
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      if (!isLocked && error) {
        setError(null);
      }
    };

    return (
      <div
        className={styles.loginContainer}
        style={{ backgroundImage: `url(${LOGIN_BACKGROUND_IMAGE_URL})` }}
      >
        <div className={styles.loginOverlay} aria-hidden="true" />
        <div className={styles.loginCard}>
          <div className={styles.loginHeader}>
            <h1 className={styles.loginTitle}>{PRODUCT_NAME}</h1>
            <p className={styles.loginSubtitle}>Sign in to access your facility dashboard</p>
          </div>

          {isSessionExpired && !displayError && (
            <Banner variant="info" message="Your session has expired. Please sign in again." id="session-expired-banner" />
          )}

          {displayError && <Banner variant={isLocked ? 'error' : errorVariant} message={displayError} id="login-error" />}

          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <Input
              id="username"
              name="username"
              type="text"
              label="Username"
              value={username}
              onChange={handleUsernameChange}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              disabled={isSubmitting || isLocked}
              placeholder="Enter username"
            />

            <Input
              id="current-password"
              name="password"
              type="password"
              label="Password"
              value={password}
              onChange={handlePasswordChange}
              autoComplete="current-password"
              required
              disabled={isSubmitting || isLocked}
              placeholder="Enter password"
            />

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting || isLocked} isLoading={isSubmitting}>
              {buttonLabel}
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
