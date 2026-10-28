import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { rentService } from '../modules/rent/rent.service.js';
import { rentRepository } from '../modules/rent/rent.repository.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { seedOrganizationSettings } from './helpers/rent-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('Ownership Transfer Rent Billing & Customer Attribution Tests', { timeout: 35000 }, () => {
  const facilityId = 'fac-transfer-bill';
  const customerA = 'cust-tf-amar';
  const customerB = 'cust-tf-bhaskar';
  const userId = 'usr-tf-tester';
  const commodityId = 'cmd-tf-potato';
  let grnSeq = 8100;

  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetStockCollections();
    await seedOrganizationSettings();
    await FacilityModel.create({
      id: facilityId,
      name: 'Transfer Billing Test Facility',
      code: 'TBF',
      isActive: true,
    });
    await CustomerModel.create([
      { id: customerA, name: 'Farmer Amar', facilityIds: [facilityId], isActive: true },
      { id: customerB, name: 'Trader Bhaskar', facilityIds: [facilityId], isActive: true },
    ]);
    await CommodityModel.create({
      id: commodityId,
      name: 'Jyoti Potato',
      normalizedName: 'jyoti potato',
      seasonDuration: 'Seasonal',
      isHamaliApplicable: false,
      isActive: true,
    });
  });

  async function seedGrn(bags = 100, rentAmount = 2500) {
    grnSeq++;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: String(grnSeq),
        date: new Date('2026-03-10'),
        customerId: customerA,
        commodityId,
        chamber: 'CH-01',
        bags,
        bagType: 'S/B',
        smallBags: bags,
        bigBags: 0,
        rentType: 'Seasonal',
        rentAmount,
        bagPrice: 25,
      },
      userId,
    );
    return grn;
  }

  it('Pay Now (SETTLE_NOW): records source customer on payment and displays source customer on receipt', async () => {
    const grn = await seedGrn(100, 2500);

    const { grn: transferredGrn, payment } = await internalMovementService.transferOwnership(
      facilityId,
      {
        grnId: grn.id,
        newCustomerId: customerB,
        movementDate: new Date('2026-06-15'),
        confirmedSmallBags: 100,
        confirmedBigBags: 0,
        remarks: 'Ownership transfer with Pay Now settlement',
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: {
          amountPaid: 2500,
          paymentMode: 'Cash',
          paymentNotes: 'Settled by Farmer Amar before transfer',
        },
      },
      userId,
    );

    // 1. Ownership updated on GRN
    expect(transferredGrn.customerId).toBe(customerB);
    expect(transferredGrn.customerName).toBe('Trader Bhaskar');

    // 2. Payment record strictly captures the SOURCE customer who paid
    expect(payment).toBeDefined();
    expect(payment!.customerId).toBe(customerA);
    expect(payment!.customerName).toBe('Farmer Amar');
    expect(payment!.amountPaid).toBe(2500);

    // 3. Official Cash Memo rendered for this payment must identify the source customer
    const receiptHtml = await rentService.renderReceipt(facilityId, payment!.receiptNumber, userId);
    expect(receiptHtml).toContain('Farmer Amar');
    expect(receiptHtml).not.toContain('Trader Bhaskar');
  });

  it('Pay Later (AGREED_PENDING): carries dues to destination customer, subsequent payment displays destination customer', async () => {
    const grn = await seedGrn(100, 2500);

    const { grn: transferredGrn, payment } = await internalMovementService.transferOwnership(
      facilityId,
      {
        grnId: grn.id,
        newCustomerId: customerB,
        movementDate: new Date('2026-06-15'),
        confirmedSmallBags: 100,
        confirmedBigBags: 0,
        remarks: 'Ownership transfer with Pay Later agreement',
        paymentDecision: 'AGREED_PENDING',
      },
      userId,
    );

    // 1. Ownership updated and no payment generated at transfer time
    expect(transferredGrn.customerId).toBe(customerB);
    expect(payment).toBeUndefined();

    // 2. Transferee settles the outstanding dues later
    const collectResult = await rentService.recordPayment(
      facilityId,
      {
        grnId: grn.id,
        amountPaid: 2500,
        paymentMode: 'UPI',
        paymentDate: new Date('2026-07-01'),
        notes: 'Settled by Trader Bhaskar post-handover',
      },
      userId,
    );

    expect(collectResult.payment.customerId).toBe(customerB);
    expect(collectResult.payment.customerName).toBe('Trader Bhaskar');

    // 3. Official Cash Memo rendered for this subsequent payment must identify the destination customer
    const receiptHtml = await rentService.renderReceipt(
      facilityId,
      collectResult.payment.receiptNumber,
      userId,
    );
    expect(receiptHtml).toContain('Trader Bhaskar');
    expect(receiptHtml).not.toContain('Farmer Amar');
  });

  it('Outward delivery inline payment records customer attribution and renders receipt correctly', async () => {
    const grn = await seedGrn(50, 1250);

    await createDeliveryWithRetry(
      facilityId,
      {
        grnId: grn.id,
        date: new Date('2026-05-10'),
        quantity: 50,
        smallBags: 50,
        bigBags: 0,
        paymentAmount: 1250,
        paymentMode: 'Cash',
        paymentReference: 'Delivery cash handover',
      },
      userId,
    );

    const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id);
    expect(payments.length).toBe(1);
    expect(payments[0].customerId).toBe(customerA);
    expect(payments[0].customerName).toBe('Farmer Amar');

    const receiptHtml = await rentService.renderReceipt(facilityId, payments[0].receiptNumber, userId);
    expect(receiptHtml).toContain('Farmer Amar');
  });
});
