import type { Page } from '@playwright/test';
import type { Role } from '@cold-storage/contracts';

export interface MockUserOptions {
  userId?: string;
  username?: string;
  fullName?: string;
  role?: Role;
  mustChangePassword?: boolean;
  facilityIds?: string[];
}

export const DEFAULT_FACILITY = {
  id: 'fac-solapur-01',
  name: 'Solapur Main Warehouse',
  code: 'FAC-SOL',
  isActive: true,
};

export const DEFAULT_SETTINGS = {
  orgName: 'Shree Cold Storage Pvt Ltd',
  address: 'Plot 12, Industrial Area, Solapur, Maharashtra',
  contact: '+91 98220 12345',
  gstin: '27AAAAA0000A1Z5',
  timezone: 'Asia/Kolkata',
  printFooter: 'Authorised Cold Storage Receipt',
  backupPolicy: {
    retentionDays: 30,
    backupEnabled: true,
  },
};

/**
 * Sets up basic application environment mocks (Settings & Facilities)
 * to ensure deterministic page rendering.
 */
export async function setupEnvironmentMocks(page: Page): Promise<void> {
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        isConfigured: true,
        settings: DEFAULT_SETTINGS,
      }),
    });
  });

  await page.route('**/api/facilities/**/dashboard/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: {
          facilityId: DEFAULT_FACILITY.id,
          totalStockBags: 1250,
          activeGrns: 4,
          closedGrns: 2,
          monthlyInwardBags: 500,
          monthlyDeliveredBags: 150,
          chamberStock: [{ chamber: 'CH-A1', totalBags: 1250 }],
          commodityBreakdown: [
            { commodityId: 'comm-potato-01', commodityName: 'Table Potato', totalBags: 1250 },
          ],
          recentActivity: [],
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route('**/api/facilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [DEFAULT_FACILITY],
        total: 1,
      }),
    });
  });
}

/**
 * Mocks an active user session for a specific role and facility.
 */
export async function mockAuthenticatedSession(
  page: Page,
  options: MockUserOptions = {},
): Promise<void> {
  const role: Role = options.role ?? 'SUPER_ADMIN';
  const username = options.username ?? (role === 'SUPER_ADMIN' ? 'superadmin' : `${role.toLowerCase()}_user`);

  const user = {
    userId: options.userId ?? `usr-${role.toLowerCase()}-001`,
    username,
    fullName: options.fullName ?? `${role.replace('_', ' ')} Operator`,
    role,
    mustChangePassword: options.mustChangePassword ?? false,
    facilityIds: options.facilityIds ?? [DEFAULT_FACILITY.id],
  };

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: `mock-token-${role}`,
        user,
      }),
    });
  });

  await setupEnvironmentMocks(page);
}

/**
 * Mocks an unauthenticated state (auth refresh returns 401).
 */
export async function mockUnauthenticatedSession(page: Page): Promise<void> {
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No active session' }),
    });
  });

  await setupEnvironmentMocks(page);
}
