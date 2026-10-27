'use client';

import React from 'react';
import type { DeliveryChallan, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { CollectPaymentModal } from '../../rent/components/CollectPaymentModal';
import { UpdateLoanStatusModal } from '../../grns/components/UpdateLoanStatusModal';
import { DeliveryDetailModal } from './DeliveryDetailModal';

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
}: DeliveryPageModalsProps) {
  if (!selectedFacilityId) return null;
  return (
    <>
      {rentPromptDelivery && onConfirmRentPrompt && onCancelRentPrompt && (
        <Modal
          isOpen={Boolean(rentPromptDelivery)}
          title="Challan Issued"
          onClose={onCancelRentPrompt}
          size="sm"
          footer={
            <>
              <Button
                variant="outline"
                id="print-gate-pass-btn"
                onClick={() => onPrintChallan(rentPromptDelivery.id)}
                disabled={!canPrint || printingId === rentPromptDelivery.id}
                isLoading={printingId === rentPromptDelivery.id}
              >
                Print Gate Pass
              </Button>
              <Button
                variant="primary"
                id="collect-rent-now-btn"
                onClick={() => onConfirmRentPrompt(rentPromptDelivery)}
              >
                {`Collect Rent Now (₹${rentPromptDelivery.rentCharge?.toLocaleString('en-IN')})`}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {`Delivery Challan ${rentPromptDelivery.challanNumber} issued successfully for ${rentPromptDelivery.customerName}. Collect Rent Now (₹${rentPromptDelivery.rentCharge?.toLocaleString('en-IN')})?`}
          </div>
        </Modal>
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
    </>
  );
}
