import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GroupModel } from '../database/models/group.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { groupService } from '../modules/groups/group.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('Groups Full Integration & Stock Ledger Integrity', () => {
  const USER_ID = 'usr-operator-test';
  let facilityA: string;
  let facilityB: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    await GroupModel.syncIndexes();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await GroupModel.deleteMany({});
    facilityA = await seedFacility({ name: 'Integration Fac A' });
    facilityB = await seedFacility({ name: 'Integration Fac B' });
    customerId = await seedCustomer({ facilityId: facilityA, name: 'Farmer Co-op' });
  });

  it('maintains exact ledger stock summaries across delivery and delivery reversal', async () => {
    const grn1 = await seedGrn({
      facilityId: facilityA,
      customerId,
      bags: 50,
      bagType: 'S',
      grnNumber: 'GRN-INT-001',
    });
    const grn2 = await seedGrn({
      facilityId: facilityA,
      customerId,
      bags: 100,
      bagType: 'B',
      grnNumber: 'GRN-INT-002',
    });

    const group = await groupService.createGroup(
      facilityA,
      { name: 'Kisan Aggregated Lot', customerId },
      USER_ID,
    );

    await groupService.assignGrns(facilityA, group.id, { grnIds: [grn1, grn2] }, USER_ID);

    // Initial state check
    let res = await groupService.getGroupById(facilityA, group.id);
    expect(res?.group.grnCount).toBe(2);
    expect(res?.stockSummary?.totalBags).toBe(150);
    expect(res?.stockSummary?.smallBags).toBe(50);
    expect(res?.stockSummary?.bigBags).toBe(100);

    // Partial outward delivery from GRN 1 (20 small bags)
    const delRes = await deliveryService.createDelivery(
      facilityA,
      { grnId: grn1, smallBags: 20, bigBags: 0 },
      USER_ID,
    );
    expect(delRes.delivery.id).toBeDefined();

    // Group stock summary derived from ledger reflects outward delivery immediately
    res = await groupService.getGroupById(facilityA, group.id);
    expect(res?.stockSummary?.totalBags).toBe(130);
    expect(res?.stockSummary?.smallBags).toBe(30);
    expect(res?.stockSummary?.bigBags).toBe(100);

    // Reverse the delivery
    await deliveryService.reverseDelivery(
      facilityA,
      delRes.delivery.id,
      { reason: 'Customer returned delivery lot' },
      USER_ID,
    );

    // Group stock summary is restored to 150 bags
    res = await groupService.getGroupById(facilityA, group.id);
    expect(res?.stockSummary?.totalBags).toBe(150);
    expect(res?.stockSummary?.smallBags).toBe(50);
    expect(res?.stockSummary?.bigBags).toBe(100);
  });

  it('prevents concurrent creation race condition with identical normalized names', async () => {
    const results = await Promise.allSettled([
      groupService.createGroup(facilityA, { name: 'Lotus Exports' }, USER_ID),
      groupService.createGroup(facilityA, { name: '  lotus   EXPORTS ' }, USER_ID),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  it('preserves group identity and membership through renaming', async () => {
    const grn = await seedGrn({ facilityId: facilityA, customerId, bags: 40, grnNumber: 'GRN-INT-003' });
    const group = await groupService.createGroup(facilityA, { name: 'Pre-Rename Group' }, USER_ID);
    await groupService.assignGrns(facilityA, group.id, { grnIds: [grn] }, USER_ID);

    const renamed = await groupService.updateGroup(
      facilityA,
      group.id,
      { name: 'Post-Rename Group', remarks: 'Updated note' },
      USER_ID,
    );

    expect(renamed.id).toBe(group.id);
    expect(renamed.name).toBe('Post-Rename Group');
    expect(renamed.grnCount).toBe(1);

    const checkGrn = await GrnModel.findOne({ id: grn });
    expect(checkGrn?.groupId).toBe(group.id);
  });

  it('validates facility boundary and handles invalid GRN inputs gracefully', async () => {
    const foreignGrn = await seedGrn({ facilityId: facilityB, bags: 20, grnNumber: 'GRN-FACB-001' });
    const group = await groupService.createGroup(facilityA, { name: 'Boundary Test Group' }, USER_ID);

    // Cross-facility assignment attempt must be rejected
    await expect(
      groupService.assignGrns(facilityA, group.id, { grnIds: [foreignGrn] }, USER_ID),
    ).rejects.toThrow(/do not exist in this facility/i);

    // Non-existent GRN must be rejected
    await expect(
      groupService.assignGrns(facilityA, group.id, { grnIds: ['grn-does-not-exist'] }, USER_ID),
    ).rejects.toThrow(/do not exist in this facility/i);

    // Repeated assignment of already assigned GRN in same group is idempotent / safe
    const localGrn = await seedGrn({ facilityId: facilityA, customerId, bags: 10, grnNumber: 'GRN-INT-004' });
    await groupService.assignGrns(facilityA, group.id, { grnIds: [localGrn] }, USER_ID);
    const repeated = await groupService.assignGrns(facilityA, group.id, { grnIds: [localGrn] }, USER_ID);
    expect(repeated.assignedCount).toBe(1);
  });

  it('supports closed / 0-balance GRNs in a group without corrupting summary', async () => {
    const grn = await seedGrn({
      facilityId: facilityA,
      customerId,
      bags: 10,
      bagType: 'S',
      grnNumber: 'GRN-INT-005',
    });

    // Deliver all 10 bags so GRN has 0 balance and is closed
    await deliveryService.createDelivery(facilityA, { grnId: grn, smallBags: 10, bigBags: 0 }, USER_ID);

    const group = await groupService.createGroup(facilityA, { name: 'Closed GRN Group' }, USER_ID);
    await groupService.assignGrns(facilityA, group.id, { grnIds: [grn] }, USER_ID);

    const res = await groupService.getGroupById(facilityA, group.id);
    expect(res?.group.grnCount).toBe(1);
    expect(res?.stockSummary?.totalBags).toBe(0);
    expect(res?.stockSummary?.smallBags).toBe(0);
    expect(res?.stockSummary?.bigBags).toBe(0);
  });
});
