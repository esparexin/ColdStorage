'use client';

import { useCallback, useState } from 'react';
import type { Role, UserStatus, UserSummary } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export interface UserEditDraft {
  fullName: string;
  mobile: string;
  email: string;
  role: Role;
  facilityIds: string[];
}

export function toUserEditDraft(user: UserSummary): UserEditDraft {
  return {
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    facilityIds: [...user.facilityIds],
  };
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (HTTP ${res.status})`);
}

/**
 * Owns the user lifecycle mutations (profile/role/scope update, activation toggle, and
 * Admin-issued temporary password reset). All network calls go through the canonical
 * `requestWithAuth` client so token refresh stays single-owner in `lib/api-client`.
 */
export function useUserLifecycle(onMutated: () => void) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const patchUser = useCallback(
    async (
      userId: string,
      patch: Partial<{
        fullName: string;
        mobile: string;
        email: string;
        role: Role;
        facilityIds: string[];
        status: UserStatus;
      }>,
    ): Promise<UserSummary | null> => {
      setSaving(true);
      setActionError(null);
      try {
        const res = await requestWithAuth(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          throw await readError(res, 'User update failed');
        }
        const data = (await res.json()) as { user: UserSummary };
        onMutated();
        return data.user;
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'User update failed');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [onMutated],
  );

  const setUserStatus = useCallback(
    async (user: UserSummary, status: UserStatus): Promise<boolean> => {
      const updated = await patchUser(user.id, { status });
      if (updated) {
        setActionError(null);
      }
      return updated !== null;
    },
    [patchUser],
  );

  const resetPassword = useCallback(
    async (userId: string, temporaryPassword: string): Promise<boolean> => {
      setSaving(true);
      setActionError(null);
      try {
        const res = await requestWithAuth(
          `/api/users/${encodeURIComponent(userId)}/reset-password`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temporaryPassword }),
          },
        );
        if (!res.ok) {
          throw await readError(res, 'Password reset failed');
        }
        onMutated();
        return true;
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Password reset failed');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onMutated],
  );

  return { saving, actionError, setActionError, patchUser, setUserStatus, resetPassword };
}