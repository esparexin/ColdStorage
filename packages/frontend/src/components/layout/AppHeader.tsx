'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Menu, Plus, Search } from 'lucide-react';
import { Button, Modal, Select } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { useSettings } from '@/context/SettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ORG_NAME_FALLBACK } from '@/lib/branding';
import { GlobalGrnSearch } from './GlobalGrnSearch';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  onToggleMobileNav?: () => void;
  isMobileNavOpen?: boolean;
  isCollapsed?: boolean;
}

export function AppHeader({
  onToggleMobileNav,
  isMobileNavOpen = false,
  isCollapsed = false,
}: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { selectedFacilityId, setSelectedFacilityId, availableFacilities } = useFacility();
  const { settings } = useSettings();
  const { hasPermission } = usePermissions();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const canCreateGrn = hasPermission('grn:create');
  const canCreateDelivery = hasPermission('delivery:create');

  const handleInwardClick = () => {
    if (pathname === '/grns') {
      window.dispatchEvent(new CustomEvent('open-create-grn'));
    } else {
      router.push(canCreateGrn ? '/grns?action=create' : '/grns');
    }
  };

  const handleOutwardClick = () => {
    if (pathname === '/deliveries') {
      window.dispatchEvent(new CustomEvent('switch-delivery-tab', { detail: 'issue' }));
    } else {
      router.push(canCreateDelivery ? '/deliveries?tab=issue' : '/deliveries');
    }
  };

  // No synthetic fallback: when the facility list fails to load the selector hides
  // and pages render their own error/empty states from FacilityContext.facilitiesError.
  const facilities = availableFacilities;

  const orgName = settings?.orgName || ORG_NAME_FALLBACK;
  const logoAssetId = settings?.logoAssetId;

  return (
    <header className={`${styles.header} ${isCollapsed ? styles.headerCollapsed : ''}`}>
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
        <button
          type="button"
          id="mobile-search-toggle"
          className={styles.searchTrigger}
          onClick={() => setIsMobileSearchOpen(true)}
          aria-label="Open global search"
        >
          <Search size={18} aria-hidden="true" />
        </button>
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
        <div className={styles.quickActions}>
          <Button
            id="header-inward-btn"
            variant="secondary"
            size="sm"
            onClick={handleInwardClick}
            leftIcon={<Plus size={14} aria-hidden="true" />}
            className={styles.quickActionBtn}
            aria-label="Inward of Goods"
          >
            Inward
          </Button>
          <Button
            id="header-outward-btn"
            variant="secondary"
            size="sm"
            onClick={handleOutwardClick}
            leftIcon={<Plus size={14} aria-hidden="true" />}
            className={styles.quickActionBtn}
            aria-label="Outward Delivery Challan"
          >
            Outward
          </Button>
        </div>
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

      {isMobileSearchOpen && (
        <Modal
          isOpen
          onClose={() => setIsMobileSearchOpen(false)}
          title="Search GRNs"
          size="md"
        >
          <div style={{ padding: 'var(--space-2) 0' }}>
            <GlobalGrnSearch onSelect={() => setIsMobileSearchOpen(false)} />
          </div>
        </Modal>
      )}
    </header>
  );
}
