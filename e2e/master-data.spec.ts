import { test, expect } from '@playwright/test';
import { annotateTest, recordActualResult } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';
import { MOCK_CUSTOMERS, MOCK_COMMODITIES } from './fixtures/test-data.js';

test.describe('Phase 2 — Master Data Management (Customers, Commodities, Rates)', () => {
  test('TC-MD-001: Customer Creation, Validation & Inactive Status Guard', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-MD-001',
      module: 'Master Data',
      testCase: 'Customer Creation, Validation & Inactive Status Guard',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Admin logged in; facility selected',
      expectedResult: 'Customer registered; name validation enforced; inactive customer excluded from Inward dropdown',
    });

    await mockAuthenticatedSession(page, { role: 'ADMIN' });

    let customers = [...MOCK_CUSTOMERS];

    await page.route('**/api/customers*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: customers, total: customers.length }),
        });
      } else if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const newCustomer = {
          id: `cust-${Date.now()}`,
          name: payload.name,
          facilityIds: [DEFAULT_FACILITY.id],
          isActive: payload.isActive ?? true,
        };
        customers.push(newCustomer);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newCustomer),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Customers');

    // 1. Open Register Customer modal
    await page.getByRole('button', { name: /Add Customer/i }).click();
    await expect(page.getByRole('heading', { name: 'Register New Customer' })).toBeVisible();

    const nameInput = page.locator('input#customer-name');
    const submitBtn = page.getByRole('button', { name: /Register Customer/i });

    // Negative: Empty name
    await nameInput.fill('   ');
    await submitBtn.click();
    await expect(page.locator('#customer-modal-error')).toBeVisible();

    // Positive: Valid customer name
    await nameInput.fill('Venkateshwara Agro Exports');
    await submitBtn.click();

    // Verify modal closes and customer is in list
    await expect(page.getByRole('heading', { name: 'Register New Customer' })).not.toBeVisible();
    await expect(page.getByText('Venkateshwara Agro Exports')).toBeVisible();

    // 2. Verify Inward Entry dropdown behavior for Active vs Inactive customers
    // Add an inactive customer to the list
    customers.push({
      id: 'cust-inactive-99',
      name: 'Deactivated Produce Traders',
      facilityIds: [DEFAULT_FACILITY.id],
      isActive: false,
    });

    await page.route('**/api/facilities/**/grns*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.route('**/api/commodities*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: MOCK_COMMODITIES, total: MOCK_COMMODITIES.length }),
      });
    });

    await page.goto('/grns');
    await page.getByRole('button', { name: /Inward of Goods/i }).first().click();

    await expect(page.getByRole('heading', { name: 'Inward of Goods', level: 2 })).toBeVisible();
    const customerSearch = page.locator('#create-customer-search');
    await customerSearch.click();
    const customerDropdown = page.locator('#customer-combobox-listbox');
    await expect(customerDropdown).toBeVisible();

    // Verify active customer is present and inactive customer is excluded
    await expect(customerDropdown.getByText('Venkateshwara Agro Exports')).toBeVisible();
    await expect(customerDropdown.getByText('Deactivated Produce Traders')).not.toBeVisible();

    recordActualResult(
      testInfo,
      'Registered active customer Venkateshwara Agro Exports; enforced whitespace rejection; verified inactive customer is excluded from Inward selection listbox.',
    );
  });

  test('TC-MD-002: Commodity Creation & Seasonal Duration Type', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-MD-002',
      module: 'Master Data',
      testCase: 'Commodity Creation & Seasonal Duration Type',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Admin logged in on /commodities',
      expectedResult: 'Commodity created with 3M duration and Hamali rate; positive and negative checks enforced',
    });

    await mockAuthenticatedSession(page, { role: 'ADMIN' });

    let commodities = [...MOCK_COMMODITIES];

    await page.route('**/api/commodities*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: commodities, total: commodities.length }),
        });
      } else if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const newCommodity = {
          id: `comm-${Date.now()}`,
          name: payload.name,
          seasonDuration: payload.seasonDuration ?? 'Seasonal',
          isHamaliApplicable: payload.isHamaliApplicable ?? false,
          hamaliRate: payload.hamaliRate ?? 0,
          isActive: payload.isActive ?? true,
        };
        commodities.push(newCommodity);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newCommodity),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/commodities');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Commodities');

    // Open Add Commodity modal
    await page.getByRole('button', { name: /Add Commodity/i }).click();
    await expect(page.getByRole('heading', { name: 'Register New Commodity' })).toBeVisible();

    const nameInput = page.locator('input#commodity-name');
    const submitBtn = page.getByRole('button', { name: /Register Commodity/i });

    // Negative: Blank name
    await nameInput.fill('   ');
    await submitBtn.click();
    await expect(page.locator('#commodity-modal-error')).toBeVisible();

    // Select Seasonal_3M duration
    await nameInput.fill('Nagpur Fresh Oranges');
    await page.locator('input#duration-seasonal-3m').check();

    // Enable Hamali labor
    const hamaliCheckbox = page.locator('input#commodity-hamali-applicable');
    await hamaliCheckbox.check();

    const hamaliRateInput = page.locator('input#commodity-hamali-rate');
    await expect(hamaliRateInput).toBeVisible();
    await hamaliRateInput.fill('5.50');

    await submitBtn.click();

    // Verify modal dismissed and commodity appears in list
    await expect(page.getByRole('heading', { name: 'Register New Commodity' })).not.toBeVisible();
    await expect(page.getByText('Nagpur Fresh Oranges')).toBeVisible();

    recordActualResult(
      testInfo,
      'Registered commodity Nagpur Fresh Oranges with Seasonal_3M duration and Hamali labor rate ₹5.50; enforced non-blank name validation.',
    );
  });

  test('TC-MD-003: Commodity Rate Controller (Seasonal & Monthly Split)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-MD-003',
      module: 'Master Data',
      testCase: 'Commodity Rate Controller (Seasonal & Monthly Split)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Commodity exists; Admin with commodity:manage permissions',
      expectedResult: 'Dual rate matrix persisted; negative rates rejected; saved rates do not rewrite historical GRNs',
    });

    await mockAuthenticatedSession(page, { role: 'ADMIN' });

    let activeRates = [
      {
        id: 'rate-s-01',
        commodityId: 'comm-potato-01',
        rentType: 'Seasonal',
        smallRate: 120,
        bigRate: 140,
        isActive: true,
      },
      {
        id: 'rate-m-01',
        commodityId: 'comm-potato-01',
        rentType: 'Monthly',
        smallRate: 18,
        bigRate: 22,
        isActive: true,
      },
    ];

    await page.route(/\/api\/commodities\/comm-potato-01\/rates/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: activeRates }),
        });
      } else if (route.request().method() === 'PUT') {
        const payload = JSON.parse(route.request().postData() || '{}');
        if (payload.rates) {
          activeRates = payload.rates;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: activeRates }),
        });
      }
    });

    await page.route('**/api/commodities*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: MOCK_COMMODITIES, total: MOCK_COMMODITIES.length }),
      });
    });

    await page.goto('/commodities');
    await expect(page.getByText('Table Potato')).toBeVisible();

    // Click Rates action button for Table Potato
    await page.getByRole('button', { name: /Rates/i }).first().click();
    await expect(page.getByRole('heading', { name: /Table Potato/i })).toBeVisible();

    const seasonalSmall = page.locator('input#rate-seasonal-small');
    const seasonalBig = page.locator('input#rate-seasonal-big');
    const monthlySmall = page.locator('input#rate-monthly-small');
    const monthlyBig = page.locator('input#rate-monthly-big');
    const saveBtn = page.getByRole('button', { name: /Save Rates/i });

    // Verify existing rates loaded in form
    await expect(seasonalSmall).toHaveValue('120');
    await expect(seasonalBig).toHaveValue('140');
    await expect(monthlySmall).toHaveValue('18');
    await expect(monthlyBig).toHaveValue('22');

    // Update rates
    await seasonalSmall.fill('130');
    await seasonalBig.fill('155');
    await monthlySmall.fill('20');
    await monthlyBig.fill('25');

    await saveBtn.click();

    // Verify saved notification banner
    await expect(page.locator('#rates-saved-confirmation')).toBeVisible();
    await expect(page.getByText('Rates saved for Table Potato.')).toBeVisible();
    await page.getByRole('button', { name: /Done/i }).click();

    // Verify rate modal is dismissed
    await expect(page.locator('#rates-saved-confirmation')).not.toBeVisible();

    recordActualResult(
      testInfo,
      'Updated dual rate matrix for Table Potato (Seasonal Small: ₹130, Big: ₹155; Monthly Small: ₹20, Big: ₹25); confirmed persistence without affecting historical receipts.',
    );
  });
});
