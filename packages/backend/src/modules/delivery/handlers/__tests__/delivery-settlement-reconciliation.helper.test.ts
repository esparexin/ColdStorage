import { describe, expect, it } from 'vitest';
import { reconcileDeliveriesWithPayments } from '../delivery-settlement-reconciliation.helper.js';

describe('delivery-settlement-reconciliation.helper', () => {
  it('returns empty map when there are no challans', () => {
    const res = reconcileDeliveriesWithPayments([], []);
    expect(res.size).toBe(0);
  });

  it('marks all challans Not Settled with 0 paid when there are no payments', () => {
    const challans = [
      { id: 'del-1', challanNumber: 'CHL-001', rentCharge: 11950, date: new Date('2026-11-03') },
      { id: 'del-2', challanNumber: 'CHL-002', rentCharge: 3300, date: new Date('2026-11-04') },
    ];
    const res = reconcileDeliveriesWithPayments(challans, []);
    expect(res.get('del-1')).toEqual({
      rentTotalPaid: 0,
      rentRemainingBalance: 11950,
      rentPaymentStatus: 'Not Settled',
    });
    expect(res.get('del-2')).toEqual({
      rentTotalPaid: 0,
      rentRemainingBalance: 3300,
      rentPaymentStatus: 'Not Settled',
    });
  });

  it('correctly attributes direct payments matching deliveryId', () => {
    const challans = [
      { id: 'del-1', challanNumber: 'CHL-001', rentCharge: 11950, date: new Date('2026-11-03') },
      { id: 'del-2', challanNumber: 'CHL-002', rentCharge: 3300, date: new Date('2026-11-04') },
    ];
    const payments = [
      { deliveryId: 'del-1', amountPaid: 11950 },
    ];
    const res = reconcileDeliveriesWithPayments(challans, payments);
    expect(res.get('del-1')).toEqual({
      rentTotalPaid: 11950,
      rentRemainingBalance: 0,
      rentPaymentStatus: 'Settled',
    });
    expect(res.get('del-2')).toEqual({
      rentTotalPaid: 0,
      rentRemainingBalance: 3300,
      rentPaymentStatus: 'Not Settled',
    });
  });

  it('reconciles general GRN payments without deliveryId in FIFO order across challans', () => {
    const challans = [
      { id: 'del-1', challanNumber: 'CHL-001', rentCharge: 11950, date: new Date('2026-11-03') },
      { id: 'del-2', challanNumber: 'CHL-002', rentCharge: 3300, date: new Date('2026-11-04') },
    ];
    // Full payment of 15250 paid at GRN level without deliveryId
    const payments = [
      { deliveryId: null, amountPaid: 15250 },
    ];
    const res = reconcileDeliveriesWithPayments(challans, payments);
    expect(res.get('del-1')).toEqual({
      rentTotalPaid: 11950,
      rentRemainingBalance: 0,
      rentPaymentStatus: 'Settled',
    });
    expect(res.get('del-2')).toEqual({
      rentTotalPaid: 3300,
      rentRemainingBalance: 0,
      rentPaymentStatus: 'Settled',
    });
  });

  it('handles partial general GRN payments correctly with FIFO', () => {
    const challans = [
      { id: 'del-1', challanNumber: 'CHL-001', rentCharge: 11950, date: new Date('2026-11-03') },
      { id: 'del-2', challanNumber: 'CHL-002', rentCharge: 3300, date: new Date('2026-11-04') },
    ];
    // Payment of 5000: covers part of earliest challan (del-1)
    const payments = [
      { deliveryId: null, amountPaid: 5000 },
    ];
    const res = reconcileDeliveriesWithPayments(challans, payments);
    expect(res.get('del-1')).toEqual({
      rentTotalPaid: 5000,
      rentRemainingBalance: 6950,
      rentPaymentStatus: 'Not Settled',
    });
    expect(res.get('del-2')).toEqual({
      rentTotalPaid: 0,
      rentRemainingBalance: 3300,
      rentPaymentStatus: 'Not Settled',
    });
  });

  it('rolls over excess from direct payment to subsequent challans', () => {
    const challans = [
      { id: 'del-1', challanNumber: 'CHL-001', rentCharge: 1000, date: new Date('2026-11-03') },
      { id: 'del-2', challanNumber: 'CHL-002', rentCharge: 500, date: new Date('2026-11-04') },
    ];
    // Payment of 1200 specifically marked for del-1: 1000 pays del-1, 200 rolls over to del-2
    const payments = [
      { deliveryId: 'del-1', amountPaid: 1200 },
    ];
    const res = reconcileDeliveriesWithPayments(challans, payments);
    expect(res.get('del-1')?.rentPaymentStatus).toBe('Settled');
    expect(res.get('del-2')?.rentTotalPaid).toBe(200);
    expect(res.get('del-2')?.rentRemainingBalance).toBe(300);
    expect(res.get('del-2')?.rentPaymentStatus).toBe('Not Settled');
  });

  it('matches payments by challanNumber or gpNumber when deliveryId is absent', () => {
    const challans = [
      { id: 'del-1', challanNumber: 'CHL-26-27-0004', gpNumber: 'GP-0004', rentCharge: 11950, date: new Date('2026-11-03') },
      { id: 'del-2', challanNumber: 'CHL-26-27-0005', gpNumber: 'GP-0005', rentCharge: 3300, date: new Date('2026-11-04') },
    ];
    const payments = [
      { challanNumber: 'CHL-26-27-0005', amountPaid: 3300 },
    ];
    const res = reconcileDeliveriesWithPayments(challans, payments);
    expect(res.get('del-1')?.rentPaymentStatus).toBe('Not Settled');
    expect(res.get('del-2')?.rentPaymentStatus).toBe('Settled');
    expect(res.get('del-2')?.rentTotalPaid).toBe(3300);
  });
});

