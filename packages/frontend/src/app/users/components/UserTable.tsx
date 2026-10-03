'use client';

import React from 'react';
import { KeyRound, UserCheck } from 'lucide-react';
import type { UserSummary } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface UserTableProps {
  users: UserSummary[];
  totalUsers: number;
  loading: boolean;
  page: number;
  totalPages: number;
  searchTerm: string;
  roleFilter: string;
  facilityNameMap: Map<string, string>;
  onPageChange: (newPage: number) => void;
  onOpenCreate: () => void;
}

export function UserTable({
  users,
  totalUsers,
  loading,
  page,
  totalPages,
  searchTerm,
  roleFilter,
  facilityNameMap,
  onPageChange,
  onOpenCreate,
}: UserTableProps) {
  const columns: DataTableColumn<UserSummary>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div className={styles.userInfo}>
          <span className={styles.userName}>{u.fullName}</span>
          <span className={styles.userHandle}>@{u.username}</span>
        </div>
      ),
    },
    {
      key: 'employeeId',
      header: 'Emp ID',
      render: (u) => <span className={styles.codeText}>{u.employeeId}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Badge
          variant={
            u.role === 'SUPER_ADMIN' || u.role === 'ADMIN'
              ? 'primary'
              : u.role === 'OPERATOR'
              ? 'warning'
              : 'neutral'
          }
        >
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'facilities',
      header: 'Assigned Facilities',
      render: (u) =>
        u.role === 'SUPER_ADMIN' ? (
          <span className={styles.facilityTag}>Global (All Facilities)</span>
        ) : u.facilityIds && u.facilityIds.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {u.facilityIds.map((fId) => (
              <span key={fId} className={styles.facilityTag}>
                {facilityNameMap.get(fId) || fId}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
            No Facilities Assigned
          </span>
        ),
    },
    {
      key: 'contact',
      header: 'Mobile / Email',
      render: (u) => (
        <div className={styles.userInfo}>
          <span>{u.mobile}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {u.email}
          </span>
        </div>
      ),
    },
    {
      key: 'security',
      header: 'Security State',
      render: (u) =>
        u.mustChangePassword ? (
          <Badge variant="warning" icon={<KeyRound size={12} aria-hidden="true" />}>
            Force Reset
          </Badge>
        ) : (
          <Badge variant="success" icon={<UserCheck size={12} aria-hidden="true" />}>
            Password Set
          </Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>
          {u.status}
        </Badge>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (u) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {u.lastLoginAt
            ? new Date(u.lastLoginAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : 'Never'}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={users}
      rowKey={(u) => u.id}
      caption="User accounts directory"
      loading={loading}
      loadingLabel="Loading users..."
      emptyMessage={
        searchTerm || roleFilter
          ? 'No users match your filter criteria.'
          : 'No registered users found.'
      }
      emptyAction={
        !searchTerm && !roleFilter
          ? {
              label: 'Provision First User',
              onClick: onOpenCreate,
              id: 'empty-create-user-btn',
            }
          : undefined
      }
      pagination={{
        page,
        totalPages,
        totalRecords: totalUsers,
        onPageChange,
      }}
    />
  );
}
