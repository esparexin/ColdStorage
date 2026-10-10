import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { GroupModel } from '../database/models/group.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { groupService } from '../modules/groups/group.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

describe('Group Service Domain & Persistence Integration', () => {
  const FACILITY_A = 'fac-grp-test-a';
  const FACILITY_B = 'fac-grp-test-b';
  const USER_ID = 'usr-grp-admin';
  let customerA: string;

  beforeAll(async () => {
    await connectToDatabase();
    await seedFacility({ id: FACILITY_A, name: 'Group Facility A' });
    await seedFacility({ id: FACILITY_B, name: 'Group Facility B' });
    customerA = await seedCustomer({ id: 'cust-grp-a', name: 'Ramesh Agro Traders', facilityId: FACILITY_A });
  }, 30000);

  afterAll(async () => {
    await GroupModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await GrnModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await InventoryTransactionModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await FacilityModel.deleteMany({ id: { $in: [FACILITY_A, FACILITY_B] } });
    await disconnectDatabase();
  }, 30000);

  beforeEach(async () => {
    await GroupModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await GrnModel.updateMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } }, { $set: { groupId: null } });
  });

  it('creates group and prevents duplicate names in the same facility', async () => {
    const group = await groupService.createGroup(
      FACILITY_A,
      { name: 'Kisan Traders', customerId: customerA, remarks: 'Lot 2026' },
      USER_ID,
    );
    expect(group.id).toMatch(/^grp-/);
    expect(group.name).toBe('Kisan Traders');
    expect(group.customerId).toBe(customerA);

    await expect(
      groupService.createGroup(FACILITY_A, { name: '  kisan TRADERS  ' }, USER_ID),
    ).rejects.toThrow(/already exists/i);

    const otherFacilityGroup = await groupService.createGroup(
      FACILITY_B,
      { name: 'Kisan Traders' },
      USER_ID,
    );
    expect(otherFacilityGroup.facilityId).toBe(FACILITY_B);
  });

  it('assigns, unassigns, and moves GRNs between groups', async () => {
    const grn1 = await seedGrn({ facilityId: FACILITY_A, bags: 50, bagType: 'S', grnNumber: '1001' });
    const grn2 = await seedGrn({ facilityId: FACILITY_A, bags: 100, bagType: 'B', grnNumber: '1002' });

    const group1 = await groupService.createGroup(FACILITY_A, { name: 'Batch Alpha' }, USER_ID);
    const group2 = await groupService.createGroup(FACILITY_A, { name: 'Batch Beta' }, USER_ID);

    const assignRes = await groupService.assignGrns(FACILITY_A, group1.id, { grnIds: [grn1, grn2] }, USER_ID);
    expect(assignRes.assignedCount).toBe(2);

    const assignedDoc = await GrnModel.findOne({ id: grn1 });
    expect(assignedDoc?.groupId).toBe(group1.id);

    // Conflict prevention: cannot assign grn1 to group2 without move
    await expect(
      groupService.assignGrns(FACILITY_A, group2.id, { grnIds: [grn1] }, USER_ID),
    ).rejects.toThrow(/already assigned to another group/i);

    // Move grn1 to group2
    const moveRes = await groupService.moveGrns(FACILITY_A, group1.id, { targetGroupId: group2.id, grnIds: [grn1] }, USER_ID);
    expect(moveRes.movedCount).toBe(1);

    const movedDoc = await GrnModel.findOne({ id: grn1 });
    expect(movedDoc?.groupId).toBe(group2.id);

    // Unassign grn2 from group1
    const unassignRes = await groupService.unassignGrns(FACILITY_A, group1.id, { grnIds: [grn2] }, USER_ID);
    expect(unassignRes.unassignedCount).toBe(1);

    const unassignedDoc = await GrnModel.findOne({ id: grn2 });
    expect(unassignedDoc?.groupId).toBeNull();
  });

  it('calculates group stock summary strictly from the inventory ledger', async () => {
    const grn1 = await seedGrn({ facilityId: FACILITY_A, bags: 50, bagType: 'S', grnNumber: '2001' });
    const grn2 = await seedGrn({ facilityId: FACILITY_A, bags: 30, bagType: 'B', grnNumber: '2002' });

    const group = await groupService.createGroup(FACILITY_A, { name: 'Stock Group' }, USER_ID);
    await groupService.assignGrns(FACILITY_A, group.id, { grnIds: [grn1, grn2] }, USER_ID);

    const listRes = await groupService.listGroups(FACILITY_A, {});
    const match = listRes.items.find((g) => g.id === group.id);
    expect(match?.grnCount).toBe(2);
    expect(match?.stockSummary?.totalBags).toBe(80);
    expect(match?.stockSummary?.smallBags).toBe(50);
    expect(match?.stockSummary?.bigBags).toBe(30);
  });

  it('updates metadata and renames group safely', async () => {
    const group = await groupService.createGroup(FACILITY_A, { name: 'Initial Name' }, USER_ID);

    const updated = await groupService.updateGroup(
      FACILITY_A,
      group.id,
      { name: 'Renamed Lot', remarks: 'New remarks' },
      USER_ID,
    );
    expect(updated.name).toBe('Renamed Lot');
    expect(updated.remarks).toBe('New remarks');

    const another = await groupService.createGroup(FACILITY_A, { name: 'Another Group' }, USER_ID);
    await expect(
      groupService.updateGroup(FACILITY_A, another.id, { name: 'Renamed Lot' }, USER_ID),
    ).rejects.toThrow(/already exists/i);
  });

  it('enforces safe deletion: blocks deletion when member count > 0', async () => {
    const grn = await seedGrn({ facilityId: FACILITY_A, bags: 10, grnNumber: '3001' });
    const group = await groupService.createGroup(FACILITY_A, { name: 'Non Empty Group' }, USER_ID);
    await groupService.assignGrns(FACILITY_A, group.id, { grnIds: [grn] }, USER_ID);

    await expect(groupService.deleteGroup(FACILITY_A, group.id, USER_ID)).rejects.toThrow(
      /cannot delete group.*because it contains 1 assigned GRN/i,
    );

    await groupService.unassignGrns(FACILITY_A, group.id, { grnIds: [grn] }, USER_ID);
    const deleted = await groupService.deleteGroup(FACILITY_A, group.id, USER_ID);
    expect(deleted).toBe(true);

    const grnStillExists = await GrnModel.findOne({ id: grn });
    expect(grnStillExists).not.toBeNull();
  });
});
