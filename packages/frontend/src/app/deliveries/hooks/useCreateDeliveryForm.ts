import { useCallback, useState } from 'react';
import { indianVehicleSchema } from '@cold-storage/contracts';
import type {
  DeliveryChallan,
  DeliverySummary,
  Grn,
  GrnInventorySummary,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useRentGate } from '@/hooks/useRentGate';
import type { GrnWithdrawal } from '../types';

export interface RentRequiredPayload {
  code: 'RENT_PAYMENT_REQUIRED';
  rent: { grnId: string; grnNumber: string; rentAmount: number; totalPaid: number; remainingBalance: number };
}

export function useCreateDeliveryForm(
  facilityId: string,
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void,
) {
  const [availableGrns, setAvailableGrns] = useState<Grn[]>([]);
  const [createGrnId, setCreateGrnId] = useState('');
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null);
  const [loadingGrnSummary, setLoadingGrnSummary] = useState(false);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [withdrawal, setWithdrawal] = useState<GrnWithdrawal>({ maxBags: 0, bags: '' });
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createDriverName, setCreateDriverName] = useState('');
  const [createWeight, setCreateWeight] = useState<number | ''>('');
  const [createMarks, setCreateMarks] = useState('');
  const [createGpNumber, setCreateGpNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rentRequired, setRentRequired] = useState<RentRequiredPayload | null>(null);
  const rentGate = useRentGate();

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

  const handleSelectGrn = async (grnId: string) => {
    setCreateGrnId(grnId);
    setGrnSummary(null);
    setWithdrawal({ maxBags: 0, bags: '' });
    setRentRequired(null);
    rentGate.resetRentGate();
    if (!facilityId || !grnId) return;

    setLoadingGrnSummary(true);
    setModalError(null);
    try {
      const [invRes, rentSummary] = await Promise.all([
        requestWithAuth(
          `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`,
        ),
        rentGate.refreshRentGate(facilityId, grnId),
      ]);
      if (rentSummary && rentSummary.rentAmount > 0 && rentSummary.totalPaid === 0) {
        setRentRequired({
          code: 'RENT_PAYMENT_REQUIRED',
          rent: {
            grnId: rentSummary.grnId,
            grnNumber: rentSummary.grnNumber,
            rentAmount: rentSummary.rentAmount,
            totalPaid: rentSummary.totalPaid,
            remainingBalance: rentSummary.remainingBalance,
          },
        });
      }
      if (invRes.ok) {
        const data = (await invRes.json()) as { summary: GrnInventorySummary };
        setGrnSummary(data.summary);
        setWithdrawal({ maxBags: data.summary.allocatedBags, bags: '' });
      }
    } catch {
      setModalError('Failed to load GRN stock summary');
    } finally {
      setLoadingGrnSummary(false);
    }
  };

  const totalWithdrawingBags = typeof withdrawal.bags === 'number' ? withdrawal.bags : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId) return;
    if (!createGrnId) {
      setModalError('Please select a GRN to withdraw stock from');
      return;
    }

    if (typeof withdrawal.bags !== 'number' || withdrawal.bags <= 0) {
      setModalError('Please specify how many bags to withdraw');
      return;
    }

    if (withdrawal.bags > withdrawal.maxBags) {
      setModalError(
        `Cannot withdraw ${withdrawal.bags} bags: only ${withdrawal.maxBags} are available in stock`,
      );
      return;
    }

    if (createVehicleNumber.trim()) {
      if (!indianVehicleSchema.safeParse(createVehicleNumber.trim()).success) {
        setModalError('Vehicle registration must be in standard Indian format (e.g. UP32AA1111)');
        return;
      }
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const payload: Record<string, unknown> = {
        grnId: createGrnId,
        date: new Date(createDate),
        bags: withdrawal.bags as number,
      };

      if (createVehicleNumber.trim()) {
        payload.vehicleNumber = createVehicleNumber.trim().toUpperCase();
      }
      if (createDriverName.trim()) {
        payload.driverName = createDriverName.trim();
      }
      if (createWeight !== '' && typeof createWeight === 'number' && createWeight > 0) {
        payload.weight = createWeight;
      }
      if (createMarks.trim()) {
        payload.marks = createMarks.trim();
      }
      if (createGpNumber.trim()) {
        payload.gpNumber = createGpNumber.trim();
      }
      if (createRemarks.trim()) {
        payload.remarks = createRemarks.trim();
      }

      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/deliveries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; code?: string; rent?: RentRequiredPayload['rent'] };
        if (res.status === 402 && data.code === 'RENT_PAYMENT_REQUIRED' && data.rent) {
          setRentRequired({ code: 'RENT_PAYMENT_REQUIRED', rent: data.rent });
          await rentGate.refreshRentGate(facilityId, createGrnId);
          throw new Error(data.error ?? 'Rent payment required before issuing delivery challan');
        }
        throw new Error(data.error ?? `Delivery failed with HTTP ${res.status}`);
      }

      const responseData = (await res.json()) as { delivery: DeliveryChallan; summary?: DeliverySummary };
      setRentRequired(null);
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
    setCreateDate,
    withdrawal,
    setWithdrawalBags: (bags: number | '') => setWithdrawal((prev) => ({ ...prev, bags })),
    createVehicleNumber,
    setCreateVehicleNumber,
    createDriverName,
    setCreateDriverName,
    createWeight,
    setCreateWeight,
    createMarks,
    setCreateMarks,
    createGpNumber,
    setCreateGpNumber,
    createRemarks,
    setCreateRemarks,
    modalError,
    submitting,
    totalWithdrawingBags,
    fetchAvailableGrns,
    handleSelectGrn,
    handleSubmit,
    rentSummary: rentGate.rentSummary,
    rentLoading: rentGate.rentLoading,
    rentBlocked: rentGate.rentBlocked,
    rentPartial: rentGate.rentPartial,
    rentRequired,
    refreshRentGate: rentGate.refreshRentGate,
    clearRentRequired: useCallback(() => setRentRequired(null), []),
  };
}
