# Permission Matrix (non-breaking, reviewed)

No permission keys renamed. Known overlaps documented, not changed.

- `settings:manage` (SUPER_ADMIN): `GET|PUT /settings` (settingsRouter) + `POST|DELETE /settings/logo` (assetRouter) + `POST|PATCH|DELETE /facilities` (facilityRouter lifecycle tied to settings admin by design).
- `facility:view`: `GET /facilities`.
- `user:manage`: includes `GET /roles` (role list) for admin UX; all other role ops require `role:manage`.
- `backup:manage` (SUPER_ADMIN only): trigger/list/status/download/inspect/restore.
- `grn:create`, `dashboard:view`, etc.: per `contracts/permissions.ts` canonical.

Breaking renames (e.g. `facility:manage`, `role:view`) require reviewed migration + frontend/backend/contract lockstep; explicitly deferred.
