'use client';

import { useState } from 'react';
import { isHybridBagCategory, type OperationalBagType } from '@cold-storage/contracts';
import type { BagConfirmationValue } from './bagConfirmation.helper';

export function useMergeRepackForm() {
  const [destinationChamber, setDestinationChamber] = useState<string>('');
  const [partyMark, setPartyMark] = useState<string>('');
  const [storageMark, setStorageMark] = useState<string>('');
  const [repackMode, setRepackMode] = useState(false);
  const [repackBagType, setRepackBagType] = useState<OperationalBagType>('S/B');
  const [repackSmall, setRepackSmall] = useState<number | ''>('');
  const [repackBig, setRepackBig] = useState<number | ''>('');
  const [repackQuantity, setRepackQuantity] = useState<number | ''>('');
  const [referenceWeight, setReferenceWeight] = useState<number | ''>('');
  const [repackSeasonalBagPrice, setRepackSeasonalBagPrice] = useState<number | ''>('');
  const [repackMonthlyBagPrice, setRepackMonthlyBagPrice] = useState<number | ''>('');
  const [repackBagPrice, setRepackBagPrice] = useState<number | ''>('');

  const applyDerivedRepackDefaults = (derived: BagConfirmationValue, _totalBags?: number) => {
    setRepackBagType(isHybridBagCategory(derived.category) ? 'Hybrid' : 'S/B');
    setRepackQuantity('');
    setRepackSmall('');
    setRepackBig('');
    setRepackSeasonalBagPrice(derived.seasonalBagPrice);
    setRepackMonthlyBagPrice(derived.monthlyBagPrice);
    setRepackBagPrice(derived.bagPrice);
  };

  return {
    destinationChamber,
    setDestinationChamber,
    partyMark,
    setPartyMark,
    storageMark,
    setStorageMark,
    repackMode,
    setRepackMode,
    repackBagType,
    setRepackBagType,
    repackSmall,
    setRepackSmall,
    repackBig,
    setRepackBig,
    repackQuantity,
    setRepackQuantity,
    referenceWeight,
    setReferenceWeight,
    repackSeasonalBagPrice,
    setRepackSeasonalBagPrice,
    repackMonthlyBagPrice,
    setRepackMonthlyBagPrice,
    repackBagPrice,
    setRepackBagPrice,
    applyDerivedRepackDefaults,
  };
}
