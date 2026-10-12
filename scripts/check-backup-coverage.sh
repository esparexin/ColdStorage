#!/usr/bin/env bash
# BKP-04 permanent gate: every persisted business model must be collected or explicitly excluded.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT=0
fail() { echo "[BACKUP-COVERAGE-VIOLATION] $1"; EXIT=1; }

COLLECTOR="$ROOT/packages/backend/src/modules/backup/backup-collector.ts"
# modelName:collectorKey (approved exclusions Session/BackupLog/Role handled below)
PAIRS="SystemSettings:systemSettings User:users Facility:facilities Customer:customers Commodity:commodities CommodityRate:commodityRates Grn:grns InventoryTransaction:inventoryTransactions DeliveryChallan:deliveryChallans DeliveryReversal:deliveryReversals RentPayment:rentPayments RentExtension:rentExtensions Asset:assets Counter:counters Group:groups InternalMovement:internalMovements AuditLog:auditLogs"

for pair in $PAIRS; do
  model="${pair%%:*}"
  key="${pair#*:}"
  if ! grep -q "'$key'" "$COLLECTOR"; then
    fail "collector missing key '$key' (see BACKUP_COLLECTOR_KEYS)."
  fi
  case "$model" in
    SystemSettings) modelFile="system-settings.model.ts" ;;
    User) modelFile="user.model.ts" ;;
    Facility) modelFile="facility.model.ts" ;;
    Customer) modelFile="customer.model.ts" ;;
    Commodity) modelFile="commodity.model.ts" ;;
    CommodityRate) modelFile="commodity-rate.model.ts" ;;
    Grn) modelFile="grn.model.ts" ;;
    InventoryTransaction) modelFile="inventory-transaction.model.ts" ;;
    DeliveryChallan) modelFile="delivery-challan.model.ts" ;;
    DeliveryReversal) modelFile="delivery-reversal.model.ts" ;;
    RentPayment) modelFile="rent-payment.model.ts" ;;
    RentExtension) modelFile="rent-extension.model.ts" ;;
    Asset) modelFile="asset.model.ts" ;;
    Counter) modelFile="counter.model.ts" ;;
    Group) modelFile="group.model.ts" ;;
    InternalMovement) modelFile="internal-movement.model.ts" ;;
    AuditLog) modelFile="audit-log.model.ts" ;;
    *) modelFile="" ;;
  esac
  if [ -n "$modelFile" ] && [ ! -f "$ROOT/packages/backend/src/database/models/$modelFile" ]; then
    fail "expected model file '$modelFile' absent."
  fi
done

# backupType enum must stay in sync (contracts + mongoose).
if ! grep -q "SCHEDULED" "$ROOT/packages/contracts/src/backup.ts"; then
  fail "contracts backupTypeSchema missing SCHEDULED."
fi
if ! grep -q "SCHEDULED" "$ROOT/packages/backend/src/database/models/backup-log.model.ts"; then
  fail "backup-log model enum missing SCHEDULED."
fi

if [ "$EXIT" -eq 0 ]; then echo "[PASS] Backup coverage checks passed."; fi
exit "$EXIT"
