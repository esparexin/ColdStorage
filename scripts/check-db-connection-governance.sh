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

# Raw MongoClient forbidden across entire repository source (repair script in scripts/ deleted).
if grep -rn --exclude-dir=node_modules --include="*.ts" --include="*.js" --include="*.mjs" "new MongoClient(" "$ROOT" 2>/dev/null; then
  fail "raw MongoClient in repository source (use database/connection SSOT)."
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

# Illegal Mongoose index declaration: sparse + partialFilterExpression
if python3 - "$ROOT" <<'PYEOF'
import re, sys, pathlib
root = pathlib.Path(sys.argv[1])
models = root / "packages/backend/src/database/models"
for p in models.glob("*.ts"):
    text = p.read_text(encoding="utf-8")
    for m in re.finditer(r"\.index\((.*?)\);", text, re.S):
        idx = m.group(1)
        if "sparse" in idx and "partialFilterExpression" in idx:
            print(f"Illegal index in {p.name}: cannot combine sparse and partialFilterExpression")
            sys.exit(1)
PYEOF
then :; else
  fail "illegal index specification: sparse combined with partialFilterExpression."
fi

if [ "$EXIT" -eq 0 ]; then echo "[PASS] DB connection governance checks passed."; fi
exit "$EXIT"
