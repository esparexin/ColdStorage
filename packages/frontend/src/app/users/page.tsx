'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { can, type Role, type UserSummary } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

interface FacilityOption {
  id: string;
  name: string;
  code: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'user:manage');

  // Users list state
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Facilities list for assignment
  const [availableFacilities, setAvailableFacilities] = useState<FacilityOption[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');

  // Modal & Creation
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('OPERATOR');
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    if (!canManage) return;
    setLoadingUsers(true);
    try {
      const res = await requestWithAuth(`/api/users?page=${page}&limit=${limit}`);
      if (res.ok) {
        const data = (await res.json()) as {
          items: UserSummary[];
          total: number;
          page: number;
          limit: number;
        };
        setUsers(data.items || []);
        setTotalUsers(data.total || 0);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingUsers(false);
    }
  }, [canManage, page, limit]);

  const fetchFacilities = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await requestWithAuth('/api/facilities');
      if (res.ok) {
        const data = (await res.json()) as { items?: FacilityOption[] };
        setAvailableFacilities(data.items || []);
      }
    } catch {
      // Handled silently
    }
  }, [canManage]);

  useEffect(() => {
    if (canManage) {
      void fetchUsers();
      void fetchFacilities();
    }
  }, [canManage, fetchUsers, fetchFacilities]);

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setEmployeeId('');
    setMobile('');
    setEmail('');
    setRole('OPERATOR');
    setSelectedFacilityIds(availableFacilities.length > 0 ? [availableFacilities[0].id] : []);
    setTemporaryPassword('');
    setCreateError(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleFacilityToggle = (facilityId: string) => {
    setSelectedFacilityIds((prev) =>
      prev.includes(facilityId) ? prev.filter((id) => id !== facilityId) : [...prev, facilityId],
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    // Frontend validations
    if (!fullName.trim()) return setCreateError('Full name is required.');
    if (!username.trim() || username.length < 3)
      return setCreateError('Username must be at least 3 characters.');
    if (!employeeId.trim()) return setCreateError('Employee ID is required.');
    if (!/^[6-9]\d{9}$/.test(mobile.trim()))
      return setCreateError('Mobile must be a valid 10-digit Indian number starting with 6-9.');
    if (!email.trim() || !email.includes('@'))
      return setCreateError('A valid email address is required.');
    if (selectedFacilityIds.length === 0)
      return setCreateError('User must be assigned to at least one facility.');
    if (temporaryPassword.length < 8)
      return setCreateError('Temporary password must be at least 8 characters.');

    setCreating(true);
    try {
      const res = await requestWithAuth('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim(),
          employeeId: employeeId.trim(),
          mobile: mobile.trim(),
          email: email.trim(),
          role,
          facilityIds: selectedFacilityIds,
          temporaryPassword,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string; details?: unknown };
        throw new Error(err.error || `Failed to create user (HTTP ${res.status})`);
      }

      setActionSuccess(`User "${username}" provisioned successfully with temporary password.`);
      setShowModal(false);
      resetForm();
      void fetchUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'User creation failed');
    } finally {
      setCreating(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = !roleFilter || u.role === roleFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.employeeId.toLowerCase().includes(term) ||
        u.mobile.includes(term);
      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, searchTerm]);

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

  const facilityNameMap = new Map(availableFacilities.map((f) => [f.id, f.name || f.code]));

  const totalPages = Math.ceil(totalUsers / limit);

  return (
    <div className={styles.container}>
      {/* Header */}
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
            onClick={handleOpenModal}
          >
            <Plus size={16} />
            <span>Provision User</span>
          </button>
        </div>
      </header>

      {/* Notifications */}
      {actionSuccess && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter / Search Card */}
      <div className={styles.filterCard}>
        <div className={styles.searchBox}>
          <Search size={16} color="var(--color-text-secondary)" />
          <input
            type="text"
            placeholder="Search by name, username, employee ID, mobile, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <select
          className={styles.selectInput}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as '' | Role)}
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="ADMIN">ADMIN</option>
          <option value="OPERATOR">OPERATOR</option>
          <option value="READ_ONLY">READ_ONLY</option>
        </select>
      </div>

      {/* Users Table */}
      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>
            Authorized Accounts ({filteredUsers.length} shown, {totalUsers} total)
          </h2>
        </div>

        {loadingUsers ? (
          <FeedbackStates.Loading label="Loading users..." />
        ) : filteredUsers.length === 0 ? (
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
                    onClick: handleOpenModal,
                    id: 'empty-create-user-btn',
                  }
                : undefined
            }
          />
        ) : (
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
                  {filteredUsers.map((u) => {
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
                  Page {page} of {totalPages}
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
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Provision User Modal */}
      {showModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 id="modal-title">Provision New User Account</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowModal(false)}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className={styles.modalBody}>
                {createError && (
                  <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
                    <AlertCircle size={16} />
                    <span>{createError}</span>
                  </div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label htmlFor="user-fullname">Full Name *</label>
                    <input
                      id="user-fullname"
                      className={styles.formInput}
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="user-username">Username *</label>
                    <input
                      id="user-username"
                      className={styles.formInput}
                      type="text"
                      placeholder="e.g. ramesh.k"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="user-empid">Employee ID *</label>
                    <input
                      id="user-empid"
                      className={styles.formInput}
                      type="text"
                      placeholder="e.g. EMP-1042"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="user-role">Role *</label>
                    <select
                      id="user-role"
                      className={styles.formInput}
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                    >
                      <option value="OPERATOR">OPERATOR (Weighbridge, GRN, Put-away, Challan)</option>
                      <option value="ADMIN">ADMIN (Facility Supervisor, Approvals)</option>
                      <option value="READ_ONLY">READ_ONLY (Auditor, Viewer)</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN (Complete System Authority)</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="user-mobile">Mobile (10 Digits) *</label>
                    <input
                      id="user-mobile"
                      className={styles.formInput}
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      maxLength={10}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="user-email">Email Address *</label>
                    <input
                      id="user-email"
                      className={styles.formInput}
                      type="email"
                      placeholder="e.g. ramesh@coldstorage.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroupFull}>
                    <label htmlFor="user-temp-password">Initial Temporary Password *</label>
                    <input
                      id="user-temp-password"
                      className={styles.formInput}
                      type="password"
                      placeholder="Minimum 8 characters (forced reset on first login)"
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formGroupFull}>
                    <label>Assign Facilities (At least one required) *</label>
                    <div className={styles.checkboxGrid}>
                      {availableFacilities.map((fac) => (
                        <label key={fac.id} className={styles.checkboxItem}>
                          <input
                            type="checkbox"
                            checked={selectedFacilityIds.includes(fac.id)}
                            onChange={() => handleFacilityToggle(fac.id)}
                          />
                          <span>
                            {fac.name} ({fac.code})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-user-btn"
                  className={styles.primaryBtn}
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <RefreshCw size={14} className={styles.spinning} />
                      <span>Provisioning...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>Provision User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
