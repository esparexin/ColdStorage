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
    movementDate?: string,
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
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const eligibleSources = useMemo(() => openGrns.filter((g) => g.id !== targetGrnId && (g.closingBags ?? g.bags) > 0 && g.loanStatus !== 'TAKEN'), [openGrns, targetGrnId]);
  const selectedSources = useMemo(() => eligibleSources.filter((g) => selectedSourceIds.includes(g.id)), [eligibleSources, selectedSourceIds]);
  const totalSourceBags = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.closingBags ?? g.bags), 0), [selectedSources]);
  const targetCurrentRemaining = targetGrn.closingBags ?? targetGrn.bags;
  const targetNewRemaining = targetCurrentRemaining + totalSourceBags;
  const isTargetLoanHold = targetGrn.loanStatus === 'TAKEN';

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    // Client-side mirror of the backend guard (merge-grn.handler rejects TAKEN
    // targets) so the operator learns before the round-trip, with identical wording.
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold — clear the loan before merging into it.`);
    await onExecuteMerge(targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate);
  };

  return (
    <form id="merge-grn-form" onSubmit={handleMergeSubmit} className={styles.modalContent}>
      {validationError && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}
      {isTargetLoanHold && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          Target GRN {targetGrn.grnNumber} has an active loan hold — merge is blocked until the loan is cleared.
        </div>
      )}

      {/* Target GRN Summary Strip */}
      <div className={styles.summaryStrip}>
        <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
          <Select
            id="target-grn-selector"
            label="1. Surviving Target GRN"
            value={targetGrnId}
            onChange={(e) => {
              setTargetGrnId(e.target.value);
              setSelectedSourceIds((prev) => prev.filter((id) => id !== e.target.value));
            }}
            disabled={submitting}
          >
            {openGrns.map((g) => (
              <option key={g.id} value={g.id}>{g.grnNumber} — {g.customerName} ({g.closingBags ?? g.bags} bags)</option>
            ))}
          </Select>
        </div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Customer</span><span className={styles.metaValue}>{targetGrn.customerName}</span></div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Commodity / Chamber</span><span className={styles.metaValue}>{targetGrn.commodityName} (Ch. {targetGrn.chamber})</span></div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Current Stock</span><span className={styles.metaValue}>{targetCurrentRemaining} Bags</span></div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Rent Obligation</span><span className={styles.metaValue}>{targetGrn.rentAmount != null ? `₹${targetGrn.rentAmount.toLocaleString('en-IN')}` : '—'}</span></div>
      </div>

      {/* Source GRNs Compact Selection List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
          <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            2. Source GRNs to Merge ({selectedSources.length} of {eligibleSources.length} selected)
          </span>
          <span style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>
            +{totalSourceBags} Bags Selected
          </span>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.compactTable}>
            <thead>
              <tr>
                <th className={styles.checkboxCell}>Sel</th>
                <th>GRN & Date</th>
                <th>Customer</th>
                <th>Commodity & Chamber</th>
                <th style={{ textAlign: 'right' }}>Available Bags</th>
                <th style={{ textAlign: 'right' }}>Rent</th>
                <th style={{ textAlign: 'center' }}>Loan</th>
              </tr>
            </thead>
            <tbody>
              {eligibleSources.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-3)' }}>
                    No other open eligible GRNs found in this facility.
                  </td>
                </tr>
              ) : (
                eligibleSources.map((sg) => {
                  const isSelected = selectedSourceIds.includes(sg.id);
                  const count = sg.closingBags ?? sg.bags;
                  return (
                    <tr key={sg.id} className={styles.tableRow} data-selected={isSelected} onClick={() => !submitting && toggleSource(sg.id)}>
                      <td className={styles.checkboxCell}>
                        <input
                          id={`select-source-${sg.id}`}
                          aria-label={`Select GRN ${sg.grnNumber}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSource(sg.id)}
                          disabled={submitting}
                        />
                      </td>
                      <td>
                        <strong>{sg.grnNumber}</strong>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{new Date(sg.date).toLocaleDateString('en-IN')}</div>
                      </td>
                      <td>{sg.customerName}</td>
                      <td>{sg.commodityName} (Ch. {sg.chamber})</td>
                      <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{count}</td>
                      <td style={{ textAlign: 'right' }}>{sg.rentAmount != null ? `₹${sg.rentAmount.toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge variant={sg.loanStatus === 'CLEARED' ? 'success' : 'neutral'}>{sg.loanStatus === 'CLEARED' ? 'Cleared' : 'None'}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Audit Bottom Section */}
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}><span>3. Resulting Stock</span><Badge variant="primary">Audit-Safe</Badge></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>{targetGrn.grnNumber} Initial:</span><span className={styles.detailValue}>{targetCurrentRemaining} bags</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>+ Transferred:</span><span className={styles.detailValue}>+{totalSourceBags} bags</span></div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Resulting Total:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)' }}>{targetNewRemaining} Bags</span>
          </div>
          <div className={styles.formSection}>
            <label htmlFor="merge-date" className={styles.inputLabel}>Movement Date *</label>
            <Input id="merge-date" type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} disabled={submitting} required />
          </div>
          <div className={styles.noticeBox}>
            Source GRN(s) will be set to CLOSED and linked to the surviving target GRN. Original financial
            obligations and payments are preserved.
          </div>
        </div>

        <div className={styles.compactCard}>
          <div className={styles.cardHeader}><span>4. Movement Audit & Reason</span><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>*Required</span></div>
          <div className={styles.formSection}>
            <label htmlFor="merge-reason" className={styles.inputLabel}>Audit Reason (min 5 chars) *</label>
            <Input id="merge-reason" placeholder="e.g. Stock consolidation / Re-bagging lot" value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting} required />
          </div>
          <div className={styles.formSection}>
            <label htmlFor="merge-remarks" className={styles.inputLabel}>Additional Remarks (Optional)</label>
            <textarea id="merge-remarks" aria-label="Additional Remarks" rows={2} className={styles.textarea} placeholder="Notes for ledger history..." value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={submitting} />
          </div>
        </div>
      </div>
    </form>
  );
}
