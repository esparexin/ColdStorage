'use client';

import React, { useMemo, useState } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, DataTable, Input, Select } from '@/components/ui';
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
    additionalRentAmount?: number,
    repackedSmallBags?: number,
    repackedBigBags?: number,
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
  const [repackMode, setRepackMode] = useState(false);
  const [repackSmall, setRepackSmall] = useState<number | ''>('');
  const [repackBig, setRepackBig] = useState<number | ''>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const eligibleSources = useMemo(() => openGrns.filter((g) => g.id !== targetGrnId && (g.closingBags ?? g.bags) > 0 && g.loanStatus !== 'TAKEN'), [openGrns, targetGrnId]);
  const selectedSources = useMemo(() => eligibleSources.filter((g) => selectedSourceIds.includes(g.id)), [eligibleSources, selectedSourceIds]);
  const totalSourceBags = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.closingBags ?? g.bags), 0), [selectedSources]);
  const totalSourceRent = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.rentAmount ?? 0), 0), [selectedSources]);
  const targetCurrentRemaining = targetGrn.closingBags ?? targetGrn.bags;
  const targetNewRemaining = targetCurrentRemaining + totalSourceBags;
  const targetNewRent = (targetGrn.rentAmount ?? 0) + totalSourceRent;
  const isTargetLoanHold = targetGrn.loanStatus === 'TAKEN';

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold — clear the loan before merging into it.`);
    let confSmall: number | undefined;
    let confBig: number | undefined;
    if (repackMode) {
      if (typeof repackSmall !== 'number' || typeof repackBig !== 'number') {
        return setValidationError('Both Small and Big bag counts must be confirmed when repacking.');
      }
      if (repackSmall + repackBig !== totalSourceBags) {
        return setValidationError(`Repacked counts (${repackSmall}S + ${repackBig}B = ${repackSmall + repackBig}) must reconcile with source stock (${totalSourceBags} bags).`);
      }
      confSmall = repackSmall;
      confBig = repackBig;
    }
    await onExecuteMerge(targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, totalSourceRent, confSmall, confBig);
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
          <Select id="target-grn-selector" label="1. Surviving Target GRN" value={targetGrnId} onChange={(e) => { setTargetGrnId(e.target.value); setSelectedSourceIds((prev) => prev.filter((id) => id !== e.target.value)); }} disabled={submitting}>
            {openGrns.map((g) => (<option key={g.id} value={g.id}>{g.grnNumber} — {g.customerName} ({g.closingBags ?? g.bags} bags)</option>))}
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

        <DataTable
          columns={[
            {
              key: 'select',
              header: 'Sel',
              render: (sg) => (
                <input
                  id={`select-source-${sg.id}`}
                  aria-label={`Select GRN ${sg.grnNumber}`}
                  type="checkbox"
                  checked={selectedSourceIds.includes(sg.id)}
                  onChange={() => toggleSource(sg.id)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={submitting}
                />
              ),
            },
            {
              key: 'grnNumber',
              header: 'GRN & Date',
              render: (sg) => (
                <div>
                  <strong>{sg.grnNumber}</strong>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {new Date(sg.date).toLocaleDateString('en-IN')}
                  </div>
                </div>
              ),
            },
            {
              key: 'customerName',
              header: 'Customer',
              render: (sg) => sg.customerName,
            },
            {
              key: 'commodity',
              header: 'Commodity & Chamber',
              render: (sg) => `${sg.commodityName} (Ch. ${sg.chamber})`,
            },
            {
              key: 'availableBags',
              header: 'Available Bags',
              align: 'right',
              render: (sg) => {
                const s = sg.smallBags ?? 0;
                const b = sg.bigBags ?? 0;
                const tot = sg.closingBags ?? sg.bags;
                const unconf = s === 0 && b === 0 && tot > 0;
                return (
                  <div>
                    <span style={{ fontWeight: 'var(--font-semibold)' }}>{tot}</span>
                    <div style={{ fontSize: 'var(--text-xs)', color: unconf ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>
                      {unconf ? 'Unconfirmed Mix' : `${s}S · ${b}B`}
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'rent',
              header: 'Rent',
              align: 'right',
              render: (sg) => (sg.rentAmount != null ? `₹${sg.rentAmount.toLocaleString('en-IN')}` : '—'),
            },
            {
              key: 'loan',
              header: 'Loan',
              align: 'center',
              render: (sg) => (
                <Badge variant={sg.loanStatus === 'CLEARED' ? 'success' : 'neutral'}>
                  {sg.loanStatus === 'CLEARED' ? 'Cleared' : 'None'}
                </Badge>
              ),
            },
          ]}
          rows={eligibleSources}
          rowKey={(sg) => sg.id}
          caption="Source GRNs to Merge"
          emptyMessage="No other open eligible GRNs found in this facility."
          onRowClick={!submitting ? (sg) => toggleSource(sg.id) : undefined}
        />
      </div>

      {/* Review & Audit Bottom Section */}
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}><span>3. Resulting Stock & Obligations</span><Badge variant="primary">Audit-Safe</Badge></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>{targetGrn.grnNumber} Initial:</span><span className={styles.detailValue}>{targetCurrentRemaining} bags (₹{targetGrn.rentAmount ?? 0})</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>+ Merged Sources:</span><span className={styles.detailValue}>+{totalSourceBags} bags (+₹{totalSourceRent})</span></div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Resulting Total:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)' }}>{targetNewRemaining} Bags (₹{targetNewRent})</span>
          </div>
          <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
              <input type="checkbox" checked={repackMode} onChange={(e) => { setRepackMode(e.target.checked); if (!e.target.checked) { setRepackSmall(''); setRepackBig(''); } }} disabled={submitting} />
              <span>Confirm Repacked Bag Mix</span>
            </label>
            {repackMode && (
              <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: '4px' }}>
                <Input id="repack-small" type="number" min={0} placeholder="Small Bags" value={repackSmall} onChange={(e) => setRepackSmall(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
                <Input id="repack-big" type="number" min={0} placeholder="Big Bags" value={repackBig} onChange={(e) => setRepackBig(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
              </div>
            )}
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
