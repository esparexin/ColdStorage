'use client';

import React from 'react';
import { seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';
import { X } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import stepStyles from './MergeStep1Batches.module.css';

export interface SelectedSourcesPanelProps {
  selectedSources: Grn[];
  totalSourceBags: number;
  onDeselectSource: (id: string) => void;
}

export function SelectedSourcesPanel({
  selectedSources,
  totalSourceBags,
  onDeselectSource,
}: SelectedSourcesPanelProps) {
  if (selectedSources.length === 0) return null;

  return (
    <div className={stepStyles.selectedSourcesPanel}>
      <div className={stepStyles.selectedSourcesHeader}>
        <span className={stepStyles.selectedSourcesTitle}>
          {selectedSources.length === 1 ? 'Selected Source GRN' : `Selected Source GRNs (${selectedSources.length})`}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>
          {selectedSources.length > 1 ? `Consolidated Pool: ${totalSourceBags} Bags` : `+${totalSourceBags} Bags to Merge`}
        </span>
      </div>
      <div className={stepStyles.selectedSourcesList}>
        {selectedSources.map((sg) => (
          <div key={sg.id} className={stepStyles.selectedSourceItem}>
            <div className={stepStyles.selectedSourceMain}>
              <div className={stepStyles.selectedSourceGrnRow}>
                <span className={stepStyles.selectedSourceNumber}>{sg.grnNumber}</span>
                <Badge variant="neutral">Season {seasonYearForInwardDate(sg.date)}</Badge>
                <Badge variant="primary">{sg.closingBags ?? sg.bags} Bags</Badge>
                <span className={stepStyles.selectedSourceCustomer}>{sg.customerName}</span>
              </div>
              <div className={stepStyles.selectedSourceSub}>
                <span>{sg.commodityName}{sg.chamber ? ` (Ch. ${sg.chamber})` : ''}</span>
                <span>•</span>
                <span>Rent: {sg.rentAmount != null ? `₹${sg.rentAmount.toLocaleString('en-IN')}` : '₹0'}</span>
                {sg.loanStatus && sg.loanStatus !== 'NONE' && (
                  <>
                    <span>•</span>
                    <span>Loan: {sg.loanStatus === 'CLEARED' ? 'Cleared' : sg.loanStatus}</span>
                  </>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={stepStyles.deselectIconBtn}
              onClick={() => onDeselectSource(sg.id)}
              aria-label={`Deselect GRN ${sg.grnNumber}`}
              title="Deselect this GRN"
            >
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
