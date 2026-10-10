'use client';

import React from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Group } from '@cold-storage/contracts';
import { Badge, Button, DataTable } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface GroupTableProps {
  groups: Group[];
  canManage: boolean;
  canDelete: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalGroups: number;
  onPageChange: (newPage: number) => void;
  onViewDetails: (group: Group) => void;
  onEdit: (group: Group) => void;
  onAssign: (group: Group) => void;
  onDelete: (group: Group) => void;
}

export function GroupTable({
  groups,
  canManage,
  canDelete,
  page,
  pageSize,
  totalPages,
  totalGroups,
  onPageChange,
  onViewDetails,
  onEdit,
  onAssign,
  onDelete,
}: GroupTableProps) {
  const columns: DataTableColumn<Group>[] = [
    {
      key: 'name',
      header: 'Group Name',
      render: (group: Group) => (
        <span
          style={{ fontWeight: 'var(--font-medium)', cursor: 'pointer', color: 'var(--color-primary)' }}
          onClick={() => onViewDetails(group)}
        >
          {group.name}
        </span>
      ),
    },
    {
      key: 'trader',
      header: 'Trader / Customer',
      render: (group: Group) =>
        group.customerName ? (
          <span>{group.customerName}</span>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
            Unlinked Trader
          </span>
        ),
    },
    {
      key: 'grnCount',
      header: 'Assigned GRNs',
      render: (group: Group) => (
        <Badge variant={group.grnCount > 0 ? 'primary' : 'neutral'}>
          {group.grnCount} {group.grnCount === 1 ? 'GRN' : 'GRNs'}
        </Badge>
      ),
    },
    {
      key: 'totalBags',
      header: 'Total Stock',
      render: (group: Group) => (
        <span style={{ fontWeight: 'var(--font-semibold)' }}>
          {group.stockSummary ? `${group.stockSummary.totalBags.toLocaleString()} bags` : '—'}
        </span>
      ),
    },
    {
      key: 'stockSplit',
      header: 'S / B Split',
      render: (group: Group) =>
        group.stockSummary ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {group.stockSummary.smallBags} S / {group.stockSummary.bigBags} B
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (group: Group) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {group.remarks || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (group: Group) => (
        <div className={styles.tableActions}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onViewDetails(group)}
            aria-label={`View details for group ${group.name}`}
            leftIcon={<Eye size={14} aria-hidden="true" />}
          >
            Details
          </Button>
          {canManage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAssign(group)}
                aria-label={`Assign GRNs to group ${group.name}`}
                leftIcon={<Plus size={14} aria-hidden="true" />}
              >
                Assign
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(group)}
                aria-label={`Edit group ${group.name}`}
                leftIcon={<Pencil size={14} aria-hidden="true" />}
              >
                Edit
              </Button>
            </>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(group)}
              aria-label={`Delete group ${group.name}`}
              leftIcon={<Trash2 size={14} aria-hidden="true" />}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable<Group>
      columns={columns}
      rows={groups}
      rowKey={(g) => g.id}
      caption="Groups of Goods"
      pagination={{
        page,
        pageSize,
        totalPages,
        totalRecords: totalGroups,
        onPageChange,
      }}
    />
  );
}
