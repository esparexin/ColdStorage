'use client';

import type { Grn } from '@cold-storage/contracts';
import { DataTable } from '@/components/ui/DataTable';
import {
  createGrnTableColumns,
  type CreateGrnTableColumnsParams,
} from './GrnTableColumns';

export {
  createGrnTableColumns,
  type CreateGrnTableColumnsParams,
};

export interface GrnTableProps {
  grns: Grn[];
  caption: string;
  isMergedTab?: boolean;
  canPrint: boolean;
  canCorrect?: boolean;
  canCreateChallan?: boolean;
  canInternalMove?: boolean;
  printingId: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  totalGrns: number;
  onPageChange: (page: number) => void;
  onSelectGrn: (grn: Grn) => void;
  onCorrectGrn?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function GrnTable({
  grns,
  caption,
  isMergedTab = false,
  canPrint,
  canCorrect = false,
  canCreateChallan = false,
  canInternalMove = false,
  printingId,
  page,
  pageSize,
  totalPages,
  totalGrns,
  onPageChange,
  onSelectGrn,
  onCorrectGrn,
  onCreateChallan,
  onInternalMove,
  onPrint,
}: GrnTableProps) {
  const columns = createGrnTableColumns({
    isMergedTab,
    canPrint,
    canCorrect,
    canCreateChallan,
    canInternalMove,
    printingId,
    onSelectGrn,
    onCorrectGrn,
    onCreateChallan,
    onInternalMove,
    onPrint,
  });

  return (
    <DataTable
      columns={columns}
      rows={grns}
      rowKey={(r) => r.id}
      caption={caption}
      pagination={{ page, pageSize, totalPages, totalRecords: totalGrns, onPageChange }}
      onRowClick={onSelectGrn}
    />
  );
}
