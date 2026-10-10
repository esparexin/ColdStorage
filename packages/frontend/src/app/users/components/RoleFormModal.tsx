'use client';

import React, { useState } from 'react';
import {
  PERMISSION_GROUPS,
  type CreateRole,
  type PermissionKey,
  type RoleDefinition,
  type UpdateRole,
} from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import styles from '../page.module.css';

interface RoleFormModalProps {
  role?: RoleDefinition | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: CreateRole | UpdateRole) => Promise<boolean>;
}

function normalizeKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 40);
}

export function RoleFormModal({ role, saving, error, onClose, onSubmit }: RoleFormModalProps) {
  const isEdit = Boolean(role);
  const [key, setKey] = useState(role?.key ?? '');
  const [displayName, setDisplayName] = useState(role?.displayName ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<PermissionKey[]>(role?.permissions as PermissionKey[] ?? []);
  const [localError, setLocalError] = useState<string | null>(null);

  const togglePermission = (perm: PermissionKey) => {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const normalizedKey = normalizeKey(key);
    if (!isEdit && !/^[A-Z][A-Z0-9_]*$/.test(normalizedKey)) {
      return setLocalError('Role key must be UPPER_SNAKE, starting with a letter.');
    }
    if (displayName.trim().length < 2) return setLocalError('Display name is required.');
    if (permissions.length === 0) return setLocalError('Select at least one permission.');
    const input = isEdit
      ? { displayName: displayName.trim(), description: description.trim(), permissions }
      : { key: normalizedKey, displayName: displayName.trim(), description: description.trim(), permissions };
    const ok = await onSubmit(input);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit Role — ${role?.displayName}` : 'Create Custom Role'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" variant="primary" disabled={saving} isLoading={saving}>
            {isEdit ? 'Save Changes' : 'Create Role'}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={handleSubmit}>
        {(localError ?? error) && <Banner message={(localError ?? error) as string} />}
        <div className={styles.formGrid}>
          {!isEdit && (
            <div className={styles.formGroup}>
              <label htmlFor="role-key">Role Key *</label>
              <input
                id="role-key"
                className={styles.formInput}
                value={key}
                onChange={(e) => setKey(normalizeKey(e.target.value))}
                placeholder="e.g. BILLING_CLERK"
                required
              />
            </div>
          )}
          <div className={styles.formGroup}>
            <label htmlFor="role-display">Display Name *</label>
            <input
              id="role-display"
              className={styles.formInput}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Billing Clerk"
              required
            />
          </div>
          <div className={styles.formGroupFull}>
            <label htmlFor="role-desc">Description</label>
            <input
              id="role-desc"
              className={styles.formInput}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for"
              maxLength={280}
            />
          </div>
          {(Object.entries(PERMISSION_GROUPS) as Array<[string, readonly PermissionKey[]]>).map(
            ([group, perms]) => (
              <div key={group} className={styles.formGroupFull}>
                <label>{group}</label>
                <div className={styles.checkboxGrid}>
                  {perms.map((perm) => (
                    <label key={perm} className={styles.checkboxItem}>
                      <input
                        type="checkbox"
                        checked={permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                      />
                      <span>{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </form>
    </Modal>
  );
}
