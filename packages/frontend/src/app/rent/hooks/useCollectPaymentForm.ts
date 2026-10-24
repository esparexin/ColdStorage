'use client';

import { useMemo, useState } from 'react';
import type { PaymentMode, RentSummaryDto } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { formatApiErrorMessage, parseApiResponse } from '@/lib/api-response';

interface UseCollectPaymentFormProps {
  account: RentSummaryDto;
  selectedFacilityId: string;
  onPaymentSuccess: (summary?: RentSummaryDto) => void;
}

import {
  calculatePendingAfterPayment,
  isCollectPaymentFormDirty,
  validateCollectPayment,
  type CollectPaymentFormValues,
} from './collectPayment.helper';

export {
  calculatePendingAfterPayment,
  isCollectPaymentFormDirty,
  validateCollectPayment,
  type CollectPaymentFormValues,
};

export function useCollectPaymentForm({
  account,
  selectedFacilityId,
  onPaymentSuccess,
}: UseCollectPaymentFormProps) {
  const initialAmount = account.remainingBalance > 0 ? account.remainingBalance : '';
  const initialDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [collectAmount, setCollectAmount] = useState<number | ''>(initialAmount);
  const [collectMode, setCollectMode] = useState<PaymentMode>('Cash');
  const [collectDate, setCollectDate] = useState(initialDate);
  const [collectNotes, setCollectNotes] = useState('');
  const [upiReference, setUpiReference] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  const pendingAfterPayment = useMemo(
    () => calculatePendingAfterPayment(account.remainingBalance, collectAmount),
    [account.remainingBalance, collectAmount],
  );

  const isDirty = useMemo(
    () =>
      isCollectPaymentFormDirty(
        {
          amount: collectAmount,
          mode: collectMode,
          date: collectDate,
          notes: collectNotes,
          upiReference,
        },
        {
          amount: initialAmount,
          mode: 'Cash',
          date: initialDate,
          notes: '',
          upiReference: '',
        },
      ),
    [collectAmount, initialAmount, collectMode, collectDate, initialDate, collectNotes, upiReference],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;

    const validationError = validateCollectPayment(
      collectAmount,
      account.remainingBalance,
      collectMode,
      upiReference,
    );
    if (validationError) {
      setCollectError(validationError);
      return;
    }

    setCollectSubmitting(true);
    setCollectError(null);

    const trimmedNotes = collectNotes.trim();
    const effectiveNotes = [
      collectMode === 'UPI' ? `UPI Ref: ${upiReference.trim()}` : null,
      trimmedNotes || null,
    ]
      .filter(Boolean)
      .join(' - ') || undefined;

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/collect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grnId: account.grnId,
            amountPaid: collectAmount,
            paymentMode: collectMode,
            paymentDate: new Date(collectDate),
            notes: effectiveNotes,
          }),
        },
      );

      const parsed = await parseApiResponse<{
        payment: { receiptNumber: string };
        summary: RentSummaryDto;
      }>(res);

      if (!parsed.ok) {
        throw new Error(formatApiErrorMessage(parsed));
      }

      onPaymentSuccess(parsed.data.summary);
    } catch (err: unknown) {
      setCollectError(err instanceof Error ? err.message : 'Failed to collect payment');
    } finally {
      setCollectSubmitting(false);
    }
  };

  return {
    pendingAfterPayment,
    collectAmount,
    setCollectAmount,
    collectMode,
    setCollectMode,
    collectDate,
    setCollectDate,
    collectNotes,
    setCollectNotes,
    upiReference,
    setUpiReference,
    collectError,
    collectSubmitting,
    isDirty,
    handleSubmit,
  };
}
