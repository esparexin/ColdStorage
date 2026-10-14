import { describe, expect, it } from 'vitest';
import { BACKUP_COLLECTOR_KEYS } from '../modules/backup/backup-collector.js';
import { RESTORE_TARGETS } from '../modules/backup/backup-restore-targets.js';

/**
 * Regression guard for the silent backup-restore data loss (W1.4).
 *
 * `restoreBackup` derived each archive key by lower-casing the first character
 * of the mongoose model name and appending "s":
 *
 *   const key = modelName.charAt(0).toLowerCase() + modelName.slice(1) + 's';
 *
 * The collector emits camelCase keys, so three of seventeen collections never
 * matched and restored nothing while the API still answered
 * `200 "Restore complete"` with a zero count:
 *
 *   SystemSettings -> systemSettingss   (collector: systemSettings)
 *   Facility       -> facilitys         (collector: facilities)
 *   Commodity      -> commoditys        (collector: commodities)
 *
 * Those three are the organisation identity and two of the three master-data
 * collections. A second, independent failure compounded it: SystemSettings has
 * no `id` field at all (its key is the fixed `_id: 'SYSTEM_SETTINGS'`), so the
 * `typeof id !== 'string'` guard skipped every settings document regardless of
 * key naming.
 */
describe('backup restore target parity', () => {
  it('covers every collector key exactly once', () => {
    const collectorKeys = [...BACKUP_COLLECTOR_KEYS].sort();
    const restoreKeys = RESTORE_TARGETS.map((t) => t.key).sort();
    expect(restoreKeys).toEqual(collectorKeys);
  });

  it('never derives a key the collector does not emit', () => {
    // The exact three derivations that silently restored nothing.
    const collectorKeys = new Set<string>(BACKUP_COLLECTOR_KEYS);
    for (const model of ['SystemSettings', 'Facility', 'Commodity'] as const) {
      const naive = model.charAt(0).toLowerCase() + model.slice(1) + 's';
      expect(collectorKeys.has(naive), `${model} -> ${naive}`).toBe(false);
    }
  });

  it('uses the correct identity field for the three models that lack an id', () => {
    const byModel = Object.fromEntries(RESTORE_TARGETS.map((t) => [t.model, t]));

    // These three schemas declare no `id` field at all. Keying them on `id`
    // silently skipped every one of their documents.
    expect(byModel['SystemSettings']?.identity).toBe('_id');
    expect(byModel['Counter']?.identity).toBe('compound');

    // Every other model is keyed on its business key.
    for (const target of RESTORE_TARGETS) {
      if (target.model === 'SystemSettings' || target.model === 'Counter') continue;
      expect(target.identity, target.model).toBe('id');
    }
  });

  it('keeps a unique key and a unique model name', () => {
    const keys = RESTORE_TARGETS.map((t) => t.key);
    const models = RESTORE_TARGETS.map((t) => t.model);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(models).size).toBe(models.length);
  });

  it('restores 17 collections, the full approved scope', () => {
    expect(RESTORE_TARGETS).toHaveLength(17);
    expect(BACKUP_COLLECTOR_KEYS).toHaveLength(17);
  });

  it('gives every target a live model reference', () => {
    for (const target of RESTORE_TARGETS) {
      expect(target.modelRef, target.model).toBeDefined();
      expect(typeof target.modelRef.updateOne, target.model).toBe('function');
    }
  });
});