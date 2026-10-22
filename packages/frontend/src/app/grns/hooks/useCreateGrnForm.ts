import { useEffect, useState } from 'react';
import type { Commodity, Customer, Grn, LoanStatus, RentType } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
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
  const [createBags, setCreateBags] = useState<number | ''>(isEdit ? initialGrn!.bags : '');
  const [createRentType, setCreateRentType] = useState<RentType>(isEdit ? initialGrn!.rentType : 'Seasonal');
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

  const handleBagsChange = (val: number | '') => {
    setCreateBags(val);
    clearFieldError('bags');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && initialGrn) {
      await handleEditGrnSubmit({
        facilityId, initialGrn, guardState, createChamber, createCustomerId,
        createDate, createCommodityId, createBags,
        createBagType: initialGrn.bagType,
        createRentType,
        createRentMonths: initialGrn.rentMonths ?? '',
        createRentAmount: initialGrn.rentAmount ?? '',
        createBagPrice: initialGrn.bagPrice ?? '',
        createSmallBagPrice: initialGrn.smallBagPrice ?? '',
        createBigBagPrice: initialGrn.bigBagPrice ?? '',
        createTotalBagsWeight: initialGrn.totalBagsWeight ?? '',
        createPartyMark, createVehicleNumber, createRemarks, structuralLocked, onSuccess,
        setFieldErrors, setModalError, setSubmitting,
      });
      return;
    }

    if (isGrnInvalid) {
      if (!createGrnNumber.trim() || createGrnNumber.trim().length !== 4) {
        setFieldErrors((prev) => ({ ...prev, grnNumber: 'GRN must be exactly 4 digits (numbers only)' }));
      }
      setModalError(null);
      focusField('create-gr-number');
      return;
    }

    const { errors, parsedChamber, normalizedVehicle } = validateCreateGrnForm({
      createCustomerId, createCommodityId, createChamber, createBags,
      createGrnNumber, createRentType, createPartyMark, createVehicleNumber,
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setModalError(null);
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
        chamber: parsedChamber ?? createChamber, bags: Number(createBags),
        rentType: createRentType,
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
    createPartyMark.trim() || createVehicleNumber.trim() || createRemarks.trim() || isBondForLoan,
  );

  return {
    createDate, setCreateDate,
    createCustomerId, setCreateCustomerId: (id: string) => { setCreateCustomerId(id); clearFieldError('customer'); },
    createCommodityId, setCreateCommodityId: (id: string) => {
      setCreateCommodityId(id);
      clearFieldError('commodity');
      const comm = commodities.find((c) => c.id === id);
      if (comm?.seasonDuration === 'Seasonal_3M' && createRentType === 'Seasonal') setCreateRentType('Seasonal_3M');
      if (comm?.seasonDuration === 'Seasonal' && createRentType === 'Seasonal_3M') setCreateRentType('Seasonal');
    },
    createChamber, setCreateChamber: (value: string) => { setCreateChamber(value); clearFieldError('chamber'); },
    createBags, handleBagsChange,
    createRentType, handleRentTypeChange: (val: RentType) => { setCreateRentType(val); },
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
