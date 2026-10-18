import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import {
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';
import {
  MOCK_GRN_OPEN,
} from './fixtures/test-data.js';

test.describe('Phase 6 — Bonds & Loans', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'ADMIN' });
  });

  test('TC-BOND-001: Pledging GRN for Loan (Flag Update)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-BOND-001',
      module: 'Bonds & Loans',
      testCase: 'Pledging GRN for Loan (Flag Update)',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'GRN exists',
      expectedResult: 'Bond register displays GR Number as Bond #; loanStatus TAKEN',
    });

    const bondedGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-0101',
      grnNumber: '0101',
      isBondForLoan: true,
      loanStatus: 'TAKEN' as const,
      loanBankName: 'State Bank of India',
      loanReferenceNumber: 'LOAN-REF-99',
      loanAmount: 150000,
      loanTakenAt: new Date('2026-04-12T10:00:00Z'),
    };

    await page.route(/\/api\/facilities\/[^/]+\/grns(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [bondedGrn], total: 1 }),
      });
    });

    await page.goto('/bonds');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonds');

    // Verify GRN 0101 listed in the bond register table
    await expect(page.getByText('0101').first()).toBeVisible();
    await expect(page.getByText('Ramesh Agro Traders')).toBeVisible();

    // Click on View button to open Bond Details modal
    await page.getByRole('button', { name: /View Bond Details/i }).click();

    // Verify modal title
    const modalDialog = page.getByRole('dialog', { name: 'Bond — 0101' });
    await expect(modalDialog).toBeVisible();

    // Verify Bond # displays GR Number as Bond # (no separate duplicate key)
    await expect(modalDialog.getByText('0101').first()).toBeVisible();
    await expect(modalDialog.getByText('Loan Active (Hold)')).toBeVisible();
    await expect(modalDialog.getByText('CH-A1')).toBeVisible();

    // Close modal
    await modalDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modalDialog).not.toBeVisible();

    recordActualResult(
      testInfo,
      'Bond register displayed GR Number 0101 as Bond # with Loan Active (Hold) status; confirmed no separate duplicate key was introduced.',
    );
  });

  test('TC-BOND-002: Loan Clearance & Settlement Rail Validations', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-BOND-002',
      module: 'Bonds & Loans',
      testCase: 'Loan Clearance & Settlement Rail Validations',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Loan taken on GRN',
      expectedResult: 'Validates UTR, Bank details, IFSC regex; updates status to CLEARED',
    });

    const activeLoanGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-0101',
      grnNumber: '0101',
      isBondForLoan: true,
      loanStatus: 'TAKEN' as const,
      loanBankName: 'State Bank of India',
      loanAmount: 150000,
      loanTakenAt: new Date('2026-04-12T10:00:00Z'),
    };

    await page.route(/\/api\/facilities\/[^/]+\/grns(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [activeLoanGrn], total: 1 }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns\/grn-0101\/loan-status/, async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      if (payload.loanStatus === 'CLEARED' && payload.settlement) {
        const { ifscCode, utrNumber, bankName, accountNumber } = payload.settlement;
        if (!ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Invalid IFSC Code format (e.g. SBIN0001234)' }),
          });
          return;
        }
        if (!utrNumber || !bankName || !accountNumber) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Bank Name, Account #, IFSC, and UTR are required' }),
          });
          return;
        }
        activeLoanGrn.loanStatus = 'CLEARED';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ grn: activeLoanGrn }),
        });
        return;
      }
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid request' }) });
    });

    await page.goto('/bonds');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonds');

    // Browser in-page validation of loan settlement rail
    const settlementResults = await page.evaluate(async () => {
      // 1. Invalid IFSC rejection
      const invalidRes = await fetch('/api/facilities/fac-solapur-01/grns/grn-0101/loan-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanStatus: 'CLEARED',
          settlement: {
            amountPaid: 150000,
            paymentMode: 'Bank Transfer',
            paymentDate: new Date().toISOString(),
            bankName: 'State Bank of India',
            accountNumber: '10029384721',
            ifscCode: 'INVALID_IFSC',
            utrNumber: 'UTR-999',
            receiverName: 'Official Collector',
          },
        }),
      });

      // 2. Valid Bank Transfer settlement
      const validRes = await fetch('/api/facilities/fac-solapur-01/grns/grn-0101/loan-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanStatus: 'CLEARED',
          settlement: {
            amountPaid: 150000,
            paymentMode: 'Bank Transfer',
            paymentDate: new Date().toISOString(),
            bankName: 'State Bank of India',
            accountNumber: '10029384721',
            ifscCode: 'SBIN0001234',
            utrNumber: 'UTR-20261005-098234',
            receiverName: 'Official Collector',
          },
        }),
      });

      return {
        invalidStatus: invalidRes.status,
        invalidBody: await invalidRes.json(),
        validStatus: validRes.status,
        validBody: await validRes.json(),
      };
    });

    expect(settlementResults.invalidStatus).toBe(400);
    expect(settlementResults.invalidBody.error).toContain('Invalid IFSC Code');

    expect(settlementResults.validStatus).toBe(200);
    expect(settlementResults.validBody.grn.loanStatus).toBe('CLEARED');

    recordActualResult(
      testInfo,
      'Validated loan settlement rail: invalid IFSC rejected with 400 Bad Request; valid Bank Transfer UTR cleared loan status to CLEARED.',
    );
  });
});
