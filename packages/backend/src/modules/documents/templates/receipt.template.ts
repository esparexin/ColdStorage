import type { ReceiptDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

function formatReceiptDate(d: Date | string): string {
  try {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(dateObj.getTime())) return String(d);
    return dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function formatRate(price: number | null | undefined, fallbackAmount?: number | null): string {
  if (price != null && !Number.isNaN(price)) {
    return `₹ ${price.toFixed(2)}`;
  }
  if (fallbackAmount != null && !Number.isNaN(fallbackAmount) && fallbackAmount > 0) {
    return `₹ ${fallbackAmount.toFixed(2)}`;
  }
  return '—';
}

function getRentTypeLabel(dto: ReceiptDocumentDto): string {
  if (dto.rentType === 'Seasonal') {
    return dto.rentMonths ? `Seasonal — ${dto.rentMonths} Months` : 'Seasonal — 10 Months';
  }
  if (dto.rentType === 'Monthly') {
    if (dto.rentAmount === 0 && !dto.smallBagPrice && !dto.bigBagPrice) {
      return 'Dynamic (Cycle Billing)';
    }
    return dto.rentMonths ? `Monthly — ${dto.rentMonths} Months` : 'Monthly';
  }
  return dto.rentType || 'Seasonal — 10 Months';
}

export function renderReceiptTemplate(dto: ReceiptDocumentDto): string {
  const rentTypeLabel = getRentTypeLabel(dto);
  const smallRate = formatRate(dto.smallBagPrice, dto.rentAmount);
  const bigRate = formatRate(dto.bigBagPrice, dto.rentAmount);

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 22%;">Customer</th>
        <td style="width: 28%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 22%;">Chamber Allocated</th>
        <td style="width: 28%;">${escapeHtml(dto.chamber)}</td>
      </tr>
      <tr>
        <th>Commodity Deposited</th>
        <td><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Total Bags</th>
        <td><strong>${escapeHtml(dto.bags)}</strong></td>
      </tr>
      <tr>
        <th>Storage Mark</th>
        <td>${escapeHtml(dto.storageMark || dto.grnNumber)}</td>
        <th>Party Mark</th>
        <td>${dto.partyMark ? `<strong>${escapeHtml(dto.partyMark)}</strong>` : '—'}</td>
      </tr>
      <tr>
        <th>Vehicle #</th>
        <td colspan="3">${escapeHtml(dto.vehicleNumber || '—')}</td>
      </tr>
    </table>

    <div style="margin-top: 6px; border: 1px dashed #777; padding: 5px 8px; background: #fff; font-size: 7.8px; line-height: 1.3;">
      <strong style="font-size: 8px;">Terms &amp; Conditions of Storage :</strong>
      <ol style="margin-left: 16px; margin-top: 3px; margin-bottom: 4px; line-height: 1.25;">
        <li>Goods deposited must be claimed with presentation of original receipt / order.</li>
        <li>Storage rent is payable strictly as per agreed seasonal or monthly terms.</li>
        <li>Cold storage management is not liable for natural shrinkage or prior infestation.</li>
      </ol>
      <div style="padding-top: 3px; border-top: 1px dashed #bbb; font-size: 7.8px; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        <strong>Rent Type:</strong> ${escapeHtml(rentTypeLabel)} &nbsp;|&nbsp; <strong>Small Bag Rate:</strong> ${smallRate} &nbsp;|&nbsp; <strong>Big Bag Rate:</strong> ${bigRate}
      </div>
    </div>
    <div style="margin-top: 4px; font-size: 7.5px; color: #777; text-align: right;">
      Statutory Receipt Ref: ${escapeHtml(dto.inwardReceiptNumber)}
    </div>
  `;

  return renderBaseLayout({
    title: `Receipt - GRN ${dto.grnNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'ACKNOWLEDGEMENT RECEIPT',
    documentNumber: dto.grnNumber,
    documentNumberLabel: 'GRN #',
    documentDate: formatReceiptDate(dto.date),
    customerSignatureLabel: 'Depositor Signature',
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
