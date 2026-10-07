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
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const fetchAvailableGrns = useCallback(async () => {
    if (!facilityId) return;
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/grns?status=OPEN&limit=100`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Grn[] };
        setAvailableGrns(data.items ?? []);
      }
    } catch {
      // Graceful
    }
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
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`,
          ),
          rentGate.refreshRentGate(facilityId, grnId),
        ]);
        if (invRes.ok) {
          const data = (await invRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);
          setWithdrawal({
            availableSmall: data.summary.availableSmallBags,
            availableBig: data.summary.availableBigBags,
            smallBags: '',
            bigBags: '',
          });
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
        createVehicleNumber,
        createDriverName,
        createWeight,
        createGpNumber,
        createRemarks,
      });

      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/deliveries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Delivery failed with HTTP ${res.status}`);
      }

      const responseData = (await res.json()) as { delivery: DeliveryChallan; summary?: DeliverySummary };
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
    withdrawal,
    setWithdrawalSmallBags: (val: number | '') => {
      setWithdrawal((prev) => ({ ...prev, smallBags: val }));
      clearFieldError('bags');
      clearFieldError('smallBags');
    },
    setWithdrawalBigBags: (val: number | '') => {
      setWithdrawal((prev) => ({ ...prev, bigBags: val }));
      clearFieldError('bags');
      clearFieldError('bigBags');
    },
    /** Single-quantity entry mapped onto the GRN's available side (two-sided uses side setters). */
    setWithdrawalQuantity: (val: number | '') => {
      setWithdrawal((prev) => {
        if (prev.availableBig === 0) return { ...prev, smallBags: val, bigBags: 0 };
        if (prev.availableSmall === 0) return { ...prev, smallBags: 0, bigBags: val };
        return prev;
      });
      clearFieldError('bags');
      clearFieldError('smallBags');
      clearFieldError('bigBags');
    },
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
