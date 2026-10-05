import { useEffect, useState } from 'react';
import { calculateRentAmount, SEASONAL_RENT_MONTHS } from '@cold-storage/contracts';
import type { BagType, Commodity, Customer, Grn, LoanStatus, RentType } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { buildCreateGrnPayload, parseNumericInput, validateCreateGrnForm } from './createGrnForm.helper';

export { parseNumericInput };

export function useCreateGrnForm(
  facilityId: string, customers: Customer[], commodities: Commodity[], onSuccess: (newGrn: Grn) => void,
) {
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [createCustomerId, setCreateCustomerId] = useState(''), [createCommodityId, setCreateCommodityId] = useState('');
  const [createChamber, setCreateChamber] = useState(''), [createBagType, setCreateBagType] = useState<BagType>('S');
  const [createBags, setCreateBags] = useState<number | ''>('');
  const [createRentType, setCreateRentType] = useState<RentType>('Seasonal'), [createRentMonths, setCreateRentMonths] = useState<number | ''>('');
  const [createBagPrice, setCreateBagPrice] = useState<number | ''>('');
  const [createRentAmount, setCreateRentAmount] = useState<number | ''>('');
  const [createPartyMark, setCreatePartyMark] = useState('');
  const [suggestedGrnNumber, setSuggestedGrnNumber] = useState('');
  const [createVehicleNumber, setCreateVehicleNumber] = useState(''), [createRemarks, setCreateRemarks] = useState('');
  const [isBondForLoan, setIsBondForLoan] = useState(false), [loanStatus, setLoanStatus] = useState<LoanStatus>('NONE');
  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (facilityId) {
      requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns/next-grn-number`)
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { nextGrnNumber?: string } | null) => { if (active && d?.nextGrnNumber) setSuggestedGrnNumber(d.nextGrnNumber); })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [facilityId]);

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
    const { errors, parsedChamber, normalizedVehicle } = validateCreateGrnForm({
      createCustomerId, createCommodityId, createChamber, createBags, createBagType,
      createRentType, createRentMonths, createRentAmount,
      createBagPrice, createPartyMark, createVehicleNumber,
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      const fieldIdMap: Record<string, string> = {
        customer: 'create-customer-search', commodity: 'create-commodity', chamber: 'create-chamber',
        partyMark: 'create-party-mark',
        bags: 'create-bags',
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
        facilityId, inwardDate, customerId: createCustomerId, commodityId: createCommodityId,
        chamber: parsedChamber ?? createChamber, bags: Number(createBags), bagType: createBagType,
        rentType: createRentType, rentAmount: Number(createRentAmount),
        bagPrice: createBagPrice, rentMonths: createRentMonths,
        partyMark: createPartyMark,
        vehicleNumber: normalizedVehicle, remarks: createRemarks,
        isBondForLoan, loanStatus,
      });

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
    createCustomerId || createCommodityId || createBags ||
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
    createPartyMark, setCreatePartyMark: (val: string) => { setCreatePartyMark(val); clearFieldError('partyMark'); },
    suggestedGrnNumber,
    createVehicleNumber, setCreateVehicleNumber: (val: string) => { setCreateVehicleNumber(val); clearFieldError('vehicleNumber'); },
    createRemarks, setCreateRemarks,
    isBondForLoan, setIsBondForLoan, loanStatus, setLoanStatus,
    modalError, fieldErrors, submitting, isDirty, handleSubmit,
  };
}
