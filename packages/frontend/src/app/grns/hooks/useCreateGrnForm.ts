import { useState } from 'react';
import {
  chamberTextSchema,
  indianVehicleSchema,
  rentalAmountSchema,
  SEASONAL_RENT_MONTHS,
} from '@cold-storage/contracts';
import type { BagType, Commodity, Customer, Grn, RentType } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

/**
 * Accepts only numeric input for a money or count field. Anything that is not a finite
 * decimal (alphabetic entry, stray punctuation, partial exponent) is rejected outright rather
 * than coerced to NaN and shipped to the API.
 */
export function parseNumericInput(raw: string): number | '' {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d*\.?\d*$/.test(trimmed)) return '';
  if (trimmed === '.') return '';
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : '';
}

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

  const handleBagsChange = (val: number | '') => {
    setCreateBags(val);
    clearFieldError('bags');
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

  const handleBagTypeChange = (val: BagType) => {
    setCreateBagType(val);
    setCreateBags('');
    setCreateSmallBags('');
    setCreateBigBags('');
    setCreateNominalTotalWeight('');
    clearFieldError('bags');
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!createCustomerId) errors.customer = 'Please select a customer';
    if (!createCommodityId) errors.commodity = 'Please select a commodity';
    const parsedChamber = chamberTextSchema.safeParse(createChamber);
    if (!parsedChamber.success) {
      errors.chamber = parsedChamber.error.issues[0]?.message ?? 'Chamber is required';
    }
    if (createBagType === 'S+B') {
      const small = typeof createSmallBags === 'number' ? createSmallBags : 0;
      const big = typeof createBigBags === 'number' ? createBigBags : 0;
      if (small + big <= 0) errors.bags = 'Enter at least one bag count (Small or Big) for Mixed bag type';
    } else if (typeof createBags !== 'number' || createBags <= 0) {
      errors.bags = `${createBagType === 'S' ? 'Small' : 'Big'} bags count must be a positive integer`;
    }
    if (createRentType === 'Monthly' && (typeof createRentMonths !== 'number' || createRentMonths < 1)) {
      errors.rentMonths = 'Rent months is required (>= 1) for Monthly rent';
    }
    const parsedAmount = rentalAmountSchema.safeParse(createRentAmount);
    if (!parsedAmount.success) {
      errors.rentAmount = parsedAmount.error.issues[0]?.message ?? 'Rent amount must be a number';
    }
    const normVehicle = createVehicleNumber.trim().replace(/[\s-]/g, '').toUpperCase();
    if (normVehicle && !indianVehicleSchema.safeParse(normVehicle).success) {
      errors.vehicleNumber = 'Vehicle number must be in standard Indian format (e.g., UP32AA1111)';
    }

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
        chamber: parsedChamber.data, bags: createBags, bagType: createBagType,
        rentType: createRentType, rentAmount: createRentAmount,
      };
      if (createRentType === 'Monthly' && typeof createRentMonths === 'number') payload.rentMonths = createRentMonths;
      if (typeof createNominalUnitWeight === 'number' && createNominalUnitWeight > 0) payload.nominalUnitWeight = createNominalUnitWeight;
      if (typeof createNominalTotalWeight === 'number' && createNominalTotalWeight > 0) payload.nominalTotalWeight = createNominalTotalWeight;
      if (typeof createActualWeight === 'number' && createActualWeight > 0) payload.actualWeight = createActualWeight;
      if (createGpNumber.trim()) payload.gpNumber = createGpNumber.trim();
      if (normVehicle) payload.vehicleNumber = normVehicle;
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
    createChamber,
    setCreateChamber: (value: string) => { setCreateChamber(value); clearFieldError('chamber'); },
    seasonalRentMonths: SEASONAL_RENT_MONTHS,
    createBags, handleBagsChange,
    createBagType, handleBagTypeChange,
    createSmallBags, createBigBags, handleSmallBagsChange, handleBigBagsChange,
    createNominalUnitWeight, handleUnitWeightChange,
    createNominalTotalWeight, setCreateNominalTotalWeight,
    createActualWeight, setCreateActualWeight,
    createRentType, setCreateRentType,
    createRentMonths, setCreateRentMonths: (val: number | '') => { setCreateRentMonths(val); clearFieldError('rentMonths'); },
    createRentAmount, setCreateRentAmount: (val: number | '') => { setCreateRentAmount(val); clearFieldError('rentAmount'); },
    createGpNumber, setCreateGpNumber,
    createVehicleNumber, setCreateVehicleNumber: (val: string) => { setCreateVehicleNumber(val); clearFieldError('vehicleNumber'); },
    createRemarks, setCreateRemarks,
    modalError, fieldErrors, submitting, isDirty, handleSubmit,
  };
}
