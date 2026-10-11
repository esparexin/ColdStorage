'use client';

import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from '../page.module.css';

export type UsersTab = 'users' | 'roles';

interface UsersPageHeaderProps {
  activeTab: UsersTab;
  onTabChange: (tab: UsersTab) => void;
  loadingUsers: boolean;
  loadingRoles: boolean;
  canManageRoles: boolean;
  onRefreshUsers: () => void;
  onRefreshRoles: () => void;
  onProvisionUser: () => void;
  onCreateRole: () => void;
}

export function UsersPageHeader({
  activeTab,
  onTabChange,
  loadingUsers,
  loadingRoles,
  canManageRoles,
  onRefreshUsers,
  onRefreshRoles,
  onProvisionUser,
  onCreateRole,
}: UsersPageHeaderProps) {
  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    onTabChange(activeTab === 'users' ? 'roles' : 'users');
  };

  return (
    <>
      <header className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1>User Management & Access Control</h1>
        </div>
        <div className={styles.headerActions}>
          {activeTab === 'users' ? (
            <>
              <Button
                variant="outline"
                onClick={onRefreshUsers}
                disabled={loadingUsers}
                aria-label="Refresh users list"
                leftIcon={<RefreshCw size={16} className={loadingUsers ? styles.spinning : ''} />}
              >
                Refresh
              </Button>
              <Button
                id="create-user-button"
                variant="primary"
                onClick={onProvisionUser}
                leftIcon={<Plus size={16} />}
              >
                Provision User
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={onRefreshRoles}
                disabled={loadingRoles}
                aria-label="Refresh roles list"
                leftIcon={<RefreshCw size={16} className={loadingRoles ? styles.spinning : ''} />}
              >
                Refresh
              </Button>
              {canManageRoles && (
                <Button
                  id="create-role-button"
                  variant="primary"
                  onClick={onCreateRole}
                  leftIcon={<Plus size={16} />}
                >
                  Create Role
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="User management views"
        className={styles.headerActions}
        onKeyDown={handleTabKeyDown}
      >
        <Button
          variant={activeTab === 'users' ? 'primary' : 'outline'}
          onClick={() => onTabChange('users')}
          aria-selected={activeTab === 'users'}
          role="tab"
          tabIndex={activeTab === 'users' ? 0 : -1}
        >
          Users
        </Button>
        <Button
          variant={activeTab === 'roles' ? 'primary' : 'outline'}
          onClick={() => onTabChange('roles')}
          aria-selected={activeTab === 'roles'}
          role="tab"
          tabIndex={activeTab === 'roles' ? 0 : -1}
        >
          Roles
        </Button>
      </div>
    </>
  );
}
