#!/usr/bin/env bash
# DB-01 permanent gate: all runtime connects use timeouts or the approved helper.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[DB-CONNECTION-VIOLATION] $1"; EXIT=1; }

# Bare single-arg mongoose.connect(x) without options (no timeouts/bufferCommands).
if grep -rn --include="*.ts" -E "mongoose\.connect\([A-Za-z_][A-Za-z0-9_]*\)" "$ROOT/packages/backend/src" 2>/dev/null; then
  fail "bare mongoose.connect(target) without timeout options (use connectToDatabase or timeout constants)."
fi

# Raw MongoClient in backend src (repair script in scripts/ is retired and out of scope).
if grep -rn --include="*.ts" "new MongoClient(" "$ROOT/packages/backend/src" 2>/dev/null; then
  fail "raw MongoClient in backend src (use database/connection SSOT)."
fi

# Live-target guard must persist in connection helper and DBA scripts.
if ! grep -q "assertSafeDatabaseTarget" "$ROOT/packages/backend/src/database/connection.ts"; then
  fail "assertSafeDatabaseTarget missing in database/connection.ts."
fi
for f in packages/backend/src/scripts/migrate-free-text-chamber.ts packages/backend/src/scripts/reset-orphaned-stock.ts; do
  if ! grep -q "connectToDatabase" "$ROOT/$f"; then
    fail "$f must use connectToDatabase (approved connection path)."
  fi
done

if [ "$EXIT" -eq 0 ]; then echo "[PASS] DB connection governance checks passed."; fi
exit "$EXIT"
