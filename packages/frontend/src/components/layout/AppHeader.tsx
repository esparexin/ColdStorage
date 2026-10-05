'use client';

import React from 'react';
import { LogOut, Menu } from 'lucide-react';
import { Select } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { useSettings } from '@/context/SettingsContext';
import { ORG_NAME_FALLBACK } from '@/lib/branding';
import { GlobalGrnSearch } from './GlobalGrnSearch';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  onToggleMobileNav?: () => void;
  isMobileNavOpen?: boolean;
}

export function AppHeader({ onToggleMobileNav, isMobileNavOpen = false }: AppHeaderProps) {
  const { user, logout } = useAuth();
  const { selectedFacilityId, setSelectedFacilityId, availableFacilities } = useFacility();
  const { settings } = useSettings();

  // No synthetic fallback: when the facility list fails to load the selector hides
  // and pages render their own error/empty states from FacilityContext.facilitiesError.
  const facilities = availableFacilities;

  const orgName = settings?.orgName || ORG_NAME_FALLBACK;
  const logoAssetId = settings?.logoAssetId;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {onToggleMobileNav && (
          <button
            type="button"
            id="mobile-nav-toggle"
            className={styles.menuTrigger}
            onClick={onToggleMobileNav}
            aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileNavOpen}
            aria-controls="sidebar-navigation"
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        )}
        {logoAssetId ? (
          <div className={styles.brand}>
            <img
              src={`/api/assets/${encodeURIComponent(logoAssetId)}`}
              alt={orgName}
              className={styles.orgLogo}
            />
            <span className={styles.orgName}>{orgName}</span>
          </div>
        ) : (
          <span className={styles.logo}>{orgName}</span>
        )}
      </div>

      <div className={styles.center}>
        <GlobalGrnSearch />
      </div>

      <div className={styles.right}>
        {/* Facility selector — UI state only; not authorization */}
        {facilities.length > 1 && (
          <div className={styles.facilitySelector}>
            <Select
              id="facility-selector"
              className={styles.facilitySelect}
              value={selectedFacilityId ?? ''}
              onChange={(e) => setSelectedFacilityId(e.target.value)}
              aria-label="Select facility"
            >
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>
                  {fac.name ? `${fac.name} (${fac.code})` : fac.id}
                </option>
              ))}
            </Select>
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
