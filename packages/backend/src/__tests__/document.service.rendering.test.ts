import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CounterModel } from '../database/models/counter.model.js';
import { documentService } from '../modules/documents/document.service.js';
import {
  configureOrganization,
  connectDocumentDatabase,
  disconnectDocumentDatabase,
  resetDocumentCollections,
  seedDocumentTenancy,
} from './helpers/document-db-fixtures.js';
import { seedChallan, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P9 DocumentService Record Resolution & Preview Boundary.
 *
 * Chamber is one free-text label on every document, so a render resolves the owning record and
 * prints that label — there is no storage position tree to walk and no customer contact field to
 * join. The rent-receipt preview is served from the same schema as the authoritative receipt and
 * must still touch nothing: no counters, no payment records, no new collections.
 */
describe('P9 DocumentService Record Resolution & Preview Boundary Tests', () => {
  const facilityA = 'fac-doc-res-a';

  beforeAll(async () => {
    await connectDocumentDatabase();
  });

  afterAll(async () => {
    await disconnectDocumentDatabase();
  });

  beforeEach(async () => {
    await resetDocumentCollections();
    await seedDocumentTenancy(facilityA, `${facilityA}-b`);
  });

  // 8. Inward receipt data resolution: correctly binds the GRN identity to the receipt
  it('correctly resolves GRN and Customer records to render Inward Receipt acknowledgement', async () => {
    await configureOrganization();
    const grnId = await seedGrn({
      facilityId: facilityA,
      customerName: 'Harpreet Singh',
      commodityName: 'Apple (Royal Delicious)',
      chamber: 'CH-02',
      bags: 120,
      bagType: 'B',
      bigBagWeight: 80,
      rentType: 'Monthly',
      rentMonths: 3,
      rentAmount: 24000,
      grnNumber: 'GRN-2026-0005',
      inwardReceiptNumber: 'RCPT-2026-0005',
      vehicleNumber: 'PB-02-AA-9988',
    });

    const html = await documentService.renderReceiptDocument(facilityA, grnId, 'usr-test');
    expect(html).toContain('FARMER INWARD ACKNOWLEDGEMENT RECEIPT');
    expect(html).toContain('RCPT-2026-0005');
    expect(html).toContain('Harpreet Singh');
    expect(html).toContain('Apple (Royal Delicious)');
    expect(html).toContain('CH-02');
    expect(html).toContain('PB-02-AA-9988');
    // The farmer's mobile number is no longer part of the identity or the document.
    expect(html).not.toContain('9876500005');
  });

  // 9. Delivery challan data resolution: binds the outward challan and its free-text chamber label
  it('correctly resolves Delivery Challan and its chamber label for gate pass generation', async () => {
    await configureOrganization();
    const challanId = await seedChallan({
      facilityId: facilityA,
      customerName: 'Harpreet Singh',
      commodityName: 'Apple',
      chamber: 'Block C2',
      smallBags: 50, bigBags: 0,
      vehicleNumber: 'PB-02-BB-1122',
      driverName: 'Sohan Lal',
      issuedBy: 'Operator Deep',
      challanNumber: 'CHL-2026-0099',
    });

    const html = await documentService.renderChallanDocument(facilityA, challanId, 'usr-test');
    expect(html).toContain('OUTWARD DELIVERY CHALLAN (GATE PASS)');
    expect(html).toContain('CHL-2026-0099');
    expect(html).toContain('PB-02-BB-1122');
    expect(html).toContain('Sohan Lal');
    expect(html).toContain('Block C2');
    expect(html).toContain('50');
  });

  // 10. Rent receipt preview boundary: verifies preview generation performs zero writes to database, allocates zero numbers, and creates zero payment records
  it('rent receipt preview boundary: performs zero writes to database and creates zero payment records', async () => {
    await configureOrganization();

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
    await configureOrganization();

    await expect(
      documentService.renderGrnDocument(facilityA, 'non-existent-grn', 'usr-test'),
    ).rejects.toThrow('GRN_NOT_FOUND');
  });

  // 12. Non-existent Challan: throws CHALLAN_NOT_FOUND when invalid challanId is requested
  it('throws CHALLAN_NOT_FOUND when non-existent challanId is requested', async () => {
    await configureOrganization();

    await expect(
      documentService.renderChallanDocument(facilityA, 'non-existent-challan', 'usr-test'),
    ).rejects.toThrow('CHALLAN_NOT_FOUND');
  });
});
