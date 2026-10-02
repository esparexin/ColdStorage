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
  chamberId: string;
  chamberNumber: string;
  bags: number;
  bagType: string;
  nominalUnitWeight?: number | null;
  nominalTotalWeight?: number | null;
  actualWeight?: number | null;
  authoritativeWeight?: number | null;
  rentType: string;
  rentMonths?: number | null;
  rentAmount: number;
  gpNumber?: string | null;
  marks?: string | null;
  vehicleNumber?: string | null;
  remarks?: string | null;
  status: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}): Grn {
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
    chamberId: doc.chamberId,
    chamberNumber: doc.chamberNumber,
    bags: doc.bags,
    bagType: doc.bagType as Grn['bagType'],
    nominalUnitWeight: doc.nominalUnitWeight ?? null,
    nominalTotalWeight: doc.nominalTotalWeight ?? null,
    actualWeight: doc.actualWeight ?? null,
    authoritativeWeight: doc.authoritativeWeight ?? null,
    rentType: doc.rentType as Grn['rentType'],
    rentMonths: doc.rentMonths ?? null,
    rentAmount: doc.rentAmount,
    gpNumber: doc.gpNumber ?? null,
    marks: doc.marks ?? null,
    vehicleNumber: doc.vehicleNumber ?? null,
    remarks: doc.remarks ?? null,
    status: doc.status as Grn['status'],
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
      chamberId: grn.chamberId,
      chamberNumber: grn.chamberNumber,
    },
    bagAccounting: {
      bags: grn.bags,
      bagType: grn.bagType,
      nominalUnitWeight: grn.nominalUnitWeight,
      nominalTotalWeight: grn.nominalTotalWeight,
      actualWeight: grn.actualWeight,
      authoritativeWeight: grn.authoritativeWeight,
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
