import { describe, expect, it } from 'vitest';
import {
  createDeliverySchema,
  reverseDeliverySchema,
  deliveryStatusSchema,
  deliveryQuerySchema,
  deliveryChallanSchema,
} from '../delivery.js';

describe('P6 Delivery Contracts', () => {
  it('validates a valid createDelivery input', () => {
    const input = {
      grnId: 'grn-1',
      date: new Date(),
      smallBags: 30,
      bigBags: 20,
      vehicleNumber: 'MH12AB1234',
      driverName: 'Suresh Kumar',
      weight: 4000,
      remarks: 'Delivered in good condition',
    };
    const parsed = createDeliverySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.smallBags).toBe(30);
      expect(parsed.data.bigBags).toBe(20);
      expect(parsed.data.weight).toBe(4000);
    }
  });

  it('rejects a negative or fractional bag count on either side', () => {
    expect(createDeliverySchema.safeParse({ grnId: 'grn-1', smallBags: -5, bigBags: 0 }).success).toBe(false);
    expect(createDeliverySchema.safeParse({ grnId: 'grn-1', smallBags: 0, bigBags: -1 }).success).toBe(false);
    expect(createDeliverySchema.safeParse({ grnId: 'grn-1', smallBags: 2.5, bigBags: 0 }).success).toBe(false);
  });

  it('rejects a delivery that moves no bags at all', () => {
    expect(createDeliverySchema.safeParse({ grnId: 'grn-1', smallBags: 0, bigBags: 0 }).success).toBe(false);
  });

  it('accepts a single-bag-type delivery with the other side at zero', () => {
    expect(createDeliverySchema.safeParse({ grnId: 'grn-1', smallBags: 0, bigBags: 30 }).success).toBe(true);
  });

  it('rejects a non-numeric bag count', () => {
    const parsed = createDeliverySchema.safeParse({ grnId: 'grn-1', smallBags: 'twenty', bigBags: 0 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Small bags must be a number');
    }
  });

  it('discards legacy position-item payloads rather than honouring them', () => {
    // Positions are retired. A legacy payload still parses on its bag composition, but the item
    // list is dropped, so it can never become a second way to express a delivered quantity.
    const parsed = createDeliverySchema.safeParse({
      grnId: 'grn-1',
      smallBags: 20,
      bigBags: 0,
      items: [{ positionId: 'pos-1', bags: 20 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('items');
    }
  });

  it('rejects future delivery date beyond 5-minute skew tolerance', () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000);
    const parsed = createDeliverySchema.safeParse({
      grnId: 'grn-1',
      date: futureDate,
      smallBags: 10,
      bigBags: 0,
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

  it('validates deliveryChallanSchema with a dispatched composition and transport markers', () => {
    const now = new Date();
    const challan = {
      id: 'del-1',
      facilityId: 'fac-1',
      challanNumber: 'CHL-25-26-0001',
      date: now,
      grnId: 'grn-1',
      grnNumber: 'GRN-25-26-0001',
      customerId: 'cust-1',
      customerName: 'Kisan Agro',
      commodityId: 'comm-1',
      commodityName: 'Potato',
      chamber: 'CH-01',
      smallBags: 25,
      bigBags: 15,
      totalBags: 40,
      marks: 'LOT-A',
      gpNumber: 'GP-999',
      status: 'ISSUED',
      issuedBy: 'usr-1',
      createdAt: now,
      updatedAt: now,
    };
    const parsed = deliveryChallanSchema.safeParse(challan);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.smallBags).toBe(25);
      expect(parsed.data.bigBags).toBe(15);
      expect(parsed.data.totalBags).toBe(40);
      expect(parsed.data.marks).toBe('LOT-A');
      expect(parsed.data.gpNumber).toBe('GP-999');
    }
  });
});
