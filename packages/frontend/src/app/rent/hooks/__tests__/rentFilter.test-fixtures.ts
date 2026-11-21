import type { RentSummaryDto } from '@cold-storage/contracts';

export function createMockAccount(overrides: Partial<RentSummaryDto> = {}): RentSummaryDto {
  return {
    grnId: 'grn-1',
    grnNumber: 'GRN-101',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    customerName: 'Kisan Traders',
    commodityName: 'Potato',
    chamber: 'CH-01',
    inwardDate: new Date('2026-03-01'),
    totalBags: 100,
    deliveredBags: 40,
    remainingBags: 60,
    bagPrice: 40,
    rentType: 'Seasonal',
    rentAmount: 4000,
    rentMonths: 10,
    totalPaid: 0,
    remainingBalance: 4000,
    paymentStatus: 'Not Settled',
    rentState: 'PENDING',
    payments: [],
    extensions: [],
    totalDue: 4000,
    ...overrides,
  };
}

export function createStandardAccounts(): RentSummaryDto[] {
  const account1 = createMockAccount({
    grnId: 'grn-1',
    grnNumber: 'GRN-101',
    customerName: 'Kisan Traders',
    commodityName: 'Potato',
    chamber: 'CH-01',
    rentType: 'Seasonal',
    rentAmount: 4000,
    totalPaid: 0,
    remainingBalance: 4000,
    paymentStatus: 'Not Settled',
  });

  const account2 = createMockAccount({
    grnId: 'grn-2',
    grnNumber: 'GRN-102',
    customerName: 'Ramesh Agro',
    commodityName: 'Wheat',
    chamber: 'CH-02',
    rentType: 'Seasonal',
    rentAmount: 5000,
    totalPaid: 5000,
    remainingBalance: 0,
    paymentStatus: 'Settled',
    rentState: 'SETTLED',
    payments: [
      {
        id: 'rp-1',
        facilityId: 'fac-1',
        grnId: 'grn-2',
        grnNumber: 'GRN-102',
        receiptNumber: 'RCPT-26-27-0099',
        amountPaid: 5000,
        paymentMode: 'Cash',
        paymentDate: new Date('2026-03-05'),
        notes: null,
        createdBy: 'usr-1',
        createdAt: new Date('2026-03-05'),
      },
    ],
  });

  const account3 = createMockAccount({
    grnId: 'grn-3',
    grnNumber: 'GRN-103',
    customerName: 'Suresh Farms',
    commodityName: 'Onion',
    chamber: 'CH-03',
    rentType: 'Monthly',
    rentAmount: 0,
    totalPaid: 0,
    remainingBalance: 0,
    paymentStatus: 'Settled',
  });

  const account4 = createMockAccount({
    grnId: 'grn-4',
    grnNumber: 'GRN-104',
    customerName: 'Anil Traders',
    commodityName: 'Apple',
    chamber: 'CH-04',
    rentType: 'Seasonal',
    rentAmount: 6000,
    totalPaid: 2000,
    remainingBalance: 4000,
    paymentStatus: 'Not Settled',
  });

  return [account1, account2, account3, account4];
}
