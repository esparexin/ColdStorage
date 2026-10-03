import { useCallback, useMemo, useState } from 'react';
import type {
  DeliveryChallan,
  DeliverySummary,
  Grn,
  GrnInventorySummary,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useRentGate } from '@/hooks/useRentGate';
import type { PositionWithdrawal } from '../types';

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
  const [withdrawals, setWithdrawals] = useState<PositionWithdrawal[]>([]);
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createDriverName, setCreateDriverName] = useState('');
  const [createWeight, setCreateWeight] = useState<number | ''>('');
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
    setWithdrawals([]);
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
        const rows: PositionWithdrawal[] = data.summary.positions.map((p) => ({
          positionId: p.positionId,
          positionCode: p.positionCode,
          maxBags: p.bags,
          bags: '',
        }));
        setWithdrawals(rows);
      }
    } catch {
      setModalError('Failed to load GRN position allocation summary');
    } finally {
      setLoadingGrnSummary(false);
    }
  };

  const totalWithdrawingBags = useMemo(() => {
    return withdrawals.reduce(
      (acc, w) => acc + (typeof w.bags === 'number' ? w.bags : 0),
      0,
    );
  }, [withdrawals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId) return;
    if (!createGrnId) {
      setModalError('Please select a GRN to withdraw stock from');
      return;
    }

    const activeWithdrawals = withdrawals.filter(
      (w) => typeof w.bags === 'number' && w.bags > 0,
    );

    if (activeWithdrawals.length === 0) {
      setModalError('Please specify at least 1 bag to withdraw from an allocated position');
      return;
    }

    for (const w of activeWithdrawals) {
      if ((w.bags as number) > w.maxBags) {
        setModalError(
          `Cannot withdraw ${w.bags} bags from position ${w.positionCode} (only ${w.maxBags} available)`,
        );
        return;
      }
    }

    if (createVehicleNumber.trim()) {
      const vehicleRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$/;
      if (!vehicleRegex.test(createVehicleNumber.trim().toUpperCase())) {
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
        items: activeWithdrawals.map((w) => ({
          positionId: w.positionId,
          bags: w.bags as number,
        })),
      };

      if (createVehicleNumber.trim()) {
        payload.vehicleNumber = createVehicleNumber.trim().toUpperCase();
      }
      if (createDriverName.trim()) {
        payload.driverName = createDriverName.trim();
      }
      if (typeof createWeight === 'number' && createWeight > 0) {
        payload.weight = createWeight;
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
    withdrawals,
    setWithdrawals,
    createVehicleNumber,
    setCreateVehicleNumber,
    createDriverName,
    setCreateDriverName,
    createWeight,
    setCreateWeight,
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
