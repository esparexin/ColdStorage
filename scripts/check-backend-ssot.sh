#!/usr/bin/env bash
# Backend SSOT & audit-regression governance (R8, permanent).
# Fails closed on reintroduction of fixed audit defects. Read-only checks.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[BACKEND-SSOT-VIOLATION] $1"; EXIT=1; }

echo "=== BACKEND SSOT GOVERNANCE AUDIT ==="

# F01: refresh must check rotateSession null (replay detection).
if ! grep -q "rotateSession" "$ROOT/packages/backend/src/modules/auth/auth.service.ts" 2>/dev/null; then
  fail "F01: auth.service.ts must call rotateSession."
fi
if ! grep -q "REFRESH_TOKEN_REUSE_OR_RACE" "$ROOT/packages/backend/src/modules/auth/auth.service.ts" 2>/dev/null; then
  fail "F01: refresh replay guard REFRESH_TOKEN_REUSE_OR_RACE missing in auth.service.ts."
fi

# F02: session TTL + compounds must persist.
if ! grep -q "expireAfterSeconds" "$ROOT/packages/backend/src/database/models/session.model.ts" 2>/dev/null; then
  fail "F02: session.model.ts TTL (expireAfterSeconds) missing."
fi
if ! grep -q "refreshTokenHash.*revokedAt\|revokedAt.*refreshTokenHash" "$ROOT/packages/backend/src/database/models/session.model.ts" 2>/dev/null; then
  fail "F02: session compound {refreshTokenHash,revokedAt} missing."
fi

# F03: ledger idempotency unique must persist.
if ! grep -q "referenceId.*transactionType" "$ROOT/packages/backend/src/database/models/inventory-transaction.model.ts" 2>/dev/null; then
  fail "F03: inventory-transaction unique {referenceId,transactionType} missing."
fi

# F19: Group + InternalMovement must stay monitored.
if ! grep -q "GroupModel" "$ROOT/packages/backend/src/database/indexes.ts" 2>/dev/null; then
  fail "F19: GroupModel missing from MONITORED_MODELS."
fi
if ! grep -q "InternalMovementModel" "$ROOT/packages/backend/src/database/indexes.ts" 2>/dev/null; then
  fail "F19: InternalMovementModel missing from MONITORED_MODELS."
fi

# F07: billNumber alias must stay documented (no silent column reintroduction).
if ! grep -q "billNumber" "$ROOT/packages/backend/src/modules/grn/grn.mappers.ts" 2>/dev/null; then
  fail "F07: billNumber alias missing in grn.mappers.ts."
fi

# F05: general limiter must stay IP-only (runs before authenticate).
if grep -q "req.user?.userId" "$ROOT/packages/backend/src/middleware/rate-limiter.middleware.ts" 2>/dev/null | grep -q "general" 2>/dev/null; then
  :
fi
if grep -A3 "generalRateLimiter = createRateLimiter" "$ROOT/packages/backend/src/middleware/rate-limiter.middleware.ts" 2>/dev/null | grep -q "req.user"; then
  fail "F05: generalRateLimiter must not reference req.user (runs before authenticate)."
fi

# F21: preview fixtures must stay marked preview-only, never persisted.
if grep -rn "PREVIEW-RRCPT" "$ROOT/packages/backend/src" --include="*.ts" 2>/dev/null | grep -v "__tests__" | grep -v "document.service.ts" | grep -q .; then
  fail "F21: PREVIEW-RRCPT fixture leaked outside document.service preview boundary."
fi

# F24: one-off scripts must stay marked legacy.
if ! grep -q "F24" "$ROOT/packages/backend/src/scripts/migrate-free-text-chamber.ts" 2>/dev/null; then
  fail "F24: migrate-free-text-chamber legacy marker missing."
fi
if ! grep -q "F24" "$ROOT/packages/backend/src/scripts/reset-orphaned-stock.ts" 2>/dev/null; then
  fail "F24: reset-orphaned-stock legacy marker missing."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Backend SSOT governance checks passed."
fi
exit "$EXIT"
