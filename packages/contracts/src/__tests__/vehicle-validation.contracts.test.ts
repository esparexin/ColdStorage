import { describe, expect, it } from 'vitest';
import {
  createDeliverySchema,
  createGrnSchema,
  indianVehicleSchema,
  isValidIndianVehicleNumber,
  normalizeIndianVehicleNumber,
} from '../index.js';

describe('Indian Vehicle Registration Validation (SSOT)', () => {
  describe('normalizeIndianVehicleNumber', () => {
    it('normalizes spaces, hyphens, and lowercase characters', () => {
      expect(normalizeIndianVehicleNumber('mh-12-ab-1234')).toBe('MH12AB1234');
      expect(normalizeIndianVehicleNumber('  AP 09 BZ 0959  ')).toBe('AP09BZ0959');
      expect(normalizeIndianVehicleNumber('22 bh 1234 aa')).toBe('22BH1234AA');
      expect(normalizeIndianVehicleNumber('DL-1-CAA-1111')).toBe('DL1CAA1111');
      expect(normalizeIndianVehicleNumber(null)).toBe('');
      expect(normalizeIndianVehicleNumber(undefined)).toBe('');
      expect(normalizeIndianVehicleNumber('')).toBe('');
    });
  });

  describe('isValidIndianVehicleNumber', () => {
    it('returns true for valid standard Indian registrations', () => {
      expect(isValidIndianVehicleNumber('MH12AB1234')).toBe(true);
      expect(isValidIndianVehicleNumber('AP 09 BZ 0959')).toBe(true);
      expect(isValidIndianVehicleNumber('UP-32-AA-1111')).toBe(true);
      expect(isValidIndianVehicleNumber('KA01E1234')).toBe(true);
      expect(isValidIndianVehicleNumber('TN01A1')).toBe(true);
      expect(isValidIndianVehicleNumber('GJ01AB12')).toBe(true);
      expect(isValidIndianVehicleNumber('RJ14C123')).toBe(true);
      expect(isValidIndianVehicleNumber('TS09UB1234')).toBe(true);
    });

    it('returns true for Delhi single-digit RTO and legacy no-series registrations', () => {
      expect(isValidIndianVehicleNumber('DL1CAA1111')).toBe(true);
      expect(isValidIndianVehicleNumber('DL-4-S-1234')).toBe(true);
      expect(isValidIndianVehicleNumber('DL011234')).toBe(true);
      expect(isValidIndianVehicleNumber('AP091234')).toBe(true);
      expect(isValidIndianVehicleNumber('OR05AB1234')).toBe(true);
      expect(isValidIndianVehicleNumber('UA07AB1234')).toBe(true);
    });

    it('returns true for valid Bharat Series (BH) registrations', () => {
      expect(isValidIndianVehicleNumber('22BH1234AA')).toBe(true);
      expect(isValidIndianVehicleNumber('21 BH 9999 A')).toBe(true);
      expect(isValidIndianVehicleNumber('23-BH-0001-ZZ')).toBe(true);
    });

    it('returns false for invalid or malformed registrations', () => {
      expect(isValidIndianVehicleNumber('ZZ12AB1234')).toBe(false); // Invalid state
      expect(isValidIndianVehicleNumber('AP09')).toBe(false); // Missing number
      expect(isValidIndianVehicleNumber('AP09BZ')).toBe(false); // Missing number
      expect(isValidIndianVehicleNumber('AP09BZ09599')).toBe(false); // 5 digits
      expect(isValidIndianVehicleNumber('AP009BZ0959')).toBe(false); // 3 digits RTO
      expect(isValidIndianVehicleNumber('AP09BBBB1234')).toBe(false); // 4 letters series
      expect(isValidIndianVehicleNumber('22BH12345AA')).toBe(false); // 5 digits in BH
      expect(isValidIndianVehicleNumber('22BH1234')).toBe(false); // Missing series in BH
      expect(isValidIndianVehicleNumber('INVALID')).toBe(false);
      expect(isValidIndianVehicleNumber('')).toBe(false);
      expect(isValidIndianVehicleNumber(null)).toBe(false);
    });
  });

  describe('indianVehicleSchema', () => {
    it('parses, normalizes and validates valid vehicle numbers', () => {
      const parsed = indianVehicleSchema.parse('  ap - 09 - bz - 0959  ');
      expect(parsed).toBe('AP09BZ0959');

      const parsedBh = indianVehicleSchema.parse('22 bh 1234 aa');
      expect(parsedBh).toBe('22BH1234AA');

      const parsedDl = indianVehicleSchema.parse('dl-1-caa-1111');
      expect(parsedDl).toBe('DL1CAA1111');
    });

    it('rejects invalid vehicle numbers with descriptive error', () => {
      const result = indianVehicleSchema.safeParse('ZZ12AB1234');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Vehicle registration must be in standard Indian format');
      }
    });

    it('supports nullish wrapper in schemas', () => {
      const nullishSchema = indianVehicleSchema.nullish();
      expect(nullishSchema.parse(null)).toBeNull();
      expect(nullishSchema.parse(undefined)).toBeUndefined();
      expect(nullishSchema.parse('MH12AB1234')).toBe('MH12AB1234');
    });
  });

  describe('Integration with Contract Schemas and Non-Unique Vehicle Reuse', () => {
    const baseGrnPayload = {
      facilityId: 'fac-1',
      grnNumber: '1001',
      inwardReceiptNumber: 'IRN-1001',
      date: new Date('2026-10-01'),
      customerId: 'cust-1',
      commodityId: 'comm-1',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S' as const,
      smallBags: 100,
      bigBags: 0,
      rentType: 'Seasonal' as const,
      rentAmount: 5000,
      vehicleNumber: 'ap - 09 - bz - 0959',
    };

    it('normalizes vehicleNumber in createGrnSchema', () => {
      const parsed = createGrnSchema.parse(baseGrnPayload);
      expect(parsed.vehicleNumber).toBe('AP09BZ0959');
    });

    it('allows identical vehicleNumber reuse across multiple independent GRNs', () => {
      const grn1 = createGrnSchema.parse({ ...baseGrnPayload, grnNumber: '1001' });
      const grn2 = createGrnSchema.parse({ ...baseGrnPayload, grnNumber: '1002', customerId: 'cust-2' });
      expect(grn1.vehicleNumber).toBe('AP09BZ0959');
      expect(grn2.vehicleNumber).toBe('AP09BZ0959');
      expect(grn1.vehicleNumber).toBe(grn2.vehicleNumber);
      expect(grn1.grnNumber).not.toBe(grn2.grnNumber);
    });

    it('normalizes vehicleNumber in createDeliverySchema', () => {
      const deliveryPayload = {
        facilityId: 'fac-1',
        grnId: 'grn-1',
        date: new Date('2026-10-02'),
        smallBags: 10,
        bigBags: 0,
        vehicleNumber: '22 bh 1234 aa',
      };
      const parsed = createDeliverySchema.parse(deliveryPayload);
      expect(parsed.vehicleNumber).toBe('22BH1234AA');
    });
  });
});
