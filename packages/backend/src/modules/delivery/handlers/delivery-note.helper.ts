export interface FormatOutwardDeliveryNoteInput {
  withdrawnTotal: number;
  finalSmall: number;
  finalBig: number;
  isHybrid: boolean;
  challanNumber: string;
  customRemarks?: string | null;
}

/**
 * Format authoritative outward delivery inventory transaction notes.
 * Records explicit bag type composition (e.g. Small -5, Big -16 or Hybrid -21).
 */
export function formatOutwardDeliveryTxNote(input: FormatOutwardDeliveryNoteInput): string {
  const { withdrawnTotal, finalSmall, finalBig, isHybrid, challanNumber, customRemarks } = input;
  const compStr = isHybrid
    ? `Hybrid -${withdrawnTotal}`
    : `Small -${finalSmall}, Big -${finalBig}`;
  const defaultNote = `Outward Delivery: ${withdrawnTotal} bags (${compStr}) via Challan #${challanNumber}`;
  return customRemarks?.trim() ? `${defaultNote} - ${customRemarks.trim()}` : defaultNote;
}
