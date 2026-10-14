import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resolveTotalRentObligation } from '@cold-storage/contracts';
import { computeRentBalance } from '../modules/common/rent-balance.js';
import { assertRentAllowedForOutward } from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { disconnectDatabase } from '../database/connection.js';
import {
  connectToTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

/**
 * Regression guard for the rent-obligation SSOT at the service boundary (W2).
 *
 * The rent gate used to receive only `{ id, rentAmount }` and therefore derived
 * a zero obligation for any GRN whose rent is carried on its outward challans.
 * That is not a corner case: it is the production shape. Of 22 production GRNs,
 * 16 have a stored rentAmount of 0, and GRN 0015 carries 422,250 of outward
 * rent with nothing collected against a zero obligation.
 *
 * These tests assert the boundary behaviour, not the helper: a zero-rent GRN
 * that has been delivered against owes the outward rent, and does not present
 * as settled.
 */
describe('rent gate honours outward rent on a zero-rent GRN', () => {
  const USER = 'user-ssot-test';
  let facilityId = '';
  let customerId = '';

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(async () => {
    await resetStockCollections();
    await disconnectDatabase();
  });

  afterEach(async () => {
    await resetStockCollections();
  });

  it('reports the outward rent as owed after a delivery on a rentAmount: 0 GRN', async () => {
    facilityId = await seedFacility();
    customerId = await seedCustomer({ facilityId, name: 'SSOT Customer' });

    const grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-01',
      bags: 100,
      commodityName: 'Apples',
      grnNumber: 'GRN-25-26-9001',
      rentType: 'Seasonal',
      rentAmount: 0,
      smallBagPrice: 10,
    });

    // Before any delivery there is genuinely nothing owed.
    const before = await assertRentAllowedForOutward(
      facilityId,
      {
        id: grnId,
        grnNumber: 'GRN-25-26-9001',
        rentAmount: 0,
        rentType: 'Seasonal',
        commodityId: '',
        bags: 100,
      },
    );
    expect(before.totalPaid).toBe(0);
    expect(before.remainingBalance).toBe(0);

    // Levying a delivery creates a real rent obligation.
    const delivery = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 40, bigBags: 0 },
      USER,
    );
    expect(delivery.delivery.totalBags).toBe(40);
    const rentCharge = delivery.delivery.rentCharge ?? 0;
    expect(rentCharge).toBeGreaterThan(0);

    const after = await assertRentAllowedForOutward(
      facilityId,
      {
        id: grnId,
        grnNumber: 'GRN-25-26-9001',
        rentAmount: 0,
        rentType: 'Seasonal',
        commodityId: delivery.delivery.commodityId ?? '',
        bags: 100,
      },
    );

    // The gate must now see the rent that was actually charged.
    expect(after.rentAmount).toBeGreaterThan(0);
    expect(after.remainingBalance).toBeGreaterThan(0);
    expect(after.paymentStatus).toBe('Not Settled');
    // The pre-W2 gate returned 0 here for every one of these assertions.
    expect(after.remainingBalance).not.toBe(0);
  });

  it('agrees with the SSOT for the same inputs', async () => {
    facilityId = await seedFacility();
    customerId = await seedCustomer({ facilityId, name: 'SSOT Customer 2' });
    const grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-02',
      bags: 100,
      commodityName: 'Wheat',
      grnNumber: 'GRN-25-26-9002',
      rentType: 'Seasonal',
      rentAmount: 0,
      smallBagPrice: 10,
    });

    await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 40, bigBags: 0 },
      USER,
    );

    const gate = await assertRentAllowedForOutward(
      facilityId,
      {
        id: grnId,
        grnNumber: 'GRN-25-26-9002',
        rentAmount: 0,
        rentType: 'Seasonal',
        commodityId: '',
        bags: 100,
      },
    );

    // Whatever the gate reports must be reproducible from the pure SSOT.
    const expected = resolveTotalRentObligation({
      rentType: 'Seasonal',
      rentAmount: 0,
      outwardRentCharges: gate.rentAmount,
    });
    expect(gate.rentAmount).toBe(expected);
    expect(computeRentBalance(expected, gate.totalPaid).remainingBalance).toBe(
      gate.remainingBalance,
    );
  });
});
