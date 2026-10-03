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

# 2. Forbidden content markers in source
if grep -rniE "dummy|placeholder production logic|lorem ipsum|final2" "$ROOT" --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | grep -qv "hygiene-audit"; then
  grep -rniE "dummy|placeholder production logic|lorem ipsum|final2" "$ROOT" --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist | head -20
  fail "forbidden placeholder content found"
fi

# 3. No dist/coverage tracked in git
if git -C "$ROOT" ls-files | grep -E '(^|/)(dist|coverage)/' | grep -q .; then
  git -C "$ROOT" ls-files | grep -E '(^|/)(dist|coverage)/' | head -20
  fail "build artefacts (dist/coverage) must not be tracked in git"
fi

# 4. No .env secrets committed
if find "$ROOT" -maxdepth 2 -name ".env" -not -path "$ROOT/.git/*" | grep -q .; then
  fail ".env must not be committed (use .env.example)"
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

