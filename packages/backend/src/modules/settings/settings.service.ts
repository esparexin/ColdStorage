import { systemSettingsSchema, type SystemSettings } from '@cold-storage/contracts';
import {
  SystemSettingsModel,
  type SystemSettingsDoc,
} from '../../database/models/system-settings.model.js';
import { auditService } from '../audit/audit.service.js';

export interface SettingsResult {
  settings: SystemSettings;
  isConfigured: boolean;
}

export class SettingsService {
  /**
   * Canonical singleton initialization using fixed _id 'SYSTEM_SETTINGS' and $setOnInsert.
   * Guaranteed to be idempotent with zero race conditions or duplicate documents.
   */
  public async ensureInitialized(): Promise<SystemSettingsDoc> {
    const doc = await SystemSettingsModel.findOneAndUpdate(
      { _id: 'SYSTEM_SETTINGS' },
      {
        $setOnInsert: {
          _id: 'SYSTEM_SETTINGS',
          orgName: '',
          address: '',
          contact: '',
          gstin: null,
          logoAssetId: null,
          printFooter: '',
          timezone: 'Asia/Kolkata',
          documentNumbering: {
            mode: 'FY_SEQUENTIAL',
            grnPrefix: 'GRN',
            receiptPrefix: 'RCPT',
            challanPrefix: 'CHL',
            rentReceiptPrefix: 'RRCPT',
          },
          backupPolicy: {
            atlasRetentionDays: 7,
            driveRetentionDays: 30,
            driveBackupEnabled: true,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    return doc!;
  }

  /**
   * Retrieves the system settings singleton and reports whether the organization identity
   * has been configured by an administrator.
   */
  public async getSettings(): Promise<SettingsResult> {
    const doc = await this.ensureInitialized();
    const isConfigured = Boolean(
      doc.orgName &&
      doc.orgName.trim().length > 0 &&
      doc.address &&
      doc.address.trim().length > 0 &&
      doc.contact &&
      doc.contact.trim().length > 0,
    );

    const settings: SystemSettings = {
      orgName: doc.orgName,
      address: doc.address,
      contact: doc.contact,
      gstin: doc.gstin ?? null,
      logoAssetId: doc.logoAssetId ?? null,
      printFooter: doc.printFooter ?? '',
      timezone: doc.timezone ?? 'Asia/Kolkata',
      documentNumbering: {
        mode:
          (doc.documentNumbering?.mode as 'FY_SEQUENTIAL' | 'PENDING_CONFIRMATION') ??
          'FY_SEQUENTIAL',
        grnPrefix: doc.documentNumbering?.grnPrefix ?? 'GRN',
        receiptPrefix: doc.documentNumbering?.receiptPrefix ?? 'RCPT',
        challanPrefix: doc.documentNumbering?.challanPrefix ?? 'CHL',
        rentReceiptPrefix: doc.documentNumbering?.rentReceiptPrefix ?? 'RRCPT',
      },
      backupPolicy: {
        atlasRetentionDays: doc.backupPolicy?.atlasRetentionDays ?? 7,
        driveRetentionDays: doc.backupPolicy?.driveRetentionDays ?? 30,
        driveBackupEnabled: doc.backupPolicy?.driveBackupEnabled ?? true,
      },
    };

    return { settings, isConfigured };
  }

  /**
   * Updates the system settings singleton after validating with systemSettingsSchema.
   * Full compatibility with existing shared contracts SSOT is preserved.
   */
  public async updateSettings(rawInput: unknown, _updatedBy?: string): Promise<SettingsResult> {
    const parseResult = systemSettingsSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new Error(
        `SETTINGS_VALIDATION_FAILED: ${parseResult.error.errors.map((e) => e.message).join(', ')}`,
      );
    }

    const validatedData = parseResult.data;

    await this.ensureInitialized();

    const updated = await SystemSettingsModel.findOneAndUpdate(
      { _id: 'SYSTEM_SETTINGS' },
      {
        $set: {
          orgName: validatedData.orgName,
          address: validatedData.address,
          contact: validatedData.contact,
          gstin: validatedData.gstin ?? null,
          logoAssetId: validatedData.logoAssetId ?? null,
          printFooter: validatedData.printFooter ?? '',
          timezone: validatedData.timezone ?? 'Asia/Kolkata',
          documentNumbering: validatedData.documentNumbering,
          backupPolicy: validatedData.backupPolicy,
        },
      },
      { new: true, runValidators: true },
    ).exec();

    const isConfigured = Boolean(
      updated &&
      updated.orgName.trim().length > 0 &&
      updated.address.trim().length > 0 &&
      updated.contact.trim().length > 0,
    );

    await auditService.log({
      eventType: 'SETTINGS_UPDATED',
      severity: 'INFO',
      userId: _updatedBy,
      facilityId: null,
      resource: 'settings',
      resourceId: 'SYSTEM_SETTINGS',
      details: {
        modifiedKeys: Object.keys(validatedData),
      },
    });

    return {
      settings: validatedData,
      isConfigured,
    };
  }
}

export const settingsService = new SettingsService();
