import { useEffect, useState } from 'react';
import type { BagType, Commodity, Customer, Grn, LoanStatus, RentType } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useCommodityRate } from './useCommodityRate';
import {
  buildCreateGrnPayload,
  focusField,
  GRN_FIELD_ID_MAP,
  parseNumericInput,
  toDateInput,
  validateCreateGrnForm,
} from './createGrnForm.helper';
import { handleEditGrnSubmit, submitCreateGrn } from './grnFormSubmit.helper';
import {
  formatGrnDuplicateError,
  isDuplicateGrnError,
  useLiveGrnValidation,
} from './useLiveGrnValidation';

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
  const [createBagType] = useState<BagType>(isEdit ? initialGrn!.bagType : 'S/B');
  const [createBags, setCreateBags] = useState<number | ''>(isEdit ? initialGrn!.bags : '');
  const [createRentType, setCreateRentType] = useState<RentType>(isEdit ? initialGrn!.rentType : 'Seasonal');
  const [createRentMonths, setCreateRentMonths] = useState<number | ''>(isEdit ? (initialGrn!.rentMonths ?? '') : '');
  const [createBagPrice] = useState<number | ''>(isEdit ? (initialGrn!.bagPrice ?? '') : '');
  const [createSmallBagPrice, setCreateSmallBagPrice] = useState<number | ''>(isEdit ? (initialGrn?.smallBagPrice ?? '') : '');
  const [createBigBagPrice, setCreateBigBagPrice] = useState<number | ''>(isEdit ? (initialGrn?.bigBagPrice ?? '') : '');
  const [createTotalBagsWeight, setCreateTotalBagsWeight] = useState<number | ''>(isEdit ? (initialGrn?.totalBagsWeight ?? '') : '');
  const [createRentAmount, setCreateRentAmount] = useState<number | ''>(isEdit ? (initialGrn?.rentAmount ?? '') : '');
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
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const { isCheckingGrn, isGrnInvalid, handleGrnBlur } = useLiveGrnValidation({
    facilityId,
    createGrnNumber,
    isEdit,
    fieldError: fieldErrors.grnNumber,
    setFieldErrors,
  });

  // Price Controller authority: agreed rates come from the active controller
  // row, never from operator input. Locked edits show stored history instead.
  const {
    rate: controllerRate, loading: rateLoading, error: rateError, retry: retryRate,
  } = useCommodityRate(createCommodityId, createRentType, { disabled: structuralLocked });

  useEffect(() => {
    if (!structuralLocked && controllerRate) {
      setCreateSmallBagPrice(controllerRate.small);
      setCreateBigBagPrice(controllerRate.big);
      clearFieldError('rate');
    }
  }, [controllerRate, structuralLocked]);

  const num = (v: number | ''): number | null => (typeof v === 'number' ? v : null);
  const sRate = num(createSmallBagPrice) ?? num(createBagPrice);
  const bRate = num(createBigBagPrice) ?? num(createBagPrice);
  const displayRate = structuralLocked
    ? sRate == null && bRate == null ? null : { small: sRate ?? 0, big: bRate ?? 0 }
    : controllerRate;
  const isRateUnresolved = !structuralLocked && Boolean(createCommodityId) && (rateLoading || !controllerRate);

  const handleBagsChange = (val: number | '') => {
    setCreateBags(val);
    clearFieldError('bags');
  };

  const handleRentMonthsChange = (val: number | '') => {
    setCreateRentMonths(val);
    clearFieldError('rentMonths');
  };

  const handleTotalBagsWeightChange = (val: number | '') => {
    setCreateTotalBagsWeight(val);
    clearFieldError('totalBagsWeight');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && initialGrn) {
      await handleEditGrnSubmit({
        facilityId, initialGrn, guardState, createChamber, createCustomerId,
        createDate, createCommodityId, createBags, createBagType, createRentType,
        createRentMonths, createRentAmount, createBagPrice,
        createSmallBagPrice, createBigBagPrice, createTotalBagsWeight,
        createPartyMark, createVehicleNumber, createRemarks, structuralLocked, onSuccess,
        setFieldErrors, setModalError, setSubmitting,
      });
      return;
    }

    if (isGrnInvalid) {
      if (!createGrnNumber.trim() || createGrnNumber.trim().length !== 4) {
        setFieldErrors((prev) => ({ ...prev, grnNumber: 'GRN must be exactly 4 digits (numbers only)' }));
      }
      focusField('create-gr-number');
      return;
    }

    const { errors, parsedChamber, normalizedVehicle } = validateCreateGrnForm({
      createCustomerId, createCommodityId, createChamber, createBags, createBagType,
      createGrnNumber, createRentType, createRentMonths, createRentAmount,
      createBagPrice, createSmallBagPrice, createBigBagPrice, createTotalBagsWeight,
      createPartyMark, createVehicleNumber,
    }, {
      controllerRate, rateRequired: Boolean(createCommodityId), rateError, rateLoading,
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const otherErrors = Object.keys(errors).filter((k) => k !== 'grnNumber');
      setModalError(otherErrors.length > 0 ? errors[otherErrors[0]] : null);
      const firstKey = Object.keys(errors)[0];
      focusField(GRN_FIELD_ID_MAP[firstKey] ?? firstKey);
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
        rentType: createRentType,
        rentMonths: createRentType === 'Monthly' && typeof createRentMonths === 'number' ? createRentMonths : '',
        smallBagPrice: createSmallBagPrice,
        bigBagPrice: createBigBagPrice,
        totalBagsWeight: createTotalBagsWeight,
        partyMark: createPartyMark,
        vehicleNumber: normalizedVehicle, remarks: createRemarks,
        isBondForLoan, loanStatus,
      });

      const created = await submitCreateGrn(facilityId, payload);
      onSuccess(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create GRN';
      if (isDuplicateGrnError(msg)) {
        setFieldErrors((prev) => ({
          ...prev,
          grnNumber: msg.includes('already exists for this facility')
            ? msg
            : formatGrnDuplicateError(createGrnNumber),
        }));
        setModalError(null);
        focusField('create-gr-number');
      } else {
        setModalError(msg);
        focusField('grn-modal-error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isDirty = Boolean(
    createGrnNumber.trim() || createCustomerId || createCommodityId || createBags ||
    createSmallBagPrice !== '' || createBigBagPrice !== '' || createTotalBagsWeight !== '' ||
    createPartyMark.trim() ||
    createVehicleNumber.trim() || createRemarks.trim() || isBondForLoan,
  );

  return {
    createDate, setCreateDate,
    createCustomerId, setCreateCustomerId: (id: string) => { setCreateCustomerId(id); clearFieldError('customer'); },
    createCommodityId, setCreateCommodityId: (id: string) => { setCreateCommodityId(id); clearFieldError('commodity'); clearFieldError('rate'); },
    createChamber, setCreateChamber: (value: string) => { setCreateChamber(value); clearFieldError('chamber'); },
    createBags, handleBagsChange,
    createBagType,
    createRentType, handleRentTypeChange: (val: RentType) => {
      setCreateRentType(val);
      clearFieldError('rentMonths');
      clearFieldError('rate');
    },
    createRentMonths, handleRentMonthsChange,
    createBagPrice,
    createSmallBagPrice, createBigBagPrice,
    displayRate, rateLoading, rateError, retryRate, isRateUnresolved,
    createTotalBagsWeight, handleTotalBagsWeightChange,
    createRentAmount, setCreateRentAmount: (val: number | '') => { setCreateRentAmount(val); },
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
    isCheckingGrn, isGrnInvalid, handleGrnBlur,
  };
}
