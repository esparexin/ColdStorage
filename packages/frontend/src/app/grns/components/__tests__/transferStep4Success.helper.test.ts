import { describe, expect, it } from 'vitest';
import {
  formatTransferReceiptTitle,
  formatTransferStockSummary,
  resolveTransferDocumentUrl,
} from '../transferStep4Success.helper';

describe('transferStep4Success.helper', () => {
  describe('resolveTransferDocumentUrl', () => {
    it('constructs properly URI-encoded document URL for transfer receipt', () => {
      const url = resolveTransferDocumentUrl('fac-123', 'mov-456');
      expect(url).toBe('/api/facilities/fac-123/documents/transfer-deed/mov-456');
    });

    it('handles special characters safely with URI encoding', () => {
      const url = resolveTransferDocumentUrl('fac/special#1', 'mov/batch 2');
      expect(url).toBe('/api/facilities/fac%2Fspecial%231/documents/transfer-deed/mov%2Fbatch%202');
    });
  });

  describe('formatTransferReceiptTitle', () => {
    it('returns prefixed number when invoice number is provided', () => {
      expect(formatTransferReceiptTitle('TRF-INV-2026-0001')).toBe('#TRF-INV-2026-0001');
    });

    it('returns fallback label when invoice number is missing', () => {
      expect(formatTransferReceiptTitle(null)).toBe('Pending Assignment');
      expect(formatTransferReceiptTitle(undefined)).toBe('Pending Assignment');
    });
  });

  describe('formatTransferStockSummary', () => {
    it('uses resultingBagType when present', () => {
      expect(formatTransferStockSummary(150, 'Hybrid', 'S')).toBe('150 bags (Hybrid)');
    });

    it('falls back to grnBagType when resultingBagType is omitted', () => {
      expect(formatTransferStockSummary(200, null, 'S+B')).toBe('200 bags (S+B)');
    });

    it('falls back to Standard when both are missing', () => {
      expect(formatTransferStockSummary(100, null, null)).toBe('100 bags (Standard)');
    });
  });
});
