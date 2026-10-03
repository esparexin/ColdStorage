#!/usr/bin/env bash
# P1 repository hygiene audit — checks for forbidden legacy, duplicate, or placeholder patterns.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "HYGIENE-FAIL: $1"; EXIT=1; }

echo "== hygiene audit: $ROOT =="

# 1. Forbidden filename patterns (case-insensitive)
if find "$ROOT" -path "$ROOT/node_modules" -prune -o -path "$ROOT/packages/*/node_modules" -prune -o -path "$ROOT/.git" -prune -o -type f \( -iname "*final2*" -o -iname "*old-*" -o -iname "*-old.*" -o -iname "*copy-*" -o -iname "*bak-*" \) -print | grep -q .; then
  fail "legacy/duplicate filename pattern found"
fi

# 2. Forbidden content markers in source.
# Scanned across .ts, .tsx and .mjs: a frontend page is exactly where placeholder or
# copy-paste debris tends to survive, and the previous *.ts-only scope could not see it.
PLACEHOLDER_PATTERNS="dummy|placeholder production logic|lorem ipsum|final2|TODO|FIXME|XXX|HACK:|coming soon|not implemented"
if grep -rniE "$PLACEHOLDER_PATTERNS" "$ROOT" \
  --include="*.ts" --include="*.tsx" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null \
  | grep -qv "hygiene-audit"; then
  grep -rniE "$PLACEHOLDER_PATTERNS" "$ROOT" \
    --include="*.ts" --include="*.tsx" --include="*.mjs" \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next | head -20
  fail "forbidden placeholder/leftover-work marker found"
fi

# 2b. debugger statements are dead debugging code.
if grep -rnE "^\s*debugger\s*;?\s*$" "$ROOT/packages" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next 2>/dev/null; then
  fail "debugger statement found in source"
fi

# 3. No dist/coverage tracked in git
if git -C "$ROOT" ls-files | grep -E '(^|/)(dist|coverage)/' | grep -q .; then
  git -C "$ROOT" ls-files | grep -E '(^|/)(dist|coverage)/' | head -20
  fail "build artefacts (dist/coverage) must not be tracked in git"
fi

# 4. No .env secrets committed (any depth, and not just the exact .env name)
if git -C "$ROOT" ls-files | grep -E '(^|/)(\.env|\.env\.local|\.env\..*\.local)$' | grep -q .; then
  git -C "$ROOT" ls-files | grep -E '(^|/)(\.env|\.env\.local|\.env\..*\.local)$' | head -20
  fail "local .env files must not be committed (use .env.example)"
fi

# 5. Source file line-budget and ratchet audit
if ! bash "$ROOT/scripts/check-line-budget.sh"; then
  fail "source file line budget or ratchet constraint violated"
fi

# 6. Architecture boundaries & UI SSOT audit
if ! bash "$ROOT/scripts/check-architecture-boundaries.sh"; then
  fail "architecture boundary or UI SSOT constraint violated"
fi

# 7. Semantic accessibility (a11y) audit
if ! bash "$ROOT/scripts/check-accessibility.sh"; then
  fail "accessibility governance constraint violated"
fi

if [ "$EXIT" -eq 0 ]; then echo "hygiene: PASS"; else echo "hygiene: FAIL"; fi
exit "$EXIT"

