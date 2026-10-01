import { describe, expect, it } from 'vitest';
import {
  createDeliverySchema,
  reverseDeliverySchema,
  deliveryStatusSchema,
  deliveryQuerySchema,
} from '../delivery.js';

describe('P6 Delivery Contracts', () => {
  it('validates a valid createDelivery input', () => {
    const input = {
      grnId: 'grn-1',
      date: new Date(),
      items: [
        { positionId: 'pos-1', bags: 50 },
        { positionId: 'pos-2', bags: 30 },
      ],
      vehicleNumber: 'MH12AB1234',
      driverName: 'Suresh Kumar',
      weight: 4000,
      remarks: 'Delivered in good condition',
    };
    const parsed = createDeliverySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toHaveLength(2);
      expect(parsed.data.weight).toBe(4000);
    }
  });

  it('rejects duplicate positionId in delivery items', () => {
    const input = {
      grnId: 'grn-1',
      items: [
        { positionId: 'pos-1', bags: 20 },
        { positionId: 'pos-1', bags: 30 },
      ],
    };
    const parsed = createDeliverySchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Duplicate positionId');
    }
  });

  it('rejects future delivery date beyond 5-minute skew tolerance', () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000);
    const parsed = createDeliverySchema.safeParse({
      grnId: 'grn-1',
      date: futureDate,
      items: [{ positionId: 'pos-1', bags: 10 }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('future');
    }
  });

  it('rejects empty items array or invalid bags in delivery', () => {
    expect(createDeliverySchema.safeParse({ grnId: 'grn-1', items: [] }).success).toBe(false);
    expect(
      createDeliverySchema.safeParse({
        grnId: 'grn-1',
        items: [{ positionId: 'pos-1', bags: 0 }],
      }).success,
    ).toBe(false);
    expect(
      createDeliverySchema.safeParse({
        grnId: 'grn-1',
        items: [{ positionId: 'pos-1', bags: -10 }],
      }).success,
    ).toBe(false);
  });

  it('validates reverseDelivery input with minimum 5 characters reason', () => {
    expect(reverseDeliverySchema.safeParse({ reason: 'Good' }).success).toBe(false);
    expect(
      reverseDeliverySchema.safeParse({
        reason: 'Customer cancelled truck dispatch after weighing',
      }).success,
    ).toBe(true);
  });

  it('validates deliveryStatusSchema vocabulary', () => {
    expect(deliveryStatusSchema.safeParse('ISSUED').success).toBe(true);
    expect(deliveryStatusSchema.safeParse('REVERSED').success).toBe(true);
    expect(deliveryStatusSchema.safeParse('CANCELLED').success).toBe(false);
  });

  it('parses deliveryQuery default pagination', () => {
    const parsed = deliveryQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(20);
    }
  });
});
