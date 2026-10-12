# Backup + Repository Integrity Remediation Checklist

**Branch:** `feat/backup-repository-integrity-remediation` (renamed from `audit/backup-repository-integrity-remediation` — `audit/*` branches are backend-only per `check-backend-cycles.sh`, this scope is full-stack) from `origin/main@632d534`
**Mode:** non-breaking only. No route/permission/verb/envelope renames.
**Backup target:** Atlas snapshots (monitored) + encrypted Google Drive off-site (30d). Restore: download + full restore endpoint with approval + rollback, proven on isolated DB.

## BKP — Backup resilience
- [ ] BKP-01 schedule+monitoring — `backup.service.ts`, `backup.scheduler.ts`, `contracts/backup.ts`, `index.ts` — accept: cron-configured, `lastBackupAt` staleness + failure alerts, no silent miss. Verify: unit + status test.
- [ ] BKP-02 off-site Drive + Atlas separation — `storage/*.driver.ts`, `config.ts`, docs — accept: local + Drive copies, 7d/30d documented separate. Verify: upload mock test.
- [ ] BKP-03 download+restore — `backup.routes.ts`, `backup-restore.service.ts` — accept: SUPER_ADMIN, audit-logged, `assertSafeDatabaseTarget`, dry-run + confirm token + rollback snapshot, isolated proof. Verify: supertest isolated restore.
- [ ] BKP-04 collector coverage — `backup-collector.ts` vs 20 models — accept: coverage test, exclusions (`Session`, `BackupLog`) documented. Verify: `backup-collector.coverage.test.ts`.
- [ ] BKP-05 mutex/verify/retention/key — `backup.service.ts`, `storage.driver.ts` — accept: distributed-safe guard doc, checksum re-verify, idempotent prune, rotation runbook.

## DB — Connections & data
- [ ] DB-01 consolidate connects — `scripts/migrate-free-text-chamber.ts:69`, `scripts/reset-orphaned-stock.ts:77`, `__tests__/helpers/stock-reset.ts:88` → `connectToDatabase()` + `assertSafeDatabaseTarget` — Verify: type-check + script --help.
- [ ] DB-02 config SSOT + test isolation — `config.ts`, `operational-date.helper.ts`, `CORS/HSTS/BOOTSTRAP` direct reads — accept: single reader, local `MONGODB_TEST_URI` documented. Verify: grep + guard test.
- [ ] DB-03 model guards + naming — `user/role/session.model.ts` bare `model()` → guarded; `GRN` label → `Grn` comment — Verify: type-check.

## API — Routes/services/validation
- [ ] API-01 settings ownership doc (non-breaking) — `asset.routes.ts:71,121` vs `settings.routes.ts` — accept: OWNERSHIP comment + shared validation note.
- [ ] API-02 permission matrix doc (non-breaking) — `facility.routes.ts`, `role.routes.ts:13` — accept: `docs/governance/permission-matrix.md`, no key rename.
- [ ] API-03 async + imports + exports — expand `asyncHandler` to grn/delivery/rent/inventory routers (behavior-preserving), fix `grn-edit-persist.ts:4` type-import, route exports via `ExportService`, extract query validators.
- [ ] API-04 contracts SSOT — `errors.ts` adopt-or-document, validate `movement/health` in tests, import `ifsc/aadhaar/gstin` schemas both sides.
- [ ] API-05 delete empty `import {}` in `frontend/src/app/import-export/page.tsx:4`.

## UI — Frontend/a11y (Operate, no redesign)
- [ ] UI-01 single API client — `ConnectivitySection.tsx:54` → `fetchWithTimeout`; fix `BACKEND_URL` copy; fix `FacilityFormModal` CSS ownership; update wiring-matrix counts.
- [ ] UI-02 e2e mocks — `critical-flows.spec.ts:140` → `**/api/facilities/**/grns*`; expand `mockAll`/`DATA_ROUTES`; stabilize drawer `onClose` with `useCallback`.

## GOV — Scripts/CI/docs
- [ ] GOV-01 retire-or-wire `scripts/repair-monthly-rent.mjs`; exclude `backend/src/scripts` from build tar; amend README/P0-lock addendum/PRODUCT/SECURITY/wiring-matrix; fix `release.yml` `.next`, `security-audits` fail-on-high + `.env*` match; Node 20→22 note; prettier wiring note.

## Gates (Phase 6)
- [ ] GATE-01 `scripts/check-backup-coverage.sh` + `check-db-connection-governance.sh`
- [ ] GATE-02 contract/export-collision + permission-matrix checks wired into hygiene
