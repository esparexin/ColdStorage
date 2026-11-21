export interface MovementSnapshot {
  date: Date;
  type: string;
  deliveredBags: number;
  closingBags: number;
}

export interface OccupancyCalculationInput {
  grnId: string;
  grnNumber: string;
  inwardDate: Date;
  totalBags: number;
  bagRate: number;
  movements: MovementSnapshot[];
  asOfDate?: Date;
  prorationMode?: 'full_month' | 'daily_prorate';
}

/** Monthly occupancy: per-cycle opening bags × rate, stops at 0 remaining. */
export function calculateMonthlyOccupancy(input: OccupancyCalculationInput) {
  const { grnId, grnNumber, inwardDate, totalBags, bagRate, movements } = input;
  if (totalBags <= 0 || bagRate <= 0) return [];

  const inDate = new Date(inwardDate);
  const asOf = input.asOfDate ? new Date(input.asOfDate) : new Date();
  const periods = [];

  const sortedMovements = [...movements].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let currentOpening = totalBags;
  let cycleStart = new Date(inDate);
  let periodIndex = 1;

  while (cycleStart <= asOf && currentOpening > 0) {
    const nextCycleMonth = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate());
    const cycleEnd = new Date(nextCycleMonth.getTime() - 24 * 60 * 60 * 1000);

    const movementsInCycle = sortedMovements.filter((m) => {
      const mDate = new Date(m.date);
      return mDate >= cycleStart && mDate < nextCycleMonth;
    });

    let deliveredInCycle = 0;
    let periodOutwardDate: Date | null = null;
    let endOfCycleRemaining = currentOpening;

    for (const m of movementsInCycle) {
      if (m.type === 'OUTWARD' || m.type === 'PARTIAL_OUTWARD' || m.type === 'FINAL_OUTWARD') {
        deliveredInCycle += m.deliveredBags;
        endOfCycleRemaining = Math.max(0, endOfCycleRemaining - m.deliveredBags);
        periodOutwardDate = new Date(m.date);
      } else if (m.type === 'DELIVERY_REVERSAL') {
        deliveredInCycle = Math.max(0, deliveredInCycle - m.deliveredBags);
        endOfCycleRemaining = endOfCycleRemaining + m.deliveredBags;
      }
    }

    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const billingPeriod = `${fmt(cycleStart)} – ${fmt(cycleEnd)}`;
    const applicableMonth = cycleStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const occupancyBags = currentOpening;
    const calculatedCharge = Number((occupancyBags * bagRate).toFixed(2));

    periods.push({
      grnId,
      grnNumber,
      inwardDate: inDate,
      outwardDate: periodOutwardDate,
      billingPeriod,
      applicableMonth,
      periodIndex,
      openingBags: currentOpening,
      deliveredBags: deliveredInCycle,
      remainingBags: endOfCycleRemaining,
      occupancyBags,
      bagRate,
      calculatedCharge,
    });

    currentOpening = endOfCycleRemaining;
    if (currentOpening <= 0) break;
    cycleStart = nextCycleMonth;
    periodIndex++;
  }

  return periods;
}
