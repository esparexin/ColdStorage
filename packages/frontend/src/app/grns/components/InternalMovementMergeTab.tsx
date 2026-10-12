'use client';

import React, { useMemo, useState } from 'react';
import { seasonYearForInwardDate, type Grn, type PaymentMode } from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import { MergeSourceTable } from './MergeSourceTable';
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
    referenceWeight?: number,
    sourcePaymentAmount?: number,
    sourcePaymentMode?: PaymentMode,
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
  const [referenceWeight, setReferenceWeight] = useState<number | ''>('');
  const [sourcePaymentAmount, setSourcePaymentAmount] = useState<number | ''>('');
  const [sourcePaymentMode, setSourcePaymentMode] = useState<PaymentMode>('Cash');
  const [validationError, setValidationError] = useState<string | null>(null);

  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const eligibleSources = useMemo(() => openGrns.filter((g) => g.id !== targetGrnId && (g.closingBags ?? g.bags) > 0 && g.loanStatus !== 'TAKEN'), [openGrns, targetGrnId]);
  const selectedSources = useMemo(() => eligibleSources.filter((g) => selectedSourceIds.includes(g.id)), [eligibleSources, selectedSourceIds]);
  const totalSourceBags = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.closingBags ?? g.bags), 0), [selectedSources]);
  const totalSourceRent = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.rentAmount ?? 0), 0), [selectedSources]);
  const targetCurrentRemaining = targetGrn.closingBags ?? targetGrn.bags;
  const targetNewRemaining = targetCurrentRemaining + totalSourceBags;
  const isTargetLoanHold = targetGrn.loanStatus === 'TAKEN';

  const targetSeason = useMemo(() => seasonYearForInwardDate(targetGrn.date), [targetGrn.date]);
  const hasPreviousSeason = useMemo(() => selectedSources.some((s) => seasonYearForInwardDate(s.date) < targetSeason), [selectedSources, targetSeason]);
  const hasUnconfirmedMix = useMemo(() => selectedSources.some((s) => {
    const sm = s.smallBags ?? 0;
    const bg = s.bigBags ?? 0;
    const tot = s.closingBags ?? s.bags;
    return (sm === 0 && bg === 0 && tot > 0) || sm + bg !== tot;
  }), [selectedSources]);

  const isRepackRequired = repackMode || hasUnconfirmedMix;
  const repackedSum = (typeof repackSmall === 'number' ? repackSmall : 0) + (typeof repackBig === 'number' ? repackBig : 0);
  const isRepackFilled = typeof repackSmall === 'number' && typeof repackBig === 'number';
  const isRepackReconciled = isRepackFilled && repackedSum === totalSourceBags;
  const isRepackMismatch = isRepackRequired && totalSourceBags > 0 && (!isRepackFilled || repackedSum !== totalSourceBags);

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);

    let confSmall: number | undefined;
    let confBig: number | undefined;
    if (isRepackRequired) {
      if (!isRepackFilled) {
        return setValidationError('Both Small and Big bag counts must be confirmed. Combined total must match available bags.');
      }
      if (repackSmall > totalSourceBags || repackBig > totalSourceBags) {
        return setValidationError(`Neither Small nor Big bag counts can exceed available total (${totalSourceBags} bags).`);
      }
      if (repackedSum !== totalSourceBags) {
        return setValidationError(`Counts (${repackSmall}S + ${repackBig}B = ${repackedSum}) must match total available (${totalSourceBags} bags).`);
      }
      confSmall = repackSmall;
      confBig = repackBig;
    }
    const refWeight = typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined;
    const srcPayment = typeof sourcePaymentAmount === 'number' && sourcePaymentAmount >= 0 ? sourcePaymentAmount : undefined;

    await onExecuteMerge(targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, confSmall, confBig, refWeight, srcPayment, sourcePaymentMode);
  };

  return (
    <form id="merge-grn-form" onSubmit={handleMergeSubmit} className={styles.modalContent}>
      {validationError && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}
      {hasUnconfirmedMix && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-warning-text)', borderColor: 'var(--color-warning)' }}>
          Selected source lot has unconfirmed bag composition. Historical rent is marked <strong>Pending Verification</strong>. Confirm repacked counts below before finalizing.
        </div>
      )}

      {/* Target GRN Summary Strip */}
      <div className={styles.summaryStrip}>
        <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
          <Select id="target-grn-selector" label="1. Surviving Target GRN" value={targetGrnId} onChange={(e) => { setTargetGrnId(e.target.value); setSelectedSourceIds((prev) => prev.filter((id) => id !== e.target.value)); }} disabled={submitting}>
            {openGrns.map((g) => (<option key={g.id} value={g.id}>{g.grnNumber} — {g.customerName} ({g.closingBags ?? g.bags} bags, Season {seasonYearForInwardDate(g.date)})</option>))}
          </Select>
        </div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Customer</span><span className={styles.metaValue}>{targetGrn.customerName}</span></div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Commodity / Chamber</span><span className={styles.metaValue}>{targetGrn.commodityName} (Ch. {targetGrn.chamber})</span></div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Current Stock</span><span className={styles.metaValue}>{targetCurrentRemaining} Bags</span></div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Applicable Season</span><span className={styles.metaValue}>Season {targetSeason}</span></div>
      </div>

      {/* Source GRNs List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
          <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            2. Source GRNs to Merge ({selectedSources.length} of {eligibleSources.length} selected)
          </span>
          <span style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>
            +{totalSourceBags} Bags Selected
          </span>
        </div>
        <MergeSourceTable
          eligibleSources={eligibleSources}
          selectedSourceIds={selectedSourceIds}
          targetGrnDate={targetGrn.date}
          submitting={submitting}
          onToggleSource={toggleSource}
        />
      </div>

      {/* Review & Audit Section */}
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}><span>3. Stock & Composition Confirmation</span><Badge variant="primary">Audit-Safe</Badge></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>{targetGrn.grnNumber} Initial:</span><span className={styles.detailValue}>{targetCurrentRemaining} bags</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>+ Merged Sources:</span><span className={styles.detailValue}>+{totalSourceBags} bags</span></div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Combined Target Stock:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)' }}>{targetNewRemaining} Bags (Season {targetSeason})</span>
          </div>

          <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
              <input type="checkbox" checked={repackMode || hasUnconfirmedMix} onChange={(e) => { setRepackMode(e.target.checked); if (!e.target.checked && !hasUnconfirmedMix) { setRepackSmall(''); setRepackBig(''); setReferenceWeight(''); } }} disabled={submitting || hasUnconfirmedMix} />
              <span>{hasUnconfirmedMix ? 'Bag Mix Confirmation Required (Unverified Lot)' : 'Confirm Repacked Bag Mix & Reference Weight'}</span>
            </label>
            {(repackMode || hasUnconfirmedMix) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  <Input id="repack-small" type="number" min={0} max={totalSourceBags} placeholder="Small Bags" value={repackSmall} onChange={(e) => setRepackSmall(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
                  <Input id="repack-big" type="number" min={0} max={totalSourceBags} placeholder="Big Bags" value={repackBig} onChange={(e) => setRepackBig(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0' }}>
                  <span>Final Total: <strong>{repackedSum}</strong> / {totalSourceBags} bags</span>
                  {isRepackReconciled ? (
                    <span style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>✓ Counts Reconciled</span>
                  ) : (
                    <span style={{ color: 'var(--color-danger-text)', fontWeight: 'var(--font-semibold)' }}>
                      {repackedSum > totalSourceBags ? `Exceeds by ${repackedSum - totalSourceBags}` : `Pending ${totalSourceBags - repackedSum}`}
                    </span>
                  )}
                </div>
                <Input id="reference-weight" type="number" min={0} placeholder="Total Reference Weight (kg) — Optional reference" value={referenceWeight} onChange={(e) => setReferenceWeight(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
              </div>
            )}
          </div>

          {hasPreviousSeason && (
            <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)', marginTop: '4px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', marginBottom: '4px' }}>
                Previous Season Settlement (₹0 or Partial Allowed)
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <Input id="source-payment" type="number" min={0} placeholder="Payment Received (₹)" value={sourcePaymentAmount} onChange={(e) => setSourcePaymentAmount(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
                <Select id="source-pay-mode" value={sourcePaymentMode} onChange={(e) => setSourcePaymentMode(e.target.value as PaymentMode)} disabled={submitting}>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                </Select>
              </div>
            </div>
          )}

          <div className={styles.formSection}>
            <label htmlFor="merge-date" className={styles.inputLabel}>Movement Date *</label>
            <Input id="merge-date" type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} disabled={submitting} required />
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
          <div className={styles.noticeBox} style={{ marginTop: 'auto' }}>
            Stock completion $\neq$ Financial settlement. Original financial obligations, payments, and balances are preserved.
          </div>
        </div>
      </div>
    </form>
  );
}
