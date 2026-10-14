#!/usr/bin/env bash
# Every async route handler must sit behind the async boundary (W6, permanent).
#
# Background: Express 4 does not catch rejected promises from handlers. Seven
# handlers awaited a DB call BEFORE entering their try block, so a transient
# Mongo failure produced an unhandled rejection and Node >= 15 exited the whole
# process. In three of the seven the un-guarded await was the authorization
# call, so a DB blip also skipped the facility-scope check.
#
# asyncRouter() now wraps every async handler at registration, so a route file
# must not construct a bare Router().
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[ASYNC-BOUNDARY-VIOLATION] $1"; EXIT=1; }

echo "=== ASYNC ROUTE BOUNDARY AUDIT ==="

ROUTES_DIR="$ROOT/packages/backend/src/routes"

# 1. No route file may build a bare Router(): it would bypass the auto-wrap.
BARE=$(grep -rn "= Router()" "$ROUTES_DIR" --include="*.ts" 2>/dev/null | grep -v "asyncRouter" || true)
if [ -n "$BARE" ]; then
  echo "$BARE"
  fail "a route file uses a bare Router(); use asyncRouter() so async rejections reach Express."
fi

# 2. Every route file must import asyncRouter.
MISSING=0
for f in "$ROUTES_DIR"/*.routes.ts; do
  if ! grep -q "asyncRouter" "$f"; then
    echo "  $(basename "$f") does not use asyncRouter()"
    MISSING=1
  fi
done
if [ "$MISSING" -ne 0 ]; then
  fail "route file(s) bypass the async boundary."
fi

# 3. The process-level safety net must remain.
if ! grep -q "unhandledRejection" "$ROOT/packages/backend/src/index.ts"; then
  fail "index.ts lost its unhandledRejection handler; a stray rejection would exit the process."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] All routes sit behind the async boundary."
fi
exit "$EXIT"
