'use client';

import React from 'react';
import type { RoleDefinition } from '@cold-storage/contracts';
import { FilterToolbar, Select } from '@/components/ui';

interface UserFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  availableRoles?: RoleDefinition[];
}

export function UserFilterBar({
  searchTerm,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  availableRoles,
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
        onChange={(e) => onRoleFilterChange(e.target.value)}
        aria-label="Filter by role"
      >
        <option value="">All Roles</option>
        {(availableRoles && availableRoles.length > 0
          ? availableRoles.map((r) => ({ value: r.key, label: `${r.displayName} (${r.key})` }))
          : [
              { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
              { value: 'ADMIN', label: 'ADMIN' },
              { value: 'OPERATOR', label: 'OPERATOR' },
              { value: 'READ_ONLY', label: 'READ_ONLY' },
            ]
        ).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </FilterToolbar>
  );
}