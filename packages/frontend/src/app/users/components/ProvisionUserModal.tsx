'use client';

import React from 'react';
import type { Role } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useProvisionUserForm } from '../hooks/useProvisionUserForm';
import type { FacilityOption } from '@/context/FacilityContext';
import styles from '../page.module.css';

interface ProvisionUserModalProps {
  availableFacilities: FacilityOption[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function ProvisionUserModal({
  availableFacilities,
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
    role,
    setRole,
    selectedFacilityIds,
    handleFacilityToggle,
    temporaryPassword,
    setTemporaryPassword,
    creating,
    createError,
    handleCreateUser,
  } = useProvisionUserForm({
    availableFacilities,
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
                  required
                />
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
                  required
                />
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
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <Select
                  id="user-role"
                  label="Role"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="OPERATOR">OPERATOR (Weighbridge, GRN, Put-away, Challan)</option>
                  <option value="ADMIN">ADMIN (Facility Supervisor, Approvals)</option>
                  <option value="READ_ONLY">READ_ONLY (Auditor, Viewer)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Complete System Authority)</option>
                </Select>
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
                  required
                />
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
                  required
                />
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
                        checked={selectedFacilityIds.includes(fac.id)}
                        onChange={() => handleFacilityToggle(fac.id)}
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
