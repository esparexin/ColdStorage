#!/usr/bin/env bash
# Money must be rounded once, at the boundary (W6, permanent).
#
# Background: 46 inline `.toFixed(2)` call sites were scattered across backend,
# contracts and frontend, including a local `const norm = (n) => Number(n.toFixed(2))`
# redeclared inside commodity-rate.service.ts. Two related rules are enforced:
#
#   1. No module may re-declare a rounding helper locally. One implementation
#      exists in contracts; a second copy is how rounding diverges.
#   2. `toFixed` must not be applied to a value that is already the output of
#      the SSOT helpers, which would round twice and can differ by a paisa.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[NUMERIC-HYGIENE-VIOLATION] $1"; EXIT=1; }

echo "=== NUMERIC ROUNDING HYGIENE AUDIT ==="

# 1. A locally-redeclared money-rounding arrow function.
HITS=$(grep -rnE "(const|let)\s+\w+\s*=\s*\(?\w*\)?\s*=>\s*Number\((\w+\.)?toFixed\(2\)\)" \
  "$ROOT/packages/backend/src" "$ROOT/packages/frontend/src" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null \
  | grep -v "__tests__" || true)
if [ -n "$HITS" ]; then
  echo "$HITS"
  fail "a local money-rounding helper is redeclared; use the contracts implementation."
fi

# 2. Double rounding: toFixed applied directly to an SSOT result.
DOUBLE=$(grep -rnE "(resolveTotalRentObligation|splitRentObligation|totalRentDue|computeRentBalance|calculateRentAmount|calculateHamaliAmount)\([^)]*\)[^;,]{0,20}\.toFixed\(2\)" \
  "$ROOT/packages/backend/src" "$ROOT/packages/frontend/src" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null \
  | grep -v "__tests__" || true)
if [ -n "$DOUBLE" ]; then
  echo "$DOUBLE"
  fail "an SSOT money result is rounded a second time."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Money rounding is applied once, at the boundary."
fi
exit "$EXIT"
