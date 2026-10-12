# Disaster Recovery Runbook — Encrypted Backups (BKP-01..05)

## 1. Schedule
- `BACKUP_SCHEDULE_ENABLED=true` + `BACKUP_SCHEDULE_INTERVAL_MS` (min 60000, default 86400000).
- Scheduler starts in `index.ts` only when enabled; skips on 409 in-progress.
- Monitor `GET /api/backups/status → schedule.lastScheduledAt` for staleness + `encryptedArchive.lastBackupAt`.
- Atlas 7-day snapshots are platform-level and monitored separately; app archives are 30-day (`backupPolicy.retentionDays`).

## 2. Off-site
- Local `storage/backups/backup_<epoch>_<rand>.enc` (AES-256-GCM `[IV12][Tag16][CT]`, SHA256 checksum) is authoritative.
- Set `BACKUP_OFFSITE_PROVIDER` + `BACKUP_OFFSITE_DESTINATION` to attempt off-site copy. Until SDK credentials are approved, `offsite.configured=false` and attempts log `OFFSITE_UPLOAD_DEFERRED` without failing the backup.

## 3. Key management
- `BACKUP_ENCRYPTION_KEY` = 64 hex chars. Loss = unrecoverable archives.
- Rotation: generate new key, trigger backup, verify `checksumMatch` via inspect, retain old key until all pre-rotation archives expire/prune.

## 4. Inspect / download (SUPER_ADMIN, `backup:manage`)
- `GET /api/backups/:id/inspect` → `{format, version, createdAt, checksumMatch, entityCounts}` (no raw docs).
- `GET /api/backups/:id/download` → checksum-verified `.enc` stream.

## 5. Restore (full endpoint with safeguards)
1. Take a fresh backup: `POST /api/backups/trigger`.
2. Inspect: `GET /api/backups/:id/inspect` (expect `checksumMatch:true`).
3. Dry-run: `POST /api/backups/restore {backupId, confirm: backupId, dryRun: true}`.
4. Non-dry-run only into active DB; live `cold_storage` additionally requires `BACKUP_ALLOW_LIVE_RESTORE=true`.
5. Restore upserts by `id`, never drops collections. Rollback = restore the fresh backup from step 1.
6. Verify counts + spot-check GRNs/deliveries/rent ledger.

## 6. Retention / alerts
- `pruneExpiredBackups()` after each success marks `PRUNED` + deletes files. Stale `lastBackupAt` and `offsite.lastError` must be alerted by ops monitoring (hook point: status endpoint).
- Failures create `FAILED` rows + `CRITICAL` audit; config refusals are `503` + `INFO` (not failures).
