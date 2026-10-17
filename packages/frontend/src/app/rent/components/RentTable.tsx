'use client';

import React from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { createRentColumns } from './RentTableColumns';

interface RentTableProps {
  accounts: RentSummaryDto[];
  facilityName: string;
  canCollect: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalAccounts: number;
  onPageChange: (page: number) => void;
  onOpenCollect: (acc: RentSummaryDto) => void;
  onOpenHistory: (acc: RentSummaryDto) => void;
}

export function RentTable({
  accounts,
  facilityName: _facilityName,
  canCollect,
  page,
  pageSize,
  totalPages,
  totalAccounts,
  onPageChange,
  onOpenCollect,
  onOpenHistory,
}: RentTableProps) {
  const columns = createRentColumns({
    canCollect,
    onOpenCollect,
    onOpenHistory,
  });

  return (
    <DataTable
      columns={columns}
      rows={accounts}
      rowKey={(r) => r.grnId}
      onRowClick={onOpenHistory}
      pagination={{ page, pageSize, totalPages, totalRecords: totalAccounts, onPageChange }}
    />
  );
}
