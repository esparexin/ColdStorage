import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { GrnModel } from '../database/models/grn.model.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';

/**
 * Regression guard for the bond-number uniqueness index (W1.5).
 *
 * `grn.model.ts` declared
 *   { unique: true, sparse: true, partialFilterExpression: {...} }
 * MongoDB rejects that combination outright, so with `autoIndex: true` the
 * index was silently never created and per-facility duplicate bond numbers
 * were possible. Verified against production: `facilityId_1_bondNumber_1` was
 * absent from `db.grns.getIndexes()`.
 *
 * These tests assert the specification is legal AND that the database
 * actually accepts it, rather than only inspecting the schema object.
 */
describe('GRN bond-number index specification', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('does not combine sparse with partialFilterExpression', () => {
    const bondIndex = GrnModel.schema
      .indexes()
      .find(([, spec]) => spec.partialFilterExpression?.bondNumber !== undefined);
    expect(bondIndex, 'bond-number index declaration not found').toBeDefined();
    expect(bondIndex?.[1].sparse).toBeUndefined();
    expect(bondIndex?.[1].unique).toBe(true);
  });

  it('is accepted by MongoDB and materialises on the collection', async () => {
    // This is the assertion the previous definition would have failed: an
    // illegal spec is rejected by the server, so the index never appears.
    const bondIndex = GrnModel.schema
      .indexes()
      .find(([, spec]) => spec.partialFilterExpression?.bondNumber !== undefined);
    expect(bondIndex).toBeDefined();

    await GrnModel.syncIndexes();
    const live = await GrnModel.collection.indexes();
    const created = live.find(
      (i) => i.key?.facilityId === 1 && i.key?.bondNumber === 1,
    );
    expect(created, 'facilityId_1_bondNumber_1 was not created').toBeDefined();
    expect(created?.unique).toBe(true);
  });

  it('enforces uniqueness of a bond number within a facility', async () => {
    const facilityId = 'fac-bond-idx';
    const base = {
      facilityId,
      customerId: 'cust-1',
      customerName: 'C',
      commodityId: 'cmd-1',
      commodityName: 'M',
      chamber: 'CH-1',
      bags: 10,
      smallBags: 10,
      bigBags: 0,
      status: 'OPEN',
      rentType: 'Monthly',
      isBondForLoan: true,
      bondNumber: 'BOND-UNIQ-1',
      date: new Date(),
      createdBy: 'user-test',
    };
    await GrnModel.create([
      { ...base, id: 'grn-bond-a', grnNumber: '7001', inwardReceiptNumber: 'RCPT-2026-27-7001' },
    ]);
    await expect(
      GrnModel.create([
        {
          ...base,
          id: 'grn-bond-b',
          grnNumber: '7002',
          inwardReceiptNumber: 'RCPT-2026-27-7002',
        },
      ]),
    ).rejects.toThrow(/duplicate key/i);

    await mongoose.connection.collection('grns').deleteMany({ facilityId });
  });

  it('permits many GRNs with no bond number in the same facility', async () => {
    const facilityId = 'fac-bond-null';
    const mk = (n: string, id: string) => ({
      id,
      facilityId,
      grnNumber: n,
      inwardReceiptNumber: `RCPT-2026-27-${n}`,
      customerId: 'cust-1',
      customerName: 'C',
      commodityId: 'cmd-1',
      commodityName: 'M',
      chamber: 'CH-1',
      bags: 10,
      smallBags: 10,
      bigBags: 0,
      status: 'OPEN',
      rentType: 'Monthly',
      isBondForLoan: false,
      bondNumber: null,
      date: new Date(),
      createdBy: 'user-test',
    });
    // A non-partial unique index would reject the second insert.
    await GrnModel.create([mk('7101', 'grn-null-a'), mk('7102', 'grn-null-b')]);
    expect(await GrnModel.countDocuments({ facilityId })).toBe(2);
    await mongoose.connection.collection('grns').deleteMany({ facilityId });
  });
});