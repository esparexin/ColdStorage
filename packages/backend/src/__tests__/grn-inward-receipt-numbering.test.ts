import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildInwardReceiptNumber, getFinancialYearKey } from '@cold-storage/contracts';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { grnService } from '../modules/grn/grn.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

/**
 * Integration guard for the inward-receipt numbering change (W1.3).
 *
 * The Inward Receipt Number is derived from the GR Number. The assertions that
 * matter for the poisoning defect are:
 *
 *  1. A created GRN receives `RCPT-<FY>-<grnNumber>`.
 *  2. Creating GRNs does NOT advance any INWARD_RECEIPT counter. This is the
 *     direct regression guard: under the old implementation the counter moved
 *     on every create and could be pushed arbitrarily high by an operator-
 *     supplied billNumber via an unanchored `/(\d+)$/` match plus `$max`.
 */
describe('inward receipt numbering is derived from the GR Number', () => {
  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  afterEach(async () => {
    await resetStockCollections();
  });

  async function seedCommodity(): Promise<string> {
    const id = `cmd-${randomUUID()}`;
    await CommodityModel.create({
      id,
      name: `Commodity ${id.slice(-6)}`,
      normalizedName: `commodity ${id.slice(-6)}`,
      isActive: true,
    });
    await CommodityRateModel.create([
      { id: `crt-${id}-s`, commodityId: id, rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true },
      { id: `crt-${id}-m`, commodityId: id, rentType: 'Monthly', smallRate: 100, bigRate: 100, isActive: true },
    ]);
    return id;
  }

  async function createGrnWithNumber(
    facilityId: string,
    grnNumber: string,
    date: Date,
  ): Promise<string> {
    const customerId = await seedCustomer({ facilityId });
    const commodityId = await seedCommodity();
    const grn = await grnService.createGrn(
      facilityId,
      {
        grnNumber,
        date,
        customerId,
        commodityId,
        chamber: 'CH-01',
        bags: 50,
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Monthly',
        rentAmount: 5000,
        remarks: null,
        vehicleNumber: null,
        bondNumber: null,
        isBondForLoan: false,
        partyMark: null,
        storageMark: null,
        marks: null,
        bigBagWeight: null,
        smallBagPrice: 100,
        bigBagPrice: null,
        bagPrice: 100,
        rentMonths: 1,
        loanSettlementAmount: null,
        loanStatus: null,
      } as never,
      'user-test-author',
    );
    return grn.grn.id;
  }

  it('stores RCPT-<FY>-<grnNumber> on the created GRN', async () => {
    const facilityId = await seedFacility();
    const date = new Date('2026-10-01T00:00:00.000Z');
    const grnId = await createGrnWithNumber(facilityId, '0099', date);

    const doc = await GrnModel.findOne({ id: grnId }).lean().exec();
    const fy = getFinancialYearKey(date);

    expect(doc?.inwardReceiptNumber).toBe(buildInwardReceiptNumber(fy, '0099'));
    expect(doc?.inwardReceiptNumber).toBe(`RCPT-${fy}-0099`);
  });

  it('derives a distinct receipt per GR Number', async () => {
    const facilityId = await seedFacility();
    const date = new Date('2026-10-01T00:00:00.000Z');

    const first = await createGrnWithNumber(facilityId, '0101', date);
    const second = await createGrnWithNumber(facilityId, '0102', date);

    const a = await GrnModel.findOne({ id: first }).lean().exec();
    const b = await GrnModel.findOne({ id: second }).lean().exec();

    expect(a?.inwardReceiptNumber).not.toBe(b?.inwardReceiptNumber);
  });

  it('never advances an INWARD_RECEIPT counter on create', async () => {
    const facilityId = await seedFacility();
    const date = new Date('2026-10-01T00:00:00.000Z');

    await createGrnWithNumber(facilityId, '0201', date);
    await createGrnWithNumber(facilityId, '0202', date);
    await createGrnWithNumber(facilityId, '0203', date);

    const inwardCounters = await CounterModel.countDocuments({ counterType: 'INWARD_RECEIPT' });
    expect(inwardCounters).toBe(0);

    // Defence in depth: if any counter row were written it must not carry a
    // runaway sequence value.
    const counters = await CounterModel.find({ counterType: 'INWARD_RECEIPT' }).lean().exec();
    for (const c of counters) {
      expect(c.lastSequence).toBeLessThan(1000);
    }
  });

  it('rejects a GR Number the contract forbids before any receipt is derived', async () => {
    const facilityId = await seedFacility();
    const date = new Date('2026-10-01T00:00:00.000Z');
    const customerId = await seedCustomer({ facilityId });
    const commodityId = await seedCommodity();

    await expect(
      grnService.createGrn(
        facilityId,
        {
          grnNumber: 'BILL-2026',
          date,
          customerId,
          commodityId,
          chamber: 'CH-01',
          bags: 50,
        } as never,
        'user-test-author',
      ),
    ).rejects.toThrow();

    expect(await GrnModel.countDocuments({ facilityId })).toBe(0);
  });
});