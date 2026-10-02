'use client';

import React from 'react';
import { KeyRound, UserCheck } from 'lucide-react';
import type { UserSummary } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
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
  if (loading) {
    return <FeedbackStates.Loading label="Loading users..." />;
  }

  if (users.length === 0) {
    return (
      <FeedbackStates.Empty
        message={
          searchTerm || roleFilter
            ? 'No users match your filter criteria.'
            : 'No registered users found.'
        }
        action={
          !searchTerm && !roleFilter
            ? {
                label: 'Provision First User',
                onClick: onOpenCreate,
                id: 'empty-create-user-btn',
              }
            : undefined
        }
      />
    );
  }

  return (
    <>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th>
              <th>Emp ID</th>
              <th>Role</th>
              <th>Assigned Facilities</th>
              <th>Mobile / Email</th>
              <th>Security State</th>
              <th>Status</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roleBadgeClass =
                u.role === 'SUPER_ADMIN'
                  ? styles.badgeSuperAdmin
                  : u.role === 'ADMIN'
                  ? styles.badgeAdmin
                  : u.role === 'OPERATOR'
                  ? styles.badgeOperator
                  : styles.badgeReadOnly;

              return (
                <tr key={u.id}>
                  <td>
                    <div className={styles.userInfo}>
                      <span className={styles.userName}>{u.fullName}</span>
                      <span className={styles.userHandle}>@{u.username}</span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.codeText}>{u.employeeId}</span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${roleBadgeClass}`}>{u.role}</span>
                  </td>
                  <td>
                    {u.role === 'SUPER_ADMIN' ? (
                      <span className={styles.facilityTag}>Global (All Facilities)</span>
                    ) : u.facilityIds && u.facilityIds.length > 0 ? (
                      u.facilityIds.map((fId) => (
                        <span key={fId} className={styles.facilityTag}>
                          {facilityNameMap.get(fId) || fId}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
                        No Facilities Assigned
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.userInfo}>
                      <span>{u.mobile}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {u.email}
                      </span>
                    </div>
                  </td>
                  <td>
                    {u.mustChangePassword ? (
                      <span
                        className={styles.badge}
                        style={{
                          background: 'var(--color-warning-subtle)',
                          color: 'var(--color-warning)',
                        }}
                      >
                        <KeyRound size={12} /> Force Reset
                      </span>
                    ) : (
                      <span
                        className={styles.badge}
                        style={{
                          background: 'var(--color-success-subtle)',
                          color: 'var(--color-success)',
                        }}
                      >
                        <UserCheck size={12} /> Password Set
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.badge}
                      style={{
                        background:
                          u.status === 'ACTIVE'
                            ? 'var(--color-success-subtle)'
                            : 'var(--color-danger-subtle)',
                        color:
                          u.status === 'ACTIVE'
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                      }}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Never'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 'var(--space-2)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Page {page} of {totalPages} ({totalUsers} total)
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              style={{
                padding: 'var(--space-1) var(--space-3)',
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              style={{
                padding: 'var(--space-1) var(--space-3)',
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
