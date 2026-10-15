'use client';

import React from 'react';
import type { DeliveryChallan, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { ConfirmDialog } from '@/components/ui';
import { CollectPaymentModal } from '../../rent/components/CollectPaymentModal';
import { UpdateLoanStatusModal } from '../../grns/components/UpdateLoanStatusModal';
import { DeliveryDetailModal } from './DeliveryDetailModal';
import { DeliveryReversalModal } from './DeliveryReversalModal';

interface DeliveryPageModalsProps {
  selectedFacilityId: string | null;
  selectedDelivery: DeliveryChallan | null;
  loanClearGrn: Grn | null;
  rentPayAccount: RentSummaryDto | null;
  canPrint: boolean;
  printingId: string | null;
  onCloseDetail: () => void;
  onCloseLoanClear: () => void;
  onLoanCleared: () => void;
  onCloseRentPay: () => void;
  onRentPaid: () => void;
  onPrintChallan: (challanId: string) => void;
  rentPromptDelivery?: DeliveryChallan | null;
  onConfirmRentPrompt?: (delivery: DeliveryChallan) => void;
  onCancelRentPrompt?: () => void;
  reverseDeliveryTarget?: DeliveryChallan | null;
  onCloseReverse?: () => void;
  onReversalSuccess?: () => void;
}

export function DeliveryPageModals({
  selectedFacilityId,
  selectedDelivery,
  loanClearGrn,
  rentPayAccount,
  canPrint,
  printingId,
  onCloseDetail,
  onCloseLoanClear,
  onLoanCleared,
  onCloseRentPay,
  onRentPaid,
  onPrintChallan,
  rentPromptDelivery,
  onConfirmRentPrompt,
  onCancelRentPrompt,
  reverseDeliveryTarget,
  onCloseReverse,
  onReversalSuccess,
}: DeliveryPageModalsProps) {
  if (!selectedFacilityId) return null;
  return (
    <>
      {rentPromptDelivery && onConfirmRentPrompt && onCancelRentPrompt && (
        <ConfirmDialog
          isOpen={Boolean(rentPromptDelivery)}
          title="Challan Issued"
          confirmLabel={`Collect Rent Now (₹${rentPromptDelivery.rentCharge?.toLocaleString('en-IN')})`}
          cancelLabel="Later"
          confirmVariant="primary"
          onCancel={onCancelRentPrompt}
          onConfirm={() => onConfirmRentPrompt(rentPromptDelivery)}
          message={`Delivery Challan ${rentPromptDelivery.challanNumber} issued successfully for ${rentPromptDelivery.customerName}.\n\nCollect Rent Now (₹${rentPromptDelivery.rentCharge?.toLocaleString('en-IN')})?`}
        />
      )}
      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={onCloseDetail}
          canPrint={canPrint}
          printingId={printingId}
          onPrintChallan={onPrintChallan}
        />
      )}

      {loanClearGrn && (
        <UpdateLoanStatusModal
          grn={loanClearGrn}
          facilityId={selectedFacilityId}
          onClose={onCloseLoanClear}
          onSuccess={() => onLoanCleared()}
        />
      )}

      {rentPayAccount && (
        <CollectPaymentModal
          account={rentPayAccount}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          onClose={onCloseRentPay}
          onPaymentSuccess={onRentPaid}
        />
      )}

      {reverseDeliveryTarget && onCloseReverse && onReversalSuccess && (
        <DeliveryReversalModal
          facilityId={selectedFacilityId}
          delivery={reverseDeliveryTarget}
          onClose={onCloseReverse}
          onSuccess={onReversalSuccess}
        />
      )}
    </>
  );
}
