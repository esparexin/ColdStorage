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
  totalBagsWeight?: number | null;
  rentType: string;
  rentMonths?: number | null;
  rentAmount: number;
  bagPrice?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  smallBags: number;
  bigBags: number;
  gpNumber?: string | null;
  storageMark?: string | null;
  partyMark?: string | null;
  marks?: string | null;
  vehicleNumber?: string | null;
  remarks?: string | null;
  status: string;
  bondNumber?: string | null;
  isBondForLoan?: boolean;
  loanStatus?: string;
  loanBankName?: string | null;
  loanReferenceNumber?: string | null;
  loanRemarks?: string | null;
  loanTakenAt?: Date | null;
  loanClearedAt?: Date | null;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  netDeliveredBags?: number;
  closingBags?: number;
}, extras?: { netDeliveredBags?: number; closingBags?: number }): Grn {
  // Both figures are derived at read time from the ledger-sourced extras the caller passes.
  // There is no stored snapshot to fall back to: the model no longer carries either field.
  const netDelivered = extras?.netDeliveredBags ?? 0;
  const closing = extras?.closingBags ?? Math.max(0, doc.bags - netDelivered);
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    grnNumber: doc.grnNumber,
    inwardReceiptNumber: doc.inwardReceiptNumber,
    billNumber: doc.inwardReceiptNumber,
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
    totalBagsWeight: doc.totalBagsWeight ?? null,
    rentType: doc.rentType as Grn['rentType'],
    rentMonths: doc.rentMonths ?? null,
    rentAmount: doc.rentAmount,
    bagPrice: doc.bagPrice ?? null,
    smallBagPrice: doc.smallBagPrice ?? null,
    bigBagPrice: doc.bigBagPrice ?? null,
    smallBags: doc.smallBags,
    bigBags: doc.bigBags,
    gpNumber: doc.gpNumber ?? null,
    storageMark: doc.storageMark ?? null,
    partyMark: doc.partyMark ?? null,
    marks: doc.marks ?? null,
    vehicleNumber: doc.vehicleNumber ?? null,
    remarks: doc.remarks ?? null,
    status: doc.status as Grn['status'],
    bondNumber: ((doc as Record<string, unknown>).bondNumber as string | null) ?? null,
    isBondForLoan: (doc as Record<string, unknown>).isBondForLoan === true,
    loanStatus: ((doc as Record<string, unknown>).loanStatus as Grn['loanStatus']) || 'NONE',
    loanBankName: ((doc as Record<string, unknown>).loanBankName as string | null) ?? null,
    loanReferenceNumber: ((doc as Record<string, unknown>).loanReferenceNumber as string | null) ?? null,
    loanRemarks: ((doc as Record<string, unknown>).loanRemarks as string | null) ?? null,
    loanTakenAt: ((doc as Record<string, unknown>).loanTakenAt as Date | null) ?? null,
    loanClearedAt: ((doc as Record<string, unknown>).loanClearedAt as Date | null) ?? null,
    loanSettlementAmount: ((doc as Record<string, unknown>).loanSettlementAmount as number | null) ?? null,
    loanSettlementMode: ((doc as Record<string, unknown>).loanSettlementMode as Grn['loanSettlementMode']) ?? null,
    loanSettlementUtr: ((doc as Record<string, unknown>).loanSettlementUtr as string | null) ?? null,
    loanSettlementBankName: ((doc as Record<string, unknown>).loanSettlementBankName as string | null) ?? null,
    loanSettlementAccountNumber: ((doc as Record<string, unknown>).loanSettlementAccountNumber as string | null) ?? null,
    loanSettlementIfsc: ((doc as Record<string, unknown>).loanSettlementIfsc as string | null) ?? null,
    loanSettlementReceiverName: ((doc as Record<string, unknown>).loanSettlementReceiverName as string | null) ?? null,
    loanSettlementReceiverAadhaar: ((doc as Record<string, unknown>).loanSettlementReceiverAadhaar as string | null) ?? null,
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
      smallBags: grn.smallBags,
      bigBags: grn.bigBags,
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
      storageMark: grn.storageMark,
      partyMark: grn.partyMark,
      marks: grn.marks,
      vehicleNumber: grn.vehicleNumber,
    },
    remarks: grn.remarks,
    status: grn.status,
    bondNumber: grn.bondNumber ?? null,
    isBondForLoan: grn.isBondForLoan,
    issuedBy: grn.createdBy,
    issuedAt: grn.createdAt ?? new Date(),
  };
}
