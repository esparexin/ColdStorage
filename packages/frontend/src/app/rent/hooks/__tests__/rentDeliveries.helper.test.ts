import { describe, expect, it } from 'vitest';
import type { DeliveryChallan } from '@cold-storage/contracts';
import {
  categorizeOutwardBags,
  deriveOutwardPeriodLabel,
  formatOutwardBagBreakdown,
  parseMergedGrnNotes,
  summarizeOutwardRent,
} from '../rentDeliveries.helper';

describe('rentDeliveries.helper', () => {
  describe('categorizeOutwardBags', () => {
    it('categorizes small bags correctly', () => {
      expect(categorizeOutwardBags(100, 0)).toBe('Small');
    });

    it('categorizes big bags correctly', () => {
      expect(categorizeOutwardBags(0, 50)).toBe('Big');
    });

    it('categorizes combined bags correctly', () => {
      expect(categorizeOutwardBags(40, 60)).toBe('Small & Big');
    });
  });

  describe('formatOutwardBagBreakdown', () => {
    it('formats small bag count', () => {
      expect(formatOutwardBagBreakdown(50, 0)).toBe('50 Small bags');
    });

    it('formats big bag count', () => {
      expect(formatOutwardBagBreakdown(0, 40)).toBe('40 Big bags');
    });

    it('formats combined bag breakdown', () => {
      expect(formatOutwardBagBreakdown(30, 20)).toBe('50 bags (30 S + 20 B)');
    });
  });

  describe('deriveOutwardPeriodLabel', () => {
    it('derives origin season label for current year dispatches', () => {
      const inwardDate = new Date('2024-03-15');
      const deliveryDate = new Date('2024-08-20');
      expect(deriveOutwardPeriodLabel(inwardDate, deliveryDate)).toBe('Season 2024');
    });

    it('derives January extension label for January of following year', () => {
      const inwardDate = new Date('2024-03-15');
      const deliveryDate = new Date('2025-01-10');
      expect(deriveOutwardPeriodLabel(inwardDate, deliveryDate)).toBe('January 2025 Extension');
    });

    it('derives February extension label for February of following year', () => {
      const inwardDate = new Date('2024-03-15');
      const deliveryDate = new Date('2025-02-14');
      expect(deriveOutwardPeriodLabel(inwardDate, deliveryDate)).toBe('February 2025 Extension');
    });

    it('derives Renewal label for subsequent seasons', () => {
      const inwardDate = new Date('2023-04-10');
      const deliveryDate = new Date('2024-06-15');
      expect(deriveOutwardPeriodLabel(inwardDate, deliveryDate)).toBe('Season 2024 Renewal');
    });
  });

  describe('summarizeOutwardRent', () => {
    const mockDeliveries: DeliveryChallan[] = [
      {
        id: 'del-1',
        facilityId: 'fac-1',
        challanNumber: 'DC-2024-001',
        date: new Date('2024-05-10'),
        grnId: 'grn-1',
        grnNumber: '0017',
        customerId: 'c-1',
        customerName: 'NITISH',
        commodityId: 'cmd-1',
        commodityName: 'Potato',
        chamber: 'CH-1',
        smallBags: 25,
        bigBags: 15,
        totalBags: 40,
        rentCharge: 4400,
        status: 'ISSUED',
        issuedBy: 'user-1',
        createdAt: new Date('2024-05-10'),
        updatedAt: new Date('2024-05-10'),
      },
      {
        id: 'del-2',
        facilityId: 'fac-1',
        challanNumber: 'DC-2024-002',
        date: new Date('2024-06-12'),
        grnId: 'grn-1',
        grnNumber: '0017',
        customerId: 'c-1',
        customerName: 'NITISH',
        commodityId: 'cmd-1',
        commodityName: 'Potato',
        chamber: 'CH-1',
        smallBags: 20,
        bigBags: 0,
        totalBags: 20,
        rentCharge: 2200,
        status: 'ISSUED',
        issuedBy: 'user-1',
        createdAt: new Date('2024-06-12'),
        updatedAt: new Date('2024-06-12'),
      },
      {
        id: 'del-3',
        facilityId: 'fac-1',
        challanNumber: 'DC-2024-003',
        date: new Date('2024-07-01'),
        grnId: 'grn-1',
        grnNumber: '0017',
        customerId: 'c-1',
        customerName: 'NITISH',
        commodityId: 'cmd-1',
        commodityName: 'Potato',
        chamber: 'CH-1',
        smallBags: 10,
        bigBags: 10,
        totalBags: 20,
        rentCharge: 2200,
        status: 'REVERSED',
        issuedBy: 'user-1',
        createdAt: new Date('2024-07-01'),
        updatedAt: new Date('2024-07-01'),
      },
    ];

    it('aggregates rent charges only for ISSUED deliveries', () => {
      const summary = summarizeOutwardRent(mockDeliveries);
      expect(summary.totalRent).toBe(6600); // 4400 + 2200
      expect(summary.totalBags).toBe(60);   // 40 + 20
      expect(summary.smallBags).toBe(45);   // 25 + 20
      expect(summary.bigBags).toBe(15);     // 15 + 0
      expect(summary.issuedCount).toBe(2);
      expect(summary.reversedCount).toBe(1);
    });
  });

  describe('parseMergedGrnNotes', () => {
    it('returns empty array when remarks is empty or null', () => {
      expect(parseMergedGrnNotes(null)).toEqual([]);
      expect(parseMergedGrnNotes('')).toEqual([]);
      expect(parseMergedGrnNotes('Regular delivery remarks')).toEqual([]);
    });

    it('parses merged stock note with carried pending rent and repacked counts', () => {
      const remarks =
        '[MERGE RECEIVED on 2026-10-12: +50 bags (Repacked: 35 S + 15 B) from GRN-0109. Carried pending rent: ₹1200. Reason: Re-bagged into smaller sizes]';
      const parsed = parseMergedGrnNotes(remarks);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].bags).toBe(50);
      expect(parsed[0].date).toBe('2026-10-12');
      expect(parsed[0].repackedDetail).toBe('Repacked: 35 S + 15 B');
      expect(parsed[0].source).toBe('GRN-0109');
      expect(parsed[0].carriedRent).toBe(1200);
      expect(parsed[0].reason).toBe('Re-bagged into smaller sizes');
    });

    it('parses merged note without repacked details or carried rent', () => {
      const remarks =
        '[MERGE RECEIVED on 2026-10-10: +20 bags from GRN-0105. Reason: Chamber consolidation]';
      const parsed = parseMergedGrnNotes(remarks);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].bags).toBe(20);
      expect(parsed[0].carriedRent).toBe(0);
      expect(parsed[0].reason).toBe('Chamber consolidation');
    });
  });
});

