'use client';

import { useMemo, useState } from 'react';
import type {
  PaymentMode,
  RecordBatchRentPaymentResult,
  RentSummaryDto,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { formatApiErrorMessage, parseApiResponse } from '@/lib/api-response';
import {
  autoAllocatePayment,
  getCustomersWithRentDues,
  getGrnsForCustomer,
  validateBatchCollectPayment,
} from './batchCollectPayment.helper';

interface UseBatchCollectPaymentFormProps {
  accounts: RentSummaryDto[];
  selectedFacilityId: string;
  onSuccess: (result: RecordBatchRentPaymentResult) => void;
}

export function useBatchCollectPaymentForm({
  accounts,
  selectedFacilityId,
  onSuccess,
}: UseBatchCollectPaymentFormProps) {
  const customerOptions = useMemo(() => getCustomersWithRentDues(accounts), [accounts]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customerOptions[0]?.customerId ?? '',
  );
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [upiReference, setUpiReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const customerGrns = useMemo(
    () => getGrnsForCustomer(accounts, selectedCustomerId),
    [accounts, selectedCustomerId],
  );

  const totalOutstanding = useMemo(
    () => customerGrns.reduce((sum, g) => sum + g.remainingBalance, 0),
    [customerGrns],
  );

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0),
    [allocations],
  );

  const pendingAfterPayment = useMemo(
    () => Math.max(0, Number((totalOutstanding - totalAllocated).toFixed(2))),
    [totalOutstanding, totalAllocated],
  );

  const handleCustomerChange = (newCustomerId: string) => {
    setSelectedCustomerId(newCustomerId);
    setTotalAmount('');
    setAllocations({});
    setError(null);
  };

  const handleAutoAllocate = () => {
    const amt = typeof totalAmount === 'number' ? totalAmount : 0;
    if (amt <= 0) {
      setError('Please enter a total payment amount before auto-allocating');
      return;
    }
    setError(null);
    const newAllocations = autoAllocatePayment(customerGrns, amt);
    setAllocations(newAllocations);
  };

  const handleAllocationChange = (grnId: string, amount: number) => {
    setAllocations((prev) => ({
      ...prev,
      [grnId]: Math.max(0, amount),
    }));
  };

  const isDirty = useMemo(
    () => totalAllocated > 0 || notes.trim().length > 0 || upiReference.trim().length > 0,
    [totalAllocated, notes, upiReference],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !selectedCustomerId) return;

    const validationError = validateBatchCollectPayment(
      allocations,
      customerGrns,
      paymentMode,
      upiReference,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    const activeAllocations = Object.entries(allocations)
      .filter(([_, amt]) => amt > 0)
      .map(([grnId, amountPaid]) => ({ grnId, amountPaid }));

    const trimmedNotes = notes.trim();
    const effectiveNotes = [
      paymentMode === 'UPI' ? `UPI Ref: ${upiReference.trim()}` : null,
      trimmedNotes || null,
    ]
      .filter(Boolean)
      .join(' - ') || undefined;

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/collect-batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: selectedCustomerId,
            allocations: activeAllocations,
            paymentMode,
            paymentDate: new Date(paymentDate),
            notes: effectiveNotes,
          }),
        },
      );

      const parsed = await parseApiResponse<RecordBatchRentPaymentResult>(res);
      if (!parsed.ok) {
        throw new Error(formatApiErrorMessage(parsed));
      }

      onSuccess(parsed.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record batch payment');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    customerOptions,
    selectedCustomerId,
    handleCustomerChange,
    customerGrns,
    totalAmount,
    setTotalAmount,
    allocations,
    handleAllocationChange,
    handleAutoAllocate,
    totalOutstanding,
    totalAllocated,
    pendingAfterPayment,
    paymentMode,
    setPaymentMode,
    paymentDate,
    setPaymentDate,
    notes,
    setNotes,
    upiReference,
    setUpiReference,
    error,
    submitting,
    isDirty,
    handleSubmit,
  };
}
