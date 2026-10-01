import { describe, expect, it } from 'vitest';
import type {
  ChallanDocumentDto,
  GrnDocumentDto,
  ReceiptDocumentDto,
  RentReceiptPreviewDto,
} from '@cold-storage/contracts';
import { renderChallanTemplate } from '../modules/documents/templates/challan.template.js';
import { renderGrnTemplate } from '../modules/documents/templates/grn.template.js';
import { renderReceiptTemplate } from '../modules/documents/templates/receipt.template.js';
import { renderRentReceiptTemplate } from '../modules/documents/templates/rent-receipt.template.js';

describe('P9 Document Templates Pure Rendering & Print Styling Tests', () => {
  const sampleOrg = {
    orgName: 'National Cold Chain Enterprise',
    address: 'Highway 44, G.T. Road, Sonipat, Haryana',
    contact: '+91-9812345678',
    gstin: '06BBBBB9999B1Z2',
    logoAssetId: 'logo_ncc_01',
    printFooter: 'Quality Preservation Guaranteed',
    timezone: 'Asia/Kolkata',
  };

  const sampleFacility = {
    facilityId: 'fac-sonipat',
    facilityName: 'Sonipat Mega Terminal',
    facilityCode: 'SNP-01',
    facilityAddress: 'Plot 12, Agro Hub, Sonipat',
  };

  const sampleGrnDto: GrnDocumentDto = {
    organization: sampleOrg,
    facility: sampleFacility,
    grnId: 'grn-100',
    grnNumber: 'GRN-2026-1001',
    inwardReceiptNumber: 'RCPT-2026-1001',
    date: new Date('2026-10-01T10:00:00.000Z'),
    customerName: 'Sardar Singh',
    customerMobile: '9812300001',
    commodityName: 'Potato (Sugar Free)',
    chamberNumber: 'CH-03',
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
    positions: [
      { positionCode: 'C3-R1-L1-P01', bags: 150 },
      { positionCode: 'C3-R1-L1-P02', bags: 150 },
    ],
    generatedAt: new Date('2026-10-01T11:00:00.000Z'),
    generatedBy: 'usr-operator-1',
  };

  // 1. Template purity invariant: identical input DTO produces bitwise identical HTML output; zero side effects
  it('template purity invariant: identical input DTO produces bitwise identical HTML output with zero side effects', () => {
    const output1 = renderGrnTemplate(sampleGrnDto);
    const output2 = renderGrnTemplate(sampleGrnDto);

    expect(output1).toBe(output2);
    expect(typeof output1).toBe('string');
    expect(output1.length).toBeGreaterThan(500);
  });

  // 2. GRN template structure: renders Organization Name, Facility sub-header, GRN number, chamber/rack/level positions, bag types, and weights
  it('renders complete GRN template structure with organization, facility, and storage details', () => {
    const html = renderGrnTemplate(sampleGrnDto);

    expect(html).toContain('National Cold Chain Enterprise');
    expect(html).toContain('Sonipat Mega Terminal (SNP-01)');
    expect(html).toContain('GRN-2026-1001');
    expect(html).toContain('GOODS RECEIPT NOTE (STORAGE RECORD)');
    expect(html).toContain('Sardar Singh');
    expect(html).toContain('C3-R1-L1-P01');
    expect(html).toContain('C3-R1-L1-P02');
    expect(html).toContain('14950 kg');
    expect(html).toContain('HR-10-XY-9999');
  });

  // 3. Inward Receipt template structure: renders Inward Receipt number, farmer name, mobile, commodity, bags, rent rate and terms
  it('renders complete Inward Receipt template with farmer acknowledgement and terms', () => {
    const receiptDto: ReceiptDocumentDto = {
      organization: sampleOrg,
      facility: sampleFacility,
      inwardReceiptNumber: 'RCPT-2026-1001',
      grnNumber: 'GRN-2026-1001',
      date: new Date('2026-10-01T10:00:00.000Z'),
      customerName: 'Sardar Singh',
      customerMobile: '9812300001',
      commodityName: 'Potato (Sugar Free)',
      chamberNumber: 'CH-03',
      bags: 300,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 45000,
      vehicleNumber: 'HR-10-XY-9999',
      generatedAt: new Date('2026-10-01T11:00:00.000Z'),
      generatedBy: 'usr-operator-1',
    };

    const html = renderReceiptTemplate(receiptDto);

    expect(html).toContain('FARMER INWARD ACKNOWLEDGEMENT RECEIPT');
    expect(html).toContain('RCPT-2026-1001');
    expect(html).toContain('Sardar Singh');
    expect(html).toContain('300 Bags (S)');
    expect(html).toContain('₹45000');
    expect(html).toContain('Terms &amp; Conditions of Storage');
  });

  // 4. Delivery Challan template structure: renders Challan number, date, vehicle number, driver name, items by chamber/position, and issuedBy
  it('renders complete Delivery Challan template with dispatch positions and gate pass declaration', () => {
    const challanDto: ChallanDocumentDto = {
      organization: sampleOrg,
      facility: sampleFacility,
      challanNumber: 'CHL-2026-5001',
      date: new Date('2026-10-02T14:30:00.000Z'),
      grnNumber: 'GRN-2026-1001',
      customerName: 'Sardar Singh',
      commodityName: 'Potato (Sugar Free)',
      chamberNumber: 'CH-03',
      totalBags: 100,
      items: [{ positionCode: 'C3-R1-L1-P01', bags: 100 }],
      vehicleNumber: 'DL-01-AA-4321',
      driverName: 'Karamjit Singh',
      issuedBy: 'Officer Verma',
      status: 'ISSUED',
      generatedAt: new Date('2026-10-02T14:35:00.000Z'),
      generatedBy: 'usr-operator-1',
    };

    const html = renderChallanTemplate(challanDto);

    expect(html).toContain('OUTWARD DELIVERY CHALLAN (GATE PASS)');
    expect(html).toContain('CHL-2026-5001');
    expect(html).toContain('DL-01-AA-4321');
    expect(html).toContain('Karamjit Singh');
    expect(html).toContain('Officer Verma');
    expect(html).toContain('C3-R1-L1-P01');
    expect(html).toContain('Gate Pass Declaration');
  });

  // 5. Rent Receipt preview structure: renders preview watermark (PREVIEW ONLY — UNCOMMITTED), customer name, and rent breakdown
  it('renders Rent Receipt preview template with explicit uncommitted preview watermark notice', () => {
    const rentPreviewDto: RentReceiptPreviewDto = {
      organization: sampleOrg,
      facility: sampleFacility,
      receiptNumber: 'PREVIEW-RRCPT-901',
      grnNumber: 'GRN-2026-1001',
      date: new Date('2026-10-02T15:00:00.000Z'),
      customerName: 'Sardar Singh',
      customerMobile: '9812300001',
      commodityName: 'Potato',
      totalRentObligation: 45000,
      amountPaid: 20000,
      paymentMode: 'Cash',
      remainingBalance: 25000,
      paymentStatus: 'Not Settled',
      isPreview: true,
      generatedAt: new Date('2026-10-02T15:00:00.000Z'),
      generatedBy: 'usr-admin',
    };

    const html = renderRentReceiptTemplate(rentPreviewDto);

    expect(html).toContain('RENT PAYMENT RECEIPT [PREVIEW]');
    expect(html).toContain('PREVIEW ONLY — UNCOMMITTED');
    expect(html).toContain('PREVIEW-RRCPT-901');
    expect(html).toContain('₹20000.00');
    expect(html).toContain('₹25000.00');
    expect(html).toContain('Phase 12 (Rent Collection &amp; Payment Management)');
  });

  // 6. Print CSS & CSP compliance: verifies @media print rules, A4 page sizing, .no-print concealment, page-break-inside: avoid, and same-origin logo image URL
  it('complies with print CSS rules, A4 page sizing, and same-origin logo resolution', () => {
    const html = renderGrnTemplate(sampleGrnDto);

    // Print CSS rules
    expect(html).toContain('@media print');
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('.no-print');
    expect(html).toContain('page-break-inside: avoid');

    // Same-origin asset resolver URL for logo (no external URL)
    expect(html).toContain('src="/api/assets/logo_ncc_01"');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });
});
