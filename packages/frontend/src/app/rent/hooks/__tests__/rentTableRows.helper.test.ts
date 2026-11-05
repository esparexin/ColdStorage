import { describe, expect, it } from 'vitest';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { filterRentBillRows, projectRentBillRows } from '../rentTableRows.helper';

function makeMockAccount(overrides: Partial<RentSummaryDto> = {}): RentSummaryDto {
  return {
    grnId: 'grn-5aafa407-5fa6-4deb-a3d0-08bb7360a637',
    grnNumber: '0007',
    facilityId: 'fac-1',
    customerId: 'cust-67ad2116-3fae-438c-8f17-5da12cd1dfd7',
    customerName: 'Kalyan',
    commodityId: 'cmd-1',
    commodityName: 'Mirchi',
    chamber: 'CH-1',
    inwardDate: new Date('2026-11-02'),
    totalBags: 140,
    bagType: 'S+B',
    smallBags: 70,
    bigBags: 70,
    deliveredBags: 90,
    remainingBags: 50,
    bagPrice: null,
    smallBagPrice: 125,
    bigBagPrice: 205,
    totalBagsWeight: null,
    rentType: 'Seasonal',
    rentAmount: 0,
    outwardRentCharges: 15250,
    hamaliShare: 0,
    rentMonths: null,
    totalPaid: 0,
    remainingBalance: 15250,
    paymentStatus: 'Not Settled',
    rentState: 'UNBILLED',
    verificationReason: null,
    payments: [],
    extensions: [],
    totalDue: 15250,
    remarks: 'Merged Consignment',
    deliveryBills: [
      {
        deliveryId: 'del-1',
        challanNumber: 'CHL-26-27-0004',
        gpNumber: 'GP-0004',
        date: new Date('2026-11-03'),
        totalBags: 70,
        smallBags: 30,
        bigBags: 40,
        rentCharge: 11950,
        rentTotalPaid: 0,
        rentRemainingBalance: 11950,
        rentPaymentStatus: 'Not Settled',
      },
      {
        deliveryId: 'del-2',
        challanNumber: 'CHL-26-27-0005',
        gpNumber: 'GP-0005',
        date: new Date('2026-11-04'),
        totalBags: 20,
        smallBags: 10,
        bigBags: 10,
        rentCharge: 3300,
        rentTotalPaid: 0,
        rentRemainingBalance: 3300,
        rentPaymentStatus: 'Not Settled',
      },
    ],
    ...overrides,
  };
}

describe('rentTableRows.helper', () => {
  it('projects a GRN with multiple outward gate passes into separate bill rows for Kalyan', () => {
    const kalyanGrn = makeMockAccount();
    const rows = projectRentBillRows([kalyanGrn]);

    expect(rows).toHaveLength(2);
    expect(rows[0].customerName).toBe('Kalyan');
    expect(rows[0].challanNumber).toBe('CHL-26-27-0004');
    expect(rows[0].gpNumber).toBe('GP-0004');
    expect(rows[0].totalDue).toBe(11950);
    expect(rows[0].remainingBalance).toBe(11950);

    expect(rows[1].customerName).toBe('Kalyan');
    expect(rows[1].challanNumber).toBe('CHL-26-27-0005');
    expect(rows[1].gpNumber).toBe('GP-0005');
    expect(rows[1].totalDue).toBe(3300);
    expect(rows[1].remainingBalance).toBe(3300);

    const totalSum = rows.reduce((s, r) => s + r.totalDue, 0);
    expect(totalSum).toBe(15250);
  });

  it('projects single-bill GRN without deliveries into one row', () => {
    const singleGrn = makeMockAccount({
      grnNumber: '0008',
      customerName: 'A SRINIVASULU REDDY RLP',
      rentAmount: 380,
      totalDue: 380,
      remainingBalance: 380,
      deliveryBills: [],
    });

    const rows = projectRentBillRows([singleGrn]);
    expect(rows).toHaveLength(1);
    expect(rows[0].customerName).toBe('A SRINIVASULU REDDY RLP');
    expect(rows[0].totalDue).toBe(380);
  });

  it('filters bill rows by search term matching GP number', () => {
    const kalyanGrn = makeMockAccount();
    const rows = projectRentBillRows([kalyanGrn]);

    const filtered = filterRentBillRows(rows, {
      searchTerm: 'GP-0005',
      statusFilter: '',
      typeFilter: '',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].gpNumber).toBe('GP-0005');
    expect(filtered[0].totalDue).toBe(3300);
  });

  it('filters bill rows by status filter', () => {
    const kalyanGrn = makeMockAccount();
    const rows = projectRentBillRows([kalyanGrn]);

    const unpaid = filterRentBillRows(rows, {
      searchTerm: '',
      statusFilter: 'UNPAID',
      typeFilter: '',
    });
    expect(unpaid).toHaveLength(2);

    const settled = filterRentBillRows(rows, {
      searchTerm: '',
      statusFilter: 'SETTLED',
      typeFilter: '',
    });
    expect(settled).toHaveLength(0);
  });
});

