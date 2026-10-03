import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { settingsService } from '../modules/settings/settings.service.js';

describe('P9 SettingsService Singleton & SSOT Tests', () => {
  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await SystemSettingsModel.deleteMany({});
  });

  // 1. Canonical initialization: initializes singleton document with fixed _id: 'SYSTEM_SETTINGS' via $setOnInsert preserving backupPolicy
  it('initializes singleton document with fixed _id SYSTEM_SETTINGS via $setOnInsert preserving backupPolicy', async () => {
    const doc = await settingsService.ensureInitialized();
    expect(doc._id).toBe('SYSTEM_SETTINGS');
    expect(doc.timezone).toBe('Asia/Kolkata');
    expect(doc.backupPolicy.retentionDays).toBe(30);
    expect(doc.backupPolicy.backupEnabled).toBe(true);

    const count = await SystemSettingsModel.countDocuments();
    expect(count).toBe(1);
  });

  // 2. Idempotency: repeated calls to ensureInitialized() preserve existing settings and create zero duplicates
  it('idempotently handles repeated ensureInitialized() calls preserving existing settings without creating duplicates', async () => {
    await settingsService.ensureInitialized();
    await settingsService.updateSettings({
      orgName: 'Custom Org Name',
      address: 'Custom Address',
      contact: '9876543210',
    });

    // Second initialization call must NOT overwrite custom settings
    const doc2 = await settingsService.ensureInitialized();
    expect(doc2.orgName).toBe('Custom Org Name');

    const count = await SystemSettingsModel.countDocuments();
    expect(count).toBe(1);
  });

  // 3. Unconfigured detection: getSettings() correctly reports isConfigured: false when orgName is blank
  it('reports isConfigured: false when organization details are not yet configured', async () => {
    const result = await settingsService.getSettings();
    expect(result.isConfigured).toBe(false);
    expect(result.settings.orgName).toBe('');
  });

  // 4. Updates: updateSettings() updates organization identity, preserves backupPolicy, and marks isConfigured: true
  it('updates organization identity, preserves backupPolicy, and marks isConfigured: true', async () => {
    const updated = await settingsService.updateSettings({
      orgName: 'Agro Warehousing Limited',
      address: '77 Logistics Park, Haryana',
      contact: '+91-9876500000',
      gstin: '06AAAAA1234A1Z5',
      logoAssetId: 'logo-asset-123',
      printFooter: 'Quality Storage Services',
    });

    expect(updated.isConfigured).toBe(true);
    expect(updated.settings.orgName).toBe('Agro Warehousing Limited');
    expect(updated.settings.gstin).toBe('06AAAAA1234A1Z5');
    expect(updated.settings.logoAssetId).toBe('logo-asset-123');
    expect(updated.settings.backupPolicy.retentionDays).toBe(30);

    const recheck = await settingsService.getSettings();
    expect(recheck.isConfigured).toBe(true);
    expect(recheck.settings.orgName).toBe('Agro Warehousing Limited');
  });

  // 5. Rejection: updateSettings() validates against systemSettingsSchema and rejects invalid inputs
  it('validates against systemSettingsSchema and rejects blank orgName or invalid gstin', async () => {
    await expect(
      settingsService.updateSettings({
        orgName: '',
        address: 'Some Address',
        contact: '123',
      }),
    ).rejects.toThrow('SETTINGS_VALIDATION_FAILED');

    await expect(
      settingsService.updateSettings({
        orgName: 'Valid Org',
        address: 'Valid Address',
        contact: '123',
        gstin: 'THIS_IS_LONGER_THAN_15_CHARS',
      }),
    ).rejects.toThrow('SETTINGS_VALIDATION_FAILED');
  });

  // 6. Timezone & Defaults: Asia/Kolkata is the platform default timezone. Document numbering
  // is intentionally absent: sequence prefixes are owned by modules/common/counter.service.ts.
  it('guarantees the Asia/Kolkata platform default timezone', async () => {
    const { settings } = await settingsService.getSettings();
    expect(settings.timezone).toBe('Asia/Kolkata');
    expect(settings).not.toHaveProperty('documentNumbering');
  });
});
