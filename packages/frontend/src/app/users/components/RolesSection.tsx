'use client';

import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { CreateRole, RoleDefinition, UpdateRole, UserSummary } from '@cold-storage/contracts';
import { Banner, Button, Card, ConfirmDialog } from '@/components/ui';
import { useRolesData } from '../hooks/useRolesData';
import { RoleFormModal } from './RoleFormModal';
import { RolesTable } from './RolesTable';
import styles from '../page.module.css';

interface RolesSectionProps {
  users: UserSummary[];
  canManageRoles: boolean;
  onChanged: () => void;
}

export function RolesSection({ users, canManageRoles, onChanged }: RolesSectionProps) {
  const { roles, loading, error, saving, actionError, setActionError, fetchRoles, createRole, updateRole, deleteRole } =
    useRolesData(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<RoleDefinition | null>(null);
  const [deleting, setDeleting] = useState<RoleDefinition | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const userCountByRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of users) {
      const roleId = user.roleId ?? user.role;
      counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
      const match = roles.find((r) => r.key === user.role);
      if (match) counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
    }
    return counts;
  }, [users, roles]);

  const handleCreate = async (input: CreateRole | UpdateRole) => {
    const created = await createRole(input as CreateRole);
    if (created) {
      setSuccess(`Role "${created.key}" created.`);
      onChanged();
    }
    return created !== null;
  };

  const handleUpdate = async (input: CreateRole | UpdateRole) => {
    if (!editing) return false;
    const updated = await updateRole(editing.id, input as UpdateRole);
    if (updated) {
      setSuccess(`Role "${updated.key}" updated.`);
      setEditing(null);
      onChanged();
    }
    return updated !== null;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const ok = await deleteRole(deleting.id);
    if (ok) {
      setSuccess(`Role "${deleting.key}" deleted.`);
      setDeleting(null);
      onChanged();
    }
  };

  return (
    <section className={styles.tableSection} aria-label="Role configuration">
      <header className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Configurable Roles</h2>
          <p className={styles.warningNote}>System roles are locked. Custom roles grant subsets of permissions.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={() => void fetchRoles()} disabled={loading} aria-label="Refresh roles">
            <RefreshCw size={16} className={loading ? styles.spinning : ''} aria-hidden="true" /> Refresh
          </Button>
          {canManageRoles && (
            <Button variant="primary" onClick={() => setShowCreate(true)} leftIcon={<Plus size={16} />}>
              Create Role
            </Button>
          )}
        </div>
      </header>

      {success && <Banner variant="success" message={success} />}
      {actionError && <Banner message={actionError} />}

      <Card>
        <RolesTable
          roles={roles}
          loading={loading}
          error={error}
          userCountByRole={userCountByRole}
          canManageRoles={canManageRoles}
          onRetry={() => void fetchRoles()}
          onEdit={setEditing}
          onDelete={setDeleting}
          onCreate={() => setShowCreate(true)}
        />
      </Card>

      {showCreate && (
        <RoleFormModal
          saving={saving}
          error={actionError}
          onClose={() => {
            setShowCreate(false);
            setActionError(null);
          }}
          onSubmit={handleCreate}
        />
      )}
      {editing && (
        <RoleFormModal
          role={editing}
          saving={saving}
          error={actionError}
          onClose={() => {
            setEditing(null);
            setActionError(null);
          }}
          onSubmit={handleUpdate}
        />
      )}
      {deleting && (
        <ConfirmDialog
          isOpen
          title={`Delete role ${deleting.key}?`}
          message="Custom roles assigned to users cannot be deleted. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
