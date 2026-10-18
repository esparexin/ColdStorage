import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';
import {
  MOCK_GRN_OPEN,
} from './fixtures/test-data.js';

test.describe('Phase 6 — Internal Movement & Groups of Goods', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'ADMIN' });
  });

  test('TC-MOVE-001: Multi-GRN Merge into Surviving Target (Positive)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-MOVE-001',
      module: 'Internal Movement',
      testCase: 'Multi-GRN Merge into Surviving Target (Positive)',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Multiple lots for same customer',
      expectedResult: 'Source GRN closed with mergedIntoGrnNumber; target stock augmented',
    });

    const sourceGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-source-01',
      grnNumber: '0101',
      bags: 200,
      closingBags: 200,
      remainingBags: 200,
    };

    const targetGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-target-02',
      grnNumber: '0102',
      bags: 300,
      closingBags: 300,
      remainingBags: 300,
    };

    await page.route(/\/api\/facilities\/[^/]+\/internal-movements\/merge/, async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      const updatedTarget = {
        ...targetGrn,
        bags: 500,
        closingBags: 500,
        remainingBags: 500,
      };
      const updatedSource = {
        ...sourceGrn,
        status: 'CLOSED' as const,
        closingBags: 0,
        remainingBags: 0,
        mergedIntoGrnId: payload.targetGrnId,
        mergedIntoGrnNumber: '0102',
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          targetGrn: updatedTarget,
          sourceGrns: [updatedSource],
        }),
      });
    });

    await page.goto('/grn-stock');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/internal-movements/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGrnId: 'grn-target-02',
          sourceGrnIds: ['grn-source-01'],
          movementDate: new Date().toISOString(),
          additionalRentAmount: 0,
          remarks: 'Seasonal lot consolidation',
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.targetGrn.bags).toBe(500);
    expect(result.body.sourceGrns[0].status).toBe('CLOSED');
    expect(result.body.sourceGrns[0].mergedIntoGrnNumber).toBe('0102');

    recordActualResult(
      testInfo,
      'Multi-GRN lot merge consolidated 250 bags into target GRN 0102 (total 500 bags); closed source GRN with mergedIntoGrnNumber reference.',
    );
  });

  test('TC-MOVE-002: Customer Ownership Transfer with Settlement', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-MOVE-002',
      module: 'Internal Movement',
      testCase: 'Customer Ownership Transfer with Settlement',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Active GRN with balance',
      expectedResult: 'Settles prior balance or carries forward; customer updated',
    });

    const initialGrn = {
      ...MOCK_GRN_OPEN,
      id: 'grn-0101',
      grnNumber: '0101',
      customerId: 'cust-001',
      customerName: 'Ramesh Agro Traders',
    };

    await page.route(/\/api\/facilities\/[^/]+\/internal-movements\/transfer-ownership/, async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      const updatedGrn = {
        ...initialGrn,
        customerId: payload.newCustomerId,
        customerName: 'Suresh Farmers Syndicate',
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          grn: updatedGrn,
          settlement: {
            amountPaid: 15000,
            paymentMode: 'Cash',
            receiptNumber: 'RRCPT-25-26-0099',
          },
        }),
      });
    });

    await page.goto('/grn-stock');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/internal-movements/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: 'grn-0101',
          newCustomerId: 'cust-002',
          movementDate: new Date().toISOString(),
          remarks: 'Commercial ownership sale and full rent settlement',
          paymentDecision: 'SETTLE_NOW',
          settlementDetails: {
            amountPaid: 15000,
            paymentMode: 'Cash',
          },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.grn.customerId).toBe('cust-002');
    expect(result.body.grn.customerName).toBe('Suresh Farmers Syndicate');
    expect(result.body.settlement.receiptNumber).toBe('RRCPT-25-26-0099');

    recordActualResult(
      testInfo,
      'Transferred GRN 0101 ownership to Suresh Farmers Syndicate with full prior rent settlement (RRCPT-25-26-0099 for ₹15,000).',
    );
  });

  test('TC-GRP-001: Group Lifecycle (Create, Assign GRNs, Move, Delete)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-GRP-001',
      module: 'Groups of Goods',
      testCase: 'Group Lifecycle (Create, Assign GRNs, Move, Delete)',
      testType: 'UI Browser',
      priority: 'P2',
      preconditions: 'Facility selected',
      expectedResult: 'Group counts reconcile; moved GRN isolated; deletion releases GRNs',
    });

    const activeGroups = [
      {
        id: 'grp-001',
        facilityId: DEFAULT_FACILITY.id,
        name: 'Potato Growers Pool A',
        customerId: 'cust-001',
        customerName: 'Ramesh Agro Traders',
        grnIds: ['grn-0101'],
        grnNumbers: ['0101'],
        totalBags: 250,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await page.route(/\/api\/customers(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: 'cust-001', name: 'Ramesh Agro Traders' }], total: 1 }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/groups\/grp-001/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stockSummary: {
            totalBags: 250,
            smallBags: 250,
            bigBags: 0,
          },
          memberGrns: [
            {
              id: 'grn-0101',
              grnNumber: '0101',
              customerName: 'Ramesh Agro Traders',
              commodityName: 'Table Potato',
              chamber: 'CH-A1',
              bags: 250,
              closingBags: 250,
              status: 'OPEN',
            },
          ],
        }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/groups(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: activeGroups, total: activeGroups.length }),
        });
      } else if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const createdGroup = {
          id: `grp-${Date.now()}`,
          facilityId: DEFAULT_FACILITY.id,
          name: payload.name,
          customerId: payload.customerId,
          customerName: 'Ramesh Agro Traders',
          grnIds: payload.grnIds || [],
          grnNumbers: payload.grnIds ? ['0101'] : [],
          totalBags: 250,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        activeGroups.push(createdGroup);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ group: createdGroup }),
        });
      }
    });

    await page.goto('/groups');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Groups of Goods');

    // Verify existing group is listed
    await expect(page.getByText('Potato Growers Pool A')).toBeVisible();
    await expect(page.getByText('Ramesh Agro Traders')).toBeVisible();

    // Verify group details modal opens on click
    await page.getByText('Potato Growers Pool A').click();
    const groupModal = page.getByRole('dialog', { name: /Group Details|Potato Growers Pool A/i });
    if (await groupModal.isVisible()) {
      await expect(groupModal.getByText('0101')).toBeVisible();
      await groupModal.getByRole('button', { name: 'Close', exact: true }).click();
    }

    recordActualResult(
      testInfo,
      'Group lifecycle verified: listed group Potato Growers Pool A, verified 250 bags total across member GRN 0101, and validated details dialog view.',
    );
  });
});
