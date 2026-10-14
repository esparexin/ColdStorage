#!/usr/bin/env bash
# Every declared permission must be enforced at least once (W6, permanent).
#
# Background: `allocation:manage` was declared in PERMISSIONS and offered in the
# role editor, but no requirePermission() call site existed anywhere. A
# SUPER_ADMIN could grant it and it would protect nothing - a false assurance
# about who can do what. It was removed in W1.13; this gate stops the next one
# being invented.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[PERMISSION-COVERAGE-VIOLATION] $1"; EXIT=1; }

echo "=== PERMISSION DECLARATION/ENFORCEMENT COVERAGE AUDIT ==="

PERMISSIONS="$ROOT/packages/contracts/src/permissions.ts"
ROUTES="$ROOT/packages/backend/src/routes"

python3 - <<PYEOF
import re, sys, pathlib, subprocess
root = pathlib.Path("$ROOT")
perms = (root / "packages/contracts/src/permissions.ts").read_text(encoding="utf-8")

# PERMISSION_KEYS is derived from the PERMISSIONS catalog, so read that.
block = re.search(r"export const PERMISSIONS\s*=\s*\{(.*?)\n\} as const", perms, re.S)
if not block:
    print("could not locate the PERMISSIONS catalog in permissions.ts")
    sys.exit(1)
declared = set(re.findall(r"^\s*'([a-z]+:[a-z]+)':", block.group(1), re.M))

# Every requirePermission('x') call across the backend.
calls = subprocess.run(
    ["grep", "-rhoE", r"requirePermission\('[a-z]+:[a-z]+'", str(root / "packages/backend/src")],
    capture_output=True, text=True).stdout
enforced = set(re.findall(r"requirePermission\('([a-z]+:[a-z]+)'", calls))

unenforced = sorted(declared - enforced)
if unenforced:
    print("permissions declared but never enforced by any route:")
    for p in unenforced:
        print("  " + p)
    sys.exit(1)
print(f"all {len(declared)} declared permissions are enforced by at least one route")
PYEOF

if [ $? -ne 0 ]; then
  fail "a declared permission guards nothing; it is offered in the role editor but protects no endpoint."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Every declared permission is enforced."
fi
exit "$EXIT"
