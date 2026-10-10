import type { Group, GroupStockSummary } from '@cold-storage/contracts';

export interface GroupLike {
  id: string;
  facilityId: string;
  name: string;
  remarks?: string | null;
  customerId?: string | null;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function toGroupEntity(
  doc: GroupLike,
  extra?: { grnCount?: number; stockSummary?: GroupStockSummary; customerName?: string },
): Group {
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    name: doc.name,
    remarks: doc.remarks ?? null,
    customerId: doc.customerId ?? null,
    customerName: extra?.customerName,
    grnCount: extra?.grnCount ?? 0,
    stockSummary: extra?.stockSummary,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
