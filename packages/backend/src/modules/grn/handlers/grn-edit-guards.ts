import type { CorrectGrnInput } from '@cold-storage/contracts';
import { wantsBagsChange } from './grn-edit-bags.js';
import { wantsRentChange } from './grn-edit-rent.js';

interface GuardState {
  status: string;
  grnNumber: string;
}

export function isStructuralEdit(input: CorrectGrnInput, bagsChanged = wantsBagsChange(input)): boolean {
  return (
    input.customerId !== undefined ||
    input.date !== undefined ||
    input.commodityId !== undefined ||
    bagsChanged ||
    input.smallBagWeight !== undefined ||
    input.bigBagWeight !== undefined ||
    wantsRentChange(input, bagsChanged)
  );
}

/**
 * Transaction-immutability guardrails for the full-edit workflow.
 * CLOSED receipts and active ISSUED deliveries refuse every edit; any
 * challan/reversal history freezes structural fields so the ledger cannot diverge.
 */
export function assertCorrectionAllowed(
  grn: GuardState,
  opts: { hasMovement: boolean; activeChallans: number; structural: boolean },
): void {
  if (grn.status === 'CLOSED') {
    throw new Error(
      `GRN_CLOSED: Cannot correct GRN '${grn.grnNumber}': it is CLOSED and its stock has been fully delivered`,
    );
  }
  if (opts.activeChallans > 0) {
    throw new Error(
      `GRN_ACTIVE_DELIVERY: Cannot correct GRN '${grn.grnNumber}': stock has already been delivered. Use the delivery reversal workflow instead.`,
    );
  }
  if (opts.hasMovement && opts.structural) {
    throw new Error(
      `GRN_MOVED: Cannot correct customer, date, commodity, bags, weights or rent on GRN '${grn.grnNumber}': stock has already moved and ` +
        `the ledger has recorded the original figures. Only chamber, gate pass, marks and remarks may still be corrected.`,
    );
  }
}
