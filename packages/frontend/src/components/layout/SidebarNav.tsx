'use client';

import React, { useEffect } from 'react';
import {
  ArrowUpDown,
  Boxes,
  Database,
  Layers,
  LayoutDashboard,
  Link2,
  Menu,
  PackageSearch,
  Receipt,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PermissionKey } from '@cold-storage/contracts';
import { usePermissions } from '@/hooks/usePermissions';
import { useSettings } from '@/context/SettingsContext';
import { ORG_NAME_FALLBACK } from '@/lib/branding';
import styles from './SidebarNav.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission: PermissionKey;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
      { href: '/grns', label: 'Inward of Goods', icon: Warehouse, permission: 'grn:view' },
      { href: '/deliveries', label: 'Outward of Goods', icon: Truck, permission: 'delivery:view' },
      { href: '/groups', label: 'Groups', icon: Layers, permission: 'group:view' },
      { href: '/grn-stock', label: 'GRN Stock', icon: PackageSearch, permission: 'grn:view' },
      { href: '/bonds', label: 'Bonds', icon: Link2, permission: 'grn:view' },
      { href: '/rent', label: 'Rent Billing', icon: Receipt, permission: 'rent:view' },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { href: '/customers', label: 'Customers', icon: Users, permission: 'customer:view' },
      { href: '/commodities', label: 'Commodities', icon: Boxes, permission: 'commodity:view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/settings', label: 'System Settings', icon: Settings, permission: 'settings:manage' },
      { href: '/import-export', label: 'Import / Export', icon: ArrowUpDown, permission: 'export:execute' },
      { href: '/audit', label: 'Audit Logs', icon: ShieldCheck, permission: 'audit:view' },
      { href: '/backup', label: 'Backup', icon: Database, permission: 'backup:manage' },
      { href: '/users', label: 'User Management', icon: UserCog, permission: 'user:manage' },
    ],
  },
];

interface SidebarNavProps {
  isOpen?: boolean;
  isCollapsed?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}

export function SidebarNav({
  isOpen = false,
  isCollapsed = false,
  onClose,
  onToggleCollapse,
}: SidebarNavProps) {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  // Same source as the header, so the two cannot show different names.
  const { settings } = useSettings();
  const orgName = settings?.orgName || ORG_NAME_FALLBACK;
  const navRef = React.useRef<HTMLElement>(null);

  // Close mobile drawer on route change
  useEffect(() => {
    onClose?.();
  }, [pathname, onClose]);

  // Handle Escape key on mobile drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scrolling when mobile drawer is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Trap focus inside mobile drawer
  useEffect(() => {
    if (!isOpen || !navRef.current) return;
    const navEl = navRef.current;
    const focusable = navEl.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    first.focus();
    navEl.addEventListener('keydown', handleTabKey);
    return () => navEl.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  return (
    <>
      {isOpen && (
        <div
          className={styles.drawerBackdrop}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <nav
        ref={navRef}
        className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''} ${isCollapsed ? styles.sidebarCollapsed : ''}`}
        aria-label="Main navigation"
        id="sidebar-navigation"
        role="navigation"
        aria-modal={isOpen ? 'true' : undefined}
      >
        <div className={styles.brandArea}>
          <span className={styles.brandTitle}>{orgName}</span>
          {onToggleCollapse && (
            <button
              type="button"
              id="sidebar-collapse-toggle"
              className={styles.collapseToggleBtn}
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className={styles.mobileCloseBtn}
              onClick={onClose}
              aria-label="Dismiss navigation menu"
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

      {NAV_SECTIONS.map((section) => {
        const allowedItems = section.items.filter((item) => hasPermission(item.permission));
        if (allowedItems.length === 0) {
          return null;
        }

        return (
          <div key={section.title} className={styles.navSection}>
            <span className={styles.sectionHeader}>{section.title}</span>
            <ul className={styles.navList} role="list">
              {allowedItems.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      prefetch={false}
                      className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      title={label}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
    </>
  );
}
