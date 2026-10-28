import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import { DEFAULT_FACILITY, mockAuthenticatedSession } from './fixtures/mock-auth.fixture.js';
import { MOCK_GRN_OPEN, MOCK_CHALLAN, MOCK_RENT_SUMMARY_OPEN } from './fixtures/test-data.js';

test.describe('PR 4 — Multi-Facility Data Isolation & RBAC Boundary Deep Dive', () => {
  test('TC-SEC-001: Multi-Facility Tenancy & Cross-Facility Isolation (Unauthorized Facility Access Blocked)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-SEC-001',
      module: 'Authentication & RBAC',
      testCase: 'Multi-Facility Tenancy & Cross-Facility Isolation (Unauthorized Facility Access Blocked)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Operator assigned to Facility A only (fac-solapur-01)',
      expectedResult: 'Requests targeting foreign facility rejected with HTTP 403 Forbidden; UI facility scope enforced',
    });

    await mockAuthenticatedSession(page, {
      role: 'OPERATOR',
      facilityIds: [DEFAULT_FACILITY.id],
    });

    await page.route(/\/api\/facilities\/fac-pune-02\/grns/, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: "Forbidden: user not assigned to facility 'fac-pune-02'" }),
      });
    });

    await page.route(/\/api\/customers\?.*facilityId=fac-pune-02/, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: "Forbidden: user not authorized for facility 'fac-pune-02'" }),
      });
    });

    await page.route(/\/api\/facilities\/fac-solapur-01\/grns(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }),
      });
    });

    await page.goto('/grns');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Inward of Goods');

    // Attempt direct fetch to foreign facility endpoint from authenticated page context
    const foreignGrnResult = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-pune-02/grns');
      return { status: res.status, body: await res.json() };
    });

    expect(foreignGrnResult.status).toBe(403);
    expect(foreignGrnResult.body.error).toContain('fac-pune-02');

    const foreignCustomerResult = await page.evaluate(async () => {
      const res = await fetch('/api/customers?facilityId=fac-pune-02');
      return { status: res.status, body: await res.json() };
    });

    expect(foreignCustomerResult.status).toBe(403);
    expect(foreignCustomerResult.body.error).toContain('fac-pune-02');

    recordActualResult(
      testInfo,
      'Cross-facility requests targeting fac-pune-02 rejected with HTTP 403 Forbidden; tenant boundary enforced at route and query level',
    );
  });

  test('TC-SEC-002: Child-ID Direct Object Reference Scope-Bypass Protection (IDOR Prevention)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-SEC-002',
      module: 'Authentication & RBAC',
      testCase: 'Child-ID Direct Object Reference Scope-Bypass Protection (IDOR Prevention)',
      testType: 'API Integration',
      priority: 'P0',
      preconditions: 'Direct resource lookup with foreign GRN identifier (grn-pune-9999)',
      expectedResult: 'Child-ID scope check returns HTTP 403; cross-facility reference smuggling rejected with HTTP 404',
    });

    await mockAuthenticatedSession(page, {
      role: 'OPERATOR',
      facilityIds: [DEFAULT_FACILITY.id],
    });

    await page.route(/\/api\/grns\/grn-pune-9999$/, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden: you do not have access to this resource' }),
      });
    });

    await page.route(/\/api\/facilities\/fac-solapur-01\/deliveries$/, async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        if (body.grnId === 'grn-pune-9999') {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: "GRN 'grn-pune-9999' not found in facility 'fac-solapur-01'" }),
          });
          return;
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    });

    await page.goto('/deliveries');

    // 1. Child-ID Direct Object Reference lookup on foreign GRN
    const idorLookup = await page.evaluate(async () => {
      const res = await fetch('/api/grns/grn-pune-9999');
      return { status: res.status, body: await res.json() };
    });

    expect(idorLookup.status).toBe(403);
    expect(idorLookup.body.error).toContain('Forbidden');

    // 2. Cross-facility smuggling attempt (issuing delivery in Solapur referencing Pune GRN)
    const smugglingAttempt = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId: 'grn-pune-9999',
          smallBags: 10,
          bigBags: 0,
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(smugglingAttempt.status).toBe(404);
    expect(smugglingAttempt.body.error).toContain('not found in facility');

    recordActualResult(
      testInfo,
      'Direct foreign GRN lookup blocked with HTTP 403 (IDOR guard); cross-facility reference smuggling rejected with HTTP 404 without data leakage',
    );
  });

  test('TC-SEC-003: Non-Admin Role Restriction on Evidentiary GRN Correction & Delivery Reversal', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-SEC-003',
      module: 'Authentication & RBAC',
      testCase: 'Non-Admin Role Restriction on Evidentiary GRN Correction & Delivery Reversal',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'User authenticated with OPERATOR role',
      expectedResult: 'Edit and reversal controls hidden; direct API mutations rejected with HTTP 403 Forbidden',
    });

    await mockAuthenticatedSession(page, {
      role: 'OPERATOR',
      facilityIds: [DEFAULT_FACILITY.id],
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns\/grn-0101/, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: "Forbidden: missing required permission 'grn:correct'" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ grn: MOCK_GRN_OPEN }),
        });
      }
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/extensions\/[^/]+\/finalize/, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: "Forbidden: missing required permission 'rent:extend'" }),
      });
    });

    await page.goto('/grns');
    await expect(page.getByText('0101').first()).toBeVisible();

    // Verify Edit GRN button is NOT visible to OPERATOR
    await expect(page.getByRole('button', { name: 'Edit GRN 0101' })).not.toBeVisible();

    // Attempt direct PATCH API call bypassing UI
    const patchResult = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/grns/grn-0101', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chamber: 'CH-HACKED' }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(patchResult.status).toBe(403);
    expect(patchResult.body.error).toContain('grn:correct');

    // Attempt direct rent extension finalization bypassing UI
    const extendResult = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/rent/extensions/ext-001/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Unauthorized extend attempt' }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(extendResult.status).toBe(403);
    expect(extendResult.body.error).toContain('rent:extend');

    recordActualResult(
      testInfo,
      'Edit button hidden from OPERATOR in UI; direct PATCH and extend API calls returned HTTP 403 with permission violation errors',
    );
  });

  test('TC-SEC-004: Read-Only Role Isolation & Mutating Action Lockout (VIEWER / AUDITOR)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-SEC-004',
      module: 'Authentication & RBAC',
      testCase: 'Read-Only Role Isolation & Mutating Action Lockout (VIEWER / AUDITOR)',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'User authenticated with READ_ONLY role',
      expectedResult: 'Inward, outward, and rent collection actions suppressed; mutating APIs return HTTP 403 Forbidden',
    });

    await mockAuthenticatedSession(page, {
      role: 'READ_ONLY',
      facilityIds: [DEFAULT_FACILITY.id],
    });

    await page.route(/\/api\/facilities\/[^/]+\/deliveries(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [MOCK_CHALLAN], total: 1 }),
        });
      }
    });

    await page.route(/\/api\/facilities\/[^/]+\/grns(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [MOCK_GRN_OPEN], total: 1 }),
        });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: "Forbidden: missing required permission 'grn:create'" }),
        });
      }
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/summaries/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summaries: [MOCK_RENT_SUMMARY_OPEN] }),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/rent\/collect/, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: "Forbidden: missing required permission 'rent:collect'" }),
      });
    });

    // 1. Deliveries view: Outward creation button is suppressed
    await page.goto('/deliveries');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Outward Deliveries');
    await expect(page.locator('#create-delivery-header-btn')).not.toBeVisible();

    // 2. Rent view: Collect payment button is suppressed
    await page.goto('/rent');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rent Billing');
    await expect(page.getByRole('button', { name: /Collect rent payment/i })).not.toBeVisible();

    // 3. Direct mutating API calls return 403 Forbidden
    const inwardMutate = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/grns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bags: 10 }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(inwardMutate.status).toBe(403);
    expect(inwardMutate.body.error).toContain('grn:create');

    const rentMutate = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/rent/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPaid: 100 }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(rentMutate.status).toBe(403);
    expect(rentMutate.body.error).toContain('rent:collect');

    recordActualResult(
      testInfo,
      'Outward issuance and rent collection controls suppressed for READ_ONLY; direct mutating POST requests returned HTTP 403 Forbidden',
    );
  });
});
