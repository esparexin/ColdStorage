import { useEffect, useState } from 'react';
import { calculateRentAmount, SEASONAL_RENT_MONTHS } from '@cold-storage/contracts';
import type { BagType, Commodity, Customer, Grn, LoanStatus, RentType } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import {
  buildCreateGrnPayload,
  buildEditGrnPayload,
  parseNumericInput,
  toDateInput,
  validateCreateGrnForm,
} from './createGrnForm.helper';
import { submitCreateGrn, submitEditGrn } from './grnFormSubmit.helper';

export { parseNumericInput };

export function useCreateGrnForm(
  facilityId: string,
  customers: Customer[],
  commodities: Commodity[],
  onSuccess: (savedGrn: Grn) => void,
  mode: 'create' | 'edit' = 'create',
  initialGrn?: Grn | null,
  structuralLocked = false,
  guardState?: 'closed' | 'partial' | 'locked' | null,
) {
  const isEdit = mode === 'edit' && Boolean(initialGrn);
  const [createDate, setCreateDate] = useState(() =>
    isEdit ? toDateInput(initialGrn?.date) : new Date().toISOString().split('T')[0],
  );
  const [createCustomerId, setCreateCustomerId] = useState(isEdit ? initialGrn!.customerId : '');
  const [createCommodityId, setCreateCommodityId] = useState(isEdit ? initialGrn!.commodityId : '');
  const [createChamber, setCreateChamber] = useState(isEdit ? initialGrn!.chamber : '');
  const [createBagType, setCreateBagType] = useState<BagType>(isEdit ? initialGrn!.bagType : 'S');
  const [createBags, setCreateBags] = useState<number | ''>(isEdit ? initialGrn!.bags : '');
  const [createRentType, setCreateRentType] = useState<RentType>(isEdit ? initialGrn!.rentType : 'Seasonal');
  const [createRentMonths, setCreateRentMonths] = useState<number | ''>(isEdit ? (initialGrn!.rentMonths ?? '') : '');
  const [createBagPrice, setCreateBagPrice] = useState<number | ''>(isEdit ? (initialGrn!.bagPrice ?? '') : '');
  const [createRentAmount, setCreateRentAmount] = useState<number | ''>(isEdit ? initialGrn!.rentAmount : '');
  const [createPartyMark, setCreatePartyMark] = useState(isEdit ? (initialGrn!.partyMark ?? '') : '');
  const [suggestedGrnNumber, setSuggestedGrnNumber] = useState('');
  const [lastCreatedGrn, setLastCreatedGrn] = useState<string | null>(null);
  const [createGrnNumber, setCreateGrnNumber] = useState(isEdit ? initialGrn!.grnNumber.slice(-4) : '');
  const [createVehicleNumber, setCreateVehicleNumber] = useState(isEdit ? (initialGrn!.vehicleNumber ?? '') : '');
  const [createRemarks, setCreateRemarks] = useState(isEdit ? (initialGrn!.remarks ?? '') : '');
  const [isBondForLoan, setIsBondForLoan] = useState(isEdit ? (initialGrn!.isBondForLoan ?? false) : false);
  const [loanStatus, setLoanStatus] = useState<LoanStatus>(isEdit ? (initialGrn!.loanStatus ?? 'NONE') : 'NONE');
  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (facilityId) {
      requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns/next-grn-number`)
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { lastCreatedGrn?: string | null; nextGrn?: string } | null) => {
          if (!active || !d?.nextGrn) return;
          setLastCreatedGrn(d.lastCreatedGrn ?? null);
          setSuggestedGrnNumber(d.nextGrn);
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [facilityId]);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  const focusField = (fieldId: string) => {
    const el = typeof document !== 'undefined' ? document.getElementById(fieldId) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  };

  const autoComputeRent = (overrides?: Partial<{
    bags: number | ''; bagType: BagType;
    bagPrice: number | '';
    rentType: RentType; rentMonths: number | '';
  }>) => {
    const bags = overrides?.bags ?? createBags;
    const bagType = overrides?.bagType ?? createBagType;
    const bagPrice = overrides?.bagPrice ?? createBagPrice;
    const rentType = overrides?.rentType ?? createRentType;
    const rentMonths = overrides?.rentMonths ?? createRentMonths;

    if (typeof bags === 'number' && bags > 0) {
      const calc = calculateRentAmount({
        rentType, bags, bagType,
        bagPrice: typeof bagPrice === 'number' ? bagPrice : null,
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
    autoComputeRent({ bags: val });
  };

  const handleBagTypeChange = (val: BagType) => {
    setCreateBagType(val);
    setCreateBags('');
    clearFieldError('bags');
  };

  const handleRentMonthsChange = (val: number | '') => {
    setCreateRentMonths(val);
    clearFieldError('rentMonths');
    autoComputeRent({ rentMonths: val });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && initialGrn) {
      if (guardState === 'closed') {
        setModalError(`Cannot correct GRN '${initialGrn.grnNumber}': it is CLOSED and its stock has been fully delivered`);
        return;
      }
      const trimmedChamber = createChamber.trim();
      if (!trimmedChamber || trimmedChamber.length > 20) {
        setFieldErrors({ chamber: 'Chamber is required (max 20 characters)' });
        setModalError('Chamber is required (max 20 characters)');
        return;
      }
      const { payload, hasChanges } = buildEditGrnPayload({
        initialGrn,
        structuralLocked,
        createCustomerId,
        createDate,
        createCommodityId,
        createChamber,
        createBags,
        createBagType,
        createRentType,
        createRentMonths,
        createRentAmount,
        createBagPrice,
        createPartyMark,
        createVehicleNumber,
        createRemarks,
      });
      if (!hasChanges) {
        setModalError('No changes detected to save');
        return;
      }
      setSubmitting(true);
      setModalError(null);
      try {
        const updated = await submitEditGrn(facilityId, initialGrn.id, payload);
        onSuccess(updated);
      } catch (err: unknown) {
        setModalError(err instanceof Error ? err.message : 'Failed to update GRN');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const { errors, parsedChamber, normalizedVehicle } = validateCreateGrnForm({
      createCustomerId, createCommodityId, createChamber, createBags, createBagType,
      createGrnNumber, createRentType, createRentMonths, createRentAmount,
      createBagPrice, createPartyMark, createVehicleNumber,
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      const fieldIdMap: Record<string, string> = {
        customer: 'create-customer-search', commodity: 'create-commodity', chamber: 'create-chamber',
        partyMark: 'create-party-mark',
        bags: 'create-bags', grnNumber: 'create-grn-number',
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
      const payload = buildCreateGrnPayload({
        facilityId, inwardDate, grnNumber: createGrnNumber.trim(),
        customerId: createCustomerId, commodityId: createCommodityId,
        chamber: parsedChamber ?? createChamber, bags: Number(createBags), bagType: createBagType,
        rentType: createRentType, rentAmount: Number(createRentAmount),
        bagPrice: createBagPrice, rentMonths: createRentMonths,
        partyMark: createPartyMark,
        vehicleNumber: normalizedVehicle, remarks: createRemarks,
        isBondForLoan, loanStatus,
      });

      const created = await submitCreateGrn(facilityId, payload);
      onSuccess(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create GRN';
      setModalError(msg);
      focusField('modal-error-banner');
    } finally {
      setSubmitting(false);
    }
  };

  const isDirty = Boolean(
    createGrnNumber.trim() || createCustomerId || createCommodityId || createBags ||
    createRentAmount || createBagPrice ||
    createPartyMark.trim() ||
    createVehicleNumber.trim() || createRemarks.trim() || isBondForLoan,
  );

  return {
    createDate, setCreateDate,
    createCustomerId, setCreateCustomerId: (id: string) => { setCreateCustomerId(id); clearFieldError('customer'); },
    createCommodityId, setCreateCommodityId: (id: string) => { setCreateCommodityId(id); clearFieldError('commodity'); },
    createChamber, setCreateChamber: (value: string) => { setCreateChamber(value); clearFieldError('chamber'); },
    seasonalRentMonths: SEASONAL_RENT_MONTHS,
    createBags, handleBagsChange,
    createBagType, handleBagTypeChange,
    createRentType, handleRentTypeChange: (val: RentType) => { setCreateRentType(val); autoComputeRent({ rentType: val }); },
    createRentMonths, handleRentMonthsChange,
    createBagPrice, handleBagPriceChange: (val: number | '') => { setCreateBagPrice(val); autoComputeRent({ bagPrice: val }); },
    createRentAmount, setCreateRentAmount: (val: number | '') => { setCreateRentAmount(val); clearFieldError('rentAmount'); },
    createGrnNumber, setCreateGrnNumber: (val: string) => {
      const digitsOnly = val.replace(/\D/g, '').slice(0, 4);
      setCreateGrnNumber(digitsOnly);
      clearFieldError('grnNumber');
    },
    lastCreatedGrn, suggestedGrnNumber,
    createPartyMark, setCreatePartyMark: (val: string) => { setCreatePartyMark(val); clearFieldError('partyMark'); },
    createVehicleNumber, setCreateVehicleNumber: (val: string) => { setCreateVehicleNumber(val); clearFieldError('vehicleNumber'); },
    createRemarks, setCreateRemarks,
    isBondForLoan, setIsBondForLoan, loanStatus, setLoanStatus,
    modalError, fieldErrors, submitting, isDirty, handleSubmit,
  };
}
