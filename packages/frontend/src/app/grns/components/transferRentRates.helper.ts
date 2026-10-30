import {
  resolveOutwardRates,
  type Commodity,
  type Grn,
} from '@cold-storage/contracts';

export interface TransferRatesResult {
  seasonalRates: { small: number; big: number };
  monthlyRates: { small: number; big: number };
}

/**
 * Resolves effective Seasonal and Monthly rates for Transfer Ownership.
 *
 * Rate hierarchy matches backend `computeExpectedDeliveryRent`:
 * 1. Stored agreed rates on the GRN win outright.
 * 2. If agreed rates are absent, look up the commodity's active controller rate row.
 * 3. Monthly rates for Jan/Feb extensions use the active Monthly controller rate.
 * 4. Falls back to canonical 10/15 reference rates only when no rate config exists.
 */
export function resolveTransferRates(
  grn: Pick<Grn, 'rentType' | 'smallBagPrice' | 'bigBagPrice' | 'bagPrice'>,
  commodity?: Pick<Commodity, 'rates'> | null,
): TransferRatesResult {
  const agreedRates = resolveOutwardRates(grn.rentType, {
    smallBagPrice: grn.smallBagPrice,
    bigBagPrice: grn.bigBagPrice,
    bagPrice: grn.bagPrice,
  });

  const hasAgreedRates =
    grn.smallBagPrice != null || grn.bigBagPrice != null || grn.bagPrice != null;

  const seasonalRateDoc = commodity?.rates?.find(
    (r) => r.rentType === 'Seasonal' && r.isActive !== false,
  );
  const monthlyRateDoc = commodity?.rates?.find(
    (r) => r.rentType === 'Monthly' && r.isActive !== false,
  );

  const seasonalRates = hasAgreedRates
    ? agreedRates
    : seasonalRateDoc
      ? { small: seasonalRateDoc.smallRate, big: seasonalRateDoc.bigRate }
      : agreedRates;

  const monthlyRates = monthlyRateDoc
    ? { small: monthlyRateDoc.smallRate, big: monthlyRateDoc.bigRate }
    : hasAgreedRates && grn.rentType === 'Monthly'
      ? agreedRates
      : seasonalRates;

  return { seasonalRates, monthlyRates };
}

