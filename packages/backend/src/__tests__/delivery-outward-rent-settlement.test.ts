import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-rent-settlement-tester';

describe('Outward Rent Settlement Flow (delivery-outward-rent-settlement.test.ts)', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Rent Settlement Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Farmer Cooperative' });
    await CommodityModel.create({
      id: 'cmd-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  it('connects outward delivery rent dues to rent ledger and enforces overpayment guard', async () => {
    // 1. Inward entry (rentAmount = 0 per outward rent workflow)
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-SETTLE-01',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-A',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // Initial rent summary before any deliveries
    const initialSummary = await rentService.getRentSummary(facilityId, grn.id);
    expect(initialSummary.totalDue).toBe(0);
    expect(initialSummary.remainingBalance).toBe(0);
    expect(initialSummary.paymentStatus).toBe('Settled');

    // 2. Issue partial delivery of 40 bags (40 × ₹10 season total = ₹400)
    const d1 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(d1.delivery.rentCharge).toBe(400);

    // 3. Rent summary now reflects outward charge as obligation
    const postDeliverySummary = await rentService.getRentSummary(facilityId, grn.id);
    expect(postDeliverySummary.rentAmount).toBe(400);
    expect(postDeliverySummary.totalDue).toBe(400);
    expect(postDeliverySummary.totalPaid).toBe(0);
    expect(postDeliverySummary.remainingBalance).toBe(400);
    expect(postDeliverySummary.paymentStatus).toBe('Not Settled');

    // Facility batch lookup also returns identical summary
    const facilitySummaries = await rentService.getRentSummariesForFacility(facilityId);
    const matched = facilitySummaries.find((s) => s.grnId === grn.id);
    expect(matched?.remainingBalance).toBe(400);
    expect(matched?.paymentStatus).toBe('Not Settled');

    // 4. Overpayment guard rejects payment exceeding outstanding outward rent (₹450 > ₹400)
    await expect(
      rentService.recordPayment(
        facilityId,
        { grnId: grn.id, amountPaid: 450, paymentMode: 'Cash', paymentDate: new Date() },
        USER_ID,
      ),
    ).rejects.toThrow(/exceeds remaining rent balance/);

    // 5. Partial payment of ₹150 succeeds and updates ledger
    const p1 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 150, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );
    expect(p1.summary.totalPaid).toBe(150);
    expect(p1.summary.remainingBalance).toBe(250);
    expect(p1.summary.paymentStatus).toBe('Not Settled');
    expect(p1.payment.receiptNumber).toBeDefined();

    // 6. Second delivery dispatches 30 bags (30 × ₹10 season total = ₹300)
    const d2 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 30, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(d2.delivery.rentCharge).toBe(300);
    expect(d2.summary.remainingDeliveryBalance).toBe(30);
    expect(d2.summary.grnStatus).toBe('OPEN');

    const summaryAfterSecondDel = await rentService.getRentSummary(facilityId, grn.id);
    expect(summaryAfterSecondDel.totalDue).toBe(700); // 400 + 300
    expect(summaryAfterSecondDel.remainingBalance).toBe(550); // 700 - 150
    expect(summaryAfterSecondDel.remainingBags).toBe(30);

    // 7. Settle remaining ₹550 rent balance via Cash Memo
    const p2 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 550, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    expect(p2.summary.totalPaid).toBe(700);
    expect(p2.summary.remainingBalance).toBe(0);
    expect(p2.summary.paymentStatus).toBe('Settled');

    // 8. Final delivery dispatches remaining 30 bags (30 × ₹10 season total = ₹300).
    // Server recomputes rent; a stale rentCharge:0 override is rejected.
    await expect(
      deliveryService.createDelivery(
        facilityId,
        { grnId: grn.id, smallBags: 30, bigBags: 0, rentCharge: 0 },
        USER_ID,
      ),
    ).rejects.toThrow(/rentCharge mismatch/);

    const d3 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 30, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(d3.delivery.rentCharge).toBe(300);
    expect(d3.summary.remainingDeliveryBalance).toBe(0);
    // Closure snapshots the pre-delivery rent balance (zero after step 7), so the
    // GRN closes here even though this delivery adds ₹300 in new dues tracked below.
    expect(d3.summary.grnStatus).toBe('CLOSED');

    const summaryAfterFinalDel = await rentService.getRentSummary(facilityId, grn.id);
    expect(summaryAfterFinalDel.totalDue).toBe(1000); // 400 + 300 + 300
    expect(summaryAfterFinalDel.remainingBalance).toBe(300);

    // 9. Settle final ₹300; GRN closes only when bags and balance are both zero.
    const p3 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 300, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    expect(p3.summary.remainingBalance).toBe(0);
    expect(p3.summary.paymentStatus).toBe('Settled');

    const grnDocFinal = await GrnModel.findOne({ id: grn.id }).lean();
    expect(grnDocFinal?.status).toBe('CLOSED');
  });

  it('excludes reversed delivery rent charges from outward dues', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-SETTLE-02',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-A',
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 20, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(del.delivery.rentCharge).toBe(200);

    const summaryBeforeReversal = await rentService.getRentSummary(facilityId, grn.id);
    expect(summaryBeforeReversal.remainingBalance).toBe(200);

    // Reverse the delivery
    await deliveryService.reverseDelivery(
      facilityId,
      del.delivery.id,
      { reason: 'Operator error in bag count' },
      USER_ID,
    );

    // Outward dues reset to 0
    const summaryAfterReversal = await rentService.getRentSummary(facilityId, grn.id);
    expect(summaryAfterReversal.totalDue).toBe(0);
    expect(summaryAfterReversal.remainingBalance).toBe(0);
    expect(summaryAfterReversal.paymentStatus).toBe('Settled');
  });
});
