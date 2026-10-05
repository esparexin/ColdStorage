import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const northFacilityId = 'fac-north-search';
const southFacilityId = 'fac-south-search';

describe('Global GRN Search Integration', () => {
  let operatorNorthToken: string;
  let customerNorth1Id: string;
  let customerNorth2Id: string;
  let customerSouthId: string;
  let commodityPotatoId: string;
  let commodityAppleId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: operatorNorthToken } = await seedAuth({
      userId: 'usr-grn-search-op',
      username: 'search.op.north',
      role: 'OPERATOR',
      facilityIds: [northFacilityId, southFacilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: northFacilityId, code: 'NORTHS', name: 'North Search Facility' });
    await seedFacility({ id: southFacilityId, code: 'SOUTHS', name: 'South Search Facility' });

    customerNorth1Id = await seedCustomer({
      id: 'cust-ramesh-search',
      facilityId: northFacilityId,
      name: 'Ramesh Patel',
    });

    customerNorth2Id = await seedCustomer({
      id: 'cust-suresh-search',
      facilityId: northFacilityId,
      name: 'Suresh Sharma',
    });

    customerSouthId = await seedCustomer({
      id: 'cust-vikram-search',
      facilityId: southFacilityId,
      name: 'Vikram Singh',
    });

    const pot = await CommodityModel.create({
      id: 'cmd-potato-search',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti search',
      isActive: true,
    });
    commodityPotatoId = pot.id;

    const appCommodity = await CommodityModel.create({
      id: 'cmd-apple-search',
      name: 'Royal Apple',
      normalizedName: 'royal apple search',
      isActive: true,
    });
    commodityAppleId = appCommodity.id;
  });

  function createInbound(facilityId: string, payload: Record<string, unknown>) {
    return request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        rentAmount: 1000,
        ...payload,
      });
  }

  function searchGrns(facilityId: string, params: Record<string, string | number> = {}) {
    return request(app)
      .get(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .query(params);
  }

  it('searches across all 7 SSOT fields case-insensitively and returns matching items', async () => {
    // Seed 2 GRNs in North facility with distinctive values across the 7 fields
    const res1 = await createInbound(northFacilityId, {
      customerId: customerNorth1Id,
      commodityId: commodityPotatoId,
      gpNumber: 'GP-ALPHA-99',
      vehicleNumber: 'UP32AB1234',
      bondNumber: 'BND-26-27-0010',
      isBondForLoan: true,
    });
    expect(res1.status).toBe(201);
    const grn1 = res1.body.grn;

    const res2 = await createInbound(northFacilityId, {
      customerId: customerNorth2Id,
      commodityId: commodityAppleId,
      gpNumber: 'GP-BETA-77',
      vehicleNumber: 'DL01CD5678',
      bondNumber: 'BND-26-27-0020',
      isBondForLoan: true,
    });
    expect(res2.status).toBe(201);
    const grn2 = res2.body.grn;

    // 1. Search by exact grnNumber
    const sGrnExact = await searchGrns(northFacilityId, { search: grn1.grnNumber });
    expect(sGrnExact.body.items).toHaveLength(1);
    expect(sGrnExact.body.items[0].id).toBe(grn1.id);
    expect(sGrnExact.body.total).toBe(1);

    // 2. Search by partial inwardReceiptNumber
    const sReceipt = await searchGrns(northFacilityId, {
      search: grn2.inwardReceiptNumber.slice(-4),
    });
    expect(sReceipt.body.items.some((g: { id: string }) => g.id === grn2.id)).toBe(true);

    // 3. Search by customerName (case-insensitive)
    const sCust = await searchGrns(northFacilityId, { search: 'ramesh' });
    expect(sCust.body.items).toHaveLength(1);
    expect(sCust.body.items[0].customerName).toBe('Ramesh Patel');

    // 4. Search by commodityName (case-insensitive)
    const sComm = await searchGrns(northFacilityId, { search: 'APPLE' });
    expect(sComm.body.items).toHaveLength(1);
    expect(sComm.body.items[0].commodityName).toBe('Royal Apple');

    // 5. Search by gpNumber
    const sGp = await searchGrns(northFacilityId, { search: 'alpha-99' });
    expect(sGp.body.items).toHaveLength(1);
    expect(sGp.body.items[0].gpNumber).toBe('GP-ALPHA-99');

    // 6. Search by vehicleNumber
    const sVeh = await searchGrns(northFacilityId, { search: 'dl01cd' });
    expect(sVeh.body.items).toHaveLength(1);
    expect(sVeh.body.items[0].vehicleNumber).toBe('DL01CD5678');

    // 7. Search by bondNumber
    const sBond = await searchGrns(northFacilityId, { search: '0010' });
    expect(sBond.body.items).toHaveLength(1);
    expect(sBond.body.items[0].bondNumber).toBe('BND-26-27-0010');
  });

  it('searches entire dataset across pagination boundaries without slicing limits', async () => {
    // Create target GRN first so it lands on a later page (sorted by date/createdAt desc)
    const resTarget = await createInbound(northFacilityId, {
      customerId: customerNorth2Id,
      commodityId: commodityAppleId,
      gpNumber: 'GP-TARGET-FINDME',
    });
    const targetGrn = resTarget.body.grn;

    await createInbound(northFacilityId, {
      customerId: customerNorth1Id,
      commodityId: commodityPotatoId,
      gpNumber: 'GP-FIRST-1',
    });
    await createInbound(northFacilityId, {
      customerId: customerNorth1Id,
      commodityId: commodityPotatoId,
      gpNumber: 'GP-SECOND-2',
    });

    // Normal pagination: limit=1, page=1 only returns newest record (target is on page 3)
    const page1 = await searchGrns(northFacilityId, { limit: 1, page: 1 });
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0].id).not.toBe(targetGrn.id);
    expect(page1.body.total).toBe(3);

    // Global search directly targets the deep record across the full dataset
    const searched = await searchGrns(northFacilityId, { search: 'FINDME' });
    expect(searched.body.items).toHaveLength(1);
    expect(searched.body.items[0].id).toBe(targetGrn.id);
    expect(searched.body.total).toBe(1);
  });

  it('handles empty search, no match, and enforces strict facility isolation', async () => {
    await createInbound(northFacilityId, {
      customerId: customerNorth1Id,
      commodityId: commodityPotatoId,
      gpNumber: 'GP-NORTH-SECRET',
    });
    await createInbound(southFacilityId, {
      customerId: customerSouthId,
      commodityId: commodityPotatoId,
      gpNumber: 'GP-SOUTH-SECRET',
    });

    // Empty search query returns all records for the facility
    const allNorth = await searchGrns(northFacilityId, { search: '   ' });
    expect(allNorth.body.items).toHaveLength(1);
    expect(allNorth.body.total).toBe(1);

    // Query with no matches returns empty items and total 0
    const noMatch = await searchGrns(northFacilityId, { search: 'NONEXISTENT_QUERY_XYZ' });
    expect(noMatch.body.items).toHaveLength(0);
    expect(noMatch.body.total).toBe(0);

    // Facility isolation: searching for South record from North facility returns nothing
    const crossFacility = await searchGrns(northFacilityId, { search: 'SOUTH-SECRET' });
    expect(crossFacility.body.items).toHaveLength(0);
    expect(crossFacility.body.total).toBe(0);

    // Searching from South facility finds it
    const southSearch = await searchGrns(southFacilityId, { search: 'SOUTH-SECRET' });
    expect(southSearch.body.items).toHaveLength(1);
    expect(southSearch.body.items[0].facilityId).toBe(southFacilityId);
  });
});
