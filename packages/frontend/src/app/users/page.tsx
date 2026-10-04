'use client';

import React, { useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { can, type Role, type UserSummary } from '@cold-storage/contracts';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { UserFilterBar } from './components/UserFilterBar';
import { UserLifecycleModals } from './components/UserLifecycleModals';
import { UserTable } from './components/UserTable';
import { useUserLifecycle, type UserEditDraft } from './hooks/useUserLifecycle';
import { useUsersData } from './hooks/useUsersData';
import styles from './page.module.css';

export default function UsersPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'user:manage');
  const { availableFacilities } = useFacility();

  const {
    totalUsers,
    page,
    setPage,
    totalPages,
    loadingUsers,
    facilityNameMap,
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    filteredUsers,
    fetchUsers,
  } = useUsersData(canManage);

  const [showModal, setShowModal] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [resettingUser, setResettingUser] = useState<UserSummary | null>(null);

  const lifecycle = useUserLifecycle(() => {
    void fetchUsers();
  });

  const handleEditUser = async (userId: string, draft: UserEditDraft) => {
    const updated = await lifecycle.submitEdit(userId, draft);
    if (updated) {
      setActionSuccess(`Account "${updated.username}" updated successfully.`);
    }
    return updated !== null;
  };

  const handleResetPassword = async (userId: string, temporaryPassword: string) => {
    const ok = await lifecycle.resetPassword(userId, temporaryPassword);
    if (ok) {
      setActionSuccess('Temporary password issued. The user must change it at first login.');
    }
    return ok;
  };

  const handleToggleStatus = async (target: UserSummary) => {
    const nextStatus = target.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const ok = await lifecycle.setUserStatus(target, nextStatus);
    if (ok) {
      setActionSuccess(
        nextStatus === 'DISABLED'
          ? `Account "${target.username}" disabled and its sessions revoked.`
          : `Account "${target.username}" re-enabled.`,
      );
    }
  };

  if (!canManage) {
    return (
      <div className={styles.container}>
        <Card className={styles.restrictedRow}>
          <ShieldAlert size={20} color="var(--color-danger)" aria-hidden="true" />
          <div>
            <p className={styles.unauthorizedTitle}>Restricted Access</p>
            <p className={styles.unauthorizedHint}>
              Requires the &lsquo;user:manage&rsquo; permission.
            </p>
          </div>
      </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1>User Management & Access Control</h1>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={() => void fetchUsers()}
            disabled={loadingUsers}
            aria-label="Refresh users list"
            leftIcon={<RefreshCw size={16} className={loadingUsers ? styles.spinning : ''} />}
          >
            Refresh
          </Button>
          <Button
            id="create-user-button"
            variant="primary"
            onClick={() => setShowModal(true)}
            leftIcon={<Plus size={16} />}
          >
            Provision User
          </Button>
        </div>
      </header>

      {actionSuccess && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      <UserFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
      />

      <section className={styles.tableSection}>
        <UserTable
          users={filteredUsers}
          totalUsers={totalUsers}
          loading={loadingUsers}
          page={page}
          totalPages={totalPages}
          searchTerm={searchTerm}
          roleFilter={roleFilter}
          facilityNameMap={facilityNameMap}
          currentUserId={user?.userId ?? null}
          actionsBusy={lifecycle.saving}
          onPageChange={setPage}
          onOpenCreate={() => setShowModal(true)}
          onEditUser={setEditingUser}
          onResetPassword={setResettingUser}
          onToggleStatus={(target) => void handleToggleStatus(target)}
        />
      </section>

      <UserLifecycleModals
        provisioningOpen={showModal}
        editingUser={editingUser}
        resettingUser={resettingUser}
        availableFacilities={availableFacilities}
        saving={lifecycle.saving}
        error={lifecycle.actionError}
        onCloseProvisioning={() => setShowModal(false)}
        onProvisioned={(msg) => {
          setActionSuccess(msg);
          void fetchUsers();
        }}
        onCloseEdit={() => {
          setEditingUser(null);
          lifecycle.setActionError(null);
        }}
        onSubmitEdit={handleEditUser}
        onCloseReset={() => {
          setResettingUser(null);
          lifecycle.setActionError(null);
        }}
        onSubmitReset={handleResetPassword}
      />
    </div>
  );
}
