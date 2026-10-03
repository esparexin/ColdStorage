'use client';

import React, { useState } from 'react';
import { customerNameSchema, type Customer } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { Button, Input, Modal } from '@/components/ui';
import styles from '../page.module.css';

interface CustomerFormModalProps {
  customer: Customer | null;
  selectedFacilityId: string | null;
  existingCustomers?: Customer[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Customer identity is a single name (max 50 characters, special characters allowed). Facility
 * scope comes from the app's facility selector rather than a form field, and active status is
 * only editable when updating an existing record.
 */
export function CustomerFormModal({
  customer,
  selectedFacilityId,
  existingCustomers,
  onClose,
  onSuccess,
}: CustomerFormModalProps) {
  const [formName, setFormName] = useState(customer?.name ?? '');
  const [formIsActive, setFormIsActive] = useState(customer?.isActive ?? true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // Reuse the shared contract validator so the browser cannot accept a name the API rejects.
    const parsedName = customerNameSchema.safeParse(formName.trim());
    if (!parsedName.success) {
      setModalError(parsedName.error.issues[0]?.message ?? 'Customer name is invalid');
      return;
    }
    const name = parsedName.data;

    const duplicate = existingCustomers?.find(
      (c) => c.id !== customer?.id && c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setModalError(`Customer with name '${name}' already exists`);
      return;
    }

    if (!customer && !selectedFacilityId) {
      setModalError('Select a facility before registering a customer');
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestWithAuth(
        customer ? `/api/customers/${customer.id}` : '/api/customers',
        {
          method: customer ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            customer ? { name, isActive: formIsActive } : { name, facilityId: selectedFacilityId },
          ),
        },
      );

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? (customer ? 'Failed to update customer' : 'Failed to register customer'));
      }

      onSuccess();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={customer ? 'Edit Customer' : 'Register New Customer'}
      size="md"
    >
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {modalError && (
          <div className={styles.modalError} role="alert">
            {modalError}
          </div>
        )}

        <Input
          id="customer-name"
          label="Customer Name"
          type="text"
          required
          maxLength={50}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Ramesh Agro Traders"
          disabled={submitting}
        />

        {customer && (
          <div className={styles.fieldGroup}>
            <label htmlFor="customer-is-active" className={styles.checkboxLabel}>
              <input
                id="customer-is-active"
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                disabled={submitting}
              />
              <span>Active</span>
            </label>
          </div>
        )}

        <div className={styles.modalFooter}>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            id="save-customer-btn"
            type="submit"
            variant="primary"
            isLoading={submitting}
          >
            {customer ? 'Update Customer' : 'Register Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}