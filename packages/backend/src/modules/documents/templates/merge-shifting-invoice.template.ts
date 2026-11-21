import type { MergeShiftingInvoiceDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderMergeShiftingInvoiceTemplate(dto: MergeShiftingInvoiceDocumentDto): string {
  const survivingCompositionStr =
    dto.resultingBagType === 'Hybrid'
      ? `${dto.survivingBags.toLocaleString('en-IN')} bags (Hybrid)`
      : `${dto.survivingBags.toLocaleString('en-IN')} bags (S: ${dto.survivingSmallBags} · B: ${dto.survivingBigBags})`;

  const varianceStr =
    dto.repackVariance !== 0
      ? `<span style="color: ${dto.repackVariance < 0 ? '#dc3545' : '#28a745'}; font-weight: bold;">${dto.repackVariance > 0 ? `+${dto.repackVariance}` : dto.repackVariance} bags</span>`
      : '<span style="color: #666;">Nil (Exact count matched)</span>';

  const laborDetailStr =
    dto.repackHamaliCharge > 0
      ? `₹${dto.repackHamaliCharge.toFixed(2)}${dto.repackHamaliRate > 0 ? ` (@ ₹${dto.repackHamaliRate}/bag)` : ''}`
      : '₹0.00 (Standard Putaway / Included)';

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
          <td><span style="color: #666;">Extinguished (Balance 0)</span></td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" style="text-align: center; color: #888;">Consolidated Source Lots</td></tr>`;

  const bodyContent = `
    <h3 style="margin: 15px 0 8px; font-size: 13px; color: #333; text-transform: uppercase; border-bottom: 2px solid #0056b3; padding-bottom: 4px;">
      1. Surviving Target Consignment (After Merge &amp; Internal Shifting)
    </h3>
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Target Depositor / Owner</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong><br/><small style="color: #666;">ID: ${escapeHtml(dto.customerId)}</small></td>
        <th style="width: 25%;">Invoice &amp; Challan #</th>
        <td style="width: 25%;"><strong style="color: #0056b3;">${escapeHtml(dto.mergeInvoiceNumber)}</strong></td>
      </tr>
      <tr>
        <th>Surviving GRN / Lot</th>
        <td><strong>${escapeHtml(dto.targetGrnNumber)}</strong></td>
        <th>Destination Chamber</th>
        <td><strong>${escapeHtml(dto.destinationChamber)}</strong> (SM: ${escapeHtml(dto.storageMark)})</td>
      </tr>
      <tr>
        <th>Commodity</th>
        <td>${escapeHtml(dto.commodityName)}</td>
        <th>Party Mark</th>
        <td>${dto.partyMark ? escapeHtml(dto.partyMark) : 'None'}</td>
      </tr>
      <tr>
        <th>Consolidated Surviving Stock</th>
        <td><strong style="color: #28a745;">${survivingCompositionStr}</strong></td>
        <th>Resulting Bag Category</th>
        <td><strong>${escapeHtml(dto.resultingBagType)}</strong></td>
      </tr>
    </table>

    <h3 style="margin: 20px 0 8px; font-size: 13px; color: #333; text-transform: uppercase; border-bottom: 2px solid #555; padding-bottom: 4px;">
      2. Extinguished Source Consignments (Drained &amp; Consolidated)
    </h3>
    <table class="data-table">
      <thead>
        <tr style="background: #f1f3f5;">
          <th>Source GRN</th>
          <th>Original Depositor</th>
          <th>Orig. Chamber</th>
          <th>Moved Bags</th>
          <th>Bag Type</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${sourceRows}
      </tbody>
      <tfoot>
        <tr style="background: #fafafa; font-weight: bold;">
          <td colspan="3" style="text-align: right;">Total Consolidated Stock:</td>
          <td colspan="3"><strong style="color: #0056b3;">${dto.totalMergedBags.toLocaleString('en-IN')} bags</strong></td>
        </tr>
      </tfoot>
    </table>

    <h3 style="margin: 20px 0 8px; font-size: 13px; color: #333; text-transform: uppercase; border-bottom: 2px solid #555; padding-bottom: 4px;">
      3. Handling, Shifting &amp; Financial Summary
    </h3>
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Repacking &amp; Shifting Labor</th>
        <td style="width: 25%;"><strong>${laborDetailStr}</strong></td>
        <th style="width: 25%;">Repack Physical Variance</th>
        <td style="width: 25%;">${varianceStr}</td>
      </tr>
      <tr>
        <th>Carried Rent Liability</th>
        <td>₹${dto.carriedRentAmount.toFixed(2)}</td>
        <th>Outstanding Rent at Merge</th>
        <td><strong>₹${dto.totalDueAtMerge.toFixed(2)}</strong></td>
      </tr>
      ${dto.remarks ? `
      <tr>
        <th>Operational Remarks</th>
        <td colspan="3">${escapeHtml(dto.remarks)}</td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 25px; padding: 12px; background: #eef2f7; border-left: 4px solid #0056b3; font-size: 11px; line-height: 1.5;">
      <strong>CERTIFICATE OF CONSIGNMENT MERGE &amp; INTERNAL SHIFTING:</strong><br/>
      This document certifies that the source consignments enumerated above have been extinguished, merged, and put away into surviving Lot <strong>${escapeHtml(dto.targetGrnNumber)}</strong> located in Chamber <strong>${escapeHtml(dto.destinationChamber)}</strong>. All physical stock counts, labor handling charges, and carried liabilities have been recorded in the cold storage warehouse management system.
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 45px; text-align: center; font-size: 11px;">
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 6px;">
        <strong>Customer / Depositor</strong><br/>Acknowledgement &amp; Acceptance
      </div>
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 6px;">
        <strong>Labor Mukaddam</strong><br/>Handling &amp; Shifting Verified
      </div>
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 6px;">
        <strong>Warehouse Manager</strong><br/>For ${escapeHtml(dto.organization.orgName)}
      </div>
    </div>
  `;

  return renderBaseLayout({
    title: `Consignment Merge & Internal Shifting Invoice - ${dto.mergeInvoiceNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'CONSIGNMENT MERGE & INTERNAL SHIFTING INVOICE',
    documentNumber: dto.mergeInvoiceNumber,
    documentNumberLabel: 'Invoice #',
    customerSignatureLabel: 'Customer / Depositor Signature',
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
