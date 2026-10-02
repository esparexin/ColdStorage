'use client';

import React from 'react';
import { AlertCircle, RefreshCw, UserPlus, X } from 'lucide-react';
import type { Role } from '@cold-storage/contracts';
import { useProvisionUserForm } from '../hooks/useProvisionUserForm';
import type { FacilityOption } from '../types';
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
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2 id="modal-title">Provision New User Account</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreateUser}>
          <div className={styles.modalBody}>
            {createError && (
              <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
                <AlertCircle size={16} />
                <span>{createError}</span>
              </div>
            )}

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
                <label htmlFor="user-role">Role *</label>
                <select
                  id="user-role"
                  className={styles.formInput}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="OPERATOR">OPERATOR (Weighbridge, GRN, Put-away, Challan)</option>
                  <option value="ADMIN">ADMIN (Facility Supervisor, Approvals)</option>
                  <option value="READ_ONLY">READ_ONLY (Auditor, Viewer)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Complete System Authority)</option>
                </select>
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
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="submit-user-btn"
              className={styles.primaryBtn}
              disabled={creating}
            >
              {creating ? (
                <>
                  <RefreshCw size={14} className={styles.spinning} />
                  <span>Provisioning...</span>
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  <span>Provision User</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
