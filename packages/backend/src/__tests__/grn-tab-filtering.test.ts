import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { grnService } from '../modules/grn/grn.service.js';

describe('Inward GRN Profile Tabs & Server Filtering', { timeout: 30000 }, () => {
  const facilityId = 'fac-tab-audit';
  const customerId = 'cust-tab-audit';
  let seq = 0;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToDatabase();
  });

  afterAll(async () => {
    delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});

    await FacilityModel.create({ id: facilityId, name: 'Tab Fac', code: 'TF', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Farmer Nitish', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-chilli', name: 'Mirchi', normalizedName: 'mirchi',
      seasonDuration: 'Seasonal', isHamaliApplicable: false, isActive: true,
    });
  });

  async function createTestGrn(overrides: Partial<Record<string, unknown>> = {}) {
    seq += 1;
    const grnId = `grn-${seq}`;
    const bags = (overrides.bags as number) ?? 100;
    const doc = await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber: `GRN-${String(seq).padStart(4, '0')}`,
      inwardReceiptNumber: `BILL-${seq}`,
      date: new Date('2026-04-01'),
      customerId,
      customerName: 'Farmer Nitish',
      commodityId: 'cmd-chilli',
      commodityName: 'Mirchi',
      chamber: 'A-01',
      bags,
      bagType: 'S/B',
      smallBags: bags,
      bigBags: 0,
      rentType: 'Seasonal',
      rentAmount: 15000,
      status: 'OPEN',
      createdBy: 'test-user',
      ...overrides,
    });
    return doc;
  }

  async function recordTestDelivery(grnId: string, deliveredBags: number, rentCharge = 0) {
    const delId = `del-${++seq}`;
    await DeliveryChallanModel.create({
      id: delId,
      facilityId,
      challanNumber: `CH-${seq}`,
      date: new Date('2026-05-01'),
      grnId,
      grnNumber: `GRN-${grnId}`,
      customerId,
      customerName: 'Farmer Nitish',
      commodityId: 'cmd-chilli',
      commodityName: 'Mirchi',
      chamber: 'A-01',
      smallBags: deliveredBags,
      bigBags: 0,
      rentCharge,
      status: 'ISSUED',
      issuedBy: 'test-user',
    });
    await InventoryTransactionModel.create({
      id: `tx-${seq}`,
      facilityId,
      grnId,
      grnNumber: `GRN-${grnId}`,
      chamber: 'A-01',
      commodityId: 'cmd-chilli',
      bagType: 'S/B',
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: deliveredBags,
      bigQuantity: 0,
      referenceType: 'DELIVERY',
      referenceId: delId,
      createdBy: 'test-user',
      createdAt: new Date('2026-05-01'),
    });
  }

  async function recordTestPayment(grnId: string, amountPaid: number) {
    await RentPaymentModel.create({
      id: `pmt-${++seq}`,
      facilityId,
      grnId,
      grnNumber: `GRN-${grnId}`,
      receiptNumber: `RCP-${seq}`,
      amountPaid,
      paymentMode: 'Cash',
      paymentDate: new Date('2026-05-02'),
      createdBy: 'test-user',
      createdAt: new Date('2026-05-02'),
    });
  }

  it('classifies GRNs correctly across All, Active, Partial, Pending Payment, Closed, and Merged', async () => {
    // 1. Untouched active lot (100 bags, 0 delivered)
    const grnActive = await createTestGrn({ bags: 100 });

    // 2. Partial lot with rent settled (100 bags, 40 delivered, rent charge 6000, 6000 paid)
    const grnPartialSettled = await createTestGrn({ bags: 100, rentAmount: 0 });
    await recordTestDelivery(grnPartialSettled.id, 40, 6000);
    await recordTestPayment(grnPartialSettled.id, 6000);

    // 3. Partial lot with rent pending (100 bags, 30 delivered, rent charge 4500, 0 paid)
    const grnPartialPending = await createTestGrn({ bags: 100, rentAmount: 0 });
    await recordTestDelivery(grnPartialPending.id, 30, 4500);

    // 4. Fully outwarded lot with rent unpaid (100 bags, 100 delivered, rent charge 15000, 0 paid, status OPEN)
    const grnFullyOutUnpaid = await createTestGrn({ bags: 100, rentAmount: 0 });
    await recordTestDelivery(grnFullyOutUnpaid.id, 100, 15000);

    // 5. Fully outwarded lot with rent fully paid (100 bags, 100 delivered, status CLOSED)
    const grnClosed = await createTestGrn({ bags: 100, status: 'CLOSED', rentAmount: 0 });
    await recordTestDelivery(grnClosed.id, 100, 15000);
    await recordTestPayment(grnClosed.id, 15000);

    // 6. Merged source lot (status CLOSED, mergedIntoGrnId set, 0 balance bags)
    const grnMergedSource = await createTestGrn({
      bags: 50,
      status: 'CLOSED',
      mergedIntoGrnId: grnActive.id,
      mergedIntoGrnNumber: grnActive.grnNumber,
    });

    // 7. Surviving merged consignment target with active remaining stock (> 0 balance bags)
    const grnMergedTarget = await createTestGrn({
      bags: 150,
      status: 'OPEN',
      remarks: '[MERGE RECEIVED from GRN-0006 on 2026-05-01: 50 bags]',
    });

    // Test tab: ALL
    const resAll = await grnService.listGrns(facilityId, { page: 1, limit: 20 });
    expect(resAll.total).toBe(7);
    expect(resAll.counts).toEqual({
      all: 7,
      active: 2,
      partial: 2,
      pendingPayment: 2,
      closed: 2,
      merged: 1,
    });

    // Test tab: ACTIVE
    const resActive = await grnService.listGrns(facilityId, { tab: 'ACTIVE', page: 1, limit: 20 });
    expect(resActive.total).toBe(2);
    const activeIds = resActive.items.map((g) => g.id);
    expect(activeIds).toContain(grnActive.id);
    expect(activeIds).toContain(grnMergedTarget.id);

    // Test tab: PARTIAL
    const resPartial = await grnService.listGrns(facilityId, { tab: 'PARTIAL', page: 1, limit: 20 });
    expect(resPartial.total).toBe(2);
    const partialIds = resPartial.items.map((g) => g.id);
    expect(partialIds).toContain(grnPartialSettled.id);
    expect(partialIds).toContain(grnPartialPending.id);

    // Test tab: PENDING_PAYMENT
    const resPending = await grnService.listGrns(facilityId, { tab: 'PENDING_PAYMENT', page: 1, limit: 20 });
    expect(resPending.total).toBe(2);
    const pendingIds = resPending.items.map((g) => g.id);
    expect(pendingIds).toContain(grnPartialPending.id);
    expect(pendingIds).toContain(grnFullyOutUnpaid.id);

    // Test tab: CLOSED (includes both outwarded closed lots and zero-balance merged source lots)
    const resClosed = await grnService.listGrns(facilityId, { tab: 'CLOSED', page: 1, limit: 20 });
    expect(resClosed.total).toBe(2);
    const closedIds = resClosed.items.map((g) => g.id);
    expect(closedIds).toContain(grnClosed.id);
    expect(closedIds).toContain(grnMergedSource.id);
    expect(closedIds).not.toContain(grnFullyOutUnpaid.id);

    // Test tab: MERGED (strictly displays merged lots with remaining stock > 0; zero-balance lots excluded)
    const resMerged = await grnService.listGrns(facilityId, { tab: 'MERGED', page: 1, limit: 20 });
    expect(resMerged.total).toBe(1);
    expect(resMerged.items[0].id).toBe(grnMergedTarget.id);
    expect(resMerged.items[0].remarks).toContain('[MERGE RECEIVED');

    // Test tab combined with search filtering
    const resSearch = await grnService.listGrns(facilityId, {
      tab: 'PARTIAL',
      search: grnPartialSettled.grnNumber,
      page: 1,
      limit: 20,
    });
    expect(resSearch.total).toBe(1);
    expect(resSearch.items[0].id).toBe(grnPartialSettled.id);

    // Test tab combined with pagination (limit 1)
    const resPage1 = await grnService.listGrns(facilityId, { tab: 'PARTIAL', page: 1, limit: 1 });
    expect(resPage1.total).toBe(2);
    expect(resPage1.items).toHaveLength(1);
  });
});
