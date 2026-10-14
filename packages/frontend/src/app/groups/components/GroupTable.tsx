'use client';

import React from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Group } from '@cold-storage/contracts';
import { Badge, Button, DataTable, OverflowMenu, type OverflowMenuItem } from '@/components/ui';
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
      sortable: true,
      sortType: 'text',
      sortAccessor: (group: Group) => group.name,
      render: (group: Group) => (
        <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-text)' }}>
          {group.name}
        </span>
      ),
    },
    {
      key: 'trader',
      header: 'Trader / Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (group: Group) => group.customerName ?? '',
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
      sortable: true,
      sortType: 'number',
      sortAccessor: (group: Group) => group.grnCount,
      render: (group: Group) => (
        <Badge variant={group.grnCount > 0 ? 'primary' : 'neutral'}>
          {group.grnCount} {group.grnCount === 1 ? 'GRN' : 'GRNs'}
        </Badge>
      ),
    },
    {
      key: 'totalBags',
      header: 'Total Stock',
      sortable: true,
      sortType: 'number',
      sortAccessor: (group: Group) => group.stockSummary?.totalBags ?? 0,
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
      render: (group: Group) => {
        const secondaryItems: OverflowMenuItem[] = [
          ...(canManage
            ? [
                {
                  key: 'assign',
                  label: 'Assign GRNs',
                  icon: <Plus size={14} aria-hidden="true" />,
                  onClick: () => onAssign(group),
                },
                {
                  key: 'edit',
                  label: 'Edit Group',
                  icon: <Pencil size={14} aria-hidden="true" />,
                  onClick: () => onEdit(group),
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  key: 'delete',
                  label: 'Delete Group',
                  icon: <Trash2 size={14} aria-hidden="true" />,
                  danger: true,
                  onClick: () => onDelete(group),
                },
              ]
            : []),
        ];

        return (
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
            {secondaryItems.length > 0 && (
              <OverflowMenu
                items={secondaryItems}
                ariaLabel={`More actions for group ${group.name}`}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable<Group>
      columns={columns}
      rows={groups}
      rowKey={(g) => g.id}
      caption="Groups of Goods"
      onRowClick={onViewDetails}
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
