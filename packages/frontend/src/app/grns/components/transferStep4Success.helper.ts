/**
 * Helper utilities for TransferStep4Success screen.
 */

export function resolveTransferDocumentUrl(facilityId: string, movementId: string): string {
  return `/api/facilities/${encodeURIComponent(facilityId)}/documents/transfer-deed/${encodeURIComponent(movementId)}`;
}

export function formatTransferReceiptTitle(invoiceNumber?: string | null): string {
  return invoiceNumber ? `#${invoiceNumber}` : 'Pending Assignment';
}

export function formatTransferStockSummary(
  totalBags: number,
  resultingBagType?: string | null,
  grnBagType?: string | null,
): string {
  const type = resultingBagType || grnBagType || 'Standard';
  return `${totalBags.toLocaleString('en-IN')} bags (${type})`;
}
