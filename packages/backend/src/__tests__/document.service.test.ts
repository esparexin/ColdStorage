import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CounterModel } from '../database/models/counter.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { documentService } from '../modules/documents/document.service.js';
import {
  configureOrganization,
  connectDocumentDatabase,
  disconnectDocumentDatabase,
  ensureOrganizationUnconfigured,
  resetDocumentCollections,
  seedDocumentTenancy,
} from './helpers/document-db-fixtures.js';
import { seedChallan, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P9 DocumentService Read-Only Composition & Ownership Guards.
 *
 * Rendering joins SystemSettings, FacilityModel, GrnModel and DeliveryChallanModel and writes
 * nothing: no counter allocation, no tenant mutation, and no document served across a facility
 * boundary or without a configured organization identity. Record resolution and the zero-write
 * rent-receipt preview boundary live in document.service.rendering.test.ts.
 */
describe('P9 DocumentService Read-Only Composition & Boundary Tests', () => {
  const facilityA = 'fac-doc-a';
  const facilityB = 'fac-doc-b';

  beforeAll(async () => {
    await connectDocumentDatabase();
  });

  afterAll(async () => {
    await disconnectDocumentDatabase();
  });

  beforeEach(async () => {
    await resetDocumentCollections();
    await seedDocumentTenancy(facilityA, facilityB);
  });

  // 1. Read-only composition: resolves GRN document data without mutating any database record
  it('read-only composition: resolves GRN document HTML without modifying database records', async () => {
    await configureOrganization();
    const grnId = await seedGrn({
      facilityId: facilityA,
      customerName: 'Kishan Lal',
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      rentAmount: 15000,
      grnNumber: 'GRN-2026-0001',
      inwardReceiptNumber: 'RCPT-2026-0001',
    });
    const initialUpdatedAt = (await GrnModel.findOne({ id: grnId }).lean().exec())!.updatedAt;

    const html = await documentService.renderGrnDocument(facilityA, grnId, 'usr-test');
    expect(html).toContain('GRN-2026-0001');
    expect(html).toContain('Kishan Lal');
    expect(html).toContain('Himalayan Agri Cold Logistics Ltd');

    const reloaded = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(reloaded!.updatedAt).toEqual(initialUpdatedAt);
  });

  // 2. Organization identity binding: correctly injects SystemSettings as corporate header and FacilityModel as warehouse branch
  it('binds SystemSettings as organization header and FacilityModel as warehouse operating branch', async () => {
    await configureOrganization();
    const grnId = await seedGrn({
      facilityId: facilityA,
      customerName: 'Kishan Lal',
      chamber: 'CH-01',
      rentAmount: 15000,
      grnNumber: 'GRN-BIND-01',
      inwardReceiptNumber: 'RCPT-BIND-01',
    });

    const html = await documentService.renderGrnDocument(facilityA, grnId, 'usr-test');
    expect(html).toContain('Himalayan Agri Cold Logistics Ltd');
    expect(html).toContain('Fruit Mandi Complex, Shimla, Himachal Pradesh 171001');
    expect(html).toContain('Facility Alpha (FA)');
    expect(html).toContain('Plot 1, Zone A');
  });

  // 3. Unconfigured organization guard: throws ORGANIZATION_NOT_CONFIGURED if administrator has not configured organization details
  it('throws ORGANIZATION_NOT_CONFIGURED when administrator has not configured organization details', async () => {
    await ensureOrganizationUnconfigured(); // orgName is the empty string
    const grnId = await seedGrn({
      facilityId: facilityA,
      customerName: 'Kishan Lal',
      chamber: 'CH-01',
      rentAmount: 15000,
      grnNumber: 'GRN-UNCONF-01',
      inwardReceiptNumber: 'RCPT-UNCONF-01',
    });

    await expect(documentService.renderGrnDocument(facilityA, grnId, 'usr-test')).rejects.toThrow(
      'ORGANIZATION_NOT_CONFIGURED',
    );
  });

  // 4. Document-level facility ownership validation: throws FACILITY_MISMATCH when route facilityId does not match GRN facilityId
  it('throws FACILITY_MISMATCH when route facilityId does not match GRN facilityId', async () => {
    await configureOrganization();
    // GRN belongs to facility B
    const grnId = await seedGrn({
      facilityId: facilityB,
      customerName: 'Kishan Lal',
      chamber: 'CH-01',
      rentAmount: 15000,
      grnNumber: 'GRN-FAC-B',
      inwardReceiptNumber: 'RCPT-FAC-B',
    });

    // Requesting under Facility A must be rejected
    await expect(documentService.renderGrnDocument(facilityA, grnId, 'usr-test')).rejects.toThrow(
      'FACILITY_MISMATCH',
    );
  });

  // 5. Challan facility ownership validation: throws FACILITY_MISMATCH when route facilityId does not match Challan facilityId
  it('throws FACILITY_MISMATCH when route facilityId does not match Challan facilityId', async () => {
    await configureOrganization();
    const challanId = await seedChallan({
      facilityId: facilityB,
      customerName: 'Farmer One',
      chamber: 'CH-01',
      smallBags: 20, bigBags: 0,
      issuedBy: 'Officer',
      challanNumber: 'CHL-FAC-B',
    });

    // Requesting under Facility A must be rejected
    await expect(
      documentService.renderChallanDocument(facilityA, challanId, 'usr-test'),
    ).rejects.toThrow('FACILITY_MISMATCH');
  });

  // 6. Numbering ownership guard (GRN): verifies counterService is never invoked and counter sequence is never incremented
  it('numbering ownership guard (GRN): document rendering does not call CounterService or increment counters', async () => {
    await configureOrganization();
    await CounterModel.create({
      facilityId: facilityA,
      counterType: 'GRN',
      financialYear: '2026-2027',
      lastSequence: 42,
    });
    const grnId = await seedGrn({
      facilityId: facilityA,
      customerName: 'Kishan Lal',
      chamber: 'CH-01',
      rentAmount: 15000,
      grnNumber: 'GRN-2026-0042',
      inwardReceiptNumber: 'RCPT-2026-0042',
    });

    await documentService.renderGrnDocument(facilityA, grnId, 'usr-test');

    const counter = await CounterModel.findOne({ facilityId: facilityA, counterType: 'GRN' });
    expect(counter?.lastSequence).toBe(42); // Unchanged!
  });

  // 7. Numbering ownership guard (Challan): verifies counterService is never invoked and challan sequence is never incremented
  it('numbering ownership guard (Challan): challan rendering does not increment counters', async () => {
    await configureOrganization();
    await CounterModel.create({
      facilityId: facilityA,
      counterType: 'CHALLAN',
      financialYear: '2026-2027',
      lastSequence: 18,
    });
    const challanId = await seedChallan({
      facilityId: facilityA,
      customerName: 'Farmer One',
      chamber: 'CH-01',
      smallBags: 10, bigBags: 0,
      issuedBy: 'Officer',
      challanNumber: 'CHL-2026-0018',
    });

    await documentService.renderChallanDocument(facilityA, challanId, 'usr-test');

    const counter = await CounterModel.findOne({ facilityId: facilityA, counterType: 'CHALLAN' });
    expect(counter?.lastSequence).toBe(18); // Unchanged!
  });
});
