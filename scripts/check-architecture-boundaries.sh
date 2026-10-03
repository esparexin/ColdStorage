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

# 11. UI SSOT Primitive Enforcement: no native <select> outside the DS primitive
if grep -rnE "<select[ >]" "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "components/ui/Select.tsx"; then
  fail "UI SSOT violation: native <select> bypasses the canonical Select primitive (components/ui/Select.tsx). Use <Select> instead."
fi

# 12. UI SSOT Primitive Enforcement: no native <button> in feature/layout code
NATIVE_BUTTON_HITS=$(grep -rnE "<button[ >]" "$ROOT/packages/frontend/src/app" "$ROOT/packages/frontend/src/components/layout" "$ROOT/packages/frontend/src/components/auth" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null || true)
if [ -n "$NATIVE_BUTTON_HITS" ]; then
  echo "$NATIVE_BUTTON_HITS" | head -20
  fail "UI SSOT violation: native <button> found outside components/ui. Use the canonical Button primitive (variant/size/leftIcon/isLoading)."
fi

# 13. Design Token SSOT: no raw hex/hsl colors outside the canonical token sheet
RAW_COLOR_HITS=$(grep -rnE "#[0-9a-fA-F]{3,8}\b|hsl\(" "$ROOT/packages/frontend/src" \
  --include="*.css" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "styles/tokens.css" || true)
if [ -n "$RAW_COLOR_HITS" ]; then
  echo "$RAW_COLOR_HITS" | head -20
  fail "Design Token SSOT violation: raw hex/hsl color found outside styles/tokens.css. Declare a --color-* token and consume var(--color-*)."
fi

# 14. DOM Integrity: duplicate element ids break label/aria association
DUPLICATE_IDS=$(grep -rhoE 'id="[a-zA-Z][a-zA-Z0-9_-]*"' "$ROOT/packages/frontend/src" \
  --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | sort | uniq -d || true)
if [ -n "$DUPLICATE_IDS" ]; then
  echo "Duplicate element ids: $DUPLICATE_IDS"
  fail "DOM integrity violation: duplicate id attribute(s) found; label htmlFor/aria-* associations become ambiguous."
fi

# 15. Backend Logging Hygiene: Zero raw console.(log|warn|error) anywhere in backend src.
# utils/logger.ts is the single sanctioned logging entry point; scoping this to src/modules
# previously let a bare console.log survive in the process entry point.
if grep -rnE "console\.(log|warn|error)" "$ROOT/packages/backend/src" --include="*.ts" 2>/dev/null \
  | grep -v "packages/backend/src/utils/logger.ts"; then
  fail "Backend logging hygiene violation: raw console.* calls are prohibited outside utils/logger.ts. Use logger.info/warn/error or auditService."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All architecture boundaries and UI SSOT governance checks passed."
fi

exit "$EXIT"

