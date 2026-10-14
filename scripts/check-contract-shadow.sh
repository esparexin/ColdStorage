#!/usr/bin/env bash
# Frontend must not shadow a @cold-storage/contracts type (W6, permanent).
#
# Background: the frontend re-declared domain types that already existed in the
# contracts SSOT. The worst case was `OutwardBagCategory` in
# rentDeliveries.helper.ts, declared as a 3-value union
# ('Small' | 'Big' | 'Small & Big') while the contract
# `outwardBagCategorySchema` has 8 - so a Hybrid, Modern, Modern Size, Mixed or
# S/B delivery could not be represented at all. `AuthUser` and
# `RawAuthUserData` were field-for-field copies of `tokenPayloadSchema` with
# weaker typing (`role: string` instead of the role union).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY=$(command -v python3)
EXIT=0
fail() { echo "[CONTRACT-SHADOW-VIOLATION] $1"; EXIT=1; }

echo "=== CONTRACT SHADOW AUDIT ==="

if "$PY" - "$ROOT" <<'PYEOF'
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])
fe = root / "packages/frontend/src"

forbidden = {
    "AuthUser": "TokenPayload / tokenPayloadSchema",
    "RawAuthUserData": "tokenPayloadSchema",
    "FacilityOption": "Facility",
    "OutwardBagCategory": "outwardBagCategorySchema",
    "TokenPayload": "tokenPayloadSchema",
}

# A real declaration, not an import specifier: `interface X`, or `type X =` /
# `type X extends`. A bare `type X,` only ever appears inside an import block.
DECL = re.compile(r"^\s*(?:export\s+)?(?:interface\s+(\w+)|type\s+(\w+)\s*(?:=|extends))", re.M)

hits = []
for path in fe.rglob("*.ts"):
    if "__tests__" in path.as_posix():
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for m in DECL.finditer(text):
        name = m.group(1) or m.group(2)
        if name in forbidden:
            hits.append(f"{path.relative_to(root).as_posix()}: {name} shadows {forbidden[name]}")

if hits:
    for h in hits:
        print("  " + h)
    sys.exit(1)

print("no contract types are redeclared in the frontend")
PYEOF
then :; else
  fail "a frontend type shadows a contracts SSOT type."
fi

# The frontend must consume the contracts package rather than redeclaring rules.
if ! grep -rq "@cold-storage/contracts" "$ROOT/packages/frontend/src"; then
  fail "the frontend no longer imports @cold-storage/contracts."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] No contract shadowing in the frontend."
fi
exit "$EXIT"
