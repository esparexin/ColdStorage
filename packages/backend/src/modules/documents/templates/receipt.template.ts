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
        <th style="width: 18%;">Customer</th>
        <td style="width: 32%;" colspan="2"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 20%;">GRN Reference #</th>
        <td style="width: 30%;" colspan="2">${escapeHtml(dto.grnNumber)}</td>
      </tr>
      <tr>
        <th>Commodity Deposited</th>
        <td colspan="2"><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Chamber Allocated</th>
        <td colspan="2">${escapeHtml(dto.chamber)}</td>
      </tr>
      <tr>
        <th>Total S/B Bags</th>
        <td colspan="2"><strong>${escapeHtml(dto.bags)}</strong></td>
        <th>Total Bags Weight</th>
        <td colspan="2"><strong>${dto.totalBagsWeight != null ? `${escapeHtml(dto.totalBagsWeight.toLocaleString('en-IN'))} kg` : '—'}</strong></td>
      </tr>
      <tr>
        <th>Storage Mark</th>
        <td>${escapeHtml(dto.storageMark || dto.grnNumber)}</td>
        <th>Party Mark</th>
        <td>${dto.partyMark ? `<strong>${escapeHtml(dto.partyMark)}</strong>` : '—'}</td>
        <th>Vehicle #</th>
        <td>${escapeHtml(dto.vehicleNumber || '—')}</td>
      </tr>
    </table>

    <div style="margin-top: 16px; font-size: 11px; color: #222; border: 1px dashed #777; padding: 12px; background: #fff;">
      <strong>Terms &amp; Conditions of Storage :</strong>
      <ol style="margin-left: 20px; margin-top: 6px; line-height: 1.6;">
        <li>Goods deposited must be claimed with presentation of original receipt / order.</li>
        <li>Storage rent is payable strictly as per agreed seasonal or monthly terms.</li>
        <li>Cold storage management is not liable for natural shrinkage or prior infestation.</li>
      </ol>
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 11px; color: #111;">
        <strong>Rent Type:</strong> ${escapeHtml(rentTypeLabel)} &nbsp;&nbsp;&nbsp;&nbsp;
        <strong>Small Bag Rate:</strong> ${smallRate}
        <span style="margin: 0 8px; color: #888;">│</span>
        <strong>Big Bag Rate:</strong> ${bigRate}
      </div>
    </div>
  `;

  return renderBaseLayout({
    title: `Receipt - ${dto.inwardReceiptNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'ACKNOWLEDGEMENT RECEIPT',
    documentNumber: dto.inwardReceiptNumber,
    documentNumberLabel: 'Receipt #',
    documentDate: formatReceiptDate(dto.date),
    customerSignatureLabel: 'Depositor Signature',
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
