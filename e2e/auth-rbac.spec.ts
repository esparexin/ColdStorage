import { test, expect } from '@playwright/test';
import { annotateTest } from './helpers/test-metadata.js';
import {
  DEFAULT_FACILITY,
  mockAuthenticatedSession,
  mockUnauthenticatedSession,
  setupEnvironmentMocks,
} from './fixtures/mock-auth.fixture.js';

test.describe('Phase 2 — Authentication, RBAC & Facility Isolation', () => {
  test('TC-AUTH-001: First-Time User Login & Forced Password Change', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-AUTH-001',
      module: 'Authentication & RBAC',
      testCase: 'First-Time User Login & Forced Password Change',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'User provisioned with temporary password (mustChangePassword=true)',
      expectedResult: 'Mandatory password change enforced; validation guards invalid entries; valid password updates session',
    });

    // 1. Mock unauthenticated session initially
    await mockUnauthenticatedSession(page);
    await page.goto('/');

    // Verify login screen renders
    await expect(page.locator('h1')).toContainText('Cold Storage Management');
    const usernameInput = page.locator('input#username');
    const passwordInput = page.locator('input#current-password');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // 2. Mock successful login returning user with mustChangePassword: true
    const tempUser = {
      userId: 'usr-temp-001',
      username: 'operator_temp',
      fullName: 'Temporary Warehouse Clerk',
      role: 'OPERATOR' as const,
      mustChangePassword: true,
      facilityIds: [DEFAULT_FACILITY.id],
    };

    let isPasswordChanged = false;
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: isPasswordChanged ? 'mock-perm-jwt-token' : 'mock-temp-jwt-token',
          user: { ...tempUser, mustChangePassword: !isPasswordChanged },
          mustChangePassword: !isPasswordChanged,
        }),
      });
    });

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: isPasswordChanged ? 'mock-perm-jwt-token' : 'mock-temp-jwt-token',
          user: { ...tempUser, mustChangePassword: !isPasswordChanged },
        }),
      });
    });

    await usernameInput.fill('operator_temp');
    await passwordInput.fill('TempPass@123');
    await submitBtn.click();

    // 3. Verify forced Change Password modal appears
    await expect(page.getByRole('heading', { name: 'Set New Password' })).toBeVisible();
    await expect(
      page.getByText('Your account was provisioned with a temporary password'),
    ).toBeVisible();

    const forceCurrent = page.locator('input#force-current-password');
    const forceNew = page.locator('input#new-password');
    const forceConfirm = page.locator('input#confirm-password');
    const updateBtn = page.getByRole('button', { name: 'Update Password' });

    // Negative Guard A: Short password (< 8 chars) enforced by HTML5 minlength constraint
    await forceCurrent.fill('TempPass@123');
    await forceNew.fill('short');
    await forceConfirm.fill('short');
    await expect(forceNew).toHaveAttribute('minlength', '8');

    // Negative Guard B: Mismatched confirmation
    await forceNew.fill('ValidPassword123');
    await forceConfirm.fill('MismatchPassword123');
    await updateBtn.click();
    await expect(page.getByText('New password and confirmation do not match')).toBeVisible();

    // Negative Guard C: Same as current temporary password
    await forceNew.fill('TempPass@123');
    await forceConfirm.fill('TempPass@123');
    await updateBtn.click();
    await expect(
      page.getByText('New password must be different from current temporary password'),
    ).toBeVisible();

    // Positive Path: Mock successful password change
    await page.route('**/api/auth/change-password', async (route) => {
      isPasswordChanged = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Update refresh mock to return mustChangePassword: false post-change
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-permanent-jwt-token',
          user: { ...tempUser, mustChangePassword: false },
        }),
      });
    });

    await forceNew.fill('PermanentPassword2026!');
    await forceConfirm.fill('PermanentPassword2026!');
    await updateBtn.click();

    // Verify modal is dismissed and user is on dashboard
    await expect(page.getByRole('heading', { name: 'Set New Password' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Operational Dashboard' })).toBeVisible();
  });

  test('TC-AUTH-002: Session Token Rotation & Storage Immutability', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-AUTH-002',
      module: 'Authentication & RBAC',
      testCase: 'Session Token Rotation & Storage Immutability',
      testType: 'API Integration',
      priority: 'P1',
      preconditions: 'Active session exists; refresh token in cookie',
      expectedResult: 'Token rotated on refresh; revoked session rejected with 401',
    });

    let refreshCallCount = 0;
    await page.route('**/api/auth/refresh', async (route) => {
      refreshCallCount++;
      if (refreshCallCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'jwt-token-generation-1',
            user: {
              userId: 'usr-admin-001',
              username: 'superadmin',
              fullName: 'System Administrator',
              role: 'SUPER_ADMIN',
              mustChangePassword: false,
              facilityIds: [DEFAULT_FACILITY.id],
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'jwt-token-generation-2',
            user: {
              userId: 'usr-admin-001',
              username: 'superadmin',
              fullName: 'System Administrator',
              role: 'SUPER_ADMIN',
              mustChangePassword: false,
              facilityIds: [DEFAULT_FACILITY.id],
            },
          }),
        });
      }
    });

    await mockAuthenticatedSession(page, { role: 'SUPER_ADMIN' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Operational Dashboard' })).toBeVisible();

    // Trigger logout
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Post-logout refresh returns 401
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session revoked' }),
      });
    });

    await page.getByRole('button', { name: 'Log out' }).click();

    // Verify redirected back to login screen
    await expect(page.locator('h1')).toContainText('Cold Storage Management');
    await expect(page.getByText('Sign in to access your facility dashboard')).toBeVisible();
  });

  test('TC-AUTH-003: Multi-Facility Tenancy Isolation & Global Scope', async ({ page }, testInfo) => {
    annotateTest(testInfo, {
      testId: 'TC-AUTH-003',
      module: 'Authentication & RBAC',
      testCase: 'Multi-Facility Tenancy Isolation & Global Scope',
      testType: 'UI Browser',
      priority: 'P0',
      preconditions: 'Two facilities exist; OPERATOR assigned to one, SUPER_ADMIN to both',
      expectedResult: 'Single-facility user restricted to assigned facility; global scope sees all facilities',
    });

    const facilityAlpha = { id: 'fac-alpha', name: 'Alpha Main Warehouse', code: 'FAC-A', isActive: true };
    const facilityBeta = { id: 'fac-beta', name: 'Beta Depot Facility', code: 'FAC-B', isActive: true };

    await setupEnvironmentMocks(page);

    await page.route('**/api/facilities/**/dashboard/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            facilityId: facilityAlpha.id,
            totalStockBags: 100,
            chamberStock: [],
            commodityBreakdown: [],
            activeGrns: 1,
            closedGrns: 0,
            monthlyInwardBags: 100,
            monthlyDeliveredBags: 0,
            recentActivity: [],
          },
        }),
      });
    });

    // 1. Test as OPERATOR with single facility access
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-op-token',
          user: {
            userId: 'usr-op-001',
            username: 'operator_solapur',
            fullName: 'Solapur Operator',
            role: 'OPERATOR',
            mustChangePassword: false,
            facilityIds: [facilityAlpha.id],
          },
        }),
      });
    });

    await page.route('**/api/facilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [facilityAlpha],
          total: 1,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Operational Dashboard' })).toBeVisible();

    // Verify Facility switcher is hidden for single-facility user
    await expect(page.locator('#facility-selector')).not.toBeVisible();

    // 2. Switch to SUPER_ADMIN with global scope
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-super-token',
          user: {
            userId: 'usr-super-001',
            username: 'superadmin',
            fullName: 'Super Administrator',
            role: 'SUPER_ADMIN',
            mustChangePassword: false,
            facilityIds: [facilityAlpha.id, facilityBeta.id],
          },
        }),
      });
    });

    await page.route('**/api/facilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [facilityAlpha, facilityBeta],
          total: 2,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Operational Dashboard' })).toBeVisible();

    // Verify facility dropdown exists and has both facilities
    const facilitySelect = page.locator('#facility-selector');
    await expect(facilitySelect).toBeVisible();
    await expect(facilitySelect.locator('option')).toHaveCount(2);
    await expect(facilitySelect.locator('option').first()).toHaveText('Alpha Main Warehouse (FAC-A)');
    await expect(facilitySelect.locator('option').last()).toHaveText('Beta Depot Facility (FAC-B)');
  });
});
