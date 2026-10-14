#!/usr/bin/env bash
# Unreferenced CSS module classes (W6, permanent).
#
# Background: roughly 45 class names were declared in *.module.css and never
# referenced by any component. They are the residue of refactors - for example
# BackupLogTable stopped using the shared FilterToolbar but kept its bespoke
# toolbar CSS (tableHeader, tableTitleArea, filterControls, selectInput,
# content, codeText). Nothing detects this today, so it only accumulates.
#
# Dynamic lookups (styles[variant]) are excluded, as are the framework's
# composes/keyframes blocks.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY=$(command -v python3)
EXIT=0
fail() { echo "[DEAD-CSS-VIOLATION] $1"; EXIT=1; }

echo "=== DEAD CSS CLASS AUDIT ==="

if "$PY" - "$ROOT" <<'PYEOF'
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])
fe = root / "packages/frontend/src"

# Classes referenced anywhere via styles.X, pageStyles.X, or via a bracket lookup.
used = set()
for path in list(fe.rglob("*.tsx")) + list(fe.rglob("*.ts")):
    text = path.read_text(encoding="utf-8", errors="ignore")
    used.update(re.findall(r"(?:[a-zA-Z0-9_]*Styles|styles)\.([A-Za-z_][A-Za-z0-9_]*)", text))
    used.update(re.findall(r"(?:[a-zA-Z0-9_]*Styles|styles)\[['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]\]", text))
    # className={styles.x ? ... : styles.y} forms and template joins
    used.update(re.findall(r"(?:[a-zA-Z0-9_]*Styles|styles)\[\s*([A-Za-z_][A-Za-z0-9_]*)\s*\]", text))

# A dynamic lookup (styles[variant]) means the class set is open-ended for
# that STYLE OBJECT, so every class in the corresponding CSS module is
# potentially live. The lookup must be attributed to the file that IMPORTS
# that module: a dynamic access in an unrelated component says nothing about it.
DYNAMIC = re.compile(r"(?:[a-zA-Z0-9_]*Styles|styles)\[\s*(?!['\"])[A-Za-z_]")
sources = list(fe.rglob("*.tsx")) + list(fe.rglob("*.ts"))
source_text = {p: p.read_text(encoding="utf-8", errors="ignore") for p in sources}

def dynamically_accessed(css_path: "pathlib.Path") -> bool:
    stem = css_path.name[: -len(".module.css")]
    for path, text in source_text.items():
        if f"{stem}.module.css" in text and DYNAMIC.search(text):
            return True
    return False

dynamic_modules = {css for css in fe.rglob("*.module.css") if dynamically_accessed(css)}

# CSS-module local names that are never referenced.
declared = {}
for css in fe.rglob("*.module.css"):
    text = css.read_text(encoding="utf-8", errors="ignore")
    # drop @keyframes bodies: those names are not style lookups
    text = re.sub(r"@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", text, flags=re.S)
    for m in re.finditer(r"\.([A-Za-z_][A-Za-z0-9_-]*)", text):
        declared.setdefault(m.group(1), css)

dead = sorted(
    (name, css.relative_to(root).as_posix())
    for name, css in declared.items()
    if name not in used and css not in dynamic_modules
)
if dead:
    print(f"  {len(dead)} unreferenced class name(s):")
    for name, css in dead:
        print(f"    {css}: .{name}")
    sys.exit(1)
print(f"all {len(declared)} declared class names are referenced")
PYEOF
then :; else
  fail "unreferenced CSS class names detected."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] No dead CSS classes."
fi
exit "$EXIT"
