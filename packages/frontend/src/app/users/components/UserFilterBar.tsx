'use client';

import React from 'react';
import { Filter } from 'lucide-react';
import type { Role } from '@cold-storage/contracts';
import { Button, SearchBar, Select } from '@/components/ui';
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
  const hasActiveFilters = Boolean(searchTerm || roleFilter);

  const handleReset = () => {
    onSearchChange('');
    onRoleFilterChange('');
  };

  return (
    <div className={styles.filterCard}>
      <SearchBar
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Search by name, username, employee ID, mobile, or email..."
        ariaLabel="Search users"
        onClear={() => onSearchChange('')}
      />
      <Select
        value={roleFilter}
        onChange={(e) => onRoleFilterChange(e.target.value as '' | Role)}
        aria-label="Filter by role"
      >
        <option value="">All Roles</option>
        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
        <option value="ADMIN">ADMIN</option>
        <option value="OPERATOR">OPERATOR</option>
        <option value="READ_ONLY">READ_ONLY</option>
      </Select>
      {hasActiveFilters && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReset}
          leftIcon={<Filter size={12} aria-hidden="true" />}
        >
          Reset
        </Button>
      )}
    </div>
  );
}
