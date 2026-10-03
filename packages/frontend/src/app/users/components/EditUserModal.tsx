'use client';

import React, { useState } from 'react';
import { AlertCircle, Save } from 'lucide-react';
import { indianMobileSchema, type Role, type UserSummary } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import type { FacilityOption } from '@/context/FacilityContext';
import { toUserEditDraft, type UserEditDraft } from '../hooks/useUserLifecycle';
import styles from '../page.module.css';

interface EditUserModalProps {
  user: UserSummary;
  availableFacilities: FacilityOption[];
  saving: boolean;
  error: string | null;
  onSubmit: (userId: string, draft: UserEditDraft) => Promise<boolean>;
  onClose: () => void;
}

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'OPERATOR', label: 'OPERATOR (Weighbridge, GRN, Put-away, Challan)' },
  { value: 'ADMIN', label: 'ADMIN (Facility Supervisor, Approvals)' },
  { value: 'READ_ONLY', label: 'READ_ONLY (Auditor, Viewer)' },
  { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN (Complete System Authority)' },
];

export function EditUserModal({
  user,
  availableFacilities,
  saving,
  error,
  onSubmit,
  onClose,
}: EditUserModalProps) {
  const [draft, setDraft] = useState<UserEditDraft>(() => toUserEditDraft(user));
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
    <Modal isOpen onClose={onClose} title={`Edit Account — ${user.fullName}`} size="lg">
      <form onSubmit={handleSubmit}>
        <div className={styles.modalBody}>
          {shownError && (
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              <AlertCircle size={16} />
              <span>{shownError}</span>
            </div>
          )}

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
              <select
                id="edit-user-role"
                className={styles.formInput}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
        </div>

        <div className={styles.modalFooter}>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            id="submit-user-edit-btn"
            type="submit"
            variant="primary"
            disabled={saving}
            isLoading={saving}
            leftIcon={!saving ? <Save size={14} /> : undefined}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}