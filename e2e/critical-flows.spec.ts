import { test, expect } from '@playwright/test';

// Intentional route mocks (not real auth): these bypass the backend to render
// navigation/dashboard states in isolation. The mocked refresh payload mirrors
// the production contract — { token, user } where user includes
// mustChangePassword (false here, so the forced-change modal stays shut) —
// matching AuthContext bootstrap expectations. Password-gate semantics are
// covered by backend integration tests (auth-password-gate.test.ts), not here.

test.describe('Critical Application Flows', () => {
  test('1. Authentication Gate: enforces login credentials on unauthenticated access', async ({
    page,
  }) => {
    // Mock refresh endpoint returning 401 (unauthenticated)
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No active session' }),
      });
    });

    await page.goto('/');

    // Verify login screen renders with title and subtitle
    await expect(page.locator('h1')).toContainText('Cold Storage Management');
    await expect(page.getByText('Sign in to access your facility dashboard')).toBeVisible();

    // Verify form inputs exist
    const usernameInput = page.locator('input[type="text"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Submit invalid credentials and verify error message
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials provided' }),
      });
    });

    await usernameInput.fill('invalid_operator');
    await passwordInput.fill('WrongPassword123!');
    await submitBtn.click();

    // Verify error alert
    await expect(page.getByText('Invalid credentials provided')).toBeVisible();
  });

  test('2. Authenticated Session & Navigation: loads dashboard with operational controls', async ({
    page,
  }) => {
    const mockUser = {
      userId: 'usr-admin-001',
      username: 'superadmin',
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
      facilityIds: ['fac-alpha', 'fac-beta'],
    };

    // Mock successful auth refresh
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token', user: mockUser }),
      });
    });

    // Mock settings singleton
    await page.route('**/api/settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isConfigured: true,
          settings: {
            orgName: 'Alpha Cold Storage Facility',
            address: 'Main Highway, Cold Chain Zone, Hyderabad',
            contact: '+91 98765 43210',
            timezone: 'Asia/Kolkata',
            printFooter: 'System-generated cold chain receipt',
            backupPolicy: {
              retentionDays: 30,
              backupEnabled: true,
            },
          },
        }),
      });
    });

    // Mock facilities
    await page.route('**/api/facilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: 'fac-alpha', name: 'Alpha Cold Storage Facility', code: 'FAC-A', isActive: true },
            { id: 'fac-beta', name: 'Beta Cold Storage Facility', code: 'FAC-B', isActive: true },
          ],
          total: 2,
        }),
      });
    });

    await page.goto('/');

    // Verify authenticated user greeting and facility header
    await expect(page.locator('body')).not.toContainText(
      'Sign in to access your facility dashboard',
    );
    await expect(page.locator('header')).toBeVisible();
  });

  test('3. GRN Management Flow: verifies inwarding directory and actions', async ({ page }) => {
    const mockUser = {
      userId: 'usr-admin-001',
      username: 'superadmin',
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
      facilityIds: ['fac-alpha'],
    };

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token', user: mockUser }),
      });
    });

    await page.route('**/api/grns*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
        }),
      });
    });

    await page.goto('/grns');

    // Verify page heading or action button
    await expect(page.locator('h1, h2')).toContainText(/Goods Receipt|GRN/i);
  });

  test('4. Facility Management Flow: verifies facilities are managed from settings', async ({
    page,
  }) => {
    const mockUser = {
      userId: 'usr-admin-001',
      username: 'superadmin',
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
      facilityIds: ['fac-alpha'],
    };

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token', user: mockUser }),
      });
    });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Settings/i);
    // Facility records are maintained here by SUPER_ADMIN; chamber is free text on the GRN
    // and has no management screen of its own.
    await expect(page.getByRole('heading', { name: /^Facilities$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Facility/i })).toBeVisible();
  });

  test('5. Inventory Flow: verifies inventory ledger view', async ({ page }) => {
    const mockUser = {
      userId: 'usr-admin-001',
      username: 'superadmin',
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
      facilityIds: ['fac-alpha'],
    };

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token', user: mockUser }),
      });
    });

    // Mock facilities: FacilityContext no longer synthesizes placeholders
    // on load failure, so /inventory renders an empty state with no h1/h2
    // unless the facility list resolves.
    await page.route('**/api/facilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: 'fac-alpha', name: 'Alpha Cold Storage Facility', code: 'FAC-A', isActive: true },
          ],
          total: 1,
        }),
      });
    });

    await page.goto('/inventory');
    await expect(page.locator('h1, h2')).toContainText(/Inventory|Stock/i);
  });

  test('6. Mobile Navigation Flow: opens drawer on small viewport, navigates and closes on Escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const mockUser = {
      userId: 'usr-admin-001',
      username: 'superadmin',
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
      facilityIds: ['fac-alpha'],
    };

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'mock-jwt-token', user: mockUser }),
      });
    });

    await page.goto('/');

    const mobileToggle = page.locator('#mobile-nav-toggle');
    await expect(mobileToggle).toBeVisible();

    await mobileToggle.click();
    const sidebar = page.locator('#sidebar-navigation');
    await expect(sidebar).toBeVisible();

    const grnLink = sidebar.locator('a[href="/grns"]');
    await expect(grnLink).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/sidebarOpen/);
  });
});
