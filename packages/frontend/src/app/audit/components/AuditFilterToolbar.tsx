'use client';

import React from 'react';
import type { AuditEventType, AuditSeverity } from '@cold-storage/contracts';
import { SearchBar } from '@/components/ui';
import styles from '../page.module.css';

interface AuditFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  severityFilter: '' | AuditSeverity;
  onSeverityChange: (val: '' | AuditSeverity) => void;
  eventTypeFilter: '' | AuditEventType;
  onEventTypeChange: (val: '' | AuditEventType) => void;
}

export function AuditFilterToolbar({
  searchTerm,
  onSearchChange,
  severityFilter,
  onSeverityChange,
  eventTypeFilter,
  onEventTypeChange,
}: AuditFilterToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <SearchBar
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Search Actor, Event, Resource, IP..."
        ariaLabel="Search audit logs"
        onClear={() => onSearchChange('')}
      />

      <div className={styles.filtersGroup}>
        <select
          aria-label="Filter by Severity"
          className={styles.filterSelect}
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value as '' | AuditSeverity)}
        >
          <option value="">All Severities</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="SECURITY">SECURITY</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        <select
          aria-label="Filter by Event Action"
          className={styles.filterSelect}
          value={eventTypeFilter}
          onChange={(e) => onEventTypeChange(e.target.value as '' | AuditEventType)}
        >
          <option value="">All Event Types</option>
          <option value="AUTH_LOGIN_SUCCESS">AUTH_LOGIN_SUCCESS</option>
          <option value="AUTH_LOGIN_FAILED">AUTH_LOGIN_FAILED</option>
          <option value="GRN_CREATED">GRN_CREATED</option>
          <option value="INVENTORY_PUTAWAY">INVENTORY_PUTAWAY</option>
          <option value="DELIVERY_ISSUED">DELIVERY_ISSUED</option>
          <option value="DELIVERY_REVERSED">DELIVERY_REVERSED</option>
          <option value="RENT_PAYMENT_COLLECTED">RENT_PAYMENT_COLLECTED</option>
          <option value="SETTINGS_UPDATED">SETTINGS_UPDATED</option>
          <option value="BACKUP_TRIGGERED">BACKUP_TRIGGERED</option>
          <option value="ACCESS_DENIED">ACCESS_DENIED</option>
        </select>
      </div>
    </div>
  );
}
