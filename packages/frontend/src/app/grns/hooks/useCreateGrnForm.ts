import { useState } from 'react';
import { calculateRentAmount, SEASONAL_RENT_MONTHS } from '@cold-storage/contracts';
import type { BagType, Commodity, Customer, Grn, RentType } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { parseNumericInput, validateCreateGrnForm } from './createGrnForm.helper';

export { parseNumericInput };

export function useCreateGrnForm(
  facilityId: string,
  customers: Customer[],
  commodities: Commodity[],
  onSuccess: (newGrn: Grn) => void,
) {
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createCommodityId, setCreateCommodityId] = useState('');
  const [createChamber, setCreateChamber] = useState('');
  const [createBags, setCreateBags] = useState<number | ''>('');
  const [createBagType, setCreateBagType] = useState<BagType>('S');
  const [createSmallBags, setCreateSmallBags] = useState<number | ''>('');
  const [createBigBags, setCreateBigBags] = useState<number | ''>('');
  const [createNominalUnitWeight, setCreateNominalUnitWeight] = useState<number | ''>('');
  const [createNominalTotalWeight, setCreateNominalTotalWeight] = useState<number | ''>('');
  const [createActualWeight, setCreateActualWeight] = useState<number | ''>('');
  const [createRentType, setCreateRentType] = useState<RentType>('Seasonal');
  const [createRentMonths, setCreateRentMonths] = useState<number | ''>('');
  const [createBagPrice, setCreateBagPrice] = useState<number | ''>('');
  const [createSmallBagPrice, setCreateSmallBagPrice] = useState<number | ''>('');
  const [createBigBagPrice, setCreateBigBagPrice] = useState<number | ''>('');
  const [createRentAmount, setCreateRentAmount] = useState<number | ''>('');
  const [createGpNumber, setCreateGpNumber] = useState('');
  const [createVehicleNumber, setCreateVehicleNumber] = useState('');
  const [createRemarks, setCreateRemarks] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const focusField = (fieldId: string) => {
    if (typeof document !== 'undefined') {
      const el = document.getElementById(fieldId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
    }
  };

  const autoComputeRent = (overrides?: Partial<{
    bags: number | ''; bagType: BagType; smallBags: number | ''; bigBags: number | '';
    bagPrice: number | ''; smallBagPrice: number | ''; bigBagPrice: number | '';
    rentType: RentType; rentMonths: number | '';
  }>) => {
    const bags = overrides?.bags ?? createBags;
    const bagType = overrides?.bagType ?? createBagType;
    const smallBags = overrides?.smallBags ?? createSmallBags;
    const bigBags = overrides?.bigBags ?? createBigBags;
    const bagPrice = overrides?.bagPrice ?? createBagPrice;
    const smallBagPrice = overrides?.smallBagPrice ?? createSmallBagPrice;
    const bigBagPrice = overrides?.bigBagPrice ?? createBigBagPrice;
    const rentType = overrides?.rentType ?? createRentType;
    const rentMonths = overrides?.rentMonths ?? createRentMonths;

    if (typeof bags === 'number' && bags > 0) {
      const calc = calculateRentAmount({
        rentType, bags, bagType,
        bagPrice: typeof bagPrice === 'number' ? bagPrice : null,
        smallBags: typeof smallBags === 'number' ? smallBags : null,
        bigBags: typeof bigBags === 'number' ? bigBags : null,
        smallBagPrice: typeof smallBagPrice === 'number' ? smallBagPrice : null,
        bigBagPrice: typeof bigBagPrice === 'number' ? bigBagPrice : null,
        rentMonths: typeof rentMonths === 'number' ? rentMonths : null,
      });
      if (calc > 0) {
        setCreateRentAmount(calc);
        clearFieldError('rentAmount');
      }
    }
  };

  const handleBagsChange = (val: number | '') => {
    setCreateBags(val);
    clearFieldError('bags');
    if (typeof val === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(val * createNominalUnitWeight);
    }
    autoComputeRent({ bags: val });
  };

  const handleUnitWeightChange = (val: number | '') => {
    setCreateNominalUnitWeight(val);
    if (typeof createBags === 'number' && typeof val === 'number') {
      setCreateNominalTotalWeight(createBags * val);
    }
  };

  const handleBagTypeChange = (val: BagType) => {
    setCreateBagType(val);
    setCreateBags('');
    setCreateSmallBags('');
    setCreateBigBags('');
    setCreateNominalTotalWeight('');
    clearFieldError('bags');
    autoComputeRent({ bagType: val, bags: '', smallBags: '', bigBags: '' });
  };

  const handleSmallBagsChange = (val: number | '') => {
    setCreateSmallBags(val);
    clearFieldError('bags');
    const small = typeof val === 'number' ? val : 0;
    const big = typeof createBigBags === 'number' ? createBigBags : 0;
    const total: number | '' = small + big > 0 ? small + big : '';
    setCreateBags(total);
    if (typeof total === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(total * createNominalUnitWeight);
    }
    autoComputeRent({ smallBags: val, bags: total });
  };

  const handleBigBagsChange = (val: number | '') => {
    setCreateBigBags(val);
    clearFieldError('bags');
    const big = typeof val === 'number' ? val : 0;
    const small = typeof createSmallBags === 'number' ? createSmallBags : 0;
    const total: number | '' = small + big > 0 ? small + big : '';
    setCreateBags(total);
    if (typeof total === 'number' && typeof createNominalUnitWeight === 'number') {
      setCreateNominalTotalWeight(total * createNominalUnitWeight);
    }
    autoComputeRent({ bigBags: val, bags: total });
  };

  const handleRentMonthsChange = (val: number | '') => {
    setCreateRentMonths(val);
    clearFieldError('rentMonths');
    autoComputeRent({ rentMonths: val });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors, parsedChamber, normalizedVehicle } = validateCreateGrnForm({
      createCustomerId, createCommodityId, createChamber, createBags, createBagType,
      createSmallBags, createBigBags, createRentType, createRentMonths, createRentAmount,
      createVehicleNumber,
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      const fieldIdMap: Record<string, string> = {
        customer: 'create-customer-search', commodity: 'create-commodity', chamber: 'create-chamber',
        bags: createBagType === 'S+B' ? 'create-small-bags' : 'create-bags',
        rentMonths: 'create-rent-months', rentAmount: 'create-rent-amount', vehicleNumber: 'create-vehicle',
      };
      setModalError(errors[firstKey]);
      focusField(fieldIdMap[firstKey] ?? firstKey);
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setFieldErrors({});

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const inwardDate = createDate === todayStr ? new Date() : new Date(`${createDate}T00:00:00`);
      const payload: Record<string, unknown> = {
        facilityId, date: inwardDate, customerId: createCustomerId, commodityId: createCommodityId,
        chamber: parsedChamber, bags: createBags, bagType: createBagType,
        rentType: createRentType, rentAmount: createRentAmount,
      };
      if (typeof createBagPrice === 'number' && createBagPrice > 0) payload.bagPrice = createBagPrice;
      if (typeof createSmallBagPrice === 'number' && createSmallBagPrice > 0) payload.smallBagPrice = createSmallBagPrice;
      if (typeof createBigBagPrice === 'number' && createBigBagPrice > 0) payload.bigBagPrice = createBigBagPrice;
      if (typeof createSmallBags === 'number' && createSmallBags > 0) payload.smallBags = createSmallBags;
      if (typeof createBigBags === 'number' && createBigBags > 0) payload.bigBags = createBigBags;
      if (createRentType === 'Monthly' && typeof createRentMonths === 'number') payload.rentMonths = createRentMonths;
      if (typeof createNominalUnitWeight === 'number' && createNominalUnitWeight > 0) payload.nominalUnitWeight = createNominalUnitWeight;
      if (typeof createNominalTotalWeight === 'number' && createNominalTotalWeight > 0) payload.nominalTotalWeight = createNominalTotalWeight;
      if (typeof createActualWeight === 'number' && createActualWeight > 0) payload.actualWeight = createActualWeight;
      if (createGpNumber.trim()) payload.gpNumber = createGpNumber.trim();
      if (normalizedVehicle) payload.vehicleNumber = normalizedVehicle;
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
      const msg = err instanceof Error ? err.message : 'Failed to create GRN';
      setModalError(msg);
      focusField('modal-error-banner');
    } finally {
      setSubmitting(false);
    }
  };

  const isDirty = Boolean(
    createCustomerId || createCommodityId || createBags || createSmallBags || createBigBags ||
    createNominalUnitWeight || createActualWeight || createRentAmount || createGpNumber.trim() ||
    createVehicleNumber.trim() || createRemarks.trim(),
  );

  return {
    createDate, setCreateDate,
    createCustomerId, setCreateCustomerId: (id: string) => { setCreateCustomerId(id); clearFieldError('customer'); },
    createCommodityId, setCreateCommodityId: (id: string) => { setCreateCommodityId(id); clearFieldError('commodity'); },
    createChamber, setCreateChamber: (value: string) => { setCreateChamber(value); clearFieldError('chamber'); },
    seasonalRentMonths: SEASONAL_RENT_MONTHS,
    createBags, handleBagsChange,
    createBagType, handleBagTypeChange,
    createSmallBags, createBigBags, handleSmallBagsChange, handleBigBagsChange,
    createNominalUnitWeight, handleUnitWeightChange,
    createNominalTotalWeight, setCreateNominalTotalWeight,
    createActualWeight, setCreateActualWeight,
    createRentType, handleRentTypeChange: (val: RentType) => { setCreateRentType(val); autoComputeRent({ rentType: val }); },
    createRentMonths, handleRentMonthsChange,
    createBagPrice, handleBagPriceChange: (val: number | '') => { setCreateBagPrice(val); autoComputeRent({ bagPrice: val }); },
    createSmallBagPrice, handleSmallBagPriceChange: (val: number | '') => { setCreateSmallBagPrice(val); autoComputeRent({ smallBagPrice: val }); },
    createBigBagPrice, handleBigBagPriceChange: (val: number | '') => { setCreateBigBagPrice(val); autoComputeRent({ bigBagPrice: val }); },
    createRentAmount, setCreateRentAmount: (val: number | '') => { setCreateRentAmount(val); clearFieldError('rentAmount'); },
    createGpNumber, setCreateGpNumber,
    createVehicleNumber, setCreateVehicleNumber: (val: string) => { setCreateVehicleNumber(val); clearFieldError('vehicleNumber'); },
    createRemarks, setCreateRemarks,
    modalError, fieldErrors, submitting, isDirty, handleSubmit,
  };
}
