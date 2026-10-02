import { useState } from 'react';
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
  const [createCustomerId, setCreateCustomerId] = useState(customers[0]?.id ?? '');
  const [createCommodityId, setCreateCommodityId] = useState(commodities[0]?.id ?? '');
  const [createChamberId, setCreateChamberId] = useState(chambers[0]?.id ?? '');
  const [createBags, setCreateBags] = useState<number | ''>('');
  const [createBagType, setCreateBagType] = useState<BagType>('S');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCustomerId) return setModalError('Please select a customer');
    if (!createCommodityId) return setModalError('Please select a commodity');
    if (!createChamberId) return setModalError('Please select a chamber');
    if (typeof createBags !== 'number' || createBags <= 0) {
      return setModalError('Bags count must be a positive integer');
    }
    if (createRentType === 'Monthly' && (typeof createRentMonths !== 'number' || createRentMonths < 1)) {
      return setModalError('Rent months is required (>= 1) for Monthly rent');
    }
    if (typeof createRentAmount !== 'number' || createRentAmount < 0) {
      return setModalError('Rent amount must be greater than or equal to 0');
    }

    if (createVehicleNumber.trim()) {
      const vehicleRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$/;
      if (!vehicleRegex.test(createVehicleNumber.trim().toUpperCase())) {
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
    setCreateBagType,
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
