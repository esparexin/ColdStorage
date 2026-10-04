import { test, expect } from '@playwright/test';

const mockUser = { userId:'u', username:'s', fullName:'A', role:'SUPER_ADMIN',
  mustChangePassword:false, facilityIds:['fac-alpha'] };

async function base(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/refresh', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'t',user:mockUser})}));
  await page.route('**/api/settings', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({isConfigured:true,settings:{orgName:'A',timezone:'Asia/Kolkata',backupPolicy:{retentionDays:30,backupEnabled:true}}})}));
  await page.route('**/api/facilities', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{id:'fac-alpha',name:'Alpha',code:'A',isActive:true}],total:1})}));
}

test('client-side list pages and shows a compact range', async ({ page }) => {
  await base(page);
  await page.route('**/api/customers*', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    items: Array.from({length:45},(_,i)=>({id:`c${i}`,name:`Customer ${i}`,isActive:true,facilityIds:['fac-alpha']})),
    total: 45 })}));
  await page.goto('/customers');
  const nav = page.getByRole('navigation', { name: 'Pagination' });
  await expect(nav).toBeVisible();
  await expect(nav).toContainText('Showing 1–20 of 45');
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(nav).toContainText('Showing 21–40 of 45');
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeEnabled();
});

test('server-paginated audit log requests the next page and reaches rows past 100', async ({ page }) => {
  await base(page);
  const urls: string[] = [];
  await page.route('**/api/audit-logs*', r => {
    const u = new URL(r.request().url());
    urls.push(u.search);
    const pageNum = Number(u.searchParams.get('page') ?? '1');
    return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      logs: Array.from({length:50},(_,i)=>({
        id:`l${pageNum}-${i}`, timestamp:new Date().toISOString(), eventType:'GRN_CREATED',
        severity:'INFO', facilityId:'fac-alpha', userId:'u', username:'s', userRole:'SUPER_ADMIN',
        ipAddress:'127.0.0.1', userAgent:'e2e', resource:'grn', resourceId:'x', details:{} })),
      totalCount: 260, page: pageNum, limit: 50, totalPages: 6 })});
  });
  await page.goto('/audit');
  const nav = page.getByRole('navigation', { name: 'Pagination' });
  await expect(nav).toBeVisible();
  await expect(nav).toContainText('Showing 1–50 of 260');
  expect(urls[0]).toContain('page=1');
  expect(urls[0]).not.toContain('limit=100');

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(nav).toContainText('Showing 51–100 of 260');
  expect(urls.some(u => u.includes('page=2'))).toBe(true);

  // jump to the last page: proves records beyond the old 100-row cap are reachable
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next page' }).click();
  await expect(nav).toContainText('Showing 251–260 of 260');
  expect(urls.some(u => u.includes('page=6'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('filter change resets to page 1', async ({ page }) => {
  await base(page);
  const urls: string[] = [];
  await page.route('**/api/audit-logs*', r => {
    const u = new URL(r.request().url());
    urls.push(u.search);
    return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      logs: Array.from({length:50},(_,i)=>({ id:`l${i}`, timestamp:new Date().toISOString(),
        eventType:'GRN_CREATED', severity:'INFO', facilityId:'fac-alpha', userId:'u', username:'s',
        userRole:'SUPER_ADMIN', ipAddress:'127.0.0.1', userAgent:'e2e', resource:'grn', resourceId:'x', details:{} })),
      totalCount: 260, page:1, limit:50, totalPages:6 })});
  });
  await page.goto('/audit');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('navigation', { name:'Pagination' })).toContainText('Showing 51–100 of 260');
  await page.getByLabel('Filter by Severity').selectOption('WARN');
  await expect(page.getByRole('navigation', { name:'Pagination' })).toContainText('Showing 1–50 of 260');
  expect(urls.some(u => u.includes('page=1') && u.includes('severity=WARN'))).toBe(true);
});

test.describe('request batching', () => {
  test('rent loads the facility in one request, not one per GRN', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', r => { if (r.url().includes('/api/')) urls.push(r.url()); });

    await base(page);
    await page.route('**/api/facilities/*/rent/summaries', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ summaries: Array.from({ length: 45 }, (_, i) => ({
        grnId: `g${i}`, grnNumber: `GRN-${i}`, facilityId: 'fac-alpha',
        customerId: 'c1', customerName: `Cust ${i}`, commodityName: 'Wheat',
        chamber: 'A1', inwardDate: new Date().toISOString(), totalBags: 100,
        rentType: 'Monthly', rentAmount: 1000, rentMonths: 1,
        totalPaid: i % 2 ? 1000 : 0, remainingBalance: i % 2 ? 0 : 1000,
        paymentStatus: i % 2 ? 'Settled' : 'Not Settled', payments: [],
      })) }) }));
    // A per-GRN call would regress the fix, so fail loudly instead of silently.
    await page.route('**/api/facilities/*/rent/grn/*', r => r.fulfill({
      status: 500, contentType: 'application/json',
      body: JSON.stringify({ error: 'per-GRN endpoint must not back the rent list' }) }));

    await page.goto('/rent');
    await page.waitForTimeout(1200);

    const rentCalls = urls.filter(u => u.includes('/rent/'));
    expect(rentCalls, `rent endpoints called: ${JSON.stringify(rentCalls)}`)
      .toEqual([expect.stringContaining('/rent/summaries')]);
    await expect(page.getByRole('navigation', { name: 'Pagination' }))
      .toContainText('Showing 1\u201320 of 45');
  });
});
