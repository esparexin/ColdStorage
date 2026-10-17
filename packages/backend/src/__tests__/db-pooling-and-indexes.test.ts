import { describe, expect, it } from 'vitest';
import {
  MONGO_MAX_POOL_SIZE,
  MONGO_MIN_POOL_SIZE,
} from '../database/connection.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { GrnModel } from '../database/models/grn.model.js';

describe('Database Connection Pooling and Compound Indexes', () => {
  it('configures bounded max and warm min pool sizes', () => {
    expect(MONGO_MAX_POOL_SIZE).toBe(50);
    expect(MONGO_MIN_POOL_SIZE).toBeGreaterThanOrEqual(1);
  });

  it('declares compound index on DeliveryChallan for facilityId and status', () => {
    const indexes = DeliveryChallanModel.schema.indexes();
    const hasFacilityStatusIndex = indexes.some(([fields]) => {
      return fields.facilityId === 1 && fields.status === 1;
    });
    expect(hasFacilityStatusIndex).toBe(true);
  });

  it('declares compound indexes on GrnModel for status and date-createdAt sorting', () => {
    const indexes = GrnModel.schema.indexes();

    const hasStatusIndex = indexes.some(([fields]) => {
      return fields.facilityId === 1 && fields.status === 1;
    });
    expect(hasStatusIndex).toBe(true);

    const hasDateCreatedAtIndex = indexes.some(([fields]) => {
      return (
        fields.facilityId === 1 &&
        fields.date === -1 &&
        fields.createdAt === -1
      );
    });
    expect(hasDateCreatedAtIndex).toBe(true);
  });
});
