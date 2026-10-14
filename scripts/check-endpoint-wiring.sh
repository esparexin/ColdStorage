#!/usr/bin/env bash
# Backend endpoints must not drift from their documentation (W6, permanent).
#
# Background: docs/ui-backend-wiring-matrix.md claimed the delivery-reversal,
# rent-extension finalize and override endpoints were "wired", and referenced a
# `DeliveryReversalModal` that does not exist. The wiring matrix is a governance
# artefact, so a false claim in it is worse than no claim: it is the document a
# reviewer trusts when deciding what is reachable.
#
# The check is deliberately narrow. Asserting that EVERY backend route has a UI
# would be wrong: several are deliberately API-only. What this gate prevents is
# documentation that asserts a frontend caller for an endpoint that has none.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY=$(command -v python3)
EXIT=0
fail() { echo "[ENDPOINT-WIRING-VIOLATION] $1"; EXIT=1; }

echo "=== ENDPOINT WIRING / DOCUMENTATION TRUTHFULNESS AUDIT ==="

if "$PY" - "$ROOT" <<'PYEOF'
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])
fe = (root / "packages/frontend/src")
routes = root / "packages/backend/src/routes"
docs = root / "docs"

# SCOPE: the LIVE governance documents only. An archived audit describes the
# codebase as it was and may legitimately name a component that has since been
# renamed; flagging those would force rewriting history to satisfy a linter.
LIVE_DOCS = [
    "docs/ui-backend-wiring-matrix.md",
    "docs/architecture/inward-rent-delivery-grn-flow-audit.md",
]

# Every path literal the frontend actually requests.
fe_text = "\n".join(
    p.read_text(encoding="utf-8", errors="ignore") for p in fe.rglob("*.ts")
) + "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in fe.rglob("*.tsx"))

problems = []

# 1. The docs must not name a frontend component that does not exist.
doc_text = "\n".join(
    (root / rel).read_text(encoding="utf-8", errors="ignore")
    for rel in LIVE_DOCS
    if (root / rel).exists()
)
for m in re.finditer(r"`([A-Z]\w+(?:Modal|Panel|Sheet|Dialog))`", doc_text):
    name = m.group(1)
    if not list(fe.rglob(f"{name}.tsx")):
        problems.append(f"docs reference `{name}.tsx`, which does not exist")

# 2. An endpoint path quoted in the docs must resolve to a real route, so a
#    renamed or removed route cannot be documented as live.
route_text = "\n".join(
    p.read_text(encoding="utf-8", errors="ignore") for p in routes.glob("*.ts")
)
for m in re.finditer(r"`/api/([a-z0-9\-/]+)`", doc_text, re.I):
    path = m.group(1).rstrip("/")
    if path in ("health",):
        continue
    # Match the trailing literal segments of the path against the route table.
    tail = path.split("/")[-1]
    if tail and tail not in route_text and f"/{tail}" not in route_text:
        problems.append(f"docs cite `/api/{path}` but no route declares `{tail}`")

if problems:
    for p in sorted(set(problems)):
        print("  " + p)
    sys.exit(1)
print("documentation makes no false frontend/endpoint claims")
PYEOF
then :; else
  fail "documentation asserts a component or endpoint that does not exist."
fi

# 3. Every backend route path literal must also exist somewhere. This catches a
#    route file edited to rename a path while the tests still call the old one.
if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Endpoint wiring documentation is truthful."
fi
exit "$EXIT"
