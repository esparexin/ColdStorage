'use client';

import React from 'react';
import { Search } from 'lucide-react';
import type { Role } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface UserFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  roleFilter: '' | Role;
  onRoleFilterChange: (role: '' | Role) => void;
}

export function UserFilterBar({
  searchTerm,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
}: UserFilterBarProps) {
  return (
    <div className={styles.filterCard}>
      <div className={styles.searchBox}>
        <Search size={16} color="var(--color-text-secondary)" />
        <input
          type="text"
          placeholder="Search by name, username, employee ID, mobile, or email..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search users"
        />
      </div>
      <select
        className={styles.selectInput}
        value={roleFilter}
        onChange={(e) => onRoleFilterChange(e.target.value as '' | Role)}
        aria-label="Filter by role"
      >
        <option value="">All Roles</option>
        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
        <option value="ADMIN">ADMIN</option>
        <option value="OPERATOR">OPERATOR</option>
        <option value="READ_ONLY">READ_ONLY</option>
      </select>
    </div>
  );
}
