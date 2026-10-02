'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { indianGstinSchema, indianMobileSchema } from '@cold-storage/contracts';
import type { Customer } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface CustomerFormModalProps {
  customer: Customer | null;
  selectedFacilityId: string | null;
  userFacilityIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function CustomerFormModal({
  customer,
  selectedFacilityId,
  userFacilityIds = [],
  onClose,
  onSuccess,
}: CustomerFormModalProps) {
  const [formName, setFormName] = useState(customer?.name ?? '');
  const [formMobile, setFormMobile] = useState(customer?.mobile ?? '');
  const [formAddress, setFormAddress] = useState(customer?.address ?? '');
  const [formGstin, setFormGstin] = useState(customer?.gstin ?? '');
  const [formIsActive, setFormIsActive] = useState(customer?.isActive ?? true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const trimmedName = formName.trim();
    const trimmedMobile = formMobile.trim();
    if (!trimmedName) {
      setModalError('Customer name is required');
      return;
    }
    if (!indianMobileSchema.safeParse(trimmedMobile).success) {
      setModalError('Mobile must be a valid 10-digit Indian number (starts with 6-9)');
      return;
    }

    const trimmedGstin = formGstin.trim().toUpperCase();
    if (trimmedGstin && !indianGstinSchema.safeParse(trimmedGstin).success) {
      setModalError('Invalid Indian GSTIN format');
      return;
    }

    const facilityIds = selectedFacilityId ? [selectedFacilityId] : userFacilityIds;
    if (facilityIds.length === 0) {
      setModalError('At least one facility must be selected or assigned');
      return;
    }

    setSubmitting(true);
    try {
      if (customer) {
        const res = await requestWithAuth(`/api/customers/${customer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            mobile: trimmedMobile,
            address: formAddress.trim() || null,
            gstin: trimmedGstin || null,
            isActive: formIsActive,
          }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? 'Failed to update customer');
        }
      } else {
        const res = await requestWithAuth('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            mobile: trimmedMobile,
            address: formAddress.trim() || null,
            gstin: trimmedGstin || null,
            facilityIds,
            isActive: formIsActive,
          }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? 'Failed to register customer');
        }
      }

      onSuccess();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 id="modal-title" className={styles.modalTitle}>
            {customer ? 'Edit Customer' : 'Register New Customer'}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {modalError && (
            <div className={styles.modalError} role="alert">
              {modalError}
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label htmlFor="customer-name" className={styles.fieldLabel}>
              Full Name / Entity Name *
            </label>
            <input
              id="customer-name"
              type="text"
              required
              maxLength={150}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Ramesh Agro Traders"
              className={styles.fieldInput}
              disabled={submitting}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="customer-mobile" className={styles.fieldLabel}>
              Mobile Number (10 Digits) *
            </label>
            <input
              id="customer-mobile"
              type="tel"
              required
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              value={formMobile}
              onChange={(e) => setFormMobile(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 9876543210"
              className={styles.fieldInput}
              disabled={submitting}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="customer-address" className={styles.fieldLabel}>
              Address
            </label>
            <input
              id="customer-address"
              type="text"
              maxLength={300}
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder="Village / Tehsil / City"
              className={styles.fieldInput}
              disabled={submitting}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="customer-gstin" className={styles.fieldLabel}>
              GSTIN (Optional)
            </label>
            <input
              id="customer-gstin"
              type="text"
              maxLength={15}
              value={formGstin}
              onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 06AAAAA1234A1Z5"
              className={styles.fieldInput}
              disabled={submitting}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                disabled={submitting}
              />
              <span>Active KYC & Operational</span>
            </label>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              id="save-customer-btn"
              type="submit"
              className={styles.primaryBtn}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : customer ? 'Update Customer' : 'Register Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
