'use client';

import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { type UserSummary } from '@cold-storage/contracts';
import { Banner, Card } from '@/components/ui';
import { ACCESS_MESSAGES } from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useFacility } from '@/context/FacilityContext';
import { UserFilterBar } from './components/UserFilterBar';
import { UserLifecycleModals } from './components/UserLifecycleModals';
import { UserTable } from './components/UserTable';
import { RolesSection } from './components/RolesSection';
import { UsersPageHeader, type UsersTab } from './components/UsersPageHeader';
import { useUserLifecycle, type UserEditDraft } from './hooks/useUserLifecycle';
import { useRolesData } from './hooks/useRolesData';
import { useUsersData } from './hooks/useUsersData';
import styles from './page.module.css';

export default function UsersPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('user:manage');
  const canManageRoles = hasPermission('role:manage');
  const { availableFacilities } = useFacility();
  const [activeTab, setActiveTab] = useState<UsersTab>('users');

  const {
    roles,
    loading: loadingRoles,
    error: rolesError,
    saving: rolesSaving,
    actionError: rolesActionError,
    setActionError: setRolesActionError,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
  } = useRolesData(canManage);

  const {
    totalUsers,
    page,
    setPage,
    totalPages,
    loadingUsers,
    loadError,
    facilityNameMap,
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    filteredUsers,
    fetchUsers,
  } = useUsersData(canManage, roles);

  const roleDisplayById = React.useMemo(
    () => new Map(roles.map((r) => [r.id, `${r.displayName} (${r.key})`])),
    [roles],
  );

  const [showModal, setShowModal] = useState(false);
  const [showCreateRole, setShowCreateRole] = useState(false);
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
            <p className={styles.unauthorizedTitle}>Access Restricted</p>
            <p className={styles.unauthorizedHint}>{ACCESS_MESSAGES.users}</p>
          </div>
      </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <UsersPageHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        loadingUsers={loadingUsers}
        loadingRoles={loadingRoles}
        canManageRoles={canManageRoles}
        onRefreshUsers={() => void fetchUsers()}
        onRefreshRoles={() => void fetchRoles()}
        onProvisionUser={() => setShowModal(true)}
        onCreateRole={() => setShowCreateRole(true)}
      />

      {actionSuccess && <Banner variant="success" message={actionSuccess} />}

      {activeTab === 'users' && (
        <>
          <UserFilterBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            availableRoles={roles}
          />

          <section className={styles.tableSection}>
            <UserTable
              users={filteredUsers}
              totalUsers={totalUsers}
              loading={loadingUsers}
              error={loadError}
              onRetry={() => void fetchUsers()}
              page={page}
              totalPages={totalPages}
              searchTerm={searchTerm}
              roleFilter={roleFilter}
              facilityNameMap={facilityNameMap}
              roleDisplayById={roleDisplayById}
              currentUserId={user?.userId ?? null}
              actionsBusy={lifecycle.saving}
              onPageChange={setPage}
              onOpenCreate={() => setShowModal(true)}
              onEditUser={setEditingUser}
              onResetPassword={setResettingUser}
              onToggleStatus={(target) => void handleToggleStatus(target)}
            />
          </section>
        </>
      )}

      {activeTab === 'roles' && (
        <RolesSection
          users={filteredUsers}
          roles={roles}
          loading={loadingRoles}
          error={rolesError}
          saving={rolesSaving}
          actionError={rolesActionError}
          canManageRoles={canManageRoles}
          showCreate={showCreateRole}
          onShowCreateChange={setShowCreateRole}
          onCreateRole={createRole}
          onUpdateRole={updateRole}
          onDeleteRole={deleteRole}
          onRetryRoles={() => void fetchRoles()}
          onActionErrorChange={setRolesActionError}
          onChanged={() => {
            void fetchRoles();
            void fetchUsers();
          }}
        />
      )}

      <UserLifecycleModals
        provisioningOpen={showModal}
        editingUser={editingUser}
        resettingUser={resettingUser}
        availableFacilities={availableFacilities}
        availableRoles={roles}
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
