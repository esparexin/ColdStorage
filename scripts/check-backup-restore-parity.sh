#!/usr/bin/env bash
# Backup collector <-> restore target parity (W6, permanent).
#
# Background: restoreBackup derived each archive key by lower-casing the first
# character of the mongoose model name and appending "s":
#
#   const key = modelName.charAt(0).toLowerCase() + modelName.slice(1) + 's';
#
# The collector emits camelCase keys, so three of seventeen collections never
# matched and restored NOTHING while the API answered 200 "Restore complete"
# with a zero count: SystemSettings (the organisation identity), Facility and
# Commodity. Two further defects compounded it - SystemSettings and Counter
# both declare no `id` field, so keying them on `id` skipped every document.
#
# The coverage gate that existed only grepped the collector for key strings, so
# it could not see any of this. This gate compares the two key sets directly.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[BACKUP-PARITY-VIOLATION] $1"; EXIT=1; }

echo "=== BACKUP COLLECTOR / RESTORE PARITY AUDIT ==="

python3 - <<PYEOF
import re, sys, pathlib
root = pathlib.Path("$ROOT")

collector = (root / "packages/backend/src/modules/backup/backup-collector.ts").read_text(encoding="utf-8")
targets   = (root / "packages/backend/src/modules/backup/backup-restore-targets.ts").read_text(encoding="utf-8")

block = re.search(r"BACKUP_COLLECTOR_KEYS\s*=\s*\[(.*?)\]\s*as const", collector, re.S)
if not block:
    print("could not locate BACKUP_COLLECTOR_KEYS"); sys.exit(1)
collected = set(re.findall(r"'([^']+)'", block.group(1)))

entries = re.findall(r"key:\s*'([^']+)'", targets)
restored = set(entries)

problems = []
if len(entries) != len(restored):
    dupes = [e for e in set(entries) if entries.count(e) > 1]
    problems.append(f"duplicate restore keys: {sorted(dupes)}")

missing = sorted(collected - restored)
extra = sorted(restored - collected)
if missing:
    problems.append(f"collected but never restored: {missing}")
if extra:
    problems.append(f"restored but never collected: {extra}")

# A naive pluralisation must never be relied on again.
if re.search(r"charAt\(0\)\.toLowerCase\(\)", targets + collector):
    problems.append("naive pluralisation is back in a backup module")

# Models that declare no `id` must be keyed on their real identity.
for model, identity in (("SystemSettings", "'_id'"), ("Counter", "'compound'")):
    m = re.search(r"model:\s*'" + model + r"'.*?identity:\s*([A-Za-z_']+)", targets, re.S)
    if not m:
        problems.append(f"{model} is missing from RESTORE_TARGETS")
    elif identity.strip("'") not in m.group(1):
        problems.append(f"{model} must use identity {identity}, found {m.group(1)}")

if problems:
    for p in problems:
        print("  " + p)
    sys.exit(1)
print(f"collector and restore agree on all {len(collected)} collections")
PYEOF

if [ $? -ne 0 ]; then
  fail "backup collector and restore targets have drifted; a restore would silently skip data."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "[PASS] Backup collector and restore targets are in parity."
fi
exit "$EXIT"
