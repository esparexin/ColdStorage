'use client';

import { Building2, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import styles from './AppHeader.module.css';

export function AppHeader() {
  const { user, logout } = useAuth();
  const { selectedFacilityId, setSelectedFacilityId } = useFacility();

  const facilities = user?.facilityIds ?? [];

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.logo}>❄ ColdStorage</span>
      </div>

      <div className={styles.right}>
        {/* Facility selector — UI state only; not authorization */}
        {facilities.length > 1 && (
          <div className={styles.facilitySelector}>
            <Building2 size={16} aria-hidden="true" />
            <select
              id="facility-selector"
              className={styles.facilitySelect}
              value={selectedFacilityId ?? ''}
              onChange={(e) => setSelectedFacilityId(e.target.value)}
              aria-label="Select facility"
            >
              {facilities.map((fid) => (
                <option key={fid} value={fid}>{fid}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
        )}

        {/* User badge */}
        <div className={styles.userBadge} aria-label={`Logged in as ${user?.fullName ?? ''}`}>
          <span className={styles.avatar}>{user?.fullName?.[0]?.toUpperCase() ?? '?'}</span>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.fullName}</span>
            <span className={styles.userRole}>{user?.role}</span>
          </div>
        </div>

        <button
          id="logout-button"
          className={styles.logoutBtn}
          onClick={() => void logout()}
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
