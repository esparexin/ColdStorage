#!/usr/bin/env bash
# Backend cycle & boundary governance (R8, permanent). No new dependencies.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[BACKEND-CYCLE-VIOLATION] $1"; EXIT=1; }

echo "=== BACKEND CYCLE GOVERNANCE AUDIT ==="

# F09: user.service must not statically import auth/session.repository (lazy only).
if grep -q "^import.*auth/session.repository" "$ROOT/packages/backend/src/modules/users/user.service.ts" 2>/dev/null; then
  fail "F09: user.service.ts static auth/session import reintroduced (use lazy import)."
fi

# F10a: rent record-payment must not statically import delivery helpers.
if grep -q "delivery/handlers/delivery-validation" "$ROOT/packages/backend/src/modules/rent/handlers/record-payment.handler.ts" 2>/dev/null; then
  fail "F10: record-payment static delivery import reintroduced (use ledger directly)."
fi

# F10b: delivery.queries must not statically import rent.service (lazy + batched only).
if grep -q "^import.*rent/rent.service" "$ROOT/packages/backend/src/modules/delivery/queries/delivery.queries.ts" 2>/dev/null; then
  fail "F10: delivery.queries static rent.service import reintroduced (use lazy batched call)."
fi

# F10c: N+1 guard — listDeliveries must use batched summaries, not per-grn map.
if ! grep -q "getRentSummariesForFacility" "$ROOT/packages/backend/src/modules/delivery/queries/delivery.queries.ts" 2>/dev/null; then
  fail "F10: delivery.queries must use batched getRentSummariesForFacility."
fi

# F22: async boundary helper must persist and stay adopted on pilot route.
if [ ! -f "$ROOT/packages/backend/src/utils/async-handler.ts" ]; then
  fail "F22: utils/async-handler.ts missing."
fi
if ! grep -q "asyncHandler" "$ROOT/packages/backend/src/routes/dashboard.routes.ts" 2>/dev/null; then
  fail "F22: dashboard.routes asyncHandler pilot missing."
fi

# Existing boundary rules (mirror check-architecture-boundaries §1, backend scope).
if grep -rn --include="*.ts" "from '../../grn/" "$ROOT/packages/backend/src/modules/delivery" 2>/dev/null; then
  fail "Delivery module has unauthorized internal imports from grn module."
fi
if grep -rn --include="*.ts" "from '../../grn/" "$ROOT/packages/backend/src/modules/rent" 2>/dev/null; then
  fail "Rent module has unauthorized internal imports from grn module."
fi

# Frontend preservation: backend phases must never touch frontend.
if git -C "$ROOT" diff --name-only origin/main...HEAD 2>/dev/null | grep -q "^packages/frontend/"; then
  fail "Frontend files changed on backend audit branch (backend-only rule)."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Backend cycle governance checks passed."
fi
exit "$EXIT"
