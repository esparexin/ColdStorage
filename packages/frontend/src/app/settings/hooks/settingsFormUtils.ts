import type { SystemSettings } from '@cold-storage/contracts';

/** Server state that the form mirrors. Kept as a primitive so the hook has a single comparison source. */
export interface FormSnapshot {
  orgName: string;
  address: string;
  contact: string;
  gstin: string;
  logoAssetId: string | null;
  printFooter: string;
  timezone: string;
  retentionDays: number;
  backupEnabled: boolean;
}

export function toSnapshot(settings: SystemSettings): FormSnapshot {
  return {
    orgName: settings.orgName ?? '',
    address: settings.address ?? '',
    contact: settings.contact ?? '',
    gstin: settings.gstin ?? '',
    logoAssetId: settings.logoAssetId ?? null,
    printFooter: settings.printFooter ?? '',
    timezone: settings.timezone ?? 'Asia/Kolkata',
    retentionDays: settings.backupPolicy?.retentionDays ?? 30,
    backupEnabled: settings.backupPolicy?.backupEnabled ?? true,
  };
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export interface OrgFields {
  orgName: string;
  address: string;
  contact: string;
  gstin: string;
  printFooter: string;
  timezone: string;
}

export function validateOrgFields(fields: OrgFields): string | null {
  if (!fields.orgName.trim() || !fields.address.trim() || !fields.contact.trim()) {
    return 'Organization Name, Registered Address, and Contact Details are required.';
  }
  if (fields.gstin.trim() && !GSTIN_PATTERN.test(fields.gstin.trim().toUpperCase())) {
    return 'Invalid Indian GSTIN format (e.g. 09ABCDE1234F1Z5)';
  }
  return null;
}

export function validateBackupFields(retentionDays: number): string | null {
  if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    return 'Archive retention must be between 1 and 365 days.';
  }
  return null;
}

/**
 * The backend singleton is updated with a full payload (org + backup + logo) even for
 * per-tab saves — the schema requires org identity on every write. Each tab validates
 * only its own section; the other section's current values are carried through untouched.
 */
export function buildSettingsPayload(snapshot: FormSnapshot): SystemSettings {
  return {
    orgName: snapshot.orgName.trim(),
    address: snapshot.address.trim(),
    contact: snapshot.contact.trim(),
    gstin: snapshot.gstin.trim() ? snapshot.gstin.trim().toUpperCase() : undefined,
    logoAssetId: snapshot.logoAssetId ?? undefined,
    printFooter: snapshot.printFooter.trim(),
    timezone: snapshot.timezone.trim() || 'Asia/Kolkata',
    backupPolicy: {
      retentionDays: snapshot.retentionDays,
      backupEnabled: snapshot.backupEnabled,
    },
  };
}
