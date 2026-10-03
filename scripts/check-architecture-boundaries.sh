#!/usr/bin/env bash
# Architecture Boundaries & UI SSOT Automated Governance Enforcement
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0

fail() {
  echo "[BOUNDARY-VIOLATION] $1"
  EXIT=1
}

echo "=== ARCHITECTURE BOUNDARY & UI SSOT GOVERNANCE AUDIT ==="

# 1. Backend Cross-Domain Boundaries: delivery/rent must not import grn internals
if grep -rn --include="*.ts" "from '\.\./\.\./grn/" "$ROOT/packages/backend/src/modules/delivery" 2>/dev/null; then
  fail "Delivery module has unauthorized internal imports from grn module."
fi

if grep -rn --include="*.ts" "from '\.\./\.\./grn/" "$ROOT/packages/backend/src/modules/rent" 2>/dev/null; then
  fail "Rent module has unauthorized internal imports from grn module."
fi

# 2. Frontend Domain Isolation: inventory must not import storage internal components
if grep -rn --include="*.tsx" "from '@/app/storage" "$ROOT/packages/frontend/src/app/inventory" 2>/dev/null; then
  fail "Inventory feature module has unauthorized direct imports from storage internal components."
fi

# 3. UI SSOT Enforcement: feature stylesheets must not define competing UI primitives
FORBIDDEN_CLASSES=("\.modalBackdrop\b" "\.modalCard\b" "\.pageBtn\b" "\.paginationButtons\b" "\.searchBarContainer\b")
for cls in "${FORBIDDEN_CLASSES[@]}"; do
  if grep -rnE "$cls" "$ROOT/packages/frontend/src/app" --include="*.module.css" 2>/dev/null; then
    fail "Feature CSS defines duplicate competing UI primitive: $cls"
  fi
done

# 4. Route Contract Drift Enforcement: customer update must be PATCH, not PUT
if grep -rnE "method:\s*['\"]PUT['\"].*\/api\/customers" "$ROOT/packages/frontend/src" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null; then
  fail "Customer update route contract mismatch: frontend uses PUT instead of canonical PATCH."
fi

# 5. Legacy Directories Prohibition: packages/backend/src/tests must remain retired
if [ -d "$ROOT/packages/backend/src/tests" ]; then
  fail "Legacy test directory packages/backend/src/tests exists; tests must reside in __tests__."
fi

# 6. Put-Away Route Contract Enforcement: frontend must use /allocations, not /put-away
if grep -rnE "(\/grns\/[^\/]+\/put-away)" "$ROOT/packages/frontend/src" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null; then
  fail "Put-Away contract violation: frontend must call canonical '/allocations' endpoint, not '/put-away'."
fi

# 7. Position Occupancy Facility-Scope Enforcement: frontend must include facilityId in path
if grep -rnE "requestWithAuth\(['\`]\/?api\/positions\/[^/]+\/occupancy" "$ROOT/packages/frontend/src" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null; then
  fail "Position occupancy route contract violation: frontend must include facilityId scope (/api/facilities/:facilityId/positions/:positionId/occupancy)."
fi

# 8. Type SSOT Enforcement: frontend must not declare duplicate PositionOccupancyResponse
if grep -rnE "interface PositionOccupancyResponse" "$ROOT/packages/frontend/src" --exclude-dir=.next --exclude-dir=node_modules 2>/dev/null; then
  fail "Type SSOT violation: frontend must import PositionOccupancy from @cold-storage/contracts instead of declaring PositionOccupancyResponse."
fi

# 9. Mongoose Duplicate Schema Index Prevention
for model in "$ROOT/packages/backend/src/database/models"/*.ts; do
  [ -f "$model" ] || continue
  indexed_fields=$(grep -oE "[a-zA-Z0-9_]+:\s*\{[^}]*index:\s*true" "$model" | cut -d: -f1 || true)
  for f in $indexed_fields; do
    if grep -E "\.index\(\{\s*$f:\s*1\s*\}\)" "$model" >/dev/null 2>&1; then
      fail "Duplicate schema index on '$f' in $(basename "$model"): declared via both property index: true and schema.index()."
    fi
  done
done

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All architecture boundaries and UI SSOT governance checks passed."
fi

exit "$EXIT"
