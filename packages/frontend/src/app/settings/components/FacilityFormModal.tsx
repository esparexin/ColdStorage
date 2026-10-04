'use client';

import React, { useState } from 'react';
import type { Facility } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { Button, Input, Modal } from '@/components/ui';
import styles from './FacilitySection.module.css';

export function FacilityFormModal({
  facility,
  onClose,
  onSaved,
}: {
  facility: Facility | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(facility?.name ?? '');
  const [code, setCode] = useState(facility?.code ?? '');
  const [address, setAddress] = useState(facility?.address ?? '');
  const [isActive, setIsActive] = useState(facility?.isActive ?? true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The facility form owns its submission. Without this, the native submit event bubbles to
    // any ancestor <form> and triggers an unrelated settings write alongside the facility write.
    e.stopPropagation();
    setModalError(null);

    if (!name.trim() || !code.trim()) {
      setModalError('Facility name and code are required');
      return;
    }

    setSaving(true);
    try {
      const res = await requestWithAuth(facility ? `/api/facilities/${facility.id}` : '/api/facilities', {
        method: facility ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          address: address.trim() || null,
          isActive,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? (facility ? 'Failed to update facility' : 'Failed to create facility'));
      }
      onSaved();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={facility ? 'Edit Facility' : 'Add Facility'}
      size="md"
    >
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {modalError && (
          <div className={styles.modalError} role="alert">
            {modalError}
          </div>
        )}

        <Input
          id="facility-name"
          label="Facility Name"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Karnal Main Cold Storage"
          disabled={saving}
        />
        <Input
          id="facility-code"
          label="Facility Code"
          type="text"
          required
          maxLength={30}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. KNL-01"
          disabled={saving}
        />
        <Input
          id="facility-address"
          label="Address"
          type="text"
          maxLength={300}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Plot 45, Industrial Area, Karnal"
          disabled={saving}
        />

        {facility && (
          <div className={styles.fieldGroup}>
            <label htmlFor="facility-is-active" className={styles.checkboxLabel}>
              <input
                id="facility-is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              <span>Active</span>
            </label>
          </div>
        )}

        <div className={styles.modalFooter}>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button id="save-facility-btn" type="submit" variant="primary" isLoading={saving}>
            {facility ? 'Update Facility' : 'Add Facility'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}