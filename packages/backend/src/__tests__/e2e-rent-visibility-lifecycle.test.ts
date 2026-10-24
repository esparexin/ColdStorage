import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { rentService } from '../modules/rent/rent.service.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('End-to-End Rent Billing & Visibility Lifecycle (PR 6)', { timeout: 35000 }, () => {
  const facilityId = 'fac-e2e-rent-life';
  const customerA = 'cust-e2e-a';
  const customerB = 'cust-e2e-b';
  const userId = 'usr-e2e-operator';
  const commodityId = 'cmd-e2e-chilli';
  let grnCounter = 9000;

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
    await FacilityModel.create({
      id: facilityId,
      name: 'E2E Test Facility',
      code: 'ETF',
      isActive: true,
    });
    await CustomerModel.create([
      { id: customerA, name: 'Farmer Amar', facilityIds: [facilityId], isActive: true },
      { id: customerB, name: 'Trader Bhaskar', facilityIds: [facilityId], isActive: true },
    ]);
    await CommodityModel.create({
      id: commodityId,
      name: 'Guntur Dry Chilli',
      normalizedName: 'guntur dry chilli',
      seasonDuration: 'Seasonal',
      isHamaliApplicable: false,
      isActive: true,
    });
    await CommodityRateModel.create({
      id: 'rate-e2e-01',
      facilityId,
      commodityId,
      rentType: 'Seasonal',
      smallRate: 30,
      bigRate: 35,
      isActive: true,
    });
  });

  async function createTestGrn(
    bags: number,
    opts: {
      customerId?: string;
      inwardDate?: Date;
      rentType?: 'Seasonal' | 'Monthly';
      rentAmount?: number;
      isCompositionVerified?: boolean;
    } = {},
  ) {
    grnCounter += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `GRN-${grnCounter}`,
        date: opts.inwardDate ?? new Date('2026-03-01'),
        customerId: opts.customerId ?? customerA,
        commodityId,
        chamber: 'CH-1',
        bags,
        bagType: 'S',
        rentType: opts.rentType ?? 'Seasonal',
        smallBagPrice: 30,
        bigBagPrice: 35,
        bagPrice: 30,
        rentAmount: opts.rentAmount ?? 0,
        isCompositionVerified: opts.isCompositionVerified ?? true,
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  it('Stage 1: Inward intake defers rent calculation with zero premature payable dues', async () => {
    const grn = await createTestGrn(100);

    const summary = await rentService.getRentSummary(facilityId, grn.id);

    // Inward stock in storage has no outward dispatches yet
    expect(summary.rentAmount).toBe(0);
    expect(summary.totalDue).toBe(0);
    expect(summary.totalPaid).toBe(0);
    expect(summary.remainingBalance).toBe(0);
    expect(summary.rentState).toBe('UNBILLED');
    expect(summary.deliveredBags).toBe(0);
    expect(summary.remainingBags).toBe(100);

    // Payment collection strictly blocked when balance is zero
    await expect(
      rentService.recordPayment(
        facilityId,
        {
          grnId: grn.id,
          amountPaid: 100,
          paymentMode: 'Cash',
          paymentDate: new Date('2026-03-02'),
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds remaining.*balance/i);
  });

  it('Stage 2: Partial outward delivery calculates rent pro-rata and unlocks payment collection', async () => {
    const grn = await createTestGrn(100);

    // Withdraw 30 bags on 2026-06-15
    const { delivery: d1 } = await createDeliveryWithRetry(
      facilityId,
      {
        grnId: grn.id,
        date: new Date('2026-06-15'),
        smallBags: 30,
        bigBags: 0,
      },
      userId,
    );

    expect(d1.rentCharge).toBeGreaterThan(0);
    const expectedDeliveryCharge = d1.rentCharge!;

    const postDeliverySummary = await rentService.getRentSummary(facilityId, grn.id);
    expect(postDeliverySummary.deliveredBags).toBe(30);
    expect(postDeliverySummary.remainingBags).toBe(70);
    expect(postDeliverySummary.totalDue).toBeCloseTo(expectedDeliveryCharge, 2);
    expect(postDeliverySummary.remainingBalance).toBeCloseTo(expectedDeliveryCharge, 2);
    expect(postDeliverySummary.totalPaid).toBe(0);
    expect(postDeliverySummary.rentState).toBe('PENDING');
    expect(postDeliverySummary.paymentStatus).toBe('Not Settled');

    // Collect partial payment of ₹500
    const partialPaymentAmount = 500;
    const { payment, summary: paidSummary } = await rentService.recordPayment(
      facilityId,
      {
        grnId: grn.id,
        amountPaid: partialPaymentAmount,
        paymentMode: 'Cash',
        paymentDate: new Date('2026-06-16'),
        notes: 'Partial cash collection for first delivery',
      },
      userId,
    );

    expect(payment.amountPaid).toBe(partialPaymentAmount);
    expect(paidSummary.totalPaid).toBe(partialPaymentAmount);
    expect(paidSummary.remainingBalance).toBeCloseTo(expectedDeliveryCharge - partialPaymentAmount, 2);
    expect(paidSummary.paymentStatus).toBe('Not Settled');
  });

  it('Stage 3: Final delivery dispatches remaining stock, closes GRN, and permits settlement to ₹0 balance', async () => {
    const grn = await createTestGrn(100);

    // Delivery 1: 40 bags
    const { delivery: d1 } = await createDeliveryWithRetry(
      facilityId,
      {
        grnId: grn.id,
        date: new Date('2026-06-15'),
        smallBags: 40,
        bigBags: 0,
      },
      userId,
    );

    // Delivery 2: Remaining 60 bags (completes the lot)
    const { delivery: d2 } = await createDeliveryWithRetry(
      facilityId,
      {
        grnId: grn.id,
        date: new Date('2026-08-10'),
        smallBags: 60,
        bigBags: 0,
      },
      userId,
    );

    // Closure invariant: GRN remains OPEN while rent balance remains so outstanding dues are tracked
    const grnDocBeforePayment = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(grnDocBeforePayment?.status).toBe('OPEN');

    const totalExpectedDue = (d1.rentCharge ?? 0) + (d2.rentCharge ?? 0);
    const summaryBeforePayment = await rentService.getRentSummary(facilityId, grn.id);
    expect(summaryBeforePayment.deliveredBags).toBe(100);
    expect(summaryBeforePayment.remainingBags).toBe(0);
    expect(summaryBeforePayment.totalDue).toBeCloseTo(totalExpectedDue, 2);
    expect(summaryBeforePayment.remainingBalance).toBeCloseTo(totalExpectedDue, 2);

    // Settle full remaining balance
    const { summary: finalSummary } = await rentService.recordPayment(
      facilityId,
      {
        grnId: grn.id,
        amountPaid: summaryBeforePayment.remainingBalance,
        paymentMode: 'UPI',
        paymentDate: new Date('2026-08-11'),
        upiReference: 'UPI-SETTLE-001',
      },
      userId,
    );

    expect(finalSummary.remainingBalance).toBe(0);
    expect(finalSummary.totalPaid).toBeCloseTo(totalExpectedDue, 2);
    expect(finalSummary.paymentStatus).toBe('Settled');
    expect(finalSummary.rentState).toBe('SETTLED');

    // Closure invariant: GRN transitions to CLOSED once remainingBags === 0 AND remainingBalance === 0
    const grnDocAfterPayment = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(grnDocAfterPayment?.status).toBe('CLOSED');

    // Overpayment rejection guard
    await expect(
      rentService.recordPayment(
        facilityId,
        {
          grnId: grn.id,
          amountPaid: 1,
          paymentMode: 'Cash',
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds remaining.*balance/i);
  });

  it('Stage 4: Consignment merge consolidates stock, attaches structured DTO, and keeps source bills separate', async () => {
    // Target GRN: 50 bags
    const target = await createTestGrn(50);
    // Source GRN: 30 bags with its own base rent obligation of ₹900
    const source = await createTestGrn(30, { rentAmount: 900 });

    const sourceSummaryBefore = await rentService.getRentSummary(facilityId, source.id);
    expect(sourceSummaryBefore.remainingBalance).toBe(900);

    // Perform consignment merge
    const { targetGrn, movement } = await internalMovementService.mergeGrn(
      facilityId,
      {
        targetGrnId: target.id,
        sourceGrnIds: [source.id],
        movementDate: new Date('2026-07-01'),
        remarks: 'Lot consolidation per customer request',
      },
      userId,
    );

    expect(targetGrn.bags).toBe(80);
    expect(movement.movementType).toBe('MERGE');

    // Check Source GRN state: closed, references target, dues intact
    const sourceDoc = await GrnModel.findOne({ id: source.id }).lean().exec();
    expect(sourceDoc?.status).toBe('CLOSED');
    expect(sourceDoc?.mergedIntoGrnId).toBe(target.id);

    const sourceSummaryAfter = await rentService.getRentSummary(facilityId, source.id);
    expect(sourceSummaryAfter.mergedIntoGrnId).toBe(target.id);
    expect(sourceSummaryAfter.remainingBalance).toBe(900);
    expect(sourceSummaryAfter.paymentStatus).toBe('Not Settled');

    // Check Target GRN state: structured mergedConsignment populated, zero double-billed rent
    const targetSummaryAfter = await rentService.getRentSummary(facilityId, target.id);
    expect(targetSummaryAfter.totalBags).toBe(80);
    expect(targetSummaryAfter.rentAmount).toBe(0); // Target has unbilled inward stock
    expect(targetSummaryAfter.totalDue).toBe(0); // Source rent is NOT rolled into target
    expect(targetSummaryAfter.mergedConsignment).not.toBeNull();
    expect(targetSummaryAfter.mergedConsignment?.isMergedTarget).toBe(true);
    expect(targetSummaryAfter.mergedConsignment?.totalMergedAddedBags).toBe(30);
    expect(targetSummaryAfter.mergedConsignment?.genesisBags).toBe(50);
    expect(targetSummaryAfter.mergedConsignment?.sources).toHaveLength(1);
    expect(targetSummaryAfter.mergedConsignment?.sources[0].grnNumber).toBe(source.grnNumber);
    expect(targetSummaryAfter.mergedConsignment?.sources[0].remainingBalance).toBe(900);
  });

  it('Stage 5: Ownership transfer assesses accrued rent and safely transfers consignment without duplicate bills', async () => {
    // GRN owned by Customer A with stored rent agreement
    const grn = await createTestGrn(60, { rentAmount: 1800 });

    // Transfer ownership to Customer B with SETTLE_NOW
    const { grn: transferredGrn, movement } = await internalMovementService.transferOwnership(
      facilityId,
      {
        grnId: grn.id,
        newCustomerId: customerB,
        movementDate: new Date('2026-07-15'),
        confirmedSmallBags: 60,
        confirmedBigBags: 0,
        remarks: 'Transfer of stock from Amar to Bhaskar',
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: {
          amountPaid: 1800,
          paymentMode: 'Cash',
          paymentDate: new Date('2026-07-15'),
          notes: 'Settled by Customer A at ownership handover',
        },
      },
      userId,
    );

    expect(transferredGrn.customerId).toBe(customerB);
    expect(transferredGrn.customerName).toBe('Trader Bhaskar');
    expect(movement.movementType).toBe('TRANSFER_OWNERSHIP');
    expect(movement.fromCustomerId).toBe(customerA);
    expect(movement.toCustomerId).toBe(customerB);

    // Verify financial snapshot on the internal movement record
    expect(movement.financialSnapshot.rentAmount).toBe(1800);
    expect(movement.financialSnapshot.totalPaid).toBe(1800);
    expect(movement.financialSnapshot.remainingBalance).toBe(0);
    expect(movement.financialSnapshot.paymentStatus).toBe('Settled');

    // Verify rent summary on the transferred GRN
    const summary = await rentService.getRentSummary(facilityId, grn.id);
    expect(summary.customerId).toBe(customerB);
    expect(summary.customerName).toBe('Trader Bhaskar');
    expect(summary.totalPaid).toBe(1800);
    expect(summary.remainingBalance).toBe(0);
    expect(summary.paymentStatus).toBe('Settled');
  });
});
