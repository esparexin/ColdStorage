import type { TransferDeedDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderTransferDeedTemplate(dto: TransferDeedDocumentDto): string {
  const compositionStr = dto.isHybrid
    ? `${dto.transferredBags.toLocaleString('en-IN')} bags (Hybrid)`
    : `${dto.transferredBags.toLocaleString('en-IN')} bags (Small: ${dto.smallBags.toLocaleString('en-IN')} · Big: ${dto.bigBags.toLocaleString('en-IN')})`;

  const feePayerDisplay = dto.feePayer ? ` (Paid by ${dto.feePayer})` : '';
  const transferFeeStr = dto.transferFeeCharged > 0
    ? `₹${dto.transferFeeCharged.toFixed(2)}${feePayerDisplay}`
    : '₹0.00 (Exempted)';

  const rentSettlementStr = dto.paymentDecision === 'SETTLE_NOW'
    ? `Fully Settled at Transfer: ₹${dto.settledAmount.toFixed(2)}${dto.rentReceiptNumber ? ` (Receipt #${escapeHtml(dto.rentReceiptNumber)})` : ''}`
    : `Agreed Pending: ₹${dto.carriedRentAmount.toFixed(2)} carried forward to Buyer`;

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Transferor (Seller)</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.sellerName)}</strong><br/><small style="color: #666;">ID: ${escapeHtml(dto.sellerId)}</small></td>
        <th style="width: 25%;">Transferee (Buyer)</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.buyerName)}</strong><br/><small style="color: #666;">ID: ${escapeHtml(dto.buyerId)}</small></td>
      </tr>
      <tr>
        <th>GRN / Lot Number</th>
        <td><strong>${escapeHtml(dto.grnNumber)}</strong></td>
        <th>Chamber &amp; Location</th>
        <td><strong>${escapeHtml(dto.chamber)}</strong> (SM: ${escapeHtml(dto.storageMark)})</td>
      </tr>
      <tr>
        <th>Commodity</th>
        <td>${escapeHtml(dto.commodityName)}</td>
        <th>Party Mark</th>
        <td>${dto.partyMark ? escapeHtml(dto.partyMark) : 'None'}</td>
      </tr>
      <tr>
        <th>Transferred Stock</th>
        <td><strong style="color: #0056b3;">${compositionStr}</strong></td>
        <th>Bag Classification</th>
        <td>${escapeHtml(dto.bagType)}</td>
      </tr>
      <tr>
        <th>Transfer Service Fee</th>
        <td><strong>${transferFeeStr}</strong></td>
        <th>Fee Status</th>
        <td>${dto.transferFeeCharged > 0 ? '<span style="color: #28a745;">Assessed / Billed</span>' : 'Waived'}</td>
      </tr>
      ${dto.repackHamaliCharge > 0 ? `
      <tr>
        <th>Repacking Hamali Labor</th>
        <td><strong>₹${dto.repackHamaliCharge.toFixed(2)}</strong> (${dto.repackHamaliBags.toLocaleString('en-IN')} bags @ ₹${dto.repackHamaliRate}/bag)</td>
        <th>Labor Status</th>
        <td><span style="color: #28a745;">Assessed / Billed</span></td>
      </tr>` : ''}
      <tr>
        <th>Storage Rent Obligation</th>
        <td>₹${dto.totalRentObligation.toFixed(2)}</td>
        <th>Rent Settlement Terms</th>
        <td><strong>${rentSettlementStr}</strong></td>
      </tr>
      ${dto.remarks ? `
      <tr>
        <th>Transfer Reason / Remarks</th>
        <td colspan="3">${escapeHtml(dto.remarks)}</td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 10px; padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 8px; line-height: 1.35; color: #475569;">
      <strong>Ownership Transfer Terms &amp; Conditions (యజమాన్య బదిలీ నిబంధనలు):</strong><br/>
      1. <strong>Transferor (Seller):</strong> Relinquishes all legal title, ownership, and claims over the stored consignment to the Transferee.<br/>
      2. <strong>Transferee (Buyer):</strong> Accepts custody of the agricultural produce as-is, along with any carried-forward rent obligations and storage rules.<br/>
      3. <strong>Facility Warehouse:</strong> Confirms physical balance transfer in facility books as of the recorded execution date.
    </div>

    <div style="margin-top: 18px; display: flex; justify-content: space-between; font-size: 8px;">
      <div style="text-align: center; width: 30%; border-top: 1px dashed #64748b; padding-top: 4px;">
        Transferor (Seller) Signature
      </div>
      <div style="text-align: center; width: 30%; border-top: 1px dashed #64748b; padding-top: 4px;">
        Transferee (Buyer) Signature
      </div>
      <div style="text-align: center; width: 30%; border-top: 1px dashed #64748b; padding-top: 4px;">
        Authorized Cold Storage Signatory
      </div>
    </div>
  `;

  return renderBaseLayout({
    title: `Ownership Transfer Rent Receipt - ${dto.transferInvoiceNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'OWNERSHIP TRANSFER RENT RECEIPT & INVOICE',
    documentNumber: dto.transferInvoiceNumber,
    documentNumberLabel: 'Transfer Receipt / Invoice #',
    customerSignatureLabel: 'Buyer / Transferee Signature',
    documentDate: new Date(dto.movementDate).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    generatedAt: new Date(dto.generatedAt).toLocaleString('en-IN'),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
