'use client';

/**
 * AuthContext — owns authenticated user state, bootstrap lifecycle,
 * and login/logout actions.
 *
 * Ownership:
 *   - user: User | null  (authenticated user state)
 *   - isLoading: boolean  (bootstrap state — true until first refresh resolves)
 *   - login / logout actions
 *
 * It does NOT own the access token value.
 * The access token lives exclusively in api-client.ts (browser memory).
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { executeSingleFlightRefresh, requestWithAuth, setAccessToken } from '@/lib/api-client';

export interface AuthUser {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  facilityIds: string[];
  mustChangePassword?: boolean;
}

interface RawAuthUserData {
  id?: string;
  userId?: string;
  username: string;
  fullName: string;
  role: string;
  facilityIds: string[];
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Bootstrap: attempt silent refresh on mount.
  // While isLoading === true, ResponsiveShell renders the full-page spinner.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const result = await executeSingleFlightRefresh<RawAuthUserData>();
        if (cancelled) return;

        if (result?.user) {
          const raw = result.user;
          setUser({
            userId: raw.userId ?? raw.id ?? '',
            username: raw.username,
            fullName: raw.fullName,
            role: raw.role,
            facilityIds: raw.facilityIds,
            mustChangePassword: Boolean(raw.mustChangePassword),
          });
        } else {
          setAccessToken(null);
          setUser(null);
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? 'Login failed');
    }

    const data = (await res.json()) as {
      token?: string;
      accessToken?: string;
      user: RawAuthUserData;
      mustChangePassword?: boolean;
    };
    const token = data.token ?? data.accessToken ?? null;
    setAccessToken(token);
    setUser({
      userId: data.user.userId ?? data.user.id ?? '',
      username: data.user.username,
      fullName: data.user.fullName,
      role: data.user.role,
      facilityIds: data.user.facilityIds,
      mustChangePassword: Boolean(data.mustChangePassword ?? data.user.mustChangePassword),
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestWithAuth('/api/auth/logout', { method: 'POST' });
    } catch {
      // best-effort logout
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await requestWithAuth('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Password change failed');
      }

      if (user) {
        await login(user.username, newPassword);
      }
    },
    [user, login],
  );

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
