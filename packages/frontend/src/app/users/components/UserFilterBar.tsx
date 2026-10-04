'use client';

import React from 'react';
import type { Role } from '@cold-storage/contracts';
import { FilterToolbar, Select } from '@/components/ui';

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
  const resetFilters = () => {
    onSearchChange('');
    onRoleFilterChange('');
  };

  return (
    <FilterToolbar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by name, username, employee ID, mobile, or email..."
      searchAriaLabel="Search users"
      onReset={resetFilters}
      hasActiveFilters={Boolean(searchTerm || roleFilter)}
    >
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
    </FilterToolbar>
  );
}