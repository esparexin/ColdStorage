import type { SortingInvoiceDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderSortingInvoiceTemplate(dto: SortingInvoiceDocumentDto): string {
  const originalCompositionStr = dto.originalBagType === 'Hybrid'
    ? `${dto.originalBags.toLocaleString('en-IN')} bags (Hybrid)`
    : `${dto.originalBags.toLocaleString('en-IN')} bags (S: ${dto.originalSmallBags} · B: ${dto.originalBigBags})`;

  const repackedCompositionStr = dto.resultingBagType === 'Hybrid'
    ? `${dto.repackedBags.toLocaleString('en-IN')} bags (Hybrid)`
    : `${dto.repackedBags.toLocaleString('en-IN')} bags (S: ${dto.repackedSmallBags} · B: ${dto.repackedBigBags})`;

  const varianceStr = dto.variance !== 0
    ? `<span style="color: ${dto.variance < 0 ? '#dc3545' : '#28a745'}; font-weight: bold;">${dto.variance > 0 ? `+${dto.variance}` : dto.variance} bags</span>${dto.varianceReason ? ` (${escapeHtml(dto.varianceReason)})` : ''}`
    : '<span style="color: #666;">Nil (Exact count matched)</span>';

  const laborDetailStr = dto.sortingLaborCharge > 0
    ? `₹${dto.sortingLaborCharge.toFixed(2)}${dto.sortingLaborRate > 0 ? ` (@ ₹${dto.sortingLaborRate}/bag)` : ''}`
    : '₹0.00 (Exempted / Included)';

  const bardanaDetailStr = dto.bardanaCharge > 0
    ? `₹${dto.bardanaCharge.toFixed(2)} (${dto.newBagsSupplied} bags @ ₹${dto.newBagRate}/bag)`
    : '₹0.00 (Own bags supplied)';

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer / Storer</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong><br/><small style="color: #666;">ID: ${escapeHtml(dto.customerId)}</small></td>
        <th style="width: 25%;">Service Invoice #</th>
        <td style="width: 25%;"><strong style="color: #0056b3;">${escapeHtml(dto.sortingInvoiceNumber)}</strong></td>
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
        <th>Original Intake Stock</th>
        <td>${originalCompositionStr}</td>
        <th>Repacked Resulting Stock</th>
        <td><strong style="color: #28a745;">${repackedCompositionStr}</strong></td>
      </tr>
      <tr>
        <th>Grading Variance / Loss</th>
        <td colspan="3">${varianceStr}</td>
      </tr>
      <tr>
        <th>Sorting &amp; Repacking Labor</th>
        <td><strong>${laborDetailStr}</strong></td>
        <th>New Bags (Bardana) Cost</th>
        <td><strong>${bardanaDetailStr}</strong></td>
      </tr>
      <tr style="background-color: #f8f9fa;">
        <th>Total Service Invoice Amount</th>
        <td colspan="3"><strong style="font-size: 1.15em; color: #0056b3;">₹${dto.totalServiceCharge.toFixed(2)}</strong></td>
      </tr>
      ${dto.remarks ? `
      <tr>
        <th>Operational Remarks</th>
        <td colspan="3">${escapeHtml(dto.remarks)}</td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 25px; padding: 12px; background: #eef2f7; border-left: 4px solid #0056b3; font-size: 11px; line-height: 1.5;">
      <strong>CERTIFICATE OF PHYSICAL SORTING &amp; REPACKING:</strong><br/>
      This document certifies that the consignment specified above underwent authorized sorting, cleaning, grading, and rebagging as per cold storage operating procedures and customer request. All labor charges, material costs, and physical variances have been recorded against the lot ledger.
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 50px; text-align: center; font-size: 11px;">
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 6px;">
        <strong>Customer / Authorized Agent</strong><br/>Acknowledgement &amp; Acceptance
      </div>
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 6px;">
        <strong>Labor Supervisor (Mukaddam)</strong><br/>Physical Handling &amp; Count Verified
      </div>
      <div style="border-top: 1px solid #333; width: 28%; padding-top: 6px;">
        <strong>Warehouse Manager</strong><br/>For ${escapeHtml(dto.organization.orgName)}
      </div>
    </div>
  `;

  return renderBaseLayout({
    title: `Sorting & Repacking Service Invoice - ${dto.sortingInvoiceNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'SORTING, GRADING & REPACKING SERVICE INVOICE',
    documentNumber: dto.sortingInvoiceNumber,
    documentNumberLabel: 'Service Invoice #',
    customerSignatureLabel: 'Customer / Storer Signature',
    documentDate: new Date(dto.movementDate).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    generatedAt: new Date(dto.generatedAt).toLocaleString('en-IN'),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
