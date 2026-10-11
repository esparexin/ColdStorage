'use client';

import React, { useEffect, useState } from 'react';
import { indianMobileSchema, type RoleDefinition, type UserSummary } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import type { FacilityOption } from '@/context/FacilityContext';
import { toUserEditDraft, type UserEditDraft } from '../hooks/useUserLifecycle';
import { FacilityFieldset, FieldError } from './UserFormFields';
import styles from '../page.module.css';

interface EditUserModalProps {
  user: UserSummary;
  availableFacilities: FacilityOption[];
  availableRoles: RoleDefinition[];
  saving: boolean;
  error: string | null;
  onSubmit: (userId: string, draft: UserEditDraft) => Promise<boolean>;
  onClose: () => void;
}

export function EditUserModal({
  user,
  availableFacilities,
  availableRoles,
  saving,
  error,
  onSubmit,
  onClose,
}: EditUserModalProps) {
  const [draft, setDraft] = useState<UserEditDraft>(() => {
    const base = toUserEditDraft(user);
    const matched = availableRoles.find((r) => r.id === base.roleId)
      ?? availableRoles.find((r) => r.key === base.role);
    return { ...base, roleId: matched?.id ?? base.roleId, role: (matched?.key as UserEditDraft['role']) ?? base.role };
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Roles load asynchronously after the modal mounts; reconcile the stored
  // roleId/key once the catalog arrives without clobbering user edits.
  useEffect(() => {
    setDraft((prev) => {
      const matched = availableRoles.find((r) => r.id === prev.roleId)
        ?? availableRoles.find((r) => r.key === prev.role);
      if (!matched || matched.id === prev.roleId) return prev;
      return { ...prev, roleId: matched.id, role: matched.key as UserEditDraft['role'] };
    });
  }, [availableRoles]);

  const toggleFacility = (facilityId: string) => {
    setDraft((prev) => ({
      ...prev,
      facilityIds: prev.facilityIds.includes(facilityId)
        ? prev.facilityIds.filter((id) => id !== facilityId)
        : [...prev.facilityIds, facilityId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const errors: Record<string, string> = {};
    if (!draft.fullName.trim()) errors.fullName = 'Full name is required.';
    if (!indianMobileSchema.safeParse(draft.mobile.trim()).success) {
      errors.mobile = 'Mobile must be a valid 10-digit Indian number starting with 6-9.';
    }
    if (!draft.email.trim() || !draft.email.includes('@')) {
      errors.email = 'A valid email address is required.';
    }
    if (!draft.roleId && !draft.role) errors.role = 'A role must be selected.';
    if (draft.facilityIds.length === 0) {
      errors.facilities = 'User must be assigned to at least one facility.';
    }
    setFieldErrors(errors);
    const firstError = Object.values(errors)[0];
    if (firstError) return setLocalError(firstError);

    const succeeded = await onSubmit(user.id, draft);
    if (succeeded) onClose();
  };

  const shownError = localError ?? error;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit Account — ${user.fullName}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            id="submit-user-edit-btn"
            type="submit"
            form="edit-user-form"
            variant="primary"
            disabled={saving}
            isLoading={saving}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={handleSubmit}>
          {shownError && <Banner message={shownError} id="edit-user-error" />}

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label htmlFor="edit-user-fullname">Full Name *</label>
              <input
                id="edit-user-fullname"
                className={styles.formInput}
                type="text"
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                aria-invalid={Boolean(fieldErrors.fullName)}
                aria-describedby={fieldErrors.fullName ? 'edit-user-fullname-error' : undefined}
                required
              />
              <FieldError id="edit-user-fullname-error" message={fieldErrors.fullName} />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-user-role">Role *</label>
              <Select
                id="edit-user-role"
                className={styles.formInput}
                value={draft.roleId ?? ''}
                onChange={(e) => {
                  const selected = availableRoles.find((r) => r.id === e.target.value);
                  if (!selected) return;
                  setDraft({
                    ...draft,
                    roleId: selected.id,
                    role: selected.key as UserEditDraft['role'],
                  });
                }}
              >
                {availableRoles.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.displayName} ({opt.key})
                  </option>
                ))}
              </Select>
              <FieldError id="edit-user-role-error" message={fieldErrors.role} />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-user-mobile">Mobile (10 Digits) *</label>
              <input
                id="edit-user-mobile"
                className={styles.formInput}
                type="tel"
                maxLength={10}
                value={draft.mobile}
                onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
                aria-invalid={Boolean(fieldErrors.mobile)}
                aria-describedby={fieldErrors.mobile ? 'edit-user-mobile-error' : undefined}
                required
              />
              <FieldError id="edit-user-mobile-error" message={fieldErrors.mobile} />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-user-email">Email Address *</label>
              <input
                id="edit-user-email"
                className={styles.formInput}
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'edit-user-email-error' : undefined}
                required
              />
              <FieldError id="edit-user-email-error" message={fieldErrors.email} />
            </div>

            <FacilityFieldset
              facilities={availableFacilities}
              selectedIds={draft.facilityIds}
              error={fieldErrors.facilities}
              onToggle={toggleFacility}
            />
          </div>
      </form>
    </Modal>
  );
}