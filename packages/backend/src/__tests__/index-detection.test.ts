import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  findMissingGrnUniqueIndexes,
  inspectDatabaseIndexesReadOnly,
  REQUIRED_GRN_UNIQUE_INDEX_KEYS,
} from '../database/indexes.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
} from './helpers/stock-reset.js';

/**
 * Read-only GRN uniqueness index detection.
 *
 * Pure matching logic is fully deterministic (no database). The live
 * inspection path only ever calls collection.indexes() — it must never
 * create, drop, or synchronize anything.
 */
describe('GRN uniqueness index detection (read-only)', () => {
  it('declares both required GRN uniqueness indexes', () => {
    expect(REQUIRED_GRN_UNIQUE_INDEX_KEYS).toEqual([
      { facilityId: 1, grnNumber: 1 },
      { facilityId: 1, inwardReceiptNumber: 1 },
    ]);
  });

  it('reports empty when all required indexes are present, ignoring extras', () => {
    expect(
      findMissingGrnUniqueIndexes([
        { name: '_id_', key: { _id: 1 } },
        { name: 'facilityId_1_grnNumber_1', key: { facilityId: 1, grnNumber: 1 } },
        { name: 'facilityId_1_inwardReceiptNumber_1', key: { facilityId: 1, inwardReceiptNumber: 1 } },
        { name: 'custom_extra', key: { chamber: 1 } },
      ]),
    ).toEqual([]);
  });

  it('reports each missing index by readable name', () => {
    expect(
      findMissingGrnUniqueIndexes([{ name: '_id_', key: { _id: 1 } }]),
    ).toEqual(['facilityId_1_grnNumber_1', 'facilityId_1_inwardReceiptNumber_1']);
    expect(
      findMissingGrnUniqueIndexes([{ name: 'x', key: { facilityId: 1, grnNumber: 1 } }]),
    ).toEqual(['facilityId_1_inwardReceiptNumber_1']);
  });

  it('treats key field order as significant, like MongoDB compound indexes', () => {
    expect(
      findMissingGrnUniqueIndexes([{ name: 'reversed', key: { grnNumber: 1, facilityId: 1 } }]),
    ).toContain('facilityId_1_grnNumber_1');
  });

  it('reports all-missing when inspection yields nothing (never false-compliant)', () => {
    expect(findMissingGrnUniqueIndexes(null)).toHaveLength(2);
    expect(findMissingGrnUniqueIndexes(undefined)).toHaveLength(2);
    expect(findMissingGrnUniqueIndexes([])).toHaveLength(2);
  });

  describe('live inspection subset filter', () => {
    beforeAll(connectToTestDatabase);
    afterAll(disconnectTestDatabase);

    it('inspects only the requested models without mutating anything', async () => {
      const result = await inspectDatabaseIndexesReadOnly(mongoose.connection, ['GRN']);
      expect(Object.keys(result)).toEqual(['GRN']);
      expect(Array.isArray(result['GRN'])).toBe(true);
    });
  });
});
