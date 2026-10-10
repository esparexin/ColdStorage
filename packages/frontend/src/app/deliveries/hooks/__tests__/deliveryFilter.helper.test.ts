import { describe, expect, it } from 'vitest';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { filterDeliveries } from '../deliveryFilter.helper';

function makeMockDelivery(overrides: Partial<DeliveryChallan> = {}): DeliveryChallan {
  return {
    id: 'del-1',
    facilityId: 'fac-1',
    challanNumber: 'CHL-2026-0001',
    date: new Date('2026-10-05'),
    grnId: 'grn-1',
    grnNumber: '1001',
    customerId: 'cust-1',
    customerName: 'Kalyan Farmers',
    commodityId: 'cmd-wheat',
    commodityName: 'Wheat',
    chamber: 'CH-01',
    smallBags: 50,
    bigBags: 0,
    totalBags: 50,
    marks: 'LOT-A',
    vehicleNumber: 'AP07BB1234',
    driverName: 'Ramesh',
    status: 'ISSUED',
    rentPaymentStatus: 'Settled',
    rentRemainingBalance: 0,
    rentCharge: 5000,
    issuedBy: 'usr-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('filterDeliveries', () => {
  const d1 = makeMockDelivery({
    id: 'del-1',
    challanNumber: 'CHL-0001',
    grnNumber: '1001',
    customerName: 'Ravi Kumar',
    commodityName: 'Wheat',
    vehicleNumber: 'AP01AA1111',
    marks: 'LOT-RED',
    rentPaymentStatus: 'Settled',
    rentRemainingBalance: 0,
  });

  const d2 = makeMockDelivery({
    id: 'del-2',
    challanNumber: 'CHL-0002',
    grnNumber: '1002',
    customerName: 'Suresh Patel',
    commodityName: 'Paddy',
    vehicleNumber: 'TS02BB2222',
    marks: 'LOT-BLUE',
    rentPaymentStatus: 'Not Settled',
    rentRemainingBalance: 3000,
  });

  const all = [d1, d2];

  it('returns all deliveries when search and filter are empty', () => {
    expect(filterDeliveries(all, '', '')).toHaveLength(2);
  });

  it('filters by challan number substring', () => {
    const res = filterDeliveries(all, '0001', '');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-1');
  });

  it('filters by customer name case-insensitively', () => {
    const res = filterDeliveries(all, 'suresh', '');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-2');
  });

  it('filters by commodity name', () => {
    const res = filterDeliveries(all, 'wheat', '');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-1');
  });

  it('filters by vehicle number', () => {
    const res = filterDeliveries(all, 'ts02', '');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-2');
  });

  it('filters by marks', () => {
    const res = filterDeliveries(all, 'lot-blue', '');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-2');
  });

  it('filters by settled rent status', () => {
    const res = filterDeliveries(all, '', 'SETTLED');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-1');
  });

  it('filters by pending rent status', () => {
    const res = filterDeliveries(all, '', 'PENDING');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-2');
  });

  it('combines search and rent status filters', () => {
    const res1 = filterDeliveries(all, 'ravi', 'SETTLED');
    expect(res1).toHaveLength(1);

    const res2 = filterDeliveries(all, 'ravi', 'PENDING');
    expect(res2).toHaveLength(0);
  });
});
