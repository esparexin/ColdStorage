'use client';

import React from 'react';
import {
  ArrowUpDown,
  Boxes,
  Database,
  Layers,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { can, type PermissionKey, type Role } from '@cold-storage/contracts';
import { useAuth } from '@/context/AuthContext';
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
      { href: '/grns', label: 'Inward GRNs', icon: Warehouse, permission: 'grn:view' },
      { href: '/inventory', label: 'Inventory & Stock', icon: Package, permission: 'inventory:view' },
      { href: '/deliveries', label: 'Deliveries', icon: Truck, permission: 'delivery:view' },
      { href: '/rent', label: 'Rent Billing', icon: Receipt, permission: 'rent:view' },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { href: '/customers', label: 'Customers', icon: Users, permission: 'customer:view' },
      { href: '/commodities', label: 'Commodities', icon: Boxes, permission: 'commodity:view' },
      { href: '/storage', label: 'Storage Hierarchy', icon: Layers, permission: 'storage:view' },
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

export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <div className={styles.brandArea}>
        <span className={styles.brandTitle}>❄ Cold Storage</span>
      </div>

      {NAV_SECTIONS.map((section) => {
        const allowedItems = section.items.filter((item) => can(userRole, item.permission));
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
                      className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon size={18} aria-hidden="true" />
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
  );
}
