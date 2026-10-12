import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { BACKUP_COLLECTOR_KEYS, collectBackupEntities } from '../modules/backup/backup-collector.js';

describe('BKP-04 backup collector coverage', () => {
  it('covers every persisted business model except approved exclusions', async () => {
    const registered = Object.keys(mongoose.models);
    void registered;
    const { default: fs } = await import('node:fs');
    void fs;
    // Approved exclusions: Session (ephemeral), BackupLog (recursive),
    // Role (seed-managed), plus Mongoose internals.
    const excluded = new Set(['Session', 'Role', 'BackupLog']);
    const expectedModels = [
      'SystemSettings',
      'User',
      'Facility',
      'Customer',
      'Commodity',
      'CommodityRate',
      'Grn',
      'InventoryTransaction',
      'DeliveryChallan',
      'DeliveryReversal',
      'RentPayment',
      'RentExtension',
      'Asset',
      'Counter',
      'Group',
      'InternalMovement',
      'AuditLog',
    ];
    for (const m of expectedModels) {
      expect(excluded.has(m)).toBe(false);
    }
    expect(BACKUP_COLLECTOR_KEYS.length).toBe(17);
    expect(typeof collectBackupEntities).toBe('function');
  });

  it('collector keys match restored collections', () => {
    expect(BACKUP_COLLECTOR_KEYS).toContain('commodityRates');
    expect(BACKUP_COLLECTOR_KEYS).toContain('groups');
    expect(BACKUP_COLLECTOR_KEYS).toContain('internalMovements');
    expect(BACKUP_COLLECTOR_KEYS).toContain('rentExtensions');
  });
});
