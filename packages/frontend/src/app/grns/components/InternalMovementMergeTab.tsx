'use client';

import React, { useMemo, useState } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

interface InternalMovementMergeTabProps {
  currentGrn: Grn;
  allGrns: Grn[];
  submitting: boolean;
  onExecuteMerge: (
    targetGrnId: string,
    sourceGrnIds: string[],
    reason: string,
    remarks?: string,
  ) => Promise<void>;
}

export function InternalMovementMergeTab({
  currentGrn,
  allGrns,
  submitting,
  onExecuteMerge,
}: InternalMovementMergeTabProps) {
  const [targetGrnId, setTargetGrnId] = useState<string>(currentGrn.id);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const eligibleSources = useMemo(
    () => openGrns.filter((g) => g.id !== targetGrnId && (g.closingBags ?? g.bags) > 0 && g.loanStatus !== 'TAKEN'),
    [openGrns, targetGrnId],
  );
  const selectedSources = useMemo(() => eligibleSources.filter((g) => selectedSourceIds.includes(g.id)), [eligibleSources, selectedSourceIds]);
  const totalSourceBags = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.closingBags ?? g.bags), 0), [selectedSources]);
  const targetCurrentRemaining = targetGrn.closingBags ?? targetGrn.bags;
  const targetNewRemaining = targetCurrentRemaining + totalSourceBags;

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (selectedSourceIds.length === 0) {
      setValidationError('Select at least one source GRN to merge.');
      return;
    }
    if (reason.trim().length < 5) {
      setValidationError('Audit reason must be at least 5 characters.');
      return;
    }
    await onExecuteMerge(targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined);
  };

  return (
    <form id="merge-grn-form" onSubmit={handleMergeSubmit} className={styles.modalContent}>
      {validationError && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}

      <div className={styles.columnsGrid}>
        {/* Column 1: Surviving Target GRN */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span>1. Surviving Target GRN</span>
            <Badge variant="success">Canonical</Badge>
          </div>
          <Select
            id="target-grn-selector"
            label="Receiving GRN"
            value={targetGrnId}
            onChange={(e) => {
              setTargetGrnId(e.target.value);
              setSelectedSourceIds((prev) => prev.filter((id) => id !== e.target.value));
            }}
            disabled={submitting}
          >
            {openGrns.map((g) => (
              <option key={g.id} value={g.id}>
                {g.grnNumber} — {g.customerName} ({g.closingBags ?? g.bags} bags)
              </option>
            ))}
          </Select>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Inward Date:</span>
            <span className={styles.detailValue}>
              {new Date(targetGrn.date).toLocaleDateString('en-IN')}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Customer:</span>
            <span className={styles.detailValue}>{targetGrn.customerName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Commodity:</span>
            <span className={styles.detailValue}>{targetGrn.commodityName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Current Remaining:</span>
            <span className={styles.detailValue}>{targetCurrentRemaining} Bags</span>
          </div>
        </div>

        {/* Column 2: Source GRNs to Merge */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span>2. Source GRNs to Merge</span>
            <span style={{ fontSize: 'var(--text-xs)' }}>{selectedSources.length} selected</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Select open GRNs to transfer into {targetGrn.grnNumber}:
          </span>
          <div className={styles.sourceGrnList} role="listbox">
            {eligibleSources.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: 'var(--space-2)' }}>
                No other open eligible GRNs found in this facility.
              </div>
            ) : (
              eligibleSources.map((sg) => {
                const isSelected = selectedSourceIds.includes(sg.id);
                const count = sg.closingBags ?? sg.bags;
                return (
                  <div
                    key={sg.id}
                    className={styles.sourceGrnItem}
                    data-selected={isSelected}
                    onClick={() => !submitting && toggleSource(sg.id)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div>
                      <strong>{sg.grnNumber}</strong> ({sg.customerName})
                    </div>
                    <span>{count} bags</span>
                  </div>
                );
              })
            )}
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Total Merging Bags:</span>
            <span className={styles.detailValue}>{totalSourceBags} Bags</span>
          </div>
        </div>

        {/* Column 3: Resulting State */}
        <div className={styles.resultColumnCard}>
          <div className={styles.columnHeader}>
            <span>3. Resulting Stock</span>
            <Badge variant="primary">Audit-Safe</Badge>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{targetGrn.grnNumber} Initial:</span>
            <span className={styles.detailValue}>{targetCurrentRemaining} bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>+ Transferred:</span>
            <span className={styles.detailValue}>+{totalSourceBags} bags</span>
          </div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Resulting Total:</span>
            <span className={styles.detailValue} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-primary-text)' }}>
              {targetNewRemaining} Bags
            </span>
          </div>
          <div className={styles.noticeBox}>
            Source GRN(s) will be cleared to 0 remaining bags and set to <strong>CLOSED</strong>. Complete history is permanently linked.
          </div>
        </div>

        {/* Column 4: Audit & Confirmation */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span>4. Movement Audit</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>*Required</span>
          </div>
          <div className={styles.formSection}>
            <label htmlFor="merge-reason" className={styles.auditReasonLabel}>
              Audit Reason (min 5 chars) *
            </label>
            <Input
              id="merge-reason"
              placeholder="e.g. Stock consolidation / Re-bagging"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className={styles.formSection}>
            <label htmlFor="merge-remarks" className={styles.auditReasonLabel}>
              Additional Remarks (Optional)
            </label>
            <textarea
              id="merge-remarks"
              rows={2}
              className={styles.textarea}
              placeholder="Notes for ledger history..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
