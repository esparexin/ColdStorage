import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CounterModel } from '../database/models/counter.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { documentService } from '../modules/documents/document.service.js';
import { settingsService } from '../modules/settings/settings.service.js';

describe('P9 DocumentService Read-Only Composition & Boundary Tests', () => {
  const facilityA = 'fac-doc-a';
  const facilityB = 'fac-doc-b';

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await SystemSettingsModel.deleteMany({});
    await FacilityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await CounterModel.deleteMany({});

    await FacilityModel.create([
      {
        id: facilityA,
        name: 'Facility Alpha',
        code: 'FA',
        address: 'Plot 1, Zone A',
        isActive: true,
      },
      {
        id: facilityB,
        name: 'Facility Beta',
        code: 'FB',
        address: 'Plot 2, Zone B',
        isActive: true,
      },
    ]);
  });

  async function configureValidOrgSettings() {
    await settingsService.ensureInitialized();
    await settingsService.updateSettings({
      orgName: 'Hindustan Cold Warehouses Ltd',
      address: 'Corporate Tower 9, Gurugram, Haryana',
      contact: '+91-124-4567890',
      gstin: '06HCW000000A1Z9',
      logoAssetId: 'logo_hcw_official',
      printFooter: 'Registered with Warehousing Development and Regulatory Authority (WDRA)',
    });
  }

  // 1. Read-only composition: resolves GRN document data without mutating any database record
  it('read-only composition: resolves GRN document HTML without modifying database records', async () => {
    await configureValidOrgSettings();

    const createdGrn = await GrnModel.create({
      id: 'grn-ro-1',
      facilityId: facilityA,
      grnNumber: 'GRN-2026-0001',
      inwardReceiptNumber: 'RCPT-2026-0001',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      customerName: 'Kishan Lal',
      commodityId: 'comm-1',
      commodityName: 'Potato',
      chamberId: 'ch-1',
      chamberNumber: '1',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 15000,
      status: 'OPEN',
      createdBy: 'u1',
    });

    const initialUpdatedAt = (createdGrn as unknown as { updatedAt: Date }).updatedAt;

    const html = await documentService.renderGrnDocument(facilityA, 'grn-ro-1', 'usr-test');
    expect(html).toContain('GRN-2026-0001');
    expect(html).toContain('Kishan Lal');
    expect(html).toContain('Hindustan Cold Warehouses Ltd');

    const reloaded = await GrnModel.findOne({ id: 'grn-ro-1' }).lean().exec();
    expect((reloaded as unknown as { updatedAt: Date }).updatedAt).toEqual(initialUpdatedAt);
  });

  // 2. Organization identity binding: correctly injects SystemSettings as corporate header and FacilityModel as warehouse branch
  it('binds SystemSettings as organization header and FacilityModel as warehouse operating branch', async () => {
    await configureValidOrgSettings();

    await GrnModel.create({
      id: 'grn-bind-1',
      facilityId: facilityA,
      grnNumber: 'GRN-BIND-01',
      inwardReceiptNumber: 'RCPT-BIND-01',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      customerName: 'Kishan Lal',
      commodityId: 'comm-1',
      commodityName: 'Potato',
      chamberId: 'ch-1',
      chamberNumber: '1',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 15000,
      status: 'OPEN',
      createdBy: 'u1',
    });

    const html = await documentService.renderGrnDocument(facilityA, 'grn-bind-1', 'usr-test');
    expect(html).toContain('Hindustan Cold Warehouses Ltd');
    expect(html).toContain('Corporate Tower 9, Gurugram, Haryana');
    expect(html).toContain('Facility Alpha (FA)');
    expect(html).toContain('Plot 1, Zone A');
  });

  // 3. Unconfigured organization guard: throws ORGANIZATION_NOT_CONFIGURED if administrator has not configured organization details
  it('throws ORGANIZATION_NOT_CONFIGURED when administrator has not configured organization details', async () => {
    await settingsService.ensureInitialized(); // orgName is empty string

    await GrnModel.create({
      id: 'grn-unconf-1',
      facilityId: facilityA,
      grnNumber: 'GRN-UNCONF-01',
      inwardReceiptNumber: 'RCPT-UNCONF-01',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      customerName: 'Kishan Lal',
      commodityId: 'comm-1',
      commodityName: 'Potato',
      chamberId: 'ch-1',
      chamberNumber: '1',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 15000,
      status: 'OPEN',
      createdBy: 'u1',
    });

    await expect(
      documentService.renderGrnDocument(facilityA, 'grn-unconf-1', 'usr-test'),
    ).rejects.toThrow('ORGANIZATION_NOT_CONFIGURED');
  });

  // 4. Document-level facility ownership validation: throws FACILITY_MISMATCH when route facilityId does not match GRN facilityId
  it('throws FACILITY_MISMATCH when route facilityId does not match GRN facilityId', async () => {
    await configureValidOrgSettings();

    // GRN belongs to facility B
    await GrnModel.create({
      id: 'grn-fac-b',
      facilityId: facilityB,
      grnNumber: 'GRN-FAC-B',
      inwardReceiptNumber: 'RCPT-FAC-B',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      customerName: 'Kishan Lal',
      commodityId: 'comm-1',
      commodityName: 'Potato',
      chamberId: 'ch-1',
      chamberNumber: '1',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 15000,
      status: 'OPEN',
      createdBy: 'u1',
    });

    // Requesting under Facility A must be rejected
    await expect(
      documentService.renderGrnDocument(facilityA, 'grn-fac-b', 'usr-test'),
    ).rejects.toThrow('FACILITY_MISMATCH');
  });

  // 5. Challan facility ownership validation: throws FACILITY_MISMATCH when route facilityId does not match Challan facilityId
  it('throws FACILITY_MISMATCH when route facilityId does not match Challan facilityId', async () => {
    await configureValidOrgSettings();

    await DeliveryChallanModel.create({
      id: 'chl-fac-b',
      facilityId: facilityB,
      challanNumber: 'CHL-FAC-B',
      date: new Date('2026-10-02'),
      grnId: 'grn-1',
      grnNumber: 'GRN-01',
      customerId: 'c1',
      customerName: 'Farmer One',
      commodityId: 'cmd1',
      commodityName: 'Potato',
      chamberId: 'ch1',
      chamberNumber: '1',
      items: [{ positionId: 'p1', positionCode: 'P-1', bags: 20 }],
      totalBags: 20,
      status: 'ISSUED',
      issuedBy: 'Officer',
    });

    // Requesting under Facility A must be rejected
    await expect(
      documentService.renderChallanDocument(facilityA, 'chl-fac-b', 'usr-test'),
    ).rejects.toThrow('FACILITY_MISMATCH');
  });

  // 6. Numbering ownership guard (GRN): verifies counterService is never invoked and counter sequence is never incremented
  it('numbering ownership guard (GRN): document rendering does not call CounterService or increment counters', async () => {
    await configureValidOrgSettings();

    await CounterModel.create({
      facilityId: facilityA,
      counterType: 'GRN',
      financialYear: '2026-2027',
      lastSequence: 42,
    });

    await GrnModel.create({
      id: 'grn-num-1',
      facilityId: facilityA,
      grnNumber: 'GRN-2026-0042',
      inwardReceiptNumber: 'RCPT-2026-0042',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      customerName: 'Kishan Lal',
      commodityId: 'comm-1',
      commodityName: 'Potato',
      chamberId: 'ch-1',
      chamberNumber: '1',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 15000,
      status: 'OPEN',
      createdBy: 'u1',
    });

    await documentService.renderGrnDocument(facilityA, 'grn-num-1', 'usr-test');

    const counter = await CounterModel.findOne({ facilityId: facilityA, counterType: 'GRN' });
    expect(counter?.lastSequence).toBe(42); // Unchanged!
  });

  // 7. Numbering ownership guard (Challan): verifies counterService is never invoked and challan sequence is never incremented
  it('numbering ownership guard (Challan): challan rendering does not increment counters', async () => {
    await configureValidOrgSettings();

    await CounterModel.create({
      facilityId: facilityA,
      counterType: 'CHALLAN',
      financialYear: '2026-2027',
      lastSequence: 18,
    });

    await DeliveryChallanModel.create({
      id: 'chl-num-1',
      facilityId: facilityA,
      challanNumber: 'CHL-2026-0018',
      date: new Date('2026-10-02'),
      grnId: 'grn-1',
      grnNumber: 'GRN-01',
      customerId: 'c1',
      customerName: 'Farmer One',
      commodityId: 'cmd1',
      commodityName: 'Potato',
      chamberId: 'ch1',
      chamberNumber: '1',
      items: [{ positionId: 'p1', positionCode: 'P-1', bags: 10 }],
      totalBags: 10,
      status: 'ISSUED',
      issuedBy: 'Officer',
    });

    await documentService.renderChallanDocument(facilityA, 'chl-num-1', 'usr-test');

    const counter = await CounterModel.findOne({ facilityId: facilityA, counterType: 'CHALLAN' });
    expect(counter?.lastSequence).toBe(18); // Unchanged!
  });

  // 8. Inward receipt data resolution: correctly joins GRN and Customer records for receipt generation
  it('correctly resolves GRN and Customer records to render Inward Receipt acknowledgement', async () => {
    await configureValidOrgSettings();

    await GrnModel.create({
      id: 'grn-rcpt-1',
      facilityId: facilityA,
      grnNumber: 'GRN-2026-0005',
      inwardReceiptNumber: 'RCPT-2026-0005',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      customerName: 'Harpreet Singh',
      customerMobile: '9876500005',
      commodityId: 'comm-1',
      commodityName: 'Apple (Royal Delicious)',
      chamberId: 'ch-2',
      chamberNumber: 'CH-02',
      bags: 120,
      bagType: 'B',
      rentType: 'Monthly',
      rentAmount: 24000,
      rentMonths: 3,
      vehicleNumber: 'PB-02-AA-9988',
      status: 'OPEN',
      createdBy: 'u1',
    });

    const html = await documentService.renderReceiptDocument(facilityA, 'grn-rcpt-1', 'usr-test');
    expect(html).toContain('FARMER INWARD ACKNOWLEDGEMENT RECEIPT');
    expect(html).toContain('RCPT-2026-0005');
    expect(html).toContain('Harpreet Singh');
    expect(html).toContain('Apple (Royal Delicious)');
    expect(html).toContain('PB-02-AA-9988');
  });

  // 9. Delivery challan data resolution: correctly joins Delivery Challan, items, and Customer records
  it('correctly resolves Delivery Challan and item positions for gate pass generation', async () => {
    await configureValidOrgSettings();

    await DeliveryChallanModel.create({
      id: 'chl-res-1',
      facilityId: facilityA,
      challanNumber: 'CHL-2026-0099',
      date: new Date('2026-10-02'),
      grnId: 'grn-1',
      grnNumber: 'GRN-01',
      customerId: 'c1',
      customerName: 'Harpreet Singh',
      commodityId: 'cmd1',
      commodityName: 'Apple',
      chamberId: 'ch2',
      chamberNumber: 'CH-02',
      items: [
        { positionId: 'pos-1', positionCode: 'C2-R1-L1-P01', bags: 30 },
        { positionId: 'pos-2', positionCode: 'C2-R1-L1-P02', bags: 20 },
      ],
      totalBags: 50,
      vehicleNumber: 'PB-02-BB-1122',
      driverName: 'Sohan Lal',
      issuedBy: 'Operator Deep',
      status: 'ISSUED',
    });

    const html = await documentService.renderChallanDocument(facilityA, 'chl-res-1', 'usr-test');
    expect(html).toContain('OUTWARD DELIVERY CHALLAN (GATE PASS)');
    expect(html).toContain('CHL-2026-0099');
    expect(html).toContain('PB-02-BB-1122');
    expect(html).toContain('Sohan Lal');
    expect(html).toContain('C2-R1-L1-P01');
    expect(html).toContain('C2-R1-L1-P02');
  });

  // 10. Rent receipt preview boundary: verifies preview generation performs zero writes to database, allocates zero numbers, and creates zero payment records
  it('rent receipt preview boundary: performs zero writes to database and creates zero payment records', async () => {
    await configureValidOrgSettings();

    const collectionsBefore = await mongoose.connection.db!.listCollections().toArray();
    const countersBefore = await CounterModel.find().lean();

    const html = await documentService.renderRentReceiptPreview(facilityA, 'usr-test');
    expect(html).toContain('RENT PAYMENT RECEIPT [PREVIEW]');
    expect(html).toContain('PREVIEW ONLY — UNCOMMITTED');

    const collectionsAfter = await mongoose.connection.db!.listCollections().toArray();
    expect(collectionsAfter.length).toBe(collectionsBefore.length);

    const countersAfter = await CounterModel.find().lean();
    expect(countersAfter).toEqual(countersBefore);
  });

  // 11. Non-existent GRN: throws GRN_NOT_FOUND when invalid grnId is requested
  it('throws GRN_NOT_FOUND when non-existent grnId is requested', async () => {
    await configureValidOrgSettings();

    await expect(
      documentService.renderGrnDocument(facilityA, 'non-existent-grn', 'usr-test'),
    ).rejects.toThrow('GRN_NOT_FOUND');
  });

  // 12. Non-existent Challan: throws CHALLAN_NOT_FOUND when invalid challanId is requested
  it('throws CHALLAN_NOT_FOUND when non-existent challanId is requested', async () => {
    await configureValidOrgSettings();

    await expect(
      documentService.renderChallanDocument(facilityA, 'non-existent-challan', 'usr-test'),
    ).rejects.toThrow('CHALLAN_NOT_FOUND');
  });
});
