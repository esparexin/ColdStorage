#!/usr/bin/env bash
# Deterministic spacing-token audit for feature CSS.
#
# Standard: Screen UI consumes the spacing scale (var(--space-*)). Raw pixel
# spacing in feature stylesheets is what makes dense surfaces drift out of the
# scale, and enforcement-rules.md rule 25 already promises this check.
#
# Scope: packages/frontend/src/app only. The shared primitives under
# components/ui own their own geometry, and the intentional 1px StatCard
# hairline is a sanctioned exception named in enforcement-rules.md.
#
# Ratchet: every known violation is recorded in
# scripts/spacing-token-baseline.json as "<rel_path>:<line>": "<declaration>".
# A violation absent from the baseline FAILS. A baselined entry whose
# declaration is still present is reported as INFO so the remaining debt is
# visible and can only shrink. Removing a line and its baseline entry retires
# it permanently; stale baseline entries are reported as ERROR, because a
# baseline that silently outlives its violation stops ratcheting.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$ROOT/scripts/spacing-token-baseline.json"

echo "=== SPACING TOKEN AUDIT (raw px gap/margin/padding in feature CSS) ==="

if python3 - "$ROOT" "$BASELINE_FILE" <<'PYEOF'
import os, re, sys, json

root, baseline_path = sys.argv[1], sys.argv[2]
app = os.path.join(root, "packages", "frontend", "src", "app")

try:
    with open(baseline_path, "r", encoding="utf-8") as f:
        baseline = json.load(f)
except FileNotFoundError:
    baseline = {}

# A full spacing declaration that carries at least one raw px value.
decl = re.compile(
    r'(?:gap|margin|padding)(?:-[a-zA-Z0-9]+)?\s*:\s*[^;{}]*?\d+(?:\.\d+)?px[^;{}]*'
)


def strip_comments_preserving_lines(text):
    """Blank out comment bodies WITHOUT changing line numbering.

    A global re.sub over /* ... */ collapses multi-line comments and shifts
    every subsequent line, which would silently invalidate the ":line" keys the
    baseline is keyed on. This walks line by line and blanks content in place.
    """
    out = []
    in_block = False
    for line in text.splitlines():
        if in_block:
            end = line.find("*/")
            if end == -1:
                out.append("")
                continue
            line = line[end + 2:]
            in_block = False
        while True:
            start = line.find("/*")
            if start == -1:
                break
            end = line.find("*/", start + 2)
            if end == -1:
                line = line[:start]
                in_block = True
                break
            line = line[:start] + " " * (end + 2 - start) + line[end + 2:]
        out.append(line)
    return out


found = {}
for dirpath, _, filenames in os.walk(app):
    for fn in sorted(filenames):
        if not fn.endswith(".css"):
            continue
        path = os.path.join(dirpath, fn)
        rel = os.path.relpath(path, root).replace(os.sep, "/")
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                lines = strip_comments_preserving_lines(f.read())
        except OSError:
            continue
        for lineno, line in enumerate(lines, 1):
            # A line can hold more than one spacing declaration, so accumulate a
            # list per line. Collapsing them to a single value would let an extra
            # declaration slip onto an already-baselined line unnoticed.
            hits = [m.group(0).strip() for m in decl.finditer(line)]
            if hits:
                found.setdefault(f"{rel}:{lineno}", []).extend(hits)


def as_list(v):
    return v if isinstance(v, list) else [v]


new = {}
debt = {}
drift = {}
stale = {}
for k, v in baseline.items():
    if k not in found:
        stale[k] = as_list(v)
    elif sorted(as_list(v)) != sorted(found[k]):
        drift[k] = (as_list(v), found[k])
for k, v in found.items():
    if k not in baseline:
        new[k] = v
    elif k not in stale and k not in drift:
        debt[k] = v

failed = False

if stale:
    print(f"[FAIL] {len(stale)} stale baseline entr(y/ies) with no matching violation:")
    for k, v in sorted(stale.items()):
        print(f"  - {k}: {'; '.join(v)} no longer present; drop it from spacing-token-baseline.json")
    failed = True

if drift:
    print(f"[FAIL] {len(drift)} baselined line(s) whose declarations changed:")
    for k, (was, now) in sorted(drift.items()):
        print(f"  - {k}: baseline {'; '.join(was)} -> found {'; '.join(now)}")
    print("  Update the baseline deliberately; do not let it track silently.")
    failed = True

if new:
    print(f"[FAIL] {len(new)} unbaselined raw-px spacing declaration(s):")
    for k, v in sorted(new.items()):
        for d in v:
            print(f"  - {k}: {d}")
    failed = True

if failed:
    sys.exit(1)

print(f"[INFO] {len(debt)} baselined raw-px spacing declaration(s) remain across "
      f"{len({k.rsplit(':', 1)[0] for k in debt})} file(s). Convert them to "
      f"var(--space-*) and drop their baseline entry to retire them.")
print("[PASS] No raw-px spacing outside the baseline.")
PYEOF
then :; else
  echo "[SPACING-TOKEN-VIOLATION] Feature CSS must consume the var(--space-*) scale."
  exit 1
fi
