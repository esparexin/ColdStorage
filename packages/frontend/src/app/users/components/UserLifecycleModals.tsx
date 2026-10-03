'use client';

import React from 'react';
import type { UserSummary } from '@cold-storage/contracts';
import type { FacilityOption } from '@/context/FacilityContext';
import type { UserEditDraft } from '../hooks/useUserLifecycle';
import { EditUserModal } from './EditUserModal';
import { ProvisionUserModal } from './ProvisionUserModal';
import { ResetPasswordModal } from './ResetPasswordModal';

interface UserLifecycleModalsProps {
  provisioningOpen: boolean;
  editingUser: UserSummary | null;
  resettingUser: UserSummary | null;
  availableFacilities: FacilityOption[];
  saving: boolean;
  error: string | null;
  onCloseProvisioning: () => void;
  onProvisioned: (message: string) => void;
  onCloseEdit: () => void;
  onSubmitEdit: (userId: string, draft: UserEditDraft) => Promise<boolean>;
  onCloseReset: () => void;
  onSubmitReset: (userId: string, temporaryPassword: string) => Promise<boolean>;
}

/**
 * Groups the user lifecycle dialogs so the route coordinator only decides which dialog is
 * open. Extracted from `page.tsx` to keep the page a coordinator rather than a dialog host.
 */
export function UserLifecycleModals({
  provisioningOpen,
  editingUser,
  resettingUser,
  availableFacilities,
  saving,
  error,
  onCloseProvisioning,
  onProvisioned,
  onCloseEdit,
  onSubmitEdit,
  onCloseReset,
  onSubmitReset,
}: UserLifecycleModalsProps) {
  return (
    <>
      {provisioningOpen && (
        <ProvisionUserModal
          availableFacilities={availableFacilities}
          onClose={onCloseProvisioning}
          onSuccess={onProvisioned}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          availableFacilities={availableFacilities}
          saving={saving}
          error={error}
          onSubmit={onSubmitEdit}
          onClose={onCloseEdit}
        />
      )}

      {resettingUser && (
        <ResetPasswordModal
          user={resettingUser}
          saving={saving}
          error={error}
          onSubmit={onSubmitReset}
          onClose={onCloseReset}
        />
      )}
    </>
  );
}