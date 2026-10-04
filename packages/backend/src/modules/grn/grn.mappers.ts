import type { Grn, GrnAcknowledgement } from '@cold-storage/contracts';

export function toGrnEntity(doc: {
  id: string;
  facilityId: string;
  grnNumber: string;
  inwardReceiptNumber: string;
  date: Date;
  customerId: string;
  customerName: string;
  commodityId: string;
  commodityName: string;
  chamber: string;
  bags: number;
  bagType: string;
  smallBagWeight?: number | null;
  bigBagWeight?: number | null;
  rentType: string;
  rentMonths?: number | null;
  rentAmount: number;
  bagPrice?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  smallBags?: number | null;
  bigBags?: number | null;
  gpNumber?: string | null;
  marks?: string | null;
  vehicleNumber?: string | null;
  remarks?: string | null;
  status: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  netDeliveredBags?: number;
  closingBags?: number;
}, extras?: { netDeliveredBags?: number; closingBags?: number }): Grn {
  const netDelivered = extras?.netDeliveredBags ?? doc.netDeliveredBags ?? 0;
  const closing = extras?.closingBags ?? doc.closingBags ?? Math.max(0, doc.bags - netDelivered);
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    grnNumber: doc.grnNumber,
    inwardReceiptNumber: doc.inwardReceiptNumber,
    date: doc.date,
    customerId: doc.customerId,
    customerName: doc.customerName,
    commodityId: doc.commodityId,
    commodityName: doc.commodityName,
    chamber: doc.chamber,
    bags: doc.bags,
    bagType: doc.bagType as Grn['bagType'],
    smallBagWeight: doc.smallBagWeight ?? null,
    bigBagWeight: doc.bigBagWeight ?? null,
    rentType: doc.rentType as Grn['rentType'],
    rentMonths: doc.rentMonths ?? null,
    rentAmount: doc.rentAmount,
    bagPrice: doc.bagPrice ?? null,
    smallBagPrice: doc.smallBagPrice ?? null,
    bigBagPrice: doc.bigBagPrice ?? null,
    smallBags: doc.smallBags ?? null,
    bigBags: doc.bigBags ?? null,
    gpNumber: doc.gpNumber ?? null,
    marks: doc.marks ?? null,
    vehicleNumber: doc.vehicleNumber ?? null,
    remarks: doc.remarks ?? null,
    status: doc.status as Grn['status'],
    netDeliveredBags: netDelivered,
    closingBags: closing,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toGrnAcknowledgement(grn: Grn): GrnAcknowledgement {
  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    inwardReceiptNumber: grn.inwardReceiptNumber,
    inwardDate: grn.date,
    customer: {
      id: grn.customerId,
      name: grn.customerName,
    },
    commodity: {
      id: grn.commodityId,
      name: grn.commodityName,
    },
    storageLocation: {
      chamber: grn.chamber,
    },
    bagAccounting: {
      bags: grn.bags,
      bagType: grn.bagType,
      bagPrice: grn.bagPrice ?? null,
      smallBagPrice: grn.smallBagPrice ?? null,
      bigBagPrice: grn.bigBagPrice ?? null,
      smallBags: grn.smallBags ?? null,
      bigBags: grn.bigBags ?? null,
      smallBagWeight: grn.smallBagWeight,
      bigBagWeight: grn.bigBagWeight,
    },
    rentTerms: {
      rentType: grn.rentType,
      rentMonths: grn.rentMonths,
      rentAmount: grn.rentAmount,
    },
    transport: {
      gpNumber: grn.gpNumber,
      marks: grn.marks,
      vehicleNumber: grn.vehicleNumber,
    },
    remarks: grn.remarks,
    status: grn.status,
    issuedBy: grn.createdBy,
    issuedAt: grn.createdAt ?? new Date(),
  };
}
