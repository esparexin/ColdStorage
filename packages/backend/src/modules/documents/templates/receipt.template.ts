import type { ReceiptDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderReceiptTemplate(dto: ReceiptDocumentDto): string {
  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer (Farmer)</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">GRN Reference #</th>
        <td style="width: 25%;">${escapeHtml(dto.grnNumber)}</td>
      </tr>
      <tr>
        <th>Commodity Deposited</th>
        <td><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Chamber Allocated</th>
        <td>${escapeHtml(dto.chamber)}</td>
      </tr>
      <tr>
        <th>Total Quantity Deposited</th>
        <td><strong>${escapeHtml(dto.bags)} Bags (${escapeHtml(dto.bagType)})</strong></td>
      </tr>
      <tr>
        <th>Agreed Rent Terms</th>
        <td colspan="3">${escapeHtml(dto.rentType)} Rent @ ₹${escapeHtml(dto.rentAmount)}${dto.rentMonths ? ` for ${dto.rentMonths} months` : ''}</td>
      </tr>
      ${dto.vehicleNumber ? `<tr><th>Delivery Vehicle #</th><td colspan="3">${escapeHtml(dto.vehicleNumber)}</td></tr>` : ''}
    </table>

    <div style="margin-top: 20px; font-size: 11px; color: #444; border: 1px dashed #999; padding: 10px;">
      <strong>Terms &amp; Conditions of Storage:</strong>
      <ol style="margin-left: 20px; margin-top: 6px; line-height: 1.5;">
        <li>Goods deposited must be claimed with presentation of original receipt / delivery order.</li>
        <li>Storage rent is payable strictly as per agreed seasonal or monthly terms.</li>
        <li>Cold storage management is not liable for natural shrinkage, quality deterioration due to prior field infestation, or force majeure events.</li>
      </ol>
    </div>
  `;

  return renderBaseLayout({
    title: `Receipt - ${dto.inwardReceiptNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'FARMER INWARD ACKNOWLEDGEMENT RECEIPT',
    documentNumber: dto.inwardReceiptNumber,
    documentDate:
      dto.date instanceof Date ? dto.date.toISOString().split('T')[0] : String(dto.date),
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
