import type { BagType, RentType } from '../index.js';

/** Deterministic GRN lifecycle fixtures (Phase 0 baseline, no DB). */
export interface LifecycleFixture {
  grnNumber: string;
  customerName: string;
  inwardDate: string;
  commodityId: string;
  bags: number;
  bagType: BagType;
  smallBags?: number | null;
  bigBags?: number | null;
  rentType: RentType;
  rentMonths?: number | null;
  smallRate: number;
  bigRate: number;
  hamaliRate?: number;
}

export const GRN_LIFECYCLE_FIXTURES: LifecycleFixture[] = [
  { grnNumber: '0023', customerName: 'Kalyan', inwardDate: '2023-07-10', commodityId: 'cmd-potato', bags: 200, bagType: 'S/B', rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
  { grnNumber: '0025', customerName: 'Kalyan', inwardDate: '2025-07-10', commodityId: 'cmd-potato', bags: 100, bagType: 'S/B', rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
  { grnNumber: '0026', customerName: 'Balaji', inwardDate: '2026-04-15', commodityId: 'cmd-potato', bags: 100, bagType: 'S/B', rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
  { grnNumber: '24A', customerName: 'Kalyan', inwardDate: '2024-07-10', commodityId: 'cmd-potato', bags: 80, bagType: 'S/B', rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
  { grnNumber: '24B', customerName: 'Meena', inwardDate: '2024-04-15', commodityId: 'cmd-onion', bags: 60, bagType: 'S', smallBags: 60, bigBags: 0, rentType: 'Monthly', rentMonths: 2, smallRate: 12, bigRate: 18 },
  { grnNumber: '24C', customerName: 'Ravi', inwardDate: '2024-05-01', commodityId: 'cmd-potato', bags: 50, bagType: 'B', smallBags: 0, bigBags: 50, rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
  { grnNumber: '24D', customerName: 'Kalyan', inwardDate: '2024-08-01', commodityId: 'cmd-potato', bags: 100, bagType: 'S+B', smallBags: 60, bigBags: 40, rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
  { grnNumber: '27A', customerName: 'Balaji', inwardDate: '2026-06-01', commodityId: 'cmd-potato', bags: 40, bagType: 'S/B', rentType: 'Seasonal_3M', smallRate: 10, bigRate: 15 },
  { grnNumber: '27B', customerName: 'Janaki', inwardDate: '2026-01-15', commodityId: 'cmd-potato', bags: 70, bagType: 'S/B', rentType: 'Seasonal', smallRate: 10, bigRate: 15 },
];
