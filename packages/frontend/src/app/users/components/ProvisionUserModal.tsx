'use client';

import React from 'react';
import type { RoleDefinition } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useProvisionUserForm } from '../hooks/useProvisionUserForm';
import { FacilityFieldset, FieldError } from './UserFormFields';
import type { FacilityOption } from '@/context/FacilityContext';
import styles from '../page.module.css';

interface ProvisionUserModalProps {
  availableFacilities: FacilityOption[];
  availableRoles: RoleDefinition[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function ProvisionUserModal({
  availableFacilities,
  availableRoles,
  onClose,
  onSuccess,
}: ProvisionUserModalProps) {
  const {
    fullName,
    setFullName,
    username,
    setUsername,
    employeeId,
    setEmployeeId,
    mobile,
    setMobile,
    email,
    setEmail,
    roleId,
    setRoleId,
    selectedRole,
    selectedFacilityIds,
    handleFacilityToggle,
    temporaryPassword,
    setTemporaryPassword,
    creating,
    createError,
    fieldErrors,
    handleCreateUser,
  } = useProvisionUserForm({
    availableFacilities,
    availableRoles,
    onClose,
    onSuccess,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Provision New User Account"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            id="submit-user-btn"
            type="submit"
            form="provision-user-form"
            variant="primary"
            disabled={creating}
            isLoading={creating}
          >
            Create Account
          </Button>
        </>
      }
    >
      <form id="provision-user-form" onSubmit={handleCreateUser}>
            {createError && <Banner message={createError} id="provision-error" />}

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label htmlFor="user-fullname">Full Name *</label>
                <input
                  id="user-fullname"
                  className={styles.formInput}
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.fullName)}
                  aria-describedby={fieldErrors.fullName ? 'user-fullname-error' : undefined}
                  required
                />
                <FieldError id="user-fullname-error" message={fieldErrors.fullName} />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="user-username">Username *</label>
                <input
                  id="user-username"
                  className={styles.formInput}
                  type="text"
                  placeholder="e.g. ramesh.k"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'user-username-error' : undefined}
                  required
                />
                <FieldError id="user-username-error" message={fieldErrors.username} />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="user-empid">Employee ID *</label>
                <input
                  id="user-empid"
                  className={styles.formInput}
                  type="text"
                  placeholder="e.g. EMP-1042"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.employeeId)}
                  aria-describedby={fieldErrors.employeeId ? 'user-empid-error' : undefined}
                  required
                />
                <FieldError id="user-empid-error" message={fieldErrors.employeeId} />
              </div>

              <div className={styles.formGroup}>
                <Select
                  id="user-role"
                  label="Role"
                  required
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                >
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.displayName} ({r.key})
                    </option>
                  ))}
                </Select>
                <FieldError id="user-role-error" message={fieldErrors.role} />
                {selectedRole && (
                  <p className={styles.unauthorizedHint} aria-live="polite">
                    {selectedRole.permissions.length} permissions
                    {selectedRole.hasGlobalFacilityScope ? ' · all facilities' : ''} —{' '}
                    {selectedRole.description || selectedRole.key}
                  </p>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="user-mobile">Mobile (10 Digits) *</label>
                <input
                  id="user-mobile"
                  className={styles.formInput}
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  maxLength={10}
                  aria-invalid={Boolean(fieldErrors.mobile)}
                  aria-describedby={fieldErrors.mobile ? 'user-mobile-error' : undefined}
                  required
                />
                <FieldError id="user-mobile-error" message={fieldErrors.mobile} />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="user-email">Email Address *</label>
                <input
                  id="user-email"
                  className={styles.formInput}
                  type="email"
                  placeholder="e.g. ramesh@coldstorage.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'user-email-error' : undefined}
                  required
                />
                <FieldError id="user-email-error" message={fieldErrors.email} />
              </div>

              <div className={styles.formGroupFull}>
                <label htmlFor="user-temp-password">Initial Temporary Password *</label>
                <input
                  id="user-temp-password"
                  className={styles.formInput}
                  type="password"
                  placeholder="Minimum 8 characters (forced reset on first login)"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.temporaryPassword)}
                  aria-describedby={fieldErrors.temporaryPassword ? 'user-temp-password-error' : undefined}
                  required
                />
                <FieldError id="user-temp-password-error" message={fieldErrors.temporaryPassword} />
              </div>

              <FacilityFieldset
                facilities={availableFacilities}
                selectedIds={selectedFacilityIds}
                error={fieldErrors.facilities}
                onToggle={handleFacilityToggle}
              />
            </div>

      </form>
    </Modal>
  );
}
