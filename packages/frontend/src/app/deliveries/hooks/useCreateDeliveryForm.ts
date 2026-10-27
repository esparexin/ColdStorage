import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deriveHybridRateVisibility, isHybridBagCategory, type DeliveryChallan, type DeliverySummary, type Grn, type GrnInventorySummary, type OutwardBagCategory,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useRentGate } from '@/hooks/useRentGate';
import { validateDeliveryForm } from './deliveryFormValidation.helper';
import { clearWithdrawalCounts, resolveValidationStock } from './eligibleGrn.helper';
import { buildDeliveryPayload } from './deliveryPayload.helper';
import { computeOutwardRentCharge, resolveOutwardBillableMonths } from './deliveryRent.helper';
import { submitDeliveryRequest } from './deliverySubmit.helper';
import { useDualSectionDelivery } from './useDualSectionDelivery';
import type { GrnWithdrawal } from '../types';

export function useCreateDeliveryForm(
  facilityId: string,
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void,
  initialGrnId?: string,
) {
  const [availableGrns, setAvailableGrns] = useState<Grn[]>([]);
  const [createGrnId, setCreateGrnId] = useState('');
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null); const [loadingGrnSummary, setLoadingGrnSummary] = useState(false);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]); const [bagCategory, setBagCategory] = useState<OutwardBagCategory>('S/B');
  const [manualBagPrice, setManualBagPrice] = useState<number | ''>(''); const [seasonalBagPrice, setSeasonalBagPrice] = useState<number | ''>(''); const [monthlyBagPrice, setMonthlyBagPrice] = useState<number | ''>('');
  const [withdrawal, setWithdrawal] = useState<GrnWithdrawal>({ availableSmall: 0, availableBig: 0, smallBags: '', bigBags: '', quantity: '' });
  const [createVehicleNumber, setCreateVehicleNumber] = useState(''); const [createDriverName, setCreateDriverName] = useState('');
  const [createWeight, setCreateWeight] = useState<number | ''>(''); const [createGpNumber, setCreateGpNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState(''); const [idempotencyKey, setIdempotencyKey] = useState(() => `del-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [modalError, setModalError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false); const [hamaliRate, setHamaliRate] = useState<number>(0);
  const [seasonalCommodityRates, setSeasonalCommodityRates] = useState<{ small: number; big: number } | null>(null); const [monthlyCommodityRates, setMonthlyCommodityRates] = useState<{ small: number; big: number } | null>(null);
  const rentGate = useRentGate();

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => (!prev[key] ? prev : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))));
  };

  const fetchAvailableGrns = useCallback(async () => {
    if (!facilityId) return;
    try {
      const res = await requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns?status=OPEN&limit=100`);
      if (res.ok) {
        const data = (await res.json()) as { items?: Grn[] };
        setAvailableGrns((data.items ?? []).filter((g) => (g.closingBags ?? g.bags) > 0));
      }
    } catch { /* Graceful */ }
  }, [facilityId]);

  const fetchNextGpNumber = useCallback(async () => {
    if (!facilityId) return;
    try {
      const res = await requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/deliveries/next-gp-number`);
      if (res.ok) {
        const data = (await res.json()) as { nextGpNumber?: string };
        if (data.nextGpNumber) setCreateGpNumber((prev) => (prev ? prev : data.nextGpNumber!));
      }
    } catch {
      setCreateGpNumber((prev) => (prev ? prev : 'GP-0001'));
    }
  }, [facilityId]);

  useEffect(() => { void fetchNextGpNumber(); }, [fetchNextGpNumber]);

  const handleSelectGrn = useCallback(
    async (grnId: string) => {
      setCreateGrnId(grnId); setGrnSummary(null);
      setWithdrawal({ availableSmall: 0, availableBig: 0, smallBags: '', bigBags: '', quantity: '' });
      setFieldErrors({}); setSeasonalCommodityRates(null); setMonthlyCommodityRates(null); setHamaliRate(0);
      rentGate.resetRentGate();
      if (!facilityId || !grnId) return;

      setLoadingGrnSummary(true); setModalError(null);
      const matched = availableGrns.find((g) => g.id === grnId || g.grnNumber === grnId);
      const targetId = matched ? matched.id : grnId;
      if (matched && (matched.closingBags ?? matched.bags) <= 0) { setModalError('Consignment has no available stock remaining for outward delivery'); return; }
      if (matched && matched.status === 'CLOSED') { setModalError(`Consignment '${matched.grnNumber}' is CLOSED. Select an open surviving consignment.`); return; }
      const isHybridGrn = matched?.bagType === 'Hybrid' || isHybridBagCategory(matched?.bagType);
      const grnPrice = matched?.bagPrice ?? '';
      setBagCategory(isHybridGrn ? 'Hybrid' : 'S/B');
      setManualBagPrice(grnPrice); setSeasonalBagPrice(grnPrice); setMonthlyBagPrice(grnPrice);
      if (typeof matched?.hamaliRate === 'number') setHamaliRate(matched.hamaliRate);

      const commodityId = matched?.commodityId;
      try {
        const [invRes, , rateRes] = await Promise.all([
          requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(targetId)}/inventory-summary`),
          rentGate.refreshRentGate(facilityId, targetId),
          commodityId ? requestWithAuth(`/api/commodities/${encodeURIComponent(commodityId)}/rates`) : Promise.resolve(null),
        ]);
        if (invRes.ok) {
          const data = (await invRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);
          const { availableSmallBags: s, availableBigBags: b } = data.summary;
          const isSb = matched?.bagType === 'S/B' && !matched?.isCompositionVerified;
          setWithdrawal({ availableSmall: isSb ? s + b : s, availableBig: isSb ? s + b : b, smallBags: '', bigBags: '', quantity: '' });
        }
        if (rateRes?.ok) {
          const rData = (await rateRes.json()) as { items?: Array<{ rentType: string; smallRate: number; bigRate: number; isActive?: boolean }>; rate?: { smallRate: number; bigRate: number }; hamaliRate?: number };
          if (matched?.hamaliRate == null && typeof rData.hamaliRate === 'number') setHamaliRate(rData.hamaliRate);
          const s = Array.isArray(rData.items) ? rData.items.find((r) => r.rentType === 'Seasonal' && r.isActive !== false) : null;
          const m = Array.isArray(rData.items) ? rData.items.find((r) => r.rentType === 'Monthly' && r.isActive !== false) : null;
          if (s) { setSeasonalCommodityRates({ small: s.smallRate, big: s.bigRate }); if (grnPrice === '') setSeasonalBagPrice(s.smallRate); }
          if (m) { setMonthlyCommodityRates({ small: m.smallRate, big: m.bigRate }); if (grnPrice === '') setMonthlyBagPrice(m.smallRate); }
          else if (rData.rate) { setMonthlyCommodityRates({ small: rData.rate.smallRate, big: rData.rate.bigRate }); if (grnPrice === '') setMonthlyBagPrice(rData.rate.smallRate); }
        }
      } catch {
        setModalError('Failed to load GRN stock summary');
      } finally { setLoadingGrnSummary(false); }
    },
    [facilityId, rentGate, availableGrns],
  );

  const autoSelectedGrnRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialGrnId && availableGrns.length > 0 && !createGrnId && autoSelectedGrnRef.current !== initialGrnId) {
      const match = availableGrns.find((g) => g.id === initialGrnId || g.grnNumber === initialGrnId) ?? availableGrns.find((g) => g.remarks?.includes(`GRN ${initialGrnId}`) || g.remarks?.includes(initialGrnId));
      if (match) { autoSelectedGrnRef.current = initialGrnId; void handleSelectGrn(match.id); }
    }
  }, [initialGrnId, availableGrns, createGrnId, handleSelectGrn]);

  const selectedGrn = availableGrns.find((g) => g.id === createGrnId) || null;
  const isLoanHoldActive = Boolean(selectedGrn?.loanStatus === 'TAKEN');
  const deliveryDateVal = createDate || new Date().toISOString().split('T')[0];
  const billableRentMonths = resolveOutwardBillableMonths({
    rentType: selectedGrn?.rentType ?? 'Seasonal', inwardDate: selectedGrn?.date,
    deliveryDate: deliveryDateVal, rentMonths: selectedGrn?.rentMonths,
  });

  const dualSection = useDualSectionDelivery({
    facilityId, selectedGrn, rentSummary: rentGate.rentSummary, createDate: deliveryDateVal,
    billableRentMonths, seasonalCommodityRates, monthlyCommodityRates,
  });

  const isHybrid = isHybridBagCategory(bagCategory);
  const smallBags = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0; const bigBags = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const hybridQty = typeof withdrawal.quantity === 'number' ? withdrawal.quantity : 0;
  const totalWithdrawingBags = dualSection.isDualSection ? dualSection.totalWithdrawingBags : (isHybrid ? hybridQty : smallBags + bigBags);

  const rateVisibility = deriveHybridRateVisibility({
    rentType: selectedGrn?.rentType ?? 'Seasonal', inwardDate: selectedGrn?.date, deliveryDate: deliveryDateVal,
  });

  const standardOutwardRent = computeOutwardRentCharge({
    rentType: selectedGrn?.rentType ?? 'Seasonal', bagCategory, smallBags: isHybrid ? 0 : smallBags, bigBags: isHybrid ? 0 : bigBags, quantity: isHybrid ? hybridQty : undefined,
    manualBagPrice: isHybrid && typeof manualBagPrice === 'number' ? manualBagPrice : undefined,
    seasonalBagPrice: isHybrid && typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined,
    monthlyBagPrice: isHybrid && typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined,
    rentMonths: billableRentMonths, inwardDate: selectedGrn?.date, deliveryDate: deliveryDateVal,
    smallBagPrice: selectedGrn?.smallBagPrice ?? (selectedGrn?.rentType === 'Monthly' ? monthlyCommodityRates?.small : seasonalCommodityRates?.small),
    bigBagPrice: selectedGrn?.bigBagPrice ?? (selectedGrn?.rentType === 'Monthly' ? monthlyCommodityRates?.big : seasonalCommodityRates?.big),
    bagPrice: selectedGrn?.bagPrice, monthlySmallBagPrice: monthlyCommodityRates?.small, monthlyBigBagPrice: monthlyCommodityRates?.big,
  });
  const outwardRent = dualSection.isDualSection ? dualSection.totalOutwardRent : standardOutwardRent;

  const handleBagCategoryChange = (cat: OutwardBagCategory) => {
    setBagCategory(cat); setWithdrawal((prev) => clearWithdrawalCounts(prev));
    clearFieldError('bags'); clearFieldError('smallBags'); clearFieldError('bigBags'); clearFieldError('bagPrice'); clearFieldError('seasonalBagPrice'); clearFieldError('monthlyBagPrice');
  };

  const handleQuantityChange = (val: number | '') => { setWithdrawal((prev) => ({ ...prev, quantity: val })); clearFieldError('bags'); };
  const setWithdrawalSmallBags = (val: number | '') => { setWithdrawal((prev) => ({ ...prev, smallBags: val })); clearFieldError('bags'); clearFieldError('smallBags'); };
  const setWithdrawalBigBags = (val: number | '') => { setWithdrawal((prev) => ({ ...prev, bigBags: val })); clearFieldError('bags'); clearFieldError('bigBags'); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId) return;

    if (dualSection.isDualSection) {
      if (!dualSection.isDualSectionValid) { setModalError('Please resolve errors in Section A and Section B allocations'); return; }
    } else {
      const isSeg = (grnSummary?.availableSmallBags ?? 0) > 0 && (grnSummary?.availableBigBags ?? 0) > 0;
      const totalAvail = (grnSummary?.availableSmallBags ?? 0) + (grnSummary?.availableBigBags ?? 0);
      const isUnsegregatedSb = selectedGrn?.bagType === 'S/B' && !selectedGrn?.isCompositionVerified;
      const isCombinedPool = Boolean(isUnsegregatedSb && !isSeg);
      const validationStock = resolveValidationStock(grnSummary, withdrawal);
      const validation = validateDeliveryForm({
        createGrnId, createDate, totalWithdrawingBags, smallBags: isHybrid ? 0 : smallBags, bigBags: isHybrid ? 0 : bigBags,
        availableSmall: isCombinedPool ? totalAvail : (grnSummary?.availableSmallBags ?? validationStock.availableSmall),
        availableBig: isCombinedPool ? totalAvail : (grnSummary?.availableBigBags ?? validationStock.availableBig),
        availableTotal: totalAvail, isCombinedPool, isHybrid, bagPrice: manualBagPrice,
        seasonalBagPrice: typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined,
        monthlyBagPrice: typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined,
        showSeasonalRate: isHybrid && rateVisibility.showSeasonalRate, showMonthlyRate: isHybrid && rateVisibility.showMonthlyRate,
        createVehicleNumber, createGpNumber, createDriverName, isLoanHoldActive, selectedGrnNumber: selectedGrn?.grnNumber, selectedGrnDate: selectedGrn?.date,
      });
      if (!validation.isValid) { setFieldErrors(validation.errors); setModalError(validation.modalError); return; }
    }
    setSubmitting(true); setModalError(null); setFieldErrors({});

    try {
      let payloadInput;
      if (dualSection.isDualSection) {
        const { unclassifiedDispatch, confirmedDispatch } = dualSection.buildAllocations();
        payloadInput = {
          grnId: createGrnId, createDate,
          smallBags: (unclassifiedDispatch?.smallBags ?? 0) + (confirmedDispatch?.smallBags ?? 0),
          bigBags: (unclassifiedDispatch?.bigBags ?? 0) + (confirmedDispatch?.bigBags ?? 0),
          quantity: dualSection.totalWithdrawingBags, bagType: 'S/B' as const, bagCategory: 'S/B' as const,
          rentCharge: outwardRent, unclassifiedDispatch, confirmedDispatch,
          createVehicleNumber, createDriverName, createWeight, createGpNumber, createRemarks, idempotencyKey,
        };
      } else {
        payloadInput = {
          grnId: createGrnId, createDate, smallBags: isHybrid ? 0 : smallBags, bigBags: isHybrid ? 0 : bigBags, quantity: isHybrid ? hybridQty : undefined,
          bagCategory, bagType: isHybrid ? 'Hybrid' as const : 'S/B' as const, bagPrice: isHybrid && typeof manualBagPrice === 'number' ? manualBagPrice : undefined,
          seasonalBagPrice: isHybrid && typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined,
          monthlyBagPrice: isHybrid && typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined,
          rentCharge: outwardRent, createVehicleNumber, createDriverName, createWeight, createGpNumber, createRemarks, idempotencyKey,
        };
      }
      const responseData = await submitDeliveryRequest(facilityId, buildDeliveryPayload(payloadInput));
      setIdempotencyKey(`del-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      onSuccess(responseData.delivery, responseData.summary);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to issue delivery challan');
    } finally { setSubmitting(false); }
  };

  const availableStock = grnSummary ? grnSummary.availableSmallBags + grnSummary.availableBigBags : (selectedGrn?.closingBags ?? selectedGrn?.bags ?? 0);
  const isSegregatedLot = (grnSummary?.availableSmallBags ?? 0) > 0 && (grnSummary?.availableBigBags ?? 0) > 0;
  const isUnsegregatedLot = selectedGrn?.bagType === 'S/B' && !selectedGrn?.isCompositionVerified && !isSegregatedLot;
  const perSideValid = isHybrid || isUnsegregatedLot || (smallBags <= (grnSummary?.availableSmallBags ?? withdrawal.availableSmall) && bigBags <= (grnSummary?.availableBigBags ?? withdrawal.availableBig));
  const hasValidPrice = !isHybrid || (
    (!rateVisibility.showSeasonalRate || (typeof seasonalBagPrice === 'number' && seasonalBagPrice > 0)) &&
    (!rateVisibility.showMonthlyRate || (typeof monthlyBagPrice === 'number' && monthlyBagPrice > 0)) &&
    (rateVisibility.showSeasonalRate || rateVisibility.showMonthlyRate || (typeof manualBagPrice === 'number' && manualBagPrice > 0))
  );
  const isFormValid = Boolean(
    selectedGrn && createDate.trim() && createVehicleNumber.trim() && createGpNumber.trim() &&
    createDriverName.trim() && !isLoanHoldActive && !submitting &&
    (dualSection.isDualSection ? dualSection.isDualSectionValid : (totalWithdrawingBags > 0 && totalWithdrawingBags <= availableStock && perSideValid && hasValidPrice)),
  );

  return {
    availableGrns, createGrnId, grnSummary, loadingGrnSummary, createDate, bagCategory, outwardRent, withdrawal,
    setCreateDate: (v: string) => { setCreateDate(v); clearFieldError('date'); },
    setBagCategory: handleBagCategoryChange, manualBagPrice, seasonalBagPrice, monthlyBagPrice, rateVisibility,
    setManualBagPrice: (v: number | '') => { setManualBagPrice(v); clearFieldError('bagPrice'); },
    setSeasonalBagPrice: (v: number | '') => { setSeasonalBagPrice(v); clearFieldError('seasonalBagPrice'); },
    setMonthlyBagPrice: (v: number | '') => { setMonthlyBagPrice(v); clearFieldError('monthlyBagPrice'); },
    setWithdrawalSmallBags, setWithdrawalBigBags, setWithdrawalQuantity: handleQuantityChange,
    createVehicleNumber, setCreateVehicleNumber: (v: string) => { setCreateVehicleNumber(v); clearFieldError('vehicleNumber'); },
    createDriverName, setCreateDriverName: (v: string) => { setCreateDriverName(v); clearFieldError('driverName'); },
    createWeight, setCreateWeight, createGpNumber, setCreateGpNumber: (v: string) => { setCreateGpNumber(v); clearFieldError('gpNumber'); },
    createRemarks, setCreateRemarks, modalError, fieldErrors, clearFieldError, submitting,
    hamaliRate, totalWithdrawingBags, fetchAvailableGrns, handleSelectGrn, handleSubmit, selectedGrn, isLoanHoldActive,
    billableRentMonths, seasonalCommodityRates, monthlyCommodityRates, isFormValid, rentSummary: rentGate.rentSummary,
    rentLoading: rentGate.rentLoading, refreshRentGate: rentGate.refreshRentGate, dualSection,
  };
}
