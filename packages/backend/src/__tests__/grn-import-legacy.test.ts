import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { grnService } from '../modules/grn/grn.service.js';
import { executeGrnImport } from '../modules/import-export/handlers/grn-import.handler.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const FACILITY_ID = 'fac-import-legacy';
const USER_ID = 'usr-import-legacy';

/**
 * Phase 5 CSV compatibility: the import path carries no rate columns by design,
 * so rentAmount-only rows keep the explicit legacy opt-out and commit even when
 * a controller row exists. Behavior change requires an approved policy first.
 */
describe('GRN import legacy preservation — grn-import-legacy.test.ts', () => {
  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});

    await seedFacility({ id: FACILITY_ID, code: 'IMP', name: 'Import Facility' });
    await seedCustomer({ id: 'cust-imp', facilityId: FACILITY_ID, name: 'Imp Customer' });
    await CommodityModel.create({
      id: 'cmd-imp',
      name: 'Potato Imp',
      normalizedName: 'potato imp',
      isActive: true,
    });
    await CommodityRateModel.create({
      id: 'crt-imp-1',
      commodityId: 'cmd-imp',
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });
  });

  it('commits rentAmount-only rows despite a configured controller row', async () => {
    const today = new Date().toISOString().split('T')[0];
    const csv = [
      'grnNumber,date,customerName,commodityName,chamber,bags,bagType,rentType,rentAmount',
      `7001,${today},Imp Customer,Potato Imp,CH-01,100,S,Seasonal,5000`,
    ].join('\n');

    const summary = await executeGrnImport(FACILITY_ID, csv, grnService, USER_ID);

    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(0);
    const grn = await GrnModel.findOne({ facilityId: FACILITY_ID, grnNumber: '7001' }).lean().exec();
    expect(grn?.rentAmount).toBe(5000);
    expect(grn?.smallBagPrice).toBeNull();
    expect(grn?.bigBagPrice).toBeNull();
  });
});
