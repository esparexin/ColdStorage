/**
 * CSV column definitions and row mappers for the export endpoints.
 *
 * Each export pairs its header list with a mapper here, so the two can never drift: a column
 * added to a header without a matching cell (or the reverse) fails the row mapper's type rather
 * than silently producing a short row.
 *
 * Bag composition is exported as its parts plus the derived total, because a receipt or challan
 * stores the two parts and never the total.
 */

const isoDate = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().split('T')[0] : String(value);

export const GRN_EXPORT_HEADERS = [
  'grnNumber',
  'inwardReceiptNumber',
  'date',
  'customerName',
  'commodityName',
  'chamber',
  'smallBags',
  'bigBags',
  'bags',
  'bagType',
  'rentType',
  'rentMonths',
  'rentAmount',
  'gpNumber',
  'vehicleNumber',
  'remarks',
  'status',
  'createdAt',
] as const;

export const DELIVERY_EXPORT_HEADERS = [
  'challanNumber',
  'date',
  'grnNumber',
  'customerName',
  'commodityName',
  'chamber',
  'smallBags',
  'bigBags',
  'totalBags',
  'vehicleNumber',
  'driverName',
  'weight',
  'remarks',
  'status',
  'createdAt',
] as const;

export const LEDGER_EXPORT_HEADERS = [
  'createdAt',
  'transactionType',
  'grnNumber',
  'chamber',
  'commodityId',
  'bagType',
  'smallQuantity',
  'bigQuantity',
  'quantity',
  'referenceType',
  'referenceId',
  'createdBy',
] as const;

interface GrnExportRow {
  grnNumber: string;
  inwardReceiptNumber: string;
  date: Date;
  customerName: string;
  commodityName: string;
  chamber: string;
  smallBags: number;
  bigBags: number;
  bags: number;
  bagType: string;
  rentType: string;
  rentMonths?: number | null;
  rentAmount: number;
  gpNumber?: string | null;
  vehicleNumber?: string | null;
  remarks?: string | null;
  status: string;
  createdAt: Date;
}

export function mapGrnToCells(doc: GrnExportRow): unknown[] {
  return [
    doc.grnNumber,
    doc.inwardReceiptNumber,
    isoDate(doc.date),
    doc.customerName,
    doc.commodityName,
    doc.chamber,
    doc.smallBags,
    doc.bigBags,
    doc.bags,
    doc.bagType,
    doc.rentType,
    doc.rentMonths ?? '',
    doc.rentAmount,
    doc.gpNumber ?? '',
    doc.vehicleNumber ?? '',
    doc.remarks ?? '',
    doc.status,
    doc.createdAt,
  ];
}

interface DeliveryExportRow {
  challanNumber: string;
  date: Date;
  grnNumber: string;
  customerName: string;
  commodityName: string;
  chamber: string;
  smallBags: number;
  bigBags: number;
  vehicleNumber?: string | null;
  driverName?: string | null;
  weight?: number | null;
  remarks?: string | null;
  status: string;
  createdAt: Date;
}

export function mapDeliveryToCells(doc: DeliveryExportRow): unknown[] {
  return [
    doc.challanNumber,
    isoDate(doc.date),
    doc.grnNumber,
    doc.customerName,
    doc.commodityName,
    doc.chamber,
    doc.smallBags,
    doc.bigBags,
    doc.smallBags + doc.bigBags,
    doc.vehicleNumber ?? '',
    doc.driverName ?? '',
    doc.weight ?? '',
    doc.remarks ?? '',
    doc.status,
    doc.createdAt,
  ];
}

interface LedgerExportRow {
  createdAt: Date;
  transactionType: string;
  grnNumber: string;
  chamber: string;
  commodityId: string;
  bagType: string;
  smallQuantity: number;
  bigQuantity: number;
  referenceType: string;
  referenceId: string;
  createdBy: string;
}

export function mapLedgerToCells(doc: LedgerExportRow): unknown[] {
  return [
    doc.createdAt,
    doc.transactionType,
    doc.grnNumber,
    doc.chamber,
    doc.commodityId,
    doc.bagType,
    doc.smallQuantity,
    doc.bigQuantity,
    doc.smallQuantity + doc.bigQuantity,
    doc.referenceType,
    doc.referenceId,
    doc.createdBy,
  ];
}