#!/usr/bin/env bash
# Money-obligation SSOT governance (W6, permanent).
#
# Fails closed on the reintroduction of a second rent-obligation derivation.
#
# Background: six independent derivations of "what is owed on this GRN" existed
# simultaneously. Four omitted the outward rent charges or the first-season
# Hamali, so the same GRN reported different balances depending on which screen
# or service asked. On production, GRN 0015 carries 422,250 of outward rent and
# 422,250 collected; the complete rule says it is paid in full, while four of
# the six rules reported a 0 obligation against that, a 4.22 lakh phantom
# overpayment.
#
# The fix is contracts/src/rent-obligation.ts. This gate makes it the only
# place the rule can be written.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[MONEY-SSOT-VIOLATION] $1"; EXIT=1; }

echo "=== MONEY OBLIGATION SSOT GOVERNANCE AUDIT ==="

SSOT="$ROOT/packages/contracts/src/rent-obligation.ts"

# 1. The SSOT itself must exist and export the canonical resolver.
if [ ! -f "$SSOT" ]; then
  fail "rent-obligation.ts is missing; the rent-obligation SSOT cannot drift if it does not exist."
fi
if ! grep -q "export function resolveTotalRentObligation" "$SSOT"; then
  fail "resolveTotalRentObligation is missing from rent-obligation.ts."
fi
if ! grep -q "export \* from './rent-obligation.js';" "$ROOT/packages/contracts/src/index.ts"; then
  fail "rent-obligation.js is not re-exported from the contracts barrel."
fi

# 2. No module may re-implement the base selection.
#    Monthly takes max(stored, outward); Seasonal prefers stored, falls back to
#    outward. These two shapes are the rule.
BASE_HITS=$(grep -rnE "rentType === 'Monthly'\s*\??[^;]{0,40}Math\.max\(|Math\.max\([^)]*rentAmount" \
  "$ROOT/packages/backend/src" "$ROOT/packages/frontend/src" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null \
  | grep -v "rent-obligation.ts" | grep -v "__tests__" || true)
if [ -n "$BASE_HITS" ]; then
  echo "$BASE_HITS"
  fail "rent-obligation base selection is duplicated; call resolveTotalRentObligation instead."
fi

# 3. The rental arithmetic must not be re-derived from bags and prices.
PRICE_HITS=$(grep -rnE "\bbags\s*\*\s*(rate|price|bagPrice|smallBagPrice|bigBagPrice)|rent\s*/\s*bags" \
  "$ROOT/packages/backend/src" "$ROOT/packages/frontend/src" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null \
  | grep -v "packages/contracts/src" | grep -v "__tests__" || true)
if [ -n "$PRICE_HITS" ]; then
  echo "$PRICE_HITS"
  fail "rental arithmetic re-derived outside contracts; computeRentAmount is the SSOT."
fi

# 4. The extension repository must delegate, not own the arithmetic.
REPO="$ROOT/packages/backend/src/modules/rent/rent-extension.repository.ts"
if grep -q "return totalRentDue(" "$REPO" 2>/dev/null; then
  fail "rent-extension.repository.ts computes the total itself; it must delegate to resolveTotalRentObligation."
fi
if ! grep -q "resolveTotalRentObligation" "$REPO" 2>/dev/null; then
  fail "rent-extension.repository.ts no longer routes through resolveTotalRentObligation."
fi

# 5. Every consumer of the shared resolver must supply rentType, which is what
#    made a silently-incomplete obligation impossible to express.
#    The argument object spans several lines, so a per-line grep is not enough:
#    this checks a window after each call site.
python3 - <<'PYEOF'
import re, sys, pathlib
root = pathlib.Path("$ROOT")
bad = []
for p in (root / "packages/backend/src").rglob("*.ts"):
    name = p.as_posix()
    if "__tests__" in name or name.endswith("rent-extension.repository.ts"):
        continue
    text = p.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r"resolveTotalDue\(", text):
        line_no = text[:m.start()].count("\n") + 1
        window = text[m.start() : m.start() + 600]
        # stop at the end of this call's argument list
        depth, end = 0, len(window)
        for i, ch in enumerate(window):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if "rentType" not in window[:end]:
            bad.append(f"{name}:{line_no}")
if bad:
    print("resolveTotalDue called without rentType:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
PYEOF
if [ $? -ne 0 ]; then
  fail "resolveTotalDue called without rentType; the obligation cannot be resolved correctly."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Rent-obligation SSOT is the single derivation."
fi
exit "$EXIT"
