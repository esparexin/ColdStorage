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
    rentTotalPaid: 0,
  });

  const d3 = makeMockDelivery({
    id: 'del-3',
    challanNumber: 'CHL-0003',
    grnNumber: '1003',
    customerName: 'Naresh Verma',
    commodityName: 'Chilli',
    vehicleNumber: 'AP09CC3333',
    marks: 'LOT-GREEN',
    rentPaymentStatus: 'Not Settled',
    rentRemainingBalance: 1500,
    rentTotalPaid: 1500,
  });

  const d4ZeroPay = makeMockDelivery({
    id: 'del-4',
    challanNumber: 'CHL-0004',
    grnNumber: '1004',
    customerName: 'Mahesh Rao',
    commodityName: 'Cotton',
    vehicleNumber: 'TS10DD4444',
    marks: 'LOT-YELLOW',
    rentPaymentStatus: 'Not Settled',
    rentRemainingBalance: 5000,
    rentTotalPaid: 0,
  });

  const all = [d1, d2, d3, d4ZeroPay];

  it('returns all deliveries when search and filter are empty', () => {
    expect(filterDeliveries(all, '', '')).toHaveLength(4);
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

  it('filters by settled rent status and excludes pending/partial records', () => {
    const res = filterDeliveries(all, '', 'SETTLED');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-1');
  });

  it('filters by DUE rent status (both unpaid and partially paid with outstanding balance)', () => {
    const res = filterDeliveries(all, '', 'DUE');
    expect(res).toHaveLength(3);
    expect(res.map((d) => d.id)).toEqual(['del-2', 'del-3', 'del-4']);
  });

  it('supports legacy UNSETTLED alias mapping to due payments', () => {
    const res = filterDeliveries(all, '', 'UNSETTLED');
    expect(res).toHaveLength(3);
    expect(res.map((d) => d.id)).toEqual(['del-2', 'del-3', 'del-4']);
  });

  it('combines search and rent status filters', () => {
    const res1 = filterDeliveries(all, 'ravi', 'SETTLED');
    expect(res1).toHaveLength(1);

    const res2 = filterDeliveries(all, 'ravi', 'DUE');
    expect(res2).toHaveLength(0);

    const res3 = filterDeliveries(all, 'naresh', 'DUE');
    expect(res3).toHaveLength(1);
    expect(res3[0].id).toBe('del-3');
  });

  it('filters by statusTab ACTIVE (issued with remaining stock)', () => {
    const activeDel = makeMockDelivery({ id: 'del-act', status: 'ISSUED', remainingTotalBags: 100 });
    const closedDel = makeMockDelivery({ id: 'del-cls', status: 'ISSUED', remainingTotalBags: 0 });
    const reversedDel = makeMockDelivery({ id: 'del-rev', status: 'REVERSED', remainingTotalBags: 50 });

    const testSet = [activeDel, closedDel, reversedDel];
    const res = filterDeliveries(testSet, '', '', 'ACTIVE');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-act');
  });

  it('filters by statusTab CLOSED (issued with zero remaining stock)', () => {
    const activeDel = makeMockDelivery({ id: 'del-act', status: 'ISSUED', remainingTotalBags: 100 });
    const closedDel = makeMockDelivery({ id: 'del-cls', status: 'ISSUED', remainingTotalBags: 0 });
    const reversedDel = makeMockDelivery({ id: 'del-rev', status: 'REVERSED', remainingTotalBags: 0 });

    const testSet = [activeDel, closedDel, reversedDel];
    const res = filterDeliveries(testSet, '', '', 'CLOSED');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-cls');
  });

  it('filters by statusTab DUE (issued with outstanding rent dues)', () => {
    const res = filterDeliveries(all, '', '', 'DUE');
    expect(res.map((d) => d.id)).toEqual(['del-2', 'del-3', 'del-4']);
  });

  it('combines statusTab CLOSED with rentStatusFilter DUE', () => {
    const closedPaid = makeMockDelivery({
      id: 'del-c1',
      status: 'ISSUED',
      remainingTotalBags: 0,
      rentPaymentStatus: 'Settled',
      rentRemainingBalance: 0,
    });
    const closedDue = makeMockDelivery({
      id: 'del-c2',
      status: 'ISSUED',
      remainingTotalBags: 0,
      rentPaymentStatus: 'Not Settled',
      rentRemainingBalance: 2000,
    });
    const activeDue = makeMockDelivery({
      id: 'del-a1',
      status: 'ISSUED',
      remainingTotalBags: 50,
      rentPaymentStatus: 'Not Settled',
      rentRemainingBalance: 1000,
    });

    const set = [closedPaid, closedDue, activeDue];
    const res = filterDeliveries(set, '', 'DUE', 'CLOSED');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('del-c2');
  });

  it('returns empty array when no challans match criteria', () => {
    const res = filterDeliveries(all, 'nonexistent-query', '', '');
    expect(res).toHaveLength(0);
  });
});

