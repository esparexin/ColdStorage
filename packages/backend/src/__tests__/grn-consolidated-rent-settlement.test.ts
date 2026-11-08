import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
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

const USER_ID = 'usr-consolidated-settlement-tester';

describe('GRN-Wise Consolidated Rent Settlement (grn-consolidated-rent-settlement.test.ts)', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    facilityId = await seedFacility({ name: 'Consolidated Rent Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Consolidated Farmer' });
    await CommodityModel.create({
      id: 'cmd-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
      defaultBagType: 'S',
    });
    await CommodityRateModel.create([
      { id: 'crt-cons-s', commodityId: 'cmd-potato', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true },
      { id: 'crt-cons-m', commodityId: 'cmd-potato', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true },
    ]);
  });

  it('settles 4 partial outward bills in one consolidated payment with a single FY-sequential receipt', async () => {
    // 1. Inward 100 bags (Seasonal @ ₹10/bag)
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-CONS-01',
        date: new Date('2026-11-01'),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-A',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
        smallBagPrice: 10,
        rentAmount: 0,
      },
      USER_ID,
    );

    // 2. Issue 4 partial outward deliveries: 10, 10, 5, 20 bags
    const d1 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 10, bigBags: 0 }, USER_ID);
    const d2 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 10, bigBags: 0 }, USER_ID);
    const d3 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 5, bigBags: 0 }, USER_ID);
    const d4 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 20, bigBags: 0 }, USER_ID);

    expect(d1.delivery.rentCharge).toBe(100);
    expect(d2.delivery.rentCharge).toBe(100);
    expect(d3.delivery.rentCharge).toBe(50);
    expect(d4.delivery.rentCharge).toBe(200);

    // Dues across the 4 deliveries: 100 + 100 + 50 + 200 = ₹450
    const summaryBefore = await rentService.getRentSummary(facilityId, grn.id);
    expect(summaryBefore.totalDue).toBe(450);
    expect(summaryBefore.remainingBalance).toBe(450);
    expect(summaryBefore.paymentStatus).toBe('Not Settled');
    expect(summaryBefore.remainingBags).toBe(55);

    // 3. Consolidated Grand Total Settlement: One payment of ₹450 without deliveryId
    const paymentResult = await rentService.recordPayment(
      facilityId,
      {
        grnId: grn.id,
        amountPaid: 450,
        paymentMode: 'Cash',
        paymentDate: new Date('2026-11-05'),
      },
      USER_ID,
    );

    expect(paymentResult.summary.totalPaid).toBe(450);
    expect(paymentResult.summary.remainingBalance).toBe(0);
    expect(paymentResult.summary.paymentStatus).toBe('Settled');

    // 4. Single FY-sequential receipt generated with trace details referencing all 4 challans
    const receiptHtml = await rentService.renderReceipt(facilityId, paymentResult.payment.receiptNumber, USER_ID);
    expect(receiptHtml).toContain(paymentResult.payment.receiptNumber);
    expect(receiptHtml).toContain(d1.delivery.challanNumber);
    expect(receiptHtml).toContain(d4.delivery.challanNumber);
    expect(receiptHtml).toContain('Consolidated Settlement: 4 Gate Passes');

    // 5. Query deliveries with reconciled payments: all 4 are Settled with rentRemainingBalance: 0
    const reconciled = await deliveryService.listDeliveriesForGrn(facilityId, grn.id);
    for (const d of reconciled) {
      expect(d.rentPaymentStatus).toBe('Settled');
      expect(d.rentRemainingBalance).toBe(0);
      expect(d.rentTotalPaid).toBe(d.rentCharge);
    }

    // 6. GRN remains OPEN because 55 bags remain in cold storage
    const grnDoc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(grnDoc?.status).toBe('OPEN');
  });

  it('handles partial consolidated payment in strict FIFO order and honors GRN closure invariant', async () => {
    // 1. Inward 100 bags
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-CONS-02',
        date: new Date('2026-11-01'),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-A',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
        smallBagPrice: 10,
        rentAmount: 0,
      },
      USER_ID,
    );

    // Issue 4 deliveries: 10, 10, 5, 20 bags (₹100, ₹100, ₹50, ₹200)
    const d1 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 10, bigBags: 0 }, USER_ID);
    const d2 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 10, bigBags: 0 }, USER_ID);
    const d3 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 5, bigBags: 0 }, USER_ID);
    const d4 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 20, bigBags: 0 }, USER_ID);

    // 2. Partial consolidated payment of ₹150 (Challan 1 gets 100, Challan 2 gets 50)
    const p1 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 150, paymentMode: 'UPI', paymentDate: new Date('2026-11-05') },
      USER_ID,
    );

    // Receipt 1 lists ONLY the 2 credited challans
    const receipt1Html = await rentService.renderReceipt(facilityId, p1.payment.receiptNumber, USER_ID);
    expect(receipt1Html).toContain(d1.delivery.challanNumber);
    expect(receipt1Html).toContain(d2.delivery.challanNumber);
    expect(receipt1Html).not.toContain(d3.delivery.challanNumber);
    expect(receipt1Html).not.toContain(d4.delivery.challanNumber);
    expect(receipt1Html).toContain('Consolidated Settlement: 2 Gate Passes');

    // Deliveries reconciliation
    const reconciled1 = await deliveryService.listDeliveriesForGrn(facilityId, grn.id);
    const m1 = new Map(reconciled1.map((d) => [d.id, d]));
    expect(m1.get(d1.delivery.id)?.rentPaymentStatus).toBe('Settled');
    expect(m1.get(d1.delivery.id)?.rentTotalPaid).toBe(100);
    expect(m1.get(d1.delivery.id)?.rentRemainingBalance).toBe(0);
    expect(m1.get(d2.delivery.id)?.rentPaymentStatus).toBe('Not Settled');
    expect(m1.get(d2.delivery.id)?.rentTotalPaid).toBe(50);
    expect(m1.get(d2.delivery.id)?.rentRemainingBalance).toBe(50);
    expect(m1.get(d3.delivery.id)?.rentPaymentStatus).toBe('Not Settled');
    expect(m1.get(d3.delivery.id)?.rentTotalPaid).toBe(0);
    expect(m1.get(d4.delivery.id)?.rentPaymentStatus).toBe('Not Settled');
    expect(m1.get(d4.delivery.id)?.rentTotalPaid).toBe(0);

    // 3. Second payment of remaining ₹300 settles d2 (50), d3 (50), d4 (200)
    const p2 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 300, paymentMode: 'Cash', paymentDate: new Date('2026-11-06') },
      USER_ID,
    );

    const receipt2Html = await rentService.renderReceipt(facilityId, p2.payment.receiptNumber, USER_ID);
    // d1 was already fully settled, so receipt2 should NOT credit d1
    expect(receipt2Html).not.toContain(d1.delivery.challanNumber);
    expect(receipt2Html).toContain(d2.delivery.challanNumber);
    expect(receipt2Html).toContain(d3.delivery.challanNumber);
    expect(receipt2Html).toContain(d4.delivery.challanNumber);
    expect(receipt2Html).toContain('Consolidated Settlement: 3 Gate Passes');

    // 4. Deliver remaining 55 bags (Delivery 5: 55 bags @ ₹10 = ₹550)
    const d5 = await deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 55, bigBags: 0 }, USER_ID);
    expect(d5.summary.remainingDeliveryBalance).toBe(0);
    // Physically empty (remainingBags = 0), but remainingBalance = ₹550 > 0 -> GRN MUST remain OPEN!
    expect(d5.summary.grnStatus).toBe('OPEN');

    // 5. Settle final ₹550
    await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 550, paymentMode: 'Cash', paymentDate: new Date('2026-11-07') },
      USER_ID,
    );

    // GRN closes ONLY when remainingBags = 0 AND remainingBalance = 0
    const finalGrn = await GrnModel.findOne({ id: grn.id }).lean();
    expect(finalGrn?.status).toBe('CLOSED');
  });
});
