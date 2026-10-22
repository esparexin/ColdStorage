import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface GrnDeleteConfirmDialogProps {
  isOpen: boolean;
  targetGrn: Grn | null;
  deleteError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GrnDeleteConfirmDialog({
  isOpen,
  targetGrn,
  deleteError,
  onConfirm,
  onCancel,
}: GrnDeleteConfirmDialogProps) {
  if (!isOpen || !targetGrn) return null;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={`Delete GRN ${targetGrn.grnNumber} (Testing Only)`}
      message={
        <>
          <p>
            This will permanently delete GRN <strong>{targetGrn.grnNumber}</strong> and all
            associated records:{' '}
          </p>
          <ul>
            <li>Rent payments and extensions</li>
            <li>Inventory transactions (inward/outward ledger)</li>
            <li>Delivery challans and reversals</li>
            <li>Internal movement records</li>
          </ul>
          <p>
            This action cannot be undone. The GRN number <strong>{targetGrn.grnNumber}</strong>
            must be entered as confirmation.
          </p>
          {deleteError && <p style={{ color: 'var(--color-danger-text)' }}>{deleteError}</p>}
        </>
      }
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmLabel="Delete GRN"
      confirmVariant="danger"
    />
  );
}
