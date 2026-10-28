import type { GrnMovementEntry } from '@cold-storage/contracts';

export interface ParsedMovementRow {
  typeLabel: string;
  badgeType: 'inward' | 'mergeIn' | 'mergeOut' | 'transfer' | 'outward' | 'reversal';
  refNumber: string;
  notes: string;
  smallDisplay: string;
  bigDisplay: string;
  totalDisplay: string;
  isReceived: boolean;
}

export function parseMovementRow(entry: GrnMovementEntry): ParsedMovementRow {
  let typeLabel: ParsedMovementRow['typeLabel'];
  let badgeType: ParsedMovementRow['badgeType'];
  let totalDisplay: string;
  let isReceived = false;
  let refNumber = entry.gpNumber || (entry.challanNumber ? entry.challanNumber : '—');
  let notes = entry.remarks || '—';

  switch (entry.type) {
    case 'INWARD':
      typeLabel = 'INWARD';
      badgeType = 'inward';
      totalDisplay = entry.closingBags.toLocaleString('en-IN');
      isReceived = true;
      notes = entry.remarks && !entry.remarks.startsWith('[') ? entry.remarks : 'Genesis Inward';
      break;

    case 'INTERNAL_MERGE_IN': {
      typeLabel = 'MERGE IN';
      badgeType = 'mergeIn';
      totalDisplay = (entry.receivedBags ?? entry.closingBags).toLocaleString('en-IN');
      isReceived = true;
      const match = entry.remarks?.match(/^Merged from GRNs?\s*([^:]+)(?::\s*(.*))?$/);
      if (match) {
        refNumber = `From GRN ${match[1].trim()}`;
        notes = match[2]?.trim() || '—';
      }
      break;
    }

    case 'INTERNAL_MERGE_OUT': {
      typeLabel = 'MERGE OUT';
      badgeType = 'mergeOut';
      totalDisplay = entry.deliveredBags.toLocaleString('en-IN');
      const match = entry.remarks?.match(/^Merged into GRN\s*([^:]+)(?::\s*(.*))?$/);
      if (match) {
        refNumber = `To GRN ${match[1].trim()}`;
        notes = match[2]?.trim() || '—';
      }
      break;
    }

    case 'OWNERSHIP_TRANSFER': {
      typeLabel = 'TRANSFER';
      badgeType = 'transfer';
      totalDisplay = '—';
      const match = entry.remarks?.match(/^Ownership transferred:\s*([^:]+)(?::\s*(.*))?$/);
      if (match) {
        refNumber = match[1].trim();
        notes = match[2]?.trim() || '—';
      }
      break;
    }

    case 'DELIVERY_REVERSAL':
      typeLabel = 'REVERSAL';
      badgeType = 'reversal';
      totalDisplay = (entry.receivedBags ?? 0).toLocaleString('en-IN');
      isReceived = true;
      break;

    case 'INTERNAL_REPACK': {
      const isRepackIn = (entry.receivedBags ?? 0) > 0;
      typeLabel = isRepackIn ? 'REPACK IN' : 'REPACK OUT';
      badgeType = isRepackIn ? 'mergeIn' : 'mergeOut';
      totalDisplay = (isRepackIn ? (entry.receivedBags ?? 0) : entry.deliveredBags).toLocaleString('en-IN');
      isReceived = isRepackIn;
      refNumber = 'Internal Repack';
      notes = entry.remarks || 'Stock repacking adjustment';
      break;
    }

    case 'PARTIAL_OUTWARD':
    case 'FINAL_OUTWARD':
    default:
      typeLabel = 'OUTWARD';
      badgeType = 'outward';
      totalDisplay = entry.deliveredBags.toLocaleString('en-IN');
      break;
  }

  const smallDisplay =
    entry.type === 'OWNERSHIP_TRANSFER'
      ? '—'
      : entry.smallBags != null
        ? entry.smallBags.toLocaleString('en-IN')
        : '—';

  const bigDisplay =
    entry.type === 'OWNERSHIP_TRANSFER'
      ? '—'
      : entry.bigBags != null
        ? entry.bigBags.toLocaleString('en-IN')
        : '—';

  return {
    typeLabel,
    badgeType,
    refNumber,
    notes,
    smallDisplay,
    bigDisplay,
    totalDisplay,
    isReceived,
  };
}
