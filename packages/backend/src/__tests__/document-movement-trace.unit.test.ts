import { describe, expect, it } from 'vitest';
import { renderRentReceiptTemplate } from '../modules/documents/templates/rent-receipt.template.js';
import { resolveReceiptOperationInfo } from '../modules/rent/handlers/rent-receipt-delivery.helper.js';
import { makeRentReceiptDto } from './helpers/document-fixtures.js';

describe('Document Movement Trace & Printed Footer Traceability', () => {
  it('renders internal movement details and audit trace on rent receipt and footer', () => {
    const dto = makeRentReceiptDto({
      movementType: 'OWNERSHIP_TRANSFER',
      operationDescription: 'Transfer Ownership Settlement',
      confirmedComposition: 'Small: 60, Big: 40',
      previousStockBags: 100,
      traceDetails: 'Operation: TRANSFER_OWNERSHIP | Lot: GRN-2026-1001',
    });

    const html = renderRentReceiptTemplate(dto);

    expect(html).toContain('Operation / Movement');
    expect(html).toContain('Transfer Ownership Settlement');
    expect(html).toContain('Composition: Small: 60, Big: 40');
    expect(html).toContain('Prev Stock: 100 bags');
    expect(html).toContain('Operation: TRANSFER_OWNERSHIP | Lot: GRN-2026-1001');
    expect(html).toContain('Quality Preservation Guaranteed');
  });

  it('renders fallback movement operation type when operationDescription is omitted', () => {
    const dto = makeRentReceiptDto({
      movementType: 'SORTING',
      traceDetails: 'Operation: SORTING | Lot: GRN-2026-1001',
    });

    const html = renderRentReceiptTemplate(dto);

    expect(html).toContain('Operation / Movement');
    expect(html).toContain('SORTING');
    expect(html).toContain('Operation: SORTING | Lot: GRN-2026-1001');
  });

  it('omits movement row when movementType and operationDescription are absent', () => {
    const dto = makeRentReceiptDto();
    const html = renderRentReceiptTemplate(dto);

    expect(html).not.toContain('Operation / Movement');
  });

  describe('resolveReceiptOperationInfo helper', () => {
    it('extracts transfer operation info from transfer settlement notes', () => {
      const info = resolveReceiptOperationInfo('Pre-transfer settlement: 100 bags transfer to Ramesh');
      expect(info.movementType).toBe('TRANSFER_OWNERSHIP');
      expect(info.operationDescription).toContain('Pre-transfer settlement');
      expect(info.traceDetails).toContain('TRANSFER_OWNERSHIP');
    });

    it('extracts sorting operation info from sorting settlement notes', () => {
      const info = resolveReceiptOperationInfo('Settled prior to sorting & repacking: 200 bags');
      expect(info.movementType).toBe('SORTING_REPACKING');
      expect(info.operationDescription).toContain('Settled prior to sorting');
      expect(info.traceDetails).toContain('SORTING_REPACKING');
    });

    it('extracts merge operation info from merge settlement notes', () => {
      const info = resolveReceiptOperationInfo('Pre-merge settlement: 150 bags merged into GRN-2026-0002');
      expect(info.movementType).toBe('MERGE');
      expect(info.operationDescription).toContain('Pre-merge settlement');
      expect(info.traceDetails).toContain('MERGE');
    });

    it('returns empty object for regular non-movement payment notes', () => {
      expect(resolveReceiptOperationInfo('Standard monthly payment')).toEqual({});
      expect(resolveReceiptOperationInfo(null)).toEqual({});
      expect(resolveReceiptOperationInfo(undefined)).toEqual({});
    });
  });
});
