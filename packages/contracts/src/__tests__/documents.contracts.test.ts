import { describe, expect, it } from 'vitest';
import {
  challanDocumentDtoSchema,
  documentFormatQuerySchema,
  grnDocumentDtoSchema,
  receiptDocumentDtoSchema,
  rentReceiptPreviewDtoSchema,
  systemSettingsSchema,
} from '../index.js';

describe('P9 Documents & Settings Contracts Tests', () => {
  const sampleOrg = {
    orgName: 'Agro Cold Storage Private Limited',
    address: '123 Mandi Road, Sector 5, Karnal, Haryana',
    contact: '+91-9876543210',
    gstin: '06AAAAA0000A1Z5',
    logoAssetId: 'logo_001',
    printFooter: 'Thank you for your business. Disputes subject to Karnal jurisdiction.',
    timezone: 'Asia/Kolkata',
  };

  const sampleFacility = {
    facilityId: 'fac-101',
    facilityName: 'Karnal Main Cold Storage',
    facilityCode: 'KNL-01',
    facilityAddress: 'Plot 45, Industrial Area, Karnal',
  };

  // 1. Validates document format query schema: accepts empty query (defaults to html)
  it('validates document format query schema: accepts empty query and defaults to html', () => {
    const result = documentFormatQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe('html');
    }
  });

  // 2. Validates document format query schema: rejects non-html formats (e.g. pdf, docx)
  it('validates document format query schema: rejects non-html formats', () => {
    const pdfResult = documentFormatQuerySchema.safeParse({ format: 'pdf' });
    expect(pdfResult.success).toBe(false);

    const docxResult = documentFormatQuerySchema.safeParse({ format: 'docx' });
    expect(docxResult.success).toBe(false);
  });

  // 3. Validates GRN print DTO schema with valid required fields
  it('validates GRN print DTO schema with complete valid fields', () => {
    const validGrn = {
      organization: sampleOrg,
      facility: sampleFacility,
      grnId: 'grn-001',
      grnNumber: 'GRN-2026-0001',
      inwardReceiptNumber: 'RCPT-2026-0001',
      date: new Date('2026-10-01'),
      customerName: 'Ramesh Farmer',
      commodityName: 'Potato (Kufri Jyoti)',
      chamber: 'CH-01',
      bags: 250,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 37500,
      rentMonths: 10,
      nominalUnitWeight: 50,
      nominalTotalWeight: 12500,
      actualWeight: 12480,
      vehicleNumber: 'HR-05-AB-1234',
      gpNumber: 'GP-987',
      marks: 'Grade A',
      status: 'OPEN',
      generatedAt: new Date(),
      generatedBy: 'usr-admin',
    };

    const result = grnDocumentDtoSchema.safeParse(validGrn);
    expect(result.success).toBe(true);
  });

  // 4. Rejects GRN print DTO schema when essential fields (e.g. grnNumber, bags) are missing
  it('rejects GRN print DTO schema when essential fields are missing', () => {
    const invalidGrn = {
      organization: sampleOrg,
      facility: sampleFacility,
      // missing grnNumber
      inwardReceiptNumber: 'RCPT-2026-0001',
      date: new Date(),
      customerName: 'Ramesh Farmer',
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 0, // invalid: min is 1
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 100,
      generatedAt: new Date(),
      generatedBy: 'usr-admin',
    };

    const result = grnDocumentDtoSchema.safeParse(invalidGrn);
    expect(result.success).toBe(false);
  });

  // 5. Validates Inward Receipt print DTO schema
  it('validates Inward Receipt print DTO schema with valid deposit slip data', () => {
    const validReceipt = {
      organization: sampleOrg,
      facility: sampleFacility,
      inwardReceiptNumber: 'RCPT-2026-0001',
      grnNumber: 'GRN-2026-0001',
      date: new Date('2026-10-01'),
      customerName: 'Ramesh Farmer',
      commodityName: 'Potato (Kufri Jyoti)',
      chamber: 'CH-01',
      bags: 250,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 37500,
      rentMonths: 10,
      vehicleNumber: 'HR-05-AB-1234',
      generatedAt: new Date(),
      generatedBy: 'usr-operator',
    };

    const result = receiptDocumentDtoSchema.safeParse(validReceipt);
    expect(result.success).toBe(true);
  });

  // 6. Validates Delivery Challan print DTO schema
  it('validates Delivery Challan print DTO schema with valid dispatch details', () => {
    const validChallan = {
      organization: sampleOrg,
      facility: sampleFacility,
      challanNumber: 'CHL-2026-0001',
      date: new Date('2026-10-02'),
      grnNumber: 'GRN-2026-0001',
      customerName: 'Ramesh Farmer',
      commodityName: 'Potato (Kufri Jyoti)',
      chamber: 'CH-01',
      bags: 50,
      totalBags: 50,
      vehicleNumber: 'HR-05-CD-5678',
      driverName: 'Suresh Kumar',
      issuedBy: 'Operator One',
      status: 'ISSUED',
      generatedAt: new Date(),
      generatedBy: 'usr-operator',
    };

    const result = challanDocumentDtoSchema.safeParse(validChallan);
    expect(result.success).toBe(true);
  });

  // 7. Validates Rent Receipt preview DTO schema
  it('validates Rent Receipt preview DTO schema with isPreview flag and payment details', () => {
    const validRentPreview = {
      organization: sampleOrg,
      facility: sampleFacility,
      receiptNumber: 'PREVIEW-RRCPT-001',
      grnNumber: 'GRN-2026-0001',
      date: new Date('2026-10-02'),
      customerName: 'Ramesh Farmer',
      commodityName: 'Potato',
      chamber: 'CH-01',
      totalRentObligation: 37500,
      amountPaid: 15000,
      paymentMode: 'Cash',
      remainingBalance: 22500,
      paymentStatus: 'Not Settled',
      isPreview: true,
      generatedAt: new Date(),
      generatedBy: 'usr-admin',
    };

    const result = rentReceiptPreviewDtoSchema.safeParse(validRentPreview);
    expect(result.success).toBe(true);
  });

  // 8. Validates systemSettingsSchema preservation of backupPolicy and rejection of invalid GSTIN or blank org name
  it('validates systemSettingsSchema preserves backupPolicy and rejects blank orgName or invalid GSTIN', () => {
    // Blank orgName rejected
    const blankOrg = systemSettingsSchema.safeParse({
      orgName: '',
      address: 'Some Address',
      contact: '9876543210',
    });
    expect(blankOrg.success).toBe(false);

    // Invalid GSTIN (> 15 chars) rejected
    const invalidGstin = systemSettingsSchema.safeParse({
      orgName: 'Valid Org',
      address: 'Some Address',
      contact: '9876543210',
      gstin: 'INVALID_LONG_GSTIN_123456789',
    });
    expect(invalidGstin.success).toBe(false);

    // Valid settings with default backupPolicy preserved
    const valid = systemSettingsSchema.safeParse({
      orgName: 'Valid Org',
      address: 'Valid Address',
      contact: '9876543210',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.backupPolicy.retentionDays).toBe(30);
      expect(valid.data.backupPolicy.backupEnabled).toBe(true);
      expect(valid.data.timezone).toBe('Asia/Kolkata');
    }
  });
});
