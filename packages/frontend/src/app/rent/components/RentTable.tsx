'use client';

import React from 'react';
import type { RentDeliveryBill, RentSummaryDto } from '@cold-storage/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { createRentColumns } from './RentTableColumns';
import type { RentBillTableRow } from '../hooks/rentTableRows.helper';

interface RentTableProps {
  rows: RentBillTableRow[];
  facilityName: string;
  canCollect: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalAccounts: number;
  onPageChange: (page: number) => void;
  onOpenCollect: (acc: RentSummaryDto, del?: RentDeliveryBill | null) => void;
  onOpenHistory: (acc: RentSummaryDto, deliveryId?: string) => void;
}

export function RentTable({
  rows,
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
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={(r) => onOpenHistory(r.account, r.deliveryId)}
      pagination={{ page, pageSize, totalPages, totalRecords: totalAccounts, onPageChange }}
    />
  );
}
