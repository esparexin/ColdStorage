import { useState } from 'react';
import { indianVehicleSchema } from '@cold-storage/contracts';
import type {
  BagType,
  Chamber,
  Commodity,
  Customer,
  Grn,
  RentType,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useCreateGrnForm(
  facilityId: string,
  customers: Customer[],
  commodities: Commodity[],
  chambers: Chamber[],
  onSuccess: (newGrn: Grn) => void,
) {
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createCommodityId, setCreateCommodityId] = useState('');
  const [createChamberId, setCreateChamberId] = useState(chambers[0]?.id ?? '');
  const [createBags, setCreateBags] = useState<number | ''>('');
  const [createBagType, setCreateBagType] = useState<BagType>('S');
  const [createSmallBags, setCreateSmallBags] = useState<number | ''>('');
  const [createBigBags, setCreateBigBags] = useState<number | ''>('');
  const [createNominalUnitWeight, setCreateNominalUnitWeight] = useState<number | ''>('');
  const [createNominalTotalWeight, setCreateNominalTotalWeight] = useState<number | ''>('');
  const [createActualWeight, setCreateActualWeight] = useState<number | ''>('');
  const [createRentType, setCreateRentType] = useState<RentType>('Seasonal');
  const [createRentMonths, setCreateRentMonths] = useState<number | ''>('');
  const [createRentAmount, setCreateRentAmount] = useState<number | ''>('');
  const [createGpNumber, setCreateGpNumber] = useState('');
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleBagsChange = (val: number | '') => {
    setCreateBags(val);
    if (typeof val === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(val * createNominalUnitWeight);
    }
  };

  const handleUnitWeightChange = (val: number | '') => {
    setCreateNominalUnitWeight(val);
    if (typeof createBags === 'number' && typeof val === 'number') {
      setCreateNominalTotalWeight(createBags * val);
    }
  };

  // Resets all bag counts when the bag type is changed to avoid stale state.
  const handleBagTypeChange = (val: BagType) => {
    setCreateBagType(val);
    setCreateBags('');
    setCreateSmallBags('');
    setCreateBigBags('');
    setCreateNominalTotalWeight('');
  };

  // S+B mode: recalculate total whenever small bags changes.
  const handleSmallBagsChange = (val: number | '') => {
    setCreateSmallBags(val);
    const small = typeof val === 'number' ? val : 0;
    const big = typeof createBigBags === 'number' ? createBigBags : 0;
    const total: number | '' = small + big > 0 ? small + big : '';
    setCreateBags(total);
    if (typeof total === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(total * createNominalUnitWeight);
    }
  };

  // S+B mode: recalculate total whenever big bags changes.
  const handleBigBagsChange = (val: number | '') => {
    setCreateBigBags(val);
    const big = typeof val === 'number' ? val : 0;
    const small = typeof createSmallBags === 'number' ? createSmallBags : 0;
    const total: number | '' = small + big > 0 ? small + big : '';
    setCreateBags(total);
    if (typeof total === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(total * createNominalUnitWeight);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCustomerId) return setModalError('Please select a customer');
    if (!createCommodityId) return setModalError('Please select a commodity');
    if (!createChamberId) return setModalError('Please select a chamber');
    if (createBagType === 'S+B') {
      const small = typeof createSmallBags === 'number' ? createSmallBags : 0;
      const big = typeof createBigBags === 'number' ? createBigBags : 0;
      if (small + big <= 0) {
        return setModalError('Enter at least one bag count (Small Bags or Big Bags) for Mixed bag type');
      }
    } else if (typeof createBags !== 'number' || createBags <= 0) {
      return setModalError(`${createBagType === 'S' ? 'Small' : 'Big'} bags count must be a positive integer`);
    }
    if (createRentType === 'Monthly' && (typeof createRentMonths !== 'number' || createRentMonths < 1)) {
      return setModalError('Rent months is required (>= 1) for Monthly rent');
    }
    if (typeof createRentAmount !== 'number' || createRentAmount < 0) {
      return setModalError('Rent amount must be greater than or equal to 0');
    }

    if (createVehicleNumber.trim()) {
      if (!indianVehicleSchema.safeParse(createVehicleNumber.trim()).success) {
        return setModalError('Vehicle number must be in standard Indian format (e.g., UP32AA1111)');
      }
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const payload: Record<string, unknown> = {
        facilityId,
        date: new Date(createDate),
        customerId: createCustomerId,
        commodityId: createCommodityId,
        chamberId: createChamberId,
        bags: createBags,
        bagType: createBagType,
        rentType: createRentType,
        rentAmount: createRentAmount,
      };

      if (createRentType === 'Monthly' && typeof createRentMonths === 'number') {
        payload.rentMonths = createRentMonths;
      }
      if (typeof createNominalUnitWeight === 'number' && createNominalUnitWeight > 0) {
        payload.nominalUnitWeight = createNominalUnitWeight;
      }
      if (typeof createNominalTotalWeight === 'number' && createNominalTotalWeight > 0) {
        payload.nominalTotalWeight = createNominalTotalWeight;
      }
      if (typeof createActualWeight === 'number' && createActualWeight > 0) {
        payload.actualWeight = createActualWeight;
      }
      if (createGpNumber.trim()) payload.gpNumber = createGpNumber.trim();
      if (createVehicleNumber.trim()) payload.vehicleNumber = createVehicleNumber.trim().toUpperCase();
      if (createRemarks.trim()) payload.remarks = createRemarks.trim();

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
      onSuccess(responseData.grn);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to create GRN');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    createDate,
    setCreateDate,
    createCustomerId,
    setCreateCustomerId,
    createCommodityId,
    setCreateCommodityId,
    createChamberId,
    setCreateChamberId,
    createBags,
    handleBagsChange,
    createBagType,
    handleBagTypeChange,
    createSmallBags,
    createBigBags,
    handleSmallBagsChange,
    handleBigBagsChange,
    createNominalUnitWeight,
    handleUnitWeightChange,
    createNominalTotalWeight,
    setCreateNominalTotalWeight,
    createActualWeight,
    setCreateActualWeight,
    createRentType,
    setCreateRentType,
    createRentMonths,
    setCreateRentMonths,
    createRentAmount,
    setCreateRentAmount,
    createGpNumber,
    setCreateGpNumber,
    createVehicleNumber,
    setCreateVehicleNumber,
    createRemarks,
    setCreateRemarks,
    modalError,
    submitting,
    handleSubmit,
  };
}
