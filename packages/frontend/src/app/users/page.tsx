'use client';

import React, { useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { useAuth } from '@/context/AuthContext';
import { ProvisionUserModal } from './components/ProvisionUserModal';
import { UserFilterBar } from './components/UserFilterBar';
import { UserTable } from './components/UserTable';
import { useUsersData } from './hooks/useUsersData';
import styles from './page.module.css';

export default function UsersPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'user:manage');

  const {
    totalUsers,
    page,
    setPage,
    totalPages,
    loadingUsers,
    availableFacilities,
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

  if (!canManage) {
    return (
      <div className={styles.container}>
        <div className={styles.unauthorizedWrapper}>
          <ShieldAlert size={48} color="var(--color-danger)" />
          <h2>Restricted Access</h2>
          <p className={styles.subtitle}>
            User administration is strictly restricted to SUPER_ADMIN authority.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>User Management & Access Control</h1>
          <p className={styles.subtitle}>
            Provision authorized personnel, enforce role-based access control, and manage facility
            assignments.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void fetchUsers()}
            disabled={loadingUsers}
            aria-label="Refresh users list"
          >
            <RefreshCw size={16} className={loadingUsers ? styles.spinning : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            id="create-user-button"
            className={styles.primaryBtn}
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} />
            <span>Provision User</span>
          </button>
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
        <div className={styles.tableHeader}>
          <h2>
            Authorized Accounts ({filteredUsers.length} shown, {totalUsers} total)
          </h2>
        </div>

        <UserTable
          users={filteredUsers}
          totalUsers={totalUsers}
          loading={loadingUsers}
          page={page}
          totalPages={totalPages}
          searchTerm={searchTerm}
          roleFilter={roleFilter}
          facilityNameMap={facilityNameMap}
          onPageChange={setPage}
          onOpenCreate={() => setShowModal(true)}
        />
      </section>

      {showModal && (
        <ProvisionUserModal
          availableFacilities={availableFacilities}
          onClose={() => setShowModal(false)}
          onSuccess={(msg) => {
            setActionSuccess(msg);
            void fetchUsers();
          }}
        />
      )}
    </div>
  );
}
