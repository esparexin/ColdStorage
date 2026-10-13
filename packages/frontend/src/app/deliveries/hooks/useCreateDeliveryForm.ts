import { useCallback, useEffect, useState } from 'react';
import {
  deriveHybridRateVisibility, isHybridBagCategory, type DeliveryChallan, type DeliverySummary, type Grn, type GrnInventorySummary,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useRentGate } from '@/hooks/useRentGate';
import { validateDeliveryForm } from './deliveryFormValidation.helper';
import { buildDeliveryPayload } from './deliveryPayload.helper';
import { computeOutwardRentCharge, resolveOutwardBillableMonths, type OutwardBagCategory } from './deliveryRent.helper';
import { submitDeliveryRequest } from './deliverySubmit.helper';
import type { GrnWithdrawal } from '../types';

export function useCreateDeliveryForm(
  facilityId: string,
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void,
  initialGrnId?: string,
) {
  const [availableGrns, setAvailableGrns] = useState<Grn[]>([]);
  const [createGrnId, setCreateGrnId] = useState('');
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null);
  const [loadingGrnSummary, setLoadingGrnSummary] = useState(false);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bagCategory, setBagCategory] = useState<OutwardBagCategory>('S/B');
  const [manualBagPrice, setManualBagPrice] = useState<number | ''>('');
  const [seasonalBagPrice, setSeasonalBagPrice] = useState<number | ''>('');
  const [monthlyBagPrice, setMonthlyBagPrice] = useState<number | ''>('');
  const [withdrawal, setWithdrawal] = useState<GrnWithdrawal>({
    availableSmall: 0, availableBig: 0, smallBags: '', bigBags: '', quantity: '',
  });
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI'>('Cash');
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createDriverName, setCreateDriverName] = useState('');
  const [createWeight, setCreateWeight] = useState<number | ''>('');
  const [createGpNumber, setCreateGpNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [monthlyCommodityRates, setMonthlyCommodityRates] = useState<{ small: number; big: number } | null>(null);
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
        setAvailableGrns(data.items ?? []);
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
      setCreateGrnId(grnId);
      setGrnSummary(null);
      setWithdrawal({ availableSmall: 0, availableBig: 0, smallBags: '', bigBags: '', quantity: '' });
      setManualBagPrice(''); setSeasonalBagPrice(''); setMonthlyBagPrice('');
      setPaymentAmount(''); setPaymentMode('Cash');
      setFieldErrors({}); setMonthlyCommodityRates(null);
      rentGate.resetRentGate();
      if (!facilityId || !grnId) return;

      setLoadingGrnSummary(true);
      setModalError(null);
      const matched = availableGrns.find((g) => g.id === grnId);
      const commodityId = matched?.commodityId;
      try {
        const [invRes, , rateRes] = await Promise.all([
          requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`),
          rentGate.refreshRentGate(facilityId, grnId),
          commodityId ? requestWithAuth(`/api/commodities/${encodeURIComponent(commodityId)}/rates?rentType=Monthly`) : Promise.resolve(null),
        ]);
        if (invRes.ok) {
          const data = (await invRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);
          const { availableSmallBags: s, availableBigBags: b } = data.summary;
          const totalStock = s + b;
          setBagCategory('S/B');
          setWithdrawal({ availableSmall: totalStock, availableBig: totalStock, smallBags: '', bigBags: '', quantity: '' });
        }
        if (rateRes && rateRes.ok) {
          const rData = (await rateRes.json()) as { rate?: { smallRate: number; bigRate: number } };
          if (rData.rate) setMonthlyCommodityRates({ small: rData.rate.smallRate, big: rData.rate.bigRate });
        }
      } catch {
        setModalError('Failed to load GRN stock summary');
      } finally {
        setLoadingGrnSummary(false);
      }
    },
    [facilityId, rentGate, availableGrns],
  );

  useEffect(() => {
    if (initialGrnId && availableGrns.length > 0 && !createGrnId && availableGrns.some((g) => g.id === initialGrnId)) {
      void handleSelectGrn(initialGrnId);
    }
  }, [initialGrnId, availableGrns, createGrnId, handleSelectGrn]);

  const isHybrid = isHybridBagCategory(bagCategory);
  const smallBags = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigBags = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const hybridQty = typeof withdrawal.quantity === 'number' ? withdrawal.quantity : 0;
  const totalWithdrawingBags = isHybrid && hybridQty > 0 && smallBags === 0 && bigBags === 0 ? hybridQty : smallBags + bigBags;
  const selectedGrn = availableGrns.find((g) => g.id === createGrnId) || null;
  const isLoanHoldActive = Boolean(selectedGrn?.loanStatus === 'TAKEN');
  const deliveryDateVal = createDate || new Date().toISOString().split('T')[0];
  const billableRentMonths = resolveOutwardBillableMonths({
    rentType: selectedGrn?.rentType ?? 'Seasonal', inwardDate: selectedGrn?.date,
    deliveryDate: deliveryDateVal, rentMonths: selectedGrn?.rentMonths,
  });

  const rateVisibility = deriveHybridRateVisibility({
    rentType: selectedGrn?.rentType ?? 'Seasonal', inwardDate: selectedGrn?.date, deliveryDate: deliveryDateVal,
  });

  const outwardRent = computeOutwardRentCharge({
    rentType: selectedGrn?.rentType ?? 'Seasonal', bagCategory, smallBags, bigBags,
    quantity: isHybrid && hybridQty > 0 && smallBags === 0 && bigBags === 0 ? hybridQty : undefined,
    manualBagPrice: isHybrid && typeof manualBagPrice === 'number' ? manualBagPrice : undefined,
    seasonalBagPrice: isHybrid && typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined,
    monthlyBagPrice: isHybrid && typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined,
    rentMonths: billableRentMonths, inwardDate: selectedGrn?.date, deliveryDate: deliveryDateVal,
    smallBagPrice: selectedGrn?.smallBagPrice, bigBagPrice: selectedGrn?.bigBagPrice, bagPrice: selectedGrn?.bagPrice,
    monthlySmallBagPrice: monthlyCommodityRates?.small, monthlyBigBagPrice: monthlyCommodityRates?.big,
  });

  const handleBagCategoryChange = (cat: OutwardBagCategory) => {
    setBagCategory(cat);
    clearFieldError('bags'); clearFieldError('smallBags'); clearFieldError('bigBags');
    clearFieldError('bagPrice'); clearFieldError('seasonalBagPrice'); clearFieldError('monthlyBagPrice');
  };

  const handleQuantityChange = (val: number | '') => { setWithdrawal((prev) => ({ ...prev, quantity: val })); clearFieldError('bags'); };
  const setWithdrawalSmallBags = (val: number | '') => { setWithdrawal((prev) => ({ ...prev, smallBags: val })); clearFieldError('bags'); clearFieldError('smallBags'); };
  const setWithdrawalBigBags = (val: number | '') => { setWithdrawal((prev) => ({ ...prev, bigBags: val })); clearFieldError('bags'); clearFieldError('bigBags'); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId) return;

    const isSb = selectedGrn?.bagType === 'S+B' || selectedGrn?.bagType === 'S/B';
    const isSeg = (grnSummary?.availableSmallBags ?? 0) > 0 && (grnSummary?.availableBigBags ?? 0) > 0;
    const totalAvail = (grnSummary?.availableSmallBags ?? 0) + (grnSummary?.availableBigBags ?? 0);

    const validation = validateDeliveryForm({
      createGrnId, createDate, smallBags, bigBags, totalWithdrawingBags,
      availableSmall: withdrawal.availableSmall, availableBig: withdrawal.availableBig,
      availableTotal: totalAvail, isCombinedPool: (isSb || isHybrid) && !isSeg,
      isHybrid: isHybrid, bagPrice: manualBagPrice,
      seasonalBagPrice: typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined,
      monthlyBagPrice: typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined,
      showSeasonalRate: isHybrid && rateVisibility.showSeasonalRate,
      showMonthlyRate: isHybrid && rateVisibility.showMonthlyRate,
      createVehicleNumber, createGpNumber, createDriverName, isLoanHoldActive,
      selectedGrnNumber: selectedGrn?.grnNumber, selectedGrnDate: selectedGrn?.date,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setModalError(validation.modalError);
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setFieldErrors({});

    try {
      const payload = buildDeliveryPayload({
        grnId: createGrnId, createDate, smallBags, bigBags,
        quantity: isHybrid && hybridQty > 0 && smallBags === 0 && bigBags === 0 ? hybridQty : undefined,
        bagCategory,
        bagPrice: isHybrid && typeof manualBagPrice === 'number' ? manualBagPrice : undefined,
        seasonalBagPrice: isHybrid && typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined,
        monthlyBagPrice: isHybrid && typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined,
        rentCharge: outwardRent,
        paymentAmount: typeof paymentAmount === 'number' && paymentAmount >= 0 ? paymentAmount : undefined,
        paymentMode: typeof paymentAmount === 'number' && paymentAmount > 0 ? paymentMode : undefined,
        createVehicleNumber, createDriverName, createWeight, createGpNumber, createRemarks,
      });
      const responseData = await submitDeliveryRequest(facilityId, payload);
      onSuccess(responseData.delivery, responseData.summary);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to issue delivery challan');
    } finally {
      setSubmitting(false);
    }
  };

  const availableStock = grnSummary
    ? grnSummary.availableSmallBags + grnSummary.availableBigBags
    : (selectedGrn?.closingBags ?? selectedGrn?.bags ?? 0);
  const hasValidPrice = !isHybrid || (
    (!rateVisibility.showSeasonalRate || (typeof seasonalBagPrice === 'number' && seasonalBagPrice > 0)) &&
    (!rateVisibility.showMonthlyRate || (typeof monthlyBagPrice === 'number' && monthlyBagPrice > 0)) &&
    (rateVisibility.showSeasonalRate || rateVisibility.showMonthlyRate || (typeof manualBagPrice === 'number' && manualBagPrice > 0))
  );
  const isFormValid = Boolean(
    selectedGrn && totalWithdrawingBags > 0 && totalWithdrawingBags <= availableStock &&
    hasValidPrice && createDate.trim() && createVehicleNumber.trim() && createGpNumber.trim() &&
    createDriverName.trim() && !isLoanHoldActive && !submitting,
  );

  return {
    availableGrns, createGrnId, grnSummary, loadingGrnSummary, createDate,
    setCreateDate: (v: string) => { setCreateDate(v); clearFieldError('date'); },
    bagCategory, setBagCategory: handleBagCategoryChange, outwardRent, withdrawal,
    manualBagPrice, setManualBagPrice: (v: number | '') => { setManualBagPrice(v); clearFieldError('bagPrice'); },
    seasonalBagPrice, setSeasonalBagPrice: (v: number | '') => { setSeasonalBagPrice(v); clearFieldError('seasonalBagPrice'); },
    monthlyBagPrice, setMonthlyBagPrice: (v: number | '') => { setMonthlyBagPrice(v); clearFieldError('monthlyBagPrice'); },
    rateVisibility,
    setWithdrawalSmallBags, setWithdrawalBigBags, setWithdrawalQuantity: handleQuantityChange,
    createVehicleNumber, setCreateVehicleNumber: (v: string) => { setCreateVehicleNumber(v); clearFieldError('vehicleNumber'); },
    createDriverName, setCreateDriverName: (v: string) => { setCreateDriverName(v); clearFieldError('driverName'); },
    createWeight, setCreateWeight, createGpNumber, setCreateGpNumber: (v: string) => { setCreateGpNumber(v); clearFieldError('gpNumber'); },
    createRemarks, setCreateRemarks, modalError, fieldErrors, clearFieldError, submitting,
    totalWithdrawingBags, fetchAvailableGrns, handleSelectGrn, handleSubmit, selectedGrn, isLoanHoldActive,
    billableRentMonths, monthlyCommodityRates, isFormValid, rentSummary: rentGate.rentSummary,
    rentLoading: rentGate.rentLoading, refreshRentGate: rentGate.refreshRentGate,
    paymentAmount, setPaymentAmount, paymentMode, setPaymentMode,
  };
}
