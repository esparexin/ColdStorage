import type { MergeShiftingInvoiceDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderMergeShiftingInvoiceTemplate(dto: MergeShiftingInvoiceDocumentDto): string {
  const survivingCompositionStr =
    dto.resultingBagType === 'Hybrid'
      ? `${dto.survivingBags.toLocaleString('en-IN')} bags (Hybrid)`
      : `${dto.survivingBags.toLocaleString('en-IN')} bags (S: ${dto.survivingSmallBags} · B: ${dto.survivingBigBags})`;

  const laborDetailStr =
    dto.repackHamaliCharge > 0
      ? `₹${dto.repackHamaliCharge.toFixed(2)}${dto.repackHamaliRate > 0 ? ` (@ ₹${dto.repackHamaliRate}/bag)` : ''}`
      : '₹0.00';

  const sourceRows = dto.sourceLots.length > 0
    ? dto.sourceLots
        .map(
          (s) => `
        <tr>
          <td><strong>${escapeHtml(s.grnNumber)}</strong></td>
          <td>${escapeHtml(s.customerName)}</td>
          <td>${escapeHtml(s.originalChamber)}</td>
          <td><strong>${s.movedBags.toLocaleString('en-IN')}</strong> (S: ${s.smallBags} · B: ${s.bigBags})</td>
          <td>${escapeHtml(s.bagType)}</td>
          <td><span style="color: #666;">Merged (0 Bags)</span></td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" style="text-align: center; color: #888;">No source lots</td></tr>`;

  const bodyContent = `
    <h3 style="margin: 15px 0 8px; font-size: 13px; color: #333; text-transform: uppercase; border-bottom: 2px solid #0056b3; padding-bottom: 4px;">
      1. Target Consignment
    </h3>
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">Invoice #</th>
        <td style="width: 25%;"><strong style="color: #0056b3;">${escapeHtml(dto.mergeInvoiceNumber)}</strong></td>
      </tr>
      <tr>
        <th>Target GRN</th>
        <td><strong>${escapeHtml(dto.targetGrnNumber)}</strong></td>
        <th>Chamber</th>
        <td><strong>${escapeHtml(dto.destinationChamber)}</strong> (SM: ${escapeHtml(dto.storageMark)})</td>
      </tr>
      <tr>
        <th>Commodity</th>
        <td>${escapeHtml(dto.commodityName)}</td>
        <th>Party Mark</th>
        <td>${dto.partyMark ? escapeHtml(dto.partyMark) : 'None'}</td>
      </tr>
      <tr>
        <th>Total Stock</th>
        <td><strong style="color: #28a745;">${survivingCompositionStr}</strong></td>
        <th>Bag Type</th>
        <td><strong>${escapeHtml(dto.resultingBagType)}</strong></td>
      </tr>
    </table>

    <h3 style="margin: 20px 0 8px; font-size: 13px; color: #333; text-transform: uppercase; border-bottom: 2px solid #555; padding-bottom: 4px;">
      2. Source Consignments (Merged)
    </h3>
    <table class="data-table">
      <thead>
        <tr style="background: #f1f3f5;">
          <th>Source GRN</th>
          <th>Customer</th>
          <th>Chamber</th>
          <th>Bags</th>
          <th>Bag Type</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${sourceRows}
      </tbody>
      <tfoot>
        <tr style="background: #fafafa; font-weight: bold;">
          <td colspan="3" style="text-align: right;">Total Merged Bags:</td>
          <td colspan="3"><strong style="color: #0056b3;">${dto.totalMergedBags.toLocaleString('en-IN')} bags</strong></td>
        </tr>
      </tfoot>
    </table>

    <h3 style="margin: 20px 0 8px; font-size: 13px; color: #333; text-transform: uppercase; border-bottom: 2px solid #555; padding-bottom: 4px;">
      3. Charges Summary
    </h3>
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Repacking Labor</th>
        <td style="width: 25%;"><strong>${laborDetailStr}</strong></td>
        <th style="width: 25%;">Carried Rent</th>
        <td style="width: 25%;">${dto.carriedRentAmount > 0 ? `₹${dto.carriedRentAmount.toFixed(2)}` : '₹0.00'}</td>
      </tr>
      <tr>
        <th>Outstanding Rent</th>
        <td colspan="3"><strong>₹${dto.totalDueAtMerge.toFixed(2)}</strong></td>
      </tr>
      ${dto.remarks ? `
      <tr>
        <th>Remarks</th>
        <td colspan="3">${escapeHtml(dto.remarks)}</td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 15px; padding: 8px 12px; background: #eef2f7; border-left: 3px solid #0056b3; font-size: 10px; line-height: 1.4;">
      <strong>Note:</strong> Source consignments merged into target Lot <strong>${escapeHtml(dto.targetGrnNumber)}</strong> in Chamber <strong>${escapeHtml(dto.destinationChamber)}</strong>.
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 35px; text-align: center; font-size: 10px;">
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 5px;">
        <strong>Customer Signature</strong>
      </div>
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 5px;">
        <strong>Labor Mukaddam</strong>
      </div>
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 5px;">
        <strong>Warehouse Manager</strong>
      </div>
    </div>
  `;

  return renderBaseLayout({
    title: `Consignment Merge Invoice - ${dto.mergeInvoiceNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'CONSIGNMENT MERGE INVOICE',
    documentNumber: dto.mergeInvoiceNumber,
    documentNumberLabel: 'Invoice #',
    customerSignatureLabel: 'Customer Signature',
    hideDefaultSignatures: true,
    documentDate: new Date(dto.movementDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    generatedAt: new Date(dto.generatedAt).toLocaleString('en-IN'),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
