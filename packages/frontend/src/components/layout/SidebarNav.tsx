'use client';

import { BarChart3, Home, Package, Truck, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SidebarNav.module.css';

const navItems = [
  { href: '/',           label: 'Dashboard',  icon: Home },
  { href: '/inventory',  label: 'Inventory',  icon: Package },
  { href: '/deliveries', label: 'Deliveries', icon: Truck },
  { href: '/grns',       label: 'GRNs',       icon: Warehouse },
  { href: '/reports',    label: 'Reports',    icon: BarChart3 },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <ul className={styles.navList} role="list">
        {navItems.map(({ href, label, icon: Icon }) => {
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
    </nav>
  );
}
