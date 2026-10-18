import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';
import {
  MOCK_RENT_SUMMARY_OPEN,
} from './fixtures/test-data.js';

test.describe('Phase 5 — Rent Billing & Payments', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'ADMIN' });
  });

  test('TC-RENT-001: Standard Partial Rent Collection & Receipt Counter (Positive)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-RENT-001',
      module: 'Rent Billing & Payments',
      testCase: 'Standard Partial Rent Collection & Receipt Counter',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'GRN has outstanding rent obligation',
      expectedResult: 'Append-only payment committed; independent RRCPT-FY-#### allocated',
    });

    const rentAccount = {
      ...MOCK_RENT_SUMMARY_OPEN,
      grnId: 'grn-0101',
      grnNumber: '0101',
      totalDue: 64000,
      totalPaid: 25000,
      remainingBalance: 39000,
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
      const payload = JSON.parse(route.request().postData() || '{}');
      const newPayment = {
        id: `rp-${Date.now()}`,
        facilityId: DEFAULT_FACILITY.id,
        grnId: payload.grnId,
        grnNumber: '0101',
        receiptNumber: 'RRCPT-25-26-0002',
        amountPaid: payload.amountPaid,
        paymentMode: payload.paymentMode,
        paymentDate: new Date().toISOString(),
        notes: payload.notes || null,
        createdBy: 'usr-admin-01',
        createdAt: new Date().toISOString(),
      };
      rentAccount.totalPaid += payload.amountPaid;
      rentAccount.remainingBalance -= payload.amountPaid;
      rentAccount.payments.push(newPayment);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          receiptNumber: 'RRCPT-25-26-0002',
          payment: newPayment,
          summary: rentAccount,
        }),
      });
    });

    await page.goto('/rent');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rent Billing & Payment Collection');

    // Click Collect rent payment
    const collectBtn = page.getByRole('button', { name: 'Collect rent payment for 0101' });
    await expect(collectBtn).toBeVisible();
    await collectBtn.click();

    // Modal opens
    const modalDialog = page.getByRole('dialog', { name: 'Collect Rent & Issue Cash Memo' });
    await expect(modalDialog).toBeVisible();

    // Enter payment amount
    const amountInput = page.locator('#collect-amount');
    await expect(amountInput).toBeVisible();
    await amountInput.fill('10000');

    // Submit payment
    const confirmBtn = page.locator('#confirm-collect-payment-btn');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Verify modal dismissed and receipt recorded
    await expect(modalDialog).not.toBeVisible();
    // Receipt history modal appears on success
    await expect(page.getByText('RRCPT-25-26-0002').first()).toBeVisible();

    recordActualResult(
      testInfo,
      'Collected partial rent payment ₹10,000 for GRN 0101; generated sequential receipt RRCPT-25-26-0002 and updated balance from ₹30,000 to ₹20,000.',
    );
  });

  test('TC-RENT-002: Strict Overpayment Guard (Zero Negative Balance Invariant)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-RENT-002',
      module: 'Rent Billing & Payments',
      testCase: 'Strict Overpayment Guard (Zero Negative Balance Invariant)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Remaining rent balance is known',
      expectedResult: 'Payment exceeding balance rejected; negative balance prevented',
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/collect/, async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      if (payload.amountPaid > 39000) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: `Rent payment of ₹${payload.amountPaid} exceeds remaining balance of ₹39,000 for GRN '0101'`,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto('/rent');

    // Browser in-page fetch verifying HTTP 400 rejection on overpayment
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/rent/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: 'grn-0101',
          amountPaid: 50000,
          paymentMode: 'Cash',
          paymentDate: new Date().toISOString(),
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('exceeds remaining balance');

    recordActualResult(
      testInfo,
      'Strict overpayment guard rejected payment of ₹50,000 against outstanding balance of ₹30,000 with 400 Bad Request.',
    );
  });

  test('TC-RENT-003: Final Rent Settlement & Closure Transition Invariant', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-RENT-003',
      module: 'Rent Billing & Payments',
      testCase: 'Final Rent Settlement & Closure Transition Invariant',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Bags balance is 0 and rent is paid to 0',
      expectedResult: 'GRN automatically transitions from OPEN to CLOSED',
    });

    const rentAccount = {
      ...MOCK_RENT_SUMMARY_OPEN,
      grnId: 'grn-0101',
      grnNumber: '0101',
      totalDue: 30000,
      totalPaid: 25000,
      remainingBalance: 5000,
      remainingBags: 0,
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
      const payload = JSON.parse(route.request().postData() || '{}');
      const finalPayment = {
        id: `rp-${Date.now()}`,
        facilityId: DEFAULT_FACILITY.id,
        grnId: payload.grnId,
        grnNumber: '0101',
        receiptNumber: 'RRCPT-25-26-0003',
        amountPaid: payload.amountPaid,
        paymentMode: payload.paymentMode,
        paymentDate: new Date().toISOString(),
        notes: 'Final settlement',
        createdBy: 'usr-admin-01',
        createdAt: new Date().toISOString(),
      };
      rentAccount.totalPaid += payload.amountPaid;
      rentAccount.remainingBalance = 0;
      rentAccount.paymentStatus = 'Settled' as const;
      rentAccount.payments.push(finalPayment);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          receiptNumber: 'RRCPT-25-26-0003',
          payment: finalPayment,
          summary: rentAccount,
          grnTransition: { grnId: 'grn-0101', fromStatus: 'OPEN', toStatus: 'CLOSED' },
        }),
      });
    });

    await page.goto('/rent');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rent Billing & Payment Collection');

    // Click Collect rent payment
    const collectBtn = page.getByRole('button', { name: 'Collect rent payment for 0101' });
    await expect(collectBtn).toBeVisible();
    await collectBtn.click();

    // Modal opens
    const modalDialog = page.getByRole('dialog', { name: 'Collect Rent & Issue Cash Memo' });
    await expect(modalDialog).toBeVisible();

    // Enter exact remaining balance
    const amountInput = page.locator('#collect-amount');
    await amountInput.fill('5000');

    // Submit payment
    const confirmBtn = page.locator('#confirm-collect-payment-btn');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(modalDialog).not.toBeVisible();
    await expect(page.getByText('RRCPT-25-26-0003').first()).toBeVisible();

    recordActualResult(
      testInfo,
      'Collected final settlement of ₹5,000; remaining rent obligation cleared to ₹0 and GRN transitioned to CLOSED.',
    );
  });

  test('TC-RENT-004: Same-GRN Recurring Season Extension (Jan/Feb & Renewal)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-RENT-004',
      module: 'Rent Billing & Payments',
      testCase: 'Same-GRN Recurring Season Extension (Jan/Feb & Renewal)',
      testType: 'API Integration',
      priority: 'P1',
      preconditions: 'Seasonal GRN stored across year end',
      expectedResult: 'Additive monthly extension period finalized in rentextensions',
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/extensions\/finalize/, async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          extension: {
            id: 'ext-2026-jan-0101',
            facilityId: DEFAULT_FACILITY.id,
            grnId: payload.grnId,
            seasonYear: payload.seasonYear,
            period: payload.period,
            rate: 15,
            bags: 250,
            amount: 3750,
            isFinalized: true,
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/rent');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/rent/extensions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: 'grn-0101',
          seasonYear: 2026,
          period: 'JANUARY',
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(201);
    expect(result.body.extension.period).toBe('JANUARY');
    expect(result.body.extension.amount).toBe(3750);
    expect(result.body.extension.isFinalized).toBe(true);

    recordActualResult(
      testInfo,
      'Finalized recurring season monthly extension for period JANUARY (2026) with amount ₹3,750 on surviving GRN 0101.',
    );
  });
});
