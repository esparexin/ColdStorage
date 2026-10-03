import type {
  ChallanDocumentDto,
  GrnDocumentDto,
  ReceiptDocumentDto,
  RentReceiptDocumentDto,
} from '@cold-storage/contracts';

/**
 * Shared pure-rendering fixtures for the Phase 9 document templates.
 *
 * Chamber is a single free-text label on every document DTO. `customerMobile`, `chamberNumber`,
 * the GRN `positions[]` breakdown and the challan `items[]` breakdown no longer exist, so these
 * builders deliberately omit them: there is no customer contact field and no storage position
 * tree to render.
 */

export const sampleOrganization = {
  orgName: 'National Cold Chain Enterprise',
  address: 'Highway 44, G.T. Road, Sonipat, Haryana',
  contact: '+91-9812345678',
  gstin: '06BBBBB9999B1Z2',
  logoAssetId: 'logo_ncc_01',
  printFooter: 'Quality Preservation Guaranteed',
  timezone: 'Asia/Kolkata',
};

export const sampleFacility = {
  facilityId: 'fac-sonipat',
  facilityName: 'Sonipat Mega Terminal',
  facilityCode: 'SNP-01',
  facilityAddress: 'Plot 12, Agro Hub, Sonipat',
};

export function makeGrnDto(overrides: Partial<GrnDocumentDto> = {}): GrnDocumentDto {
  return {
    organization: sampleOrganization,
    facility: sampleFacility,
    grnId: 'grn-100',
    grnNumber: 'GRN-2026-1001',
    inwardReceiptNumber: 'RCPT-2026-1001',
    date: new Date('2026-10-01T10:00:00.000Z'),
    customerName: 'Sardar Singh',
    commodityName: 'Potato (Sugar Free)',
    chamber: 'CH-03',
    bags: 300,
    bagType: 'S',
    rentType: 'Seasonal',
    rentAmount: 45000,
    rentMonths: null,
    nominalUnitWeight: 50,
    nominalTotalWeight: 15000,
    actualWeight: 14950,
    vehicleNumber: 'HR-10-XY-9999',
    gpNumber: 'GP-442',
    marks: 'Premium Red',
    status: 'OPEN',
    generatedAt: new Date('2026-10-01T11:00:00.000Z'),
    generatedBy: 'usr-operator-1',
    ...overrides,
  };
}

export function makeReceiptDto(overrides: Partial<ReceiptDocumentDto> = {}): ReceiptDocumentDto {
  return {
    organization: sampleOrganization,
    facility: sampleFacility,
    inwardReceiptNumber: 'RCPT-2026-1001',
    grnNumber: 'GRN-2026-1001',
    date: new Date('2026-10-01T10:00:00.000Z'),
    customerName: 'Sardar Singh',
    commodityName: 'Potato (Sugar Free)',
    chamber: 'CH-03',
    bags: 300,
    bagType: 'S',
    rentType: 'Seasonal',
    rentAmount: 45000,
    vehicleNumber: 'HR-10-XY-9999',
    generatedAt: new Date('2026-10-01T11:00:00.000Z'),
    generatedBy: 'usr-operator-1',
    ...overrides,
  };
}

export function makeChallanDto(overrides: Partial<ChallanDocumentDto> = {}): ChallanDocumentDto {
  return {
    organization: sampleOrganization,
    facility: sampleFacility,
    challanNumber: 'CHL-2026-5001',
    date: new Date('2026-10-02T14:30:00.000Z'),
    grnNumber: 'GRN-2026-1001',
    customerName: 'Sardar Singh',
    commodityName: 'Potato (Sugar Free)',
    chamber: 'CH-03',
    bags: 100,
    vehicleNumber: 'DL-01-AA-4321',
    driverName: 'Karamjit Singh',
    issuedBy: 'Officer Verma',
    status: 'ISSUED',
    generatedAt: new Date('2026-10-02T14:35:00.000Z'),
    generatedBy: 'usr-operator-1',
    ...overrides,
  };
}

/**
 * One schema serves both the authoritative committed receipt (isPreview: false) and the
 * zero-write preview (isPreview: true).
 */
export function makeRentReceiptDto(
  overrides: Partial<RentReceiptDocumentDto> = {},
): RentReceiptDocumentDto {
  return {
    organization: sampleOrganization,
    facility: sampleFacility,
    receiptNumber: 'RRCPT-901',
    grnNumber: 'GRN-2026-1001',
    date: new Date('2026-10-02T15:00:00.000Z'),
    customerName: 'Sardar Singh',
    commodityName: 'Potato',
    chamber: 'CH-03',
    totalRentObligation: 45000,
    amountPaid: 20000,
    paymentMode: 'Cash',
    remainingBalance: 25000,
    paymentStatus: 'Not Settled',
    isPreview: false,
    generatedAt: new Date('2026-10-02T15:00:00.000Z'),
    generatedBy: 'usr-admin',
    ...overrides,
  };
}
