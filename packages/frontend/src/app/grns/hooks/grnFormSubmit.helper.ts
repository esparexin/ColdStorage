import type { Grn } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { buildEditGrnPayload } from './createGrnForm.helper';

export async function submitCreateGrn(
  facilityId: string,
  payload: Record<string, unknown>,
): Promise<Grn> {
  const res = await requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Creation failed with HTTP ${res.status}`);
  }

  const responseData = (await res.json()) as { grn: Grn };
  return responseData.grn;
}

export async function submitEditGrn(
  facilityId: string,
  grnId: string,
  payload: Record<string, unknown>,
): Promise<Grn> {
  const res = await requestWithAuth(
    `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Update failed with HTTP ${res.status}`);
  }

  const responseData = (await res.json()) as { grn: Grn };
  return responseData.grn;
}

export async function handleEditGrnSubmit(params: {
  facilityId: string;
  initialGrn: Grn;
  guardState?: 'closed' | 'partial' | 'locked' | null;
  createChamber: string;
  createCustomerId: string;
  createDate: string;
  createCommodityId: string;
  createBags: number | '';
  createBagType: import('@cold-storage/contracts').BagType;
  createRentType: import('@cold-storage/contracts').RentType;
  createRentMonths: number | '';
  createRentAmount: number | '';
  createBagPrice: number | '';
  createSmallBagPrice?: number | '';
  createBigBagPrice?: number | '';
  createTotalBagsWeight?: number | '';
  createPartyMark: string;
  createVehicleNumber: string;
  createRemarks: string;
  structuralLocked: boolean;
  onSuccess: (savedGrn: Grn) => void;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setModalError: React.Dispatch<React.SetStateAction<string | null>>;
  setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
}): Promise<void> {
  const { initialGrn, guardState, createChamber } = params;
  if (guardState === 'closed') {
    params.setModalError(`Cannot correct GRN '${initialGrn.grnNumber}': it is CLOSED and its stock has been fully delivered`);
    return;
  }
  const trimmedChamber = createChamber.trim();
  if (!trimmedChamber || trimmedChamber.length > 20) {
    params.setFieldErrors({ chamber: 'Chamber is required (max 20 characters)' });
    params.setModalError('Chamber is required (max 20 characters)');
    return;
  }
  const { payload, hasChanges } = buildEditGrnPayload({
    initialGrn,
    structuralLocked: params.structuralLocked,
    createCustomerId: params.createCustomerId,
    createDate: params.createDate,
    createCommodityId: params.createCommodityId,
    createChamber: params.createChamber,
    createBags: params.createBags,
    createBagType: params.createBagType,
    createRentType: params.createRentType,
    createRentMonths: params.createRentMonths,
    createRentAmount: params.createRentAmount,
    createBagPrice: params.createBagPrice,
    createSmallBagPrice: params.createSmallBagPrice,
    createBigBagPrice: params.createBigBagPrice,
    createTotalBagsWeight: params.createTotalBagsWeight,
    createPartyMark: params.createPartyMark,
    createVehicleNumber: params.createVehicleNumber,
    createRemarks: params.createRemarks,
  });
  if (!hasChanges) {
    params.setModalError('No changes detected to save');
    return;
  }
  params.setSubmitting(true);
  params.setModalError(null);
  try {
    const updated = await submitEditGrn(params.facilityId, initialGrn.id, payload);
    params.onSuccess(updated);
  } catch (err: unknown) {
    params.setModalError(err instanceof Error ? err.message : 'Failed to update GRN');
  } finally {
    params.setSubmitting(false);
  }
}
