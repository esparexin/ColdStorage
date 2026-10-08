import { useCallback, useEffect, useState } from 'react';
import type {
  DeliveryChallan,
  DeliverySummary,
  Grn,
  GrnInventorySummary,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useRentGate } from '@/hooks/useRentGate';
import { validateDeliveryForm } from './deliveryFormValidation.helper';
import { buildDeliveryPayload } from './deliveryPayload.helper';
import { computeOutwardRentCharge, type OutwardBagCategory } from './deliveryRent.helper';
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
  const [bagCategory, setBagCategory] = useState<OutwardBagCategory>('Small');
  const [withdrawal, setWithdrawal] = useState<GrnWithdrawal>({
    availableSmall: 0,
    availableBig: 0,
    smallBags: '',
    bigBags: '',
  });
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createDriverName, setCreateDriverName] = useState('');
  const [createWeight, setCreateWeight] = useState<number | ''>('');
  const [createGpNumber, setCreateGpNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const rentGate = useRentGate();

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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

  const handleSelectGrn = useCallback(
    async (grnId: string) => {
      setCreateGrnId(grnId);
      setGrnSummary(null);
      setWithdrawal({ availableSmall: 0, availableBig: 0, smallBags: '', bigBags: '' });
      setFieldErrors({});
      rentGate.resetRentGate();
      if (!facilityId || !grnId) return;

      setLoadingGrnSummary(true);
      setModalError(null);
      try {
        const [invRes] = await Promise.all([
          requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`),
          rentGate.refreshRentGate(facilityId, grnId),
        ]);
        if (invRes.ok) {
          const data = (await invRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);
          const { availableSmallBags: s, availableBigBags: b } = data.summary;
          setBagCategory(s > 0 && b > 0 ? 'Small & Big' : b > 0 ? 'Big' : 'Small');
          setWithdrawal({ availableSmall: s, availableBig: b, smallBags: '', bigBags: '' });
        }
      } catch {
        setModalError('Failed to load GRN stock summary');
      } finally {
        setLoadingGrnSummary(false);
      }
    },
    [facilityId, rentGate],
  );

  useEffect(() => {
    if (initialGrnId && availableGrns.length > 0 && !createGrnId) {
      if (availableGrns.some((g) => g.id === initialGrnId)) {
        void handleSelectGrn(initialGrnId);
      }
    }
  }, [initialGrnId, availableGrns, createGrnId, handleSelectGrn]);

  const smallBags = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigBags = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const totalWithdrawingBags = smallBags + bigBags;
  const selectedGrn = availableGrns.find((g) => g.id === createGrnId) || null;
  const isLoanHoldActive = Boolean(selectedGrn?.loanStatus === 'TAKEN');

  const outwardRent = computeOutwardRentCharge({
    rentType: selectedGrn?.rentType ?? 'Seasonal',
    bagCategory,
    smallBags,
    bigBags,
    rentMonths: selectedGrn?.rentMonths,
    smallBagPrice: selectedGrn?.smallBagPrice,
    bigBagPrice: selectedGrn?.bigBagPrice,
    bagPrice: selectedGrn?.bagPrice,
  });

  const handleBagCategoryChange = (cat: OutwardBagCategory) => {
    setBagCategory(cat);
    setWithdrawal((prev) => {
      if (cat === 'Small') return { ...prev, bigBags: 0 };
      if (cat === 'Big') return { ...prev, smallBags: 0 };
      return prev;
    });
    clearFieldError('bags');
    clearFieldError('smallBags');
    clearFieldError('bigBags');
  };

  const handleQuantityChange = (val: number | '') => {
    setWithdrawal((prev) => {
      if (bagCategory === 'Big') return { ...prev, smallBags: 0, bigBags: val };
      return { ...prev, smallBags: val, bigBags: 0 };
    });
    clearFieldError('bags');
    clearFieldError('smallBags');
    clearFieldError('bigBags');
  };

  const setWithdrawalSmallBags = (val: number | '') => {
    setWithdrawal((prev) => ({ ...prev, smallBags: val }));
    clearFieldError('bags');
    clearFieldError('smallBags');
  };

  const setWithdrawalBigBags = (val: number | '') => {
    setWithdrawal((prev) => ({ ...prev, bigBags: val }));
    clearFieldError('bags');
    clearFieldError('bigBags');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId) return;

    const validation = validateDeliveryForm({
      createGrnId,
      createDate,
      smallBags,
      bigBags,
      totalWithdrawingBags,
      availableSmall: withdrawal.availableSmall,
      availableBig: withdrawal.availableBig,
      createVehicleNumber,
      isLoanHoldActive,
      selectedGrnNumber: selectedGrn?.grnNumber,
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
        grnId: createGrnId,
        createDate,
        smallBags,
        bigBags,
        bagCategory,
        rentCharge: outwardRent,
        createVehicleNumber,
        createDriverName,
        createWeight,
        createGpNumber,
        createRemarks,
      });

      const responseData = await submitDeliveryRequest(facilityId, payload);
      onSuccess(responseData.delivery, responseData.summary);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to issue delivery challan');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    availableGrns,
    createGrnId,
    grnSummary,
    loadingGrnSummary,
    createDate,
    setCreateDate: (v: string) => { setCreateDate(v); clearFieldError('date'); },
    bagCategory,
    setBagCategory: handleBagCategoryChange,
    outwardRent,
    withdrawal,
    setWithdrawalSmallBags,
    setWithdrawalBigBags,
    setWithdrawalQuantity: handleQuantityChange,
    createVehicleNumber,
    setCreateVehicleNumber: (v: string) => { setCreateVehicleNumber(v); clearFieldError('vehicleNumber'); },
    createDriverName,
    setCreateDriverName,
    createWeight,
    setCreateWeight,
    createGpNumber,
    setCreateGpNumber,
    createRemarks,
    setCreateRemarks,
    modalError,
    fieldErrors,
    clearFieldError,
    submitting,
    totalWithdrawingBags,
    fetchAvailableGrns,
    handleSelectGrn,
    handleSubmit,
    selectedGrn,
    isLoanHoldActive,
    rentSummary: rentGate.rentSummary,
    rentLoading: rentGate.rentLoading,
    rentBlocked: rentGate.rentBlocked,
    rentPartial: rentGate.rentPartial,
    refreshRentGate: rentGate.refreshRentGate,
  };
}
