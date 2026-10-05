'use client';

import React, { useMemo } from 'react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { createDeliveryColumns } from './deliveryTableColumns';

interface DeliveryTableProps {
  deliveries: DeliveryChallan[];
  caption: string;
  canPrint: boolean;
  canCollectRent?: boolean;
  printingId: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  totalDeliveries: number;
  onPageChange: (page: number) => void;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onCollectRent?: (delivery: DeliveryChallan) => void;
}

export function DeliveryTable({
  deliveries,
  caption,
  canPrint,
  canCollectRent,
  printingId,
  page,
  pageSize,
  totalPages,
  totalDeliveries,
  onPageChange,
  onSelectDelivery,
  onPrintChallan,
  onCollectRent,
}: DeliveryTableProps) {
  const columns = useMemo(
    () =>
      createDeliveryColumns({
        canPrint,
        canCollectRent,
        printingId,
        onSelectDelivery,
        onPrintChallan,
        onCollectRent,
      }),
    [canPrint, canCollectRent, printingId, onSelectDelivery, onPrintChallan, onCollectRent],
  );

  return (
    <DataTable
      columns={columns}
      rows={deliveries}
      rowKey={(r) => r.id}
      caption={caption}
      pagination={{
        page,
        pageSize,
        totalPages,
        totalRecords: totalDeliveries,
        onPageChange,
      }}
    />
  );
}
