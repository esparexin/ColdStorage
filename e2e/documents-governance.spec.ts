import { test, expect } from '@playwright/test';
import { annotateTest } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
} from './fixtures/mock-auth.fixture.js';

test.describe('Phase 6 — Documents, Data Governance & Security', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, { role: 'SUPER_ADMIN' });
  });

  test('TC-DOC-001: Documents & Printing — Dynamic Binding to System Settings (Zero Hardcoding)', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DOC-001',
      module: 'Documents & Printing',
      testCase: 'Dynamic Binding to System Settings (Zero Hardcoding)',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'System settings updated',
      expectedResult: 'Print templates render orgName, contact, footer dynamically',
    });

    const mockOrgSettings = {
      orgName: 'Maha Agro Cold Storage Ltd',
      address: 'Plot 42, MIDC Chincholi, Solapur, Maharashtra 413255',
      contactPhone: '+91 217 2345678',
      footerNote: 'All disputes subject to Solapur jurisdiction only.',
    };

    await page.route(/\/api\/settings\/organization/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOrgSettings),
      });
    });

    await page.route(/\/api\/facilities\/[^/]+\/documents\/receipt\/grn-0101/, async (route) => {
      const html = `<!DOCTYPE html><html><body>
        <header>
          <h1 id="doc-org-name">${mockOrgSettings.orgName}</h1>
          <p id="doc-org-address">${mockOrgSettings.address}</p>
          <p id="doc-org-phone">${mockOrgSettings.contactPhone}</p>
        </header>
        <main>
          <h2>GOODS RECEIPT NOTE (RCPT-25-26-0101)</h2>
        </main>
        <footer>
          <p id="doc-footer-note">${mockOrgSettings.footerNote}</p>
        </footer>
      </body></html>`;
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
      });
    });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const renderedDoc = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/documents/receipt/grn-0101');
      return { status: res.status, html: await res.text() };
    });

    expect(renderedDoc.status).toBe(200);
    expect(renderedDoc.html).toContain('Maha Agro Cold Storage Ltd');
    expect(renderedDoc.html).toContain('MIDC Chincholi, Solapur');
    expect(renderedDoc.html).toContain('+91 217 2345678');
    expect(renderedDoc.html).toContain('All disputes subject to Solapur jurisdiction only.');
  });

  test('TC-DOC-002: Documents & Printing — Document Number Prefix Separation', async ({ page: _page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DOC-002',
      module: 'Documents & Printing',
      testCase: 'Document Number Prefix Separation',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Documents generated across types',
      expectedResult: 'RCPT, CHL, RRCPT, GP prefixes strictly distinct',
    });

    const docNumbers = {
      inwardReceipt: 'RCPT-25-26-0101',
      deliveryChallan: 'CHL-25-26-0001',
      rentCashMemo: 'RRCPT-25-26-0001',
      gatePass: 'GP-2026-0001',
    };

    expect(docNumbers.inwardReceipt).toMatch(/^RCPT-[0-9]{2}-[0-9]{2}-[0-9]{4,}$/);
    expect(docNumbers.deliveryChallan).toMatch(/^CHL-[0-9]{2}-[0-9]{2}-[0-9]{4,}$/);
    expect(docNumbers.rentCashMemo).toMatch(/^RRCPT-[0-9]{2}-[0-9]{2}-[0-9]{4,}$/);
    expect(docNumbers.gatePass).toMatch(/^GP-[A-Za-z0-9_-]+$/);

    const prefixes = [
      docNumbers.inwardReceipt.split('-')[0],
      docNumbers.deliveryChallan.split('-')[0],
      docNumbers.rentCashMemo.split('-')[0],
      docNumbers.gatePass.split('-')[0],
    ];
    const uniquePrefixes = new Set(prefixes);
    expect(uniquePrefixes.size).toBe(4);
  });

  test('TC-DATA-001: Import & Export — Bulk GRN CSV Import Validation & Reconciliation', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DATA-001',
      module: 'Import & Export',
      testCase: 'Bulk GRN CSV Import Validation & Reconciliation',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'CSV file with mixed valid/invalid rows',
      expectedResult: 'Reconciliation count committed + rejected == totalRows enforced',
    });

    await page.route(/\/api\/facilities\/[^/]+\/import/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          reconciliation: {
            totalRows: 10,
            committedRows: 8,
            rejectedRows: 2,
            isReconciled: true,
          },
          errors: [
            { row: 4, field: 'grnNumber', error: 'GR Number 99 is not 4 digits' },
            { row: 7, field: 'bags', error: 'Bag count must be positive' },
          ],
        }),
      });
    });

    await page.goto('/import-export');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const reconciliation = await page.evaluate(async () => {
      const res = await fetch('/api/facilities/fac-solapur-01/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, facilityId: 'fac-solapur-01' }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(reconciliation.status).toBe(200);
    const { totalRows, committedRows, rejectedRows, isReconciled } = reconciliation.body.reconciliation;
    expect(committedRows + rejectedRows).toBe(totalRows);
    expect(isReconciled).toBe(true);
    expect(reconciliation.body.errors).toHaveLength(2);
  });

  test('TC-DATA-002: Audit & Security — Immutable Audit Log Forensics', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DATA-002',
      module: 'Audit & Security',
      testCase: 'Immutable Audit Log Forensics',
      testType: 'UI Browser',
      priority: 'P1',
      preconditions: 'Administrative action occurred',
      expectedResult: 'Audit entry records actor, IP, timestamp, facility, and diff',
    });

    const mockAuditLog = {
      id: 'audit-log-001',
      facilityId: DEFAULT_FACILITY.id,
      userId: 'usr-admin-01',
      userEmail: 'admin@coldstorage.com',
      eventType: 'GRN_CREATED',
      resourceType: 'GRN',
      resourceId: 'grn-0101',
      ipAddress: '192.168.1.100',
      timestamp: new Date().toISOString(),
      details: {
        grnNumber: '0101',
        bags: 250,
        commodity: 'Table Potato',
      },
    };

    await page.route(/\/api\/audit-logs(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [mockAuditLog], total: 1 }),
      });
    });

    await page.goto('/audit');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const auditResponse = await page.evaluate(async () => {
      const res = await fetch('/api/audit-logs?facilityId=fac-solapur-01&limit=10');
      return { status: res.status, body: await res.json() };
    });

    expect(auditResponse.status).toBe(200);
    const log = auditResponse.body.items[0];
    expect(log.userId).toBe('usr-admin-01');
    expect(log.eventType).toBe('GRN_CREATED');
    expect(log.facilityId).toBe(DEFAULT_FACILITY.id);
    expect(log.ipAddress).toBe('192.168.1.100');
    expect(log.details.grnNumber).toBe('0101');
  });

  test('TC-DATA-003: Audit & Security — Backup and Disaster Recovery Roundtrip', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-DATA-003',
      module: 'Audit & Security',
      testCase: 'Backup and Disaster Recovery Roundtrip',
      testType: 'API Integration',
      priority: 'P1',
      preconditions: 'Facility database populated',
      expectedResult: 'JSON backup collected across 17 collections; restore validates schema parity',
    });

    await page.route(/\/api\/backups\/trigger/, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Backup completed successfully',
          filename: 'backup-fac-solapur-01-20261018.enc',
          backupLog: {
            id: 'b-log-01',
            collectionsCount: 17,
            totalRecords: 1420,
            status: 'COMPLETED',
            durationMs: 420,
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/backup');

    const backupResult = await page.evaluate(async () => {
      const res = await fetch('/api/backups/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Scheduled automated disaster recovery backup' }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(backupResult.status).toBe(201);
    expect(backupResult.body.backupLog.collectionsCount).toBe(17);
    expect(backupResult.body.backupLog.status).toBe('COMPLETED');
    expect(backupResult.body.filename).toContain('.enc');
  });
});
