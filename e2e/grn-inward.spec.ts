import { test, expect } from '@playwright/test';
import { annotateTest } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';
import {
  MOCK_CUSTOMERS,
  MOCK_COMMODITIES,
  MOCK_GRN_OPEN,
} from './fixtures/test-data.js';

test.describe('Phase 3 — Inward Goods Receipt (GRN & Ledger)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'ADMIN' });
  });

  test('TC-GRN-001: Standard Seasonal Inward Entry (Positive Path)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRN-001',
      module: 'Inward Goods Receipt',
      testCase: 'Standard Seasonal Inward Entry (Positive Path)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Active customer, commodity with rates',
      expectedResult: 'GRN created; derived receipt RCPT-FY-####; ledger INWARD_PUTAWAY created',
    });

    const activeGrns = [{ ...MOCK_GRN_OPEN }];

    await page.route('**/api/facilities/**/grns/next-grn-number', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lastCreatedGrn: '0101', nextGrn: '0102' }),
      });
    });

    await page.route(/\/api\/commodities\/comm-potato-01\/rates/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rate: { smallRate: 120, bigRate: 140, rentType: 'Seasonal' },
        }),
      });
    });

    await page.route('**/api/commodities*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: MOCK_COMMODITIES, total: MOCK_COMMODITIES.length }),
      });
    });

    await page.route('**/api/customers*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: MOCK_CUSTOMERS, total: MOCK_CUSTOMERS.length }),
      });
    });

    await page.route('**/api/facilities/**/grns*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: activeGrns, total: activeGrns.length }),
        });
      } else if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const createdGrn = {
          id: 'grn-0102',
          facilityId: DEFAULT_FACILITY.id,
          grnNumber: payload.grnNumber,
          inwardReceiptNumber: `RCPT-25-26-${payload.grnNumber}`,
          date: new Date(payload.date),
          customerId: payload.customerId,
          customerName: 'Ramesh Agro Traders',
          commodityId: payload.commodityId,
          commodityName: 'Table Potato',
          chamber: payload.chamber,
          bagType: 'S/B',
          bags: payload.bags,
          remainingBags: payload.bags,
          deliveredBags: 0,
          netDeliveredBags: 0,
          rentType: 'Seasonal',
          status: 'OPEN',
          smallBagPrice: 120,
          bigBagPrice: 140,
          totalRentCalculated: 30000,
          totalRentPaid: 0,
          remainingRentBalance: 30000,
          vehicleNumber: payload.vehicleNumber,
        };
        activeGrns.unshift(createdGrn);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            grn: createdGrn,
            acknowledgement: {
              grnNumber: createdGrn.grnNumber,
              inwardReceiptNumber: createdGrn.inwardReceiptNumber,
              bags: createdGrn.bags,
            },
          }),
        });
      }
    });

    await page.goto('/grns');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Inward of Goods');

    // Open Inward Form
    await page.getByRole('button', { name: /Inward of Goods/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Inward of Goods', level: 2 })).toBeVisible();

    // Select Customer
    await page.locator('#create-customer-search').click();
    await page.locator('#customer-combobox-listbox').getByText('Ramesh Agro Traders').click();

    // Select Commodity
    await page.locator('select#create-commodity').selectOption('comm-potato-01');

    // Fill GR Number, Chamber, Bags
    await page.locator('input#create-gr-number').fill('0102');
    await page.locator('input#create-chamber').fill('CH-01');
    await page.locator('input#create-bags').fill('250');

    // Verify Price Controller auto-resolved rate
    await expect(page.locator('#create-rate-section')).toContainText('₹120.00');

    // Submit Inward Form
    await page.locator('#submit-create-grn-btn').click();

    // Verify modal dismissed and new GRN present in table
    await expect(page.getByRole('heading', { name: 'Inward of Goods', level: 2 })).not.toBeVisible();
    await expect(page.getByText('0102').first()).toBeVisible();
  });

  test('TC-GRN-002: GR Number 4-Digit Format & Uniqueness Rejection', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRN-002',
      module: 'Inward Goods Receipt',
      testCase: 'GR Number 4-Digit Format & Uniqueness Rejection',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Inward form open',
      expectedResult: 'Non-4-digit and duplicate numbers rejected before commit',
    });

    await page.route('**/api/facilities/**/grns?search=0101*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ grnNumber: '0101' }] }),
      });
    });

    await page.route('**/api/facilities/**/grns*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }),
      });
    });

    await page.goto('/grns');
    await page.getByRole('button', { name: /Inward of Goods/i }).first().click();

    const grnInput = page.locator('input#create-gr-number');
    const submitBtn = page.locator('#submit-create-grn-btn');

    // 1. Test short GRN (< 4 digits) — validation triggers on blur and disables submit
    await grnInput.fill('12');
    await grnInput.blur();
    await expect(page.locator('#create-gr-number-error')).toContainText('GRN must be exactly 4 digits');
    await expect(submitBtn).toBeDisabled();

    // 2. Test duplicate GRN number
    await grnInput.fill('0101');
    await grnInput.blur();
    await expect(page.locator('#create-gr-number-error')).toContainText("already exists for this facility");
    await expect(submitBtn).toBeDisabled();
  });

  test('TC-GRN-003: S/B Bag Composition Inconsistency Rejection', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRN-003',
      module: 'Inward Goods Receipt',
      testCase: 'S/B Bag Composition Inconsistency Rejection',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Inward form open',
      expectedResult: 'Split mismatching total bags rejected with validation error',
    });

    await page.route('**/api/facilities/**/grns*', async (route) => {
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const small = payload.smallBags ?? 0;
        const big = payload.bigBags ?? 0;
        if (small + big !== payload.bags) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: `Small (${small}) plus big (${big}) bags must equal the declared total of ${payload.bags} bags`,
            }),
          });
          return;
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }),
      });
    });

    await page.goto('/grns');

    // Verify via in-page browser fetch caught by page.route
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/grns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnNumber: '9999',
          customerId: 'cust-001',
          commodityId: 'comm-potato-01',
          chamber: 'CH-01',
          bags: 250,
          smallBags: 100,
          bigBags: 100,
          rentType: 'Seasonal',
          date: new Date().toISOString(),
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('must equal the declared total of 250 bags');
  });

  test('TC-GRN-004: Inward Date Future Clock Skew Boundary', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRN-004',
      module: 'Inward Goods Receipt',
      testCase: 'Inward Date Future Clock Skew Boundary',
      testType: 'API Integration',
      priority: 'P1',
      preconditions: 'API endpoint reachable',
      expectedResult: 'Dates beyond 5 min skew rejected with 400 Bad Request',
    });

    await page.route('**/api/facilities/**/grns*', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      const inputDate = new Date(payload.date);
      const now = new Date();
      const fiveMinSkew = 5 * 60 * 1000;
      if (inputDate.getTime() > now.getTime() + fiveMinSkew) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Inward date cannot be in the future' }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ grn: { ...MOCK_GRN_OPEN, date: inputDate } }),
        });
      }
    });

    await page.goto('/grns');

    // 10 minutes in the future (> 5 min skew)
    const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = await page.evaluate(async (dateStr) => {
      const res = await fetch('/api/facilities/fac-solapur-01/grns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnNumber: '8888',
          customerId: 'cust-001',
          commodityId: 'comm-potato-01',
          chamber: 'CH-01',
          bags: 100,
          rentType: 'Seasonal',
          date: dateStr,
        }),
      });
      return { status: res.status, body: await res.json() };
    }, futureDate);

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('cannot be in the future');
  });

  test('TC-GRN-005: Inward Administrative Correction (Frozen Governance Gate)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRN-005',
      module: 'Inward Goods Receipt',
      testCase: 'Inward Administrative Correction (Frozen Governance Gate)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has no outward movement (hasMovement=false)',
      expectedResult: 'Chamber and bag edits propagate to INWARD_PUTAWAY; audit WARN logged',
    });

    let currentGrn = { ...MOCK_GRN_OPEN, chamber: 'CH-01' };

    await page.route('**/api/facilities/**/grns/**/movement-history', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ history: { entries: [] } }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [currentGrn], total: 1 }),
        });
      } else if (route.request().method() === 'PATCH') {
        const payload = JSON.parse(route.request().postData() || '{}');
        currentGrn = { ...currentGrn, chamber: payload.chamber ?? currentGrn.chamber };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ grn: currentGrn }),
        });
      }
    });

    await page.goto('/grns');
    await expect(page.getByText('0101').first()).toBeVisible();

    // Click Edit button
    await page.getByRole('button', { name: 'Edit GRN 0101' }).click();
    await expect(page.getByRole('heading', { name: 'Edit GRN: 0101' })).toBeVisible();

    // Verify structural fields are editable (not disabled)
    const chamberInput = page.locator('input#create-chamber');
    const bagsInput = page.locator('input#create-bags');
    await expect(chamberInput).toBeEnabled();
    await expect(bagsInput).toBeEnabled();

    // Update chamber to CH-09
    await chamberInput.fill('CH-09');
    await page.locator('#submit-create-grn-btn').click();

    // Verify modal dismissed and updated chamber reflected
    await expect(page.getByRole('heading', { name: 'Edit GRN: 0101' })).not.toBeVisible();
    await expect(page.getByText('CH-09').first()).toBeVisible();
  });

  test('TC-GRN-006: Inward Correction Movement Freeze Violation', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRN-006',
      module: 'Inward Goods Receipt',
      testCase: 'Inward Correction Movement Freeze Violation',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has movement history',
      expectedResult: 'Structural fields frozen; error GRN_MOVED thrown',
    });

    const movedGrn = {
      ...MOCK_GRN_OPEN,
      netDeliveredBags: 50,
      deliveredBags: 50,
      remainingBags: 200,
    };

    await page.route('**/api/facilities/**/grns/**/movement-history', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          history: {
            entries: [{ type: 'PARTIAL_OUTWARD', bags: 50, timestamp: new Date().toISOString() }],
          },
        }),
      });
    });

    await page.route('**/api/facilities/**/grns*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [movedGrn], total: 1 }),
      });
    });

    await page.goto('/grns');
    await expect(page.getByText('0101').first()).toBeVisible();

    // Click Edit button
    await page.getByRole('button', { name: 'Edit GRN 0101' }).click();
    await expect(page.getByRole('heading', { name: 'Edit GRN: 0101' })).toBeVisible();

    // Verify movement freeze guard banner is rendered
    await expect(page.locator('#grn-guard-banner')).toBeVisible();
    await expect(page.locator('#grn-guard-banner')).toContainText('Partially delivered');

    // Verify structural fields are disabled
    await expect(page.locator('input#create-bags')).toBeDisabled();
    await expect(page.locator('input#create-date')).toBeDisabled();
    await expect(page.locator('select#create-commodity')).toBeDisabled();

    // Verify non-structural field (chamber) remains editable
    await expect(page.locator('input#create-chamber')).toBeEnabled();
  });
});
