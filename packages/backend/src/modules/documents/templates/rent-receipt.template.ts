import type { RentReceiptDocumentDto, RentReceiptPreviewDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderRentReceiptTemplate(
  dto: RentReceiptDocumentDto | RentReceiptPreviewDto,
): string {
  const isPreview = 'isPreview' in dto && Boolean(dto.isPreview);

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer Name</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">Mobile Number</th>
        <td style="width: 25%;">${escapeHtml(dto.customerMobile)}</td>
      </tr>
      <tr>
        <th>GRN Reference</th>
        <td><strong>${escapeHtml(dto.grnNumber)}</strong></td>
        <th>Commodity</th>
        <td>${escapeHtml(dto.commodityName)}</td>
      </tr>
      <tr>
        <th>Total Rent Obligation</th>
        <td>₹${escapeHtml(dto.totalRentObligation.toFixed(2))}</td>
        <th>Payment Mode</th>
        <td><strong>${escapeHtml(dto.paymentMode)}</strong></td>
      </tr>
      <tr>
        <th>Amount Paid</th>
        <td><strong style="font-size: 14px; color: #0056b3;">₹${escapeHtml(dto.amountPaid.toFixed(2))}</strong></td>
        <th>Payment Status</th>
        <td><strong>${escapeHtml(dto.paymentStatus)}</strong></td>
      </tr>
      <tr>
        <th>Remaining Rent Balance</th>
        <td colspan="3"><strong style="color: ${dto.remainingBalance === 0 ? '#28a745' : '#c00'};">₹${escapeHtml(dto.remainingBalance.toFixed(2))}</strong></td>
      </tr>
      ${
        'notes' in dto && dto.notes
          ? `<tr>
        <th>Notes / Remarks</th>
        <td colspan="3">${escapeHtml(dto.notes)}</td>
      </tr>`
          : ''
      }
    </table>

    ${
      isPreview
        ? `<div style="margin-top: 20px; font-size: 11px; color: #856404; background: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 4px;">
      <strong>Notice:</strong> This is a print template preview from Phase 9. Formal rent payment collection, balance mutation, and receipt numbering are executed exclusively in Phase 12 (Rent Collection &amp; Payment Management).
    </div>`
        : ''
    }
  `;

  return renderBaseLayout({
    title: isPreview
      ? `Rent Receipt [PREVIEW] - ${dto.receiptNumber}`
      : `Rent Receipt - ${dto.receiptNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: isPreview ? 'RENT PAYMENT RECEIPT [PREVIEW]' : 'RENT PAYMENT RECEIPT',
    documentNumber: dto.receiptNumber,
    documentDate:
      dto.date instanceof Date ? dto.date.toISOString().split('T')[0] : String(dto.date),
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
    watermarkNotice: isPreview
      ? 'PREVIEW ONLY — UNCOMMITTED (PHASE 12 RENT MODULE INTEGRATION)'
      : undefined,
  });
}
