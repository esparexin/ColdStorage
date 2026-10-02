'use client';

import { useState } from 'react';
import type { PaymentMode, RentSummaryDto } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

interface UseCollectPaymentFormProps {
  account: RentSummaryDto;
  selectedFacilityId: string;
  onPaymentSuccess: (summary?: RentSummaryDto) => void;
}

export function useCollectPaymentForm({
  account,
  selectedFacilityId,
  onPaymentSuccess,
}: UseCollectPaymentFormProps) {
  const [collectAmount, setCollectAmount] = useState<number | ''>(
    account.remainingBalance > 0 ? account.remainingBalance : '',
  );
  const [collectMode, setCollectMode] = useState<PaymentMode>('Cash');
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [collectNotes, setCollectNotes] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;

    if (typeof collectAmount !== 'number' || collectAmount <= 0) {
      setCollectError('Payment amount must be greater than zero');
      return;
    }

    if (collectAmount > account.remainingBalance) {
      setCollectError(
        `Amount (₹${collectAmount}) exceeds remaining balance of ₹${account.remainingBalance}`,
      );
      return;
    }

    setCollectSubmitting(true);
    setCollectError(null);

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
            notes: collectNotes.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? `Payment failed with HTTP ${res.status}`);
      }

      const result = (await res.json()) as {
        payment: { receiptNumber: string };
        summary: RentSummaryDto;
      };

      onPaymentSuccess(result.summary);
    } catch (err: unknown) {
      setCollectError(err instanceof Error ? err.message : 'Failed to collect payment');
    } finally {
      setCollectSubmitting(false);
    }
  };

  const handlePreviewReceipt = async () => {
    if (!selectedFacilityId || typeof collectAmount !== 'number') return;
    try {
      const params = new URLSearchParams({
        customerName: account.customerName,
        customerMobile: account.customerMobile,
        amount: String(collectAmount),
        paymentMode: collectMode,
      });
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/rent-receipt/preview?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Receipt preview failed');
      }
      const html = await res.text();
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) {
        alert('Pop-up window was blocked.');
        return;
      }
      previewWindow.document.open();
      previewWindow.document.write(html);
      previewWindow.document.close();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to preview receipt');
    }
  };

  return {
    collectAmount,
    setCollectAmount,
    collectMode,
    setCollectMode,
    collectDate,
    setCollectDate,
    collectNotes,
    setCollectNotes,
    collectError,
    collectSubmitting,
    handleSubmit,
    handlePreviewReceipt,
  };
}
