'use client';

import React, { useState } from 'react';
import { indianMobileSchema, type RoleDefinition, type UserSummary } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import type { FacilityOption } from '@/context/FacilityContext';
import { toUserEditDraft, type UserEditDraft } from '../hooks/useUserLifecycle';
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

    if (!draft.fullName.trim()) return setLocalError('Full name is required.');
    const mobileCheck = indianMobileSchema.safeParse(draft.mobile.trim());
    if (!mobileCheck.success) {
      return setLocalError('Mobile must be a valid 10-digit Indian number starting with 6-9.');
    }
    if (!draft.email.trim() || !draft.email.includes('@')) {
      return setLocalError('A valid email address is required.');
    }
    if (draft.facilityIds.length === 0) {
      return setLocalError('User must be assigned to at least one facility.');
    }

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
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-user-role">Role *</label>
              <Select
                id="edit-user-role"
                className={styles.formInput}
                value={draft.roleId ?? draft.role}
                onChange={(e) => {
                  const selected = availableRoles.find((r) => r.id === e.target.value);
                  setDraft({
                    ...draft,
                    roleId: selected?.id,
                    role: (selected?.key as UserEditDraft['role']) ?? draft.role,
                  });
                }}
              >
                {availableRoles.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.displayName} ({opt.key})
                  </option>
                ))}
              </Select>
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
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-user-email">Email Address *</label>
              <input
                id="edit-user-email"
                className={styles.formInput}
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                required
              />
            </div>

            <div className={styles.formGroupFull}>
              <label>Assign Facilities (At least one required) *</label>
              <div className={styles.checkboxGrid}>
                {availableFacilities.map((fac) => (
                  <label key={fac.id} className={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={draft.facilityIds.includes(fac.id)}
                      onChange={() => toggleFacility(fac.id)}
                    />
                    <span>
                      {fac.name} ({fac.code})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
      </form>
    </Modal>
  );
}