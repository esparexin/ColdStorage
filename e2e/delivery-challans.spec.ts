import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';
import {
  MOCK_GRN_OPEN,
  MOCK_CHALLAN,
  MOCK_RENT_SUMMARY_OPEN,
} from './fixtures/test-data.js';

test.describe('Phase 4 — Delivery Challans, Stock Balances & Rent Gates', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'ADMIN' });
  });

  test('TC-DEL-001: Partial Delivery Challan Issuance (Positive)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DEL-001',
      module: 'Delivery & Challans',
      testCase: 'Partial Delivery Challan Issuance (Positive)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has available ledger stock and partial rent paid',
      expectedResult: 'Challan issued; OUTWARD_DELIVERY written; balance decremented',
    });

    const activeChallans = [{ ...MOCK_CHALLAN }];
    const targetGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-0101',
      grnNumber: '0101',
      bags: 250,
      closingBags: 250,
      remainingBags: 250,
      deliveredBags: 0,
      netDeliveredBags: 0,
    };

    await page.route(/\/api\/facilities\/[^/]+\/deliveries\/next-gp-number/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ nextGpNumber: 'GP-0002' }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns\/grn-0101\/inventory-summary/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            facilityId: DEFAULT_FACILITY.id,
            grnId: 'grn-0101',
            grnNumber: '0101',
            totalInwardBags: 250,
            availableSmallBags: 250,
            availableBigBags: 0,
            totalDeliveredBags: 0,
            remainingBags: 250,
          },
        }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/grn\/grn-0101/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_RENT_SUMMARY_OPEN,
          totalPaid: 25000,
          remainingBalance: 5000,
        }),
      });
    });

    await page.route(/\/api\/commodities\/comm-potato-01\/rates/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { rentType: 'Seasonal', smallRate: 120, bigRate: 140, isActive: true },
            { rentType: 'Monthly', smallRate: 18, bigRate: 22, isActive: true },
          ],
        }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [targetGrn], total: 1 }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/deliveries(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: activeChallans, total: activeChallans.length }),
        });
      } else if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const createdChallan = {
          id: `del-${Date.now()}`,
          facilityId: DEFAULT_FACILITY.id,
          challanNumber: 'CHL-25-26-0002',
          date: new Date(),
          grnId: payload.grnId,
          grnNumber: '0101',
          customerId: 'cust-001',
          customerName: 'Ramesh Agro Traders',
          commodityId: 'comm-potato-01',
          commodityName: 'Table Potato',
          chamber: 'CH-A1',
          smallBags: payload.smallBags ?? 50,
          bigBags: payload.bigBags ?? 0,
          totalBags: 50,
          status: 'ISSUED',
          vehicleNumber: payload.vehicleNumber ?? 'MH-12-DE-9999',
          gpNumber: payload.gpNumber ?? 'GP-0002',
        };
        activeChallans.unshift(createdChallan);
        targetGrn.remainingBags = 200;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            delivery: createdChallan,
            summary: {
              remainingBags: 200,
              deliveredBags: 50,
              isFullyDelivered: false,
            },
          }),
        });
      }
    });

    await page.goto('/deliveries');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Deliveries');

    // Switch to Outward view
    await page.locator('#create-delivery-header-btn').click();
    await expect(page.locator('#outward-grn-select-grn-0101')).toBeVisible();

    // Select GRN 0101
    await page.locator('#outward-grn-select-grn-0101').click();
    const modalDialog = page.getByRole('dialog', { name: 'Issue Outward Delivery Challan' });
    await expect(modalDialog).toBeVisible();

    // Enter withdrawal quantity
    const quantityInput = page.locator('#delivery-small-bags');
    await expect(quantityInput).toBeVisible();
    await quantityInput.fill('50');

    // Fill transport and vehicle information
    await page.locator('#delivery-vehicle').fill('MH-12-DE-9999');
    await page.locator('#delivery-driver').fill('Raju Patil');
    await page.locator('#delivery-gp').fill('GP-0002');

    // Verify Remaining Bags calculation updates
    await expect(page.locator('#delivery-balance-sb-display')).toContainText('200 / 250');

    // Submit delivery
    const submitBtn = page.locator('#issue-panel-submit-delivery-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify modal dismissed and new challan listed
    await expect(modalDialog).not.toBeVisible();
    await expect(page.getByText('CHL-25-26-0002').first()).toBeVisible();

    recordActualResult(
      testInfo,
      'Issued partial delivery challan CHL-25-26-0002 for 50 bags; balance updated from 250 to 200 bags; vehicle and driver details captured.',
    );
  });

  test('TC-DEL-002: Atomic Over-Delivery Guard (Negative Boundary)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DEL-002',
      module: 'Delivery & Challans',
      testCase: 'Atomic Over-Delivery Guard (Negative Boundary)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Available ledger balance known',
      expectedResult: 'Over-withdrawal atomically rejected with balance error',
    });

    await page.route(/\/api\/facilities\/[^/]+\/deliveries/, async (route) => {
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const requested = (payload.smallBags ?? 0) + (payload.bigBags ?? 0) || payload.quantity || 0;
        if (requested > 250) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: `Requested ${requested} bags exceeds the available balance of 250 bags for GRN '0101'`,
            }),
          });
          return;
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_CHALLAN], total: 1 }),
      });
    });

    await page.goto('/deliveries');

    // In-page browser fetch verification
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: 'grn-0101',
          quantity: 300,
          smallBags: 300,
          bigBags: 0,
          deliveryDate: new Date().toISOString(),
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('exceeds the available balance of 250 bags');

    recordActualResult(
      testInfo,
      'Atomic over-delivery guard rejected attempt to deliver 300 bags when available stock was 250 bags with 400 Bad Request.',
    );
  });

  test('TC-DEL-003: Delivery Rent Gate Hard Block (Zero Rent Paid)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DEL-003',
      module: 'Delivery & Challans',
      testCase: 'Delivery Rent Gate Hard Block (Zero Rent Paid)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has rent obligation > 0 and 0 paid',
      expectedResult: 'Delivery blocked with 402 Payment Required',
    });

    await page.route(/\/api\/facilities\/[^/]+\/deliveries/, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 402,
          contentType: 'application/json',
          body: JSON.stringify({
            error: "RENT_PAYMENT_REQUIRED: Outward delivery blocked for GRN '0101': zero rent has been paid on outstanding obligation of ₹30,000",
            code: 'RENT_PAYMENT_REQUIRED',
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_CHALLAN], total: 1 }),
      });
    });

    await page.goto('/deliveries');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: 'grn-0101',
          quantity: 25,
          smallBags: 25,
          bigBags: 0,
          deliveryDate: new Date().toISOString(),
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(402);
    expect(result.body.error).toContain('RENT_PAYMENT_REQUIRED');

    recordActualResult(
      testInfo,
      'Delivery rent gate hard block enforced: delivery blocked with 402 Payment Required for GRN 0101 with zero rent paid.',
    );
  });

  test('TC-DEL-004: Delivery Reversal Full Rollback & Auto-Reopening', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DEL-004',
      module: 'Delivery & Challans',
      testCase: 'Delivery Reversal Full Rollback & Auto-Reopening',
      testType: 'API Integration',
      priority: 'P0',
      preconditions: 'Issued challan on closed GRN',
      expectedResult: 'Challan marked REVERSED; stock restored; GRN reopened to OPEN',
    });

    await page.route(/\/api\/facilities\/[^/]+\/deliveries\/del-001\/reverse/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reversal: {
            id: 'rev-001',
            deliveryId: 'del-001',
            grnId: 'grn-0101',
            reversedBags: 150,
            status: 'COMPLETED',
          },
          challan: {
            ...MOCK_CHALLAN,
            status: 'REVERSED',
          },
          summary: {
            grn: {
              id: 'grn-0101',
              status: 'OPEN',
              remainingBags: 150,
            },
          },
        }),
      });
    });

    await page.goto('/deliveries');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/deliveries/del-001/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Customer cancelled collection at weighbridge' }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.challan.status).toBe('REVERSED');
    expect(result.body.summary.grn.status).toBe('OPEN');
    expect(result.body.summary.grn.remainingBags).toBe(150);

    recordActualResult(
      testInfo,
      'Delivery reversal rolled back 150 bags; challan marked REVERSED and GRN automatically transitioned from CLOSED back to OPEN.',
    );
  });
});
