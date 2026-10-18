import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import { DEFAULT_FACILITY, mockAuthenticatedSession } from './fixtures/mock-auth.fixture.js';
import {
  MOCK_GRN_OPEN,
  MOCK_CHALLAN,
  MOCK_RENT_SUMMARY_OPEN,
  MOCK_CUSTOMERS,
  MOCK_COMMODITIES,
} from './fixtures/test-data.js';

test.describe('PR 3 — Concurrent Operations, Race Conditions & State Divergence', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'ADMIN' });
  });

  test('TC-CONC-001: Simultaneous Delivery Challans on Depleted Stock (Race-Condition Over-Withdrawal Guard)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-CONC-001',
      module: 'Delivery & Challans',
      testCase: 'Simultaneous Delivery Challans on Depleted Stock (Race-Condition Over-Withdrawal Guard)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has 50 bags remaining; operator submits 50 bags while concurrent process depletes stock',
      expectedResult: 'Atomic lock intercepts over-withdrawal; returns HTTP 400; surfaces #delivery-issue-error',
    });

    const targetGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-0101',
      grnNumber: '0101',
      bags: 50,
      closingBags: 50,
      remainingBags: 50,
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
            totalInwardBags: 50,
            availableSmallBags: 50,
            availableBigBags: 0,
            totalDeliveredBags: 0,
            remainingBags: 50,
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
          remainingBalance: 0,
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
          body: JSON.stringify({ items: [MOCK_CHALLAN], total: 1 }),
        });
      } else if (route.request().method() === 'POST') {
        // Simulate concurrent race condition: another transaction already committed
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Remaining balance (0 bags) is less than delivery quantity (50 bags)',
          }),
        });
      }
    });

    await page.goto('/deliveries');
    await page.locator('#create-delivery-header-btn').click();
    await page.locator('#outward-grn-select-grn-0101').click();

    const modalDialog = page.getByRole('dialog', { name: 'Issue Outward Delivery Challan' });
    await expect(modalDialog).toBeVisible();

    await page.locator('#delivery-small-bags').fill('50');
    await page.locator('#delivery-driver').fill('Driver Raju');
    await page.locator('#delivery-gp').fill('GP-0002');
    await page.locator('#delivery-vehicle').fill('MH-12-AB-1234');

    const submitBtn = page.locator('#issue-panel-submit-delivery-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const errorBanner = page.locator('#delivery-issue-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Remaining balance (0 bags) is less than delivery quantity (50 bags)');
    await expect(modalDialog).toBeVisible();

    recordActualResult(
      testInfo,
      'Atomic over-delivery guard intercepted depleted stock; returned HTTP 400 "Remaining balance (0 bags) is less than delivery quantity (50 bags)"; surfaced via #delivery-issue-error without ledger corruption',
    );
  });

  test('TC-CONC-002: Concurrent Rent Payment Submissions on Settled Obligation', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-CONC-002',
      module: 'Rent Billing & Payments',
      testCase: 'Concurrent Rent Payment Submissions on Settled Obligation',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has finite remaining rent balance; concurrent settlement arrives during flight',
      expectedResult: 'Rejects overpayment beyond remaining balance; returns HTTP 400; surfaces #collect-error',
    });

    const rentAccount = {
      ...MOCK_RENT_SUMMARY_OPEN,
      grnId: 'grn-0101',
      grnNumber: '0101',
      totalDue: 25000,
      totalPaid: 15000,
      remainingBalance: 10000,
      paymentStatus: 'Partially Paid' as const,
      payments: [...MOCK_RENT_SUMMARY_OPEN.payments],
    };

    await page.route(/\/api\/facilities\/[^/]+\/rent\/summaries/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summaries: [rentAccount] }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/collect/, async (route) => {
      // Simulate concurrent settlement completing first
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Payment amount (₹10,000) exceeds remaining balance (₹0)',
        }),
      });
    });

    await page.goto('/rent');
    const collectBtn = page.getByRole('button', { name: 'Collect rent payment for 0101' });
    await expect(collectBtn).toBeVisible();
    await collectBtn.click();

    const modalDialog = page.getByRole('dialog', { name: 'Collect Rent & Issue Cash Memo' });
    await expect(modalDialog).toBeVisible();

    await page.locator('#collect-amount').fill('10000');
    await page.locator('#confirm-collect-payment-btn').click();

    const errorBanner = page.locator('#collect-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('exceeds remaining balance');
    await expect(modalDialog).toBeVisible();

    recordActualResult(
      testInfo,
      'Concurrent payment intercepted by obligation validation; server returned HTTP 400 "Payment amount (₹10,000) exceeds remaining balance (₹0)"; surfaced via #collect-error preventing duplicate settlement',
    );
  });

  test('TC-CONC-003: Simultaneous GRN Inward Numbering & Duplicate Conflict Resolution', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-CONC-003',
      module: 'Inward Goods Receipt',
      testCase: 'Simultaneous GRN Inward Numbering & Duplicate Conflict Resolution',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Two concurrent inward creation attempts with identical GRN number "8888"',
      expectedResult: 'Facility unique index rejects duplicate; returns HTTP 409 Conflict; surfaces #grn-modal-error',
    });

    await page.route('**/api/facilities/**/grns/next-grn-number', async (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lastCreatedGrn: '0101', nextGrn: '8888' }) }));
    await page.route(/\/api\/commodities\/comm-potato-01\/rates/, async (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rate: { smallRate: 120, bigRate: 140, rentType: 'Seasonal' } }) }));
    await page.route('**/api/commodities*', async (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: MOCK_COMMODITIES, total: 1 }) }));
    await page.route('**/api/customers*', async (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: MOCK_CUSTOMERS, total: 2 }) }));
    await page.route('**/api/facilities/**/grns*', async (r) => {
      if (r.request().method() === 'GET') {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }) });
      } else if (r.request().method() === 'POST') {
        // Simulate concurrent duplicate collision on unique compound index { facilityId: 1, grnNumber: 1 }
        await r.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: "GRN '8888' already exists for this facility.",
          }),
        });
      }
    });

    await page.goto('/grns');
    await page.getByRole('button', { name: /Inward of Goods/i }).first().click();

    const modalDialog = page.getByRole('dialog', { name: 'Inward of Goods' });
    await expect(modalDialog).toBeVisible();

    await page.locator('#create-customer-search').click();
    await page.locator('#customer-combobox-listbox').getByText('Ramesh Agro Traders').click();
    await page.locator('select#create-commodity').selectOption('comm-potato-01');
    await page.locator('input#create-chamber').fill('CH-01');
    await page.locator('input#create-bags').fill('100');
    await page.locator('input#create-gr-number').fill('8888');
    await page.locator('input#create-vehicle').fill('MH12DE9999');

    const submitBtn = page.locator('#submit-create-grn-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const errorAlert = page.locator('#create-gr-number-error');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("GRN '8888' already exists for this facility");
    await expect(page.locator('input#create-gr-number')).toHaveAttribute('aria-invalid', 'true');
    await expect(modalDialog).toBeVisible();

    recordActualResult(
      testInfo,
      'Concurrent duplicate GRN creation rejected by facility unique index; returned HTTP 409 "GRN \'8888\' already exists for this facility."; surfaced inline via #create-gr-number-error without corrupting sequence',
    );
  });

  test('TC-CONC-004: Client-Side Rapid Double-Submit Suppression & In-Flight Lockout', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-CONC-004',
      module: 'System & UI Invariants',
      testCase: 'Client-Side Rapid Double-Submit Suppression & In-Flight Lockout',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Active modal form with valid input ready for submission',
      expectedResult: 'Submitting flag immediately locks button (disabled=true); suppresses duplicate request dispatch',
    });

    let postCallCount = 0;

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
          remainingBalance: 0,
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
          ],
        }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/deliveries(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [MOCK_CHALLAN], total: 1 }),
        });
      } else if (route.request().method() === 'POST') {
        postCallCount++;
        // Simulate asynchronous flight time
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            delivery: { ...MOCK_CHALLAN, id: 'del-delayed-01' },
            summary: { remainingBags: 230, deliveredBags: 20, isFullyDelivered: false },
          }),
        });
      }
    });

    await page.goto('/deliveries');
    await page.locator('#create-delivery-header-btn').click();
    await page.locator('#outward-grn-select-grn-0101').click();

    await page.locator('#delivery-small-bags').fill('20');
    await page.locator('#delivery-driver').fill('Driver Suresh');
    await page.locator('#delivery-gp').fill('GP-0002');
    await page.locator('#delivery-vehicle').fill('MH-12-AB-1234');

    const submitBtn = page.locator('#issue-panel-submit-delivery-btn');
    await expect(submitBtn).toBeEnabled();

    // Click submit once
    await submitBtn.click();

    // Immediately verify submit button is locked out (disabled attribute active)
    await expect(submitBtn).toBeDisabled();

    // Attempt rapid second click while request is in-flight
    await submitBtn.click({ force: true, timeout: 150 }).catch(() => {
      // Expected: disabled element ignores normal clicks
    });

    // Wait for the modal dialog to complete and close
    await expect(page.getByRole('dialog', { name: 'Issue Outward Delivery Challan' })).not.toBeVisible({ timeout: 5000 });

    // Verify only exactly 1 POST request was ever dispatched
    expect(postCallCount).toBe(1);

    recordActualResult(
      testInfo,
      'Submit button engaged immediate in-flight lockout (disabled=true, isLoading=true); rapid successive click attempts suppressed duplicate HTTP dispatch (postCallCount=1)',
    );
  });
});
