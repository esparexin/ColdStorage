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

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All architecture boundaries and UI SSOT governance checks passed."
fi

exit "$EXIT"
