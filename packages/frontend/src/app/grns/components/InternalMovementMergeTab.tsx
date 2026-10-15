'use client';

import React, { useMemo, useState } from 'react';
import {
  calculateHamaliAmount,
  isBagCompositionVerified,
  isHybridBagCategory,
  resolveMergedBagType,
  seasonYearForInwardDate,
  type Commodity,
  type Grn,
  type OutwardBagCategory,
  type PaymentMode,
} from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import { MergeBagCategoryFields, DEFAULT_BAG_CONFIRMATION, type BagConfirmationValue } from './MergeBagCategoryFields';
import { MergeRentAssessment } from './MergeRentAssessment';
import { partitionMergeSources } from './mergeEligibility.helper';
import { previewConfirmedSplit, validateBagConfirmation } from './bagConfirmation.helper';
import { MergeSourceTable } from './MergeSourceTable';
import styles from './InternalMovementModal.module.css';

interface InternalMovementMergeTabProps {
  currentGrn: Grn; allGrns: Grn[]; commodities?: Commodity[]; submitting: boolean;
  onExecuteMerge: (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string,
    movementDate?: string, additionalRentAmount?: number, repackedSmallBags?: number,
    repackedBigBags?: number, referenceWeight?: number, sourcePaymentAmount?: number,
    sourcePaymentMode?: PaymentMode, sourceBagCategory?: OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number,
    sourceMonthlyBagPrice?: number,
  ) => Promise<void>;
}

export function InternalMovementMergeTab({
  currentGrn, allGrns, commodities, submitting, onExecuteMerge,
}: InternalMovementMergeTabProps) {
  const [targetGrnId, setTargetGrnId] = useState<string>(currentGrn.id);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState(''), [remarks, setRemarks] = useState('');
  const [repackMode, setRepackMode] = useState(false);
  const [repackSmall, setRepackSmall] = useState<number | ''>(''), [repackBig, setRepackBig] = useState<number | ''>('');
  const [confirmation, setConfirmation] = useState<BagConfirmationValue>(DEFAULT_BAG_CONFIRMATION);
  const [rentAcknowledged, setRentAcknowledged] = useState(false), [aggregatePending, setAggregatePending] = useState(0);
  const [referenceWeight, setReferenceWeight] = useState<number | ''>(''), [sourcePaymentAmount, setSourcePaymentAmount] = useState<number | ''>('');
  const [sourcePaymentMode, setSourcePaymentMode] = useState<PaymentMode>('Cash');
  const [validationError, setValidationError] = useState<string | null>(null);

  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const targetSeason = useMemo(() => seasonYearForInwardDate(targetGrn.date), [targetGrn.date]);
  // Future-season lots can never merge into this target (backend season guard
  // stays authoritative); they are excluded here so they never look eligible.
  const { eligibleSources, futureSeasonCount } = useMemo(
    () => partitionMergeSources(openGrns, targetGrnId, targetSeason),
    [openGrns, targetGrnId, targetSeason],
  );
  const selectedSources = useMemo(() => eligibleSources.filter((g) => selectedSourceIds.includes(g.id)), [eligibleSources, selectedSourceIds]);
  const totalSourceBags = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.closingBags ?? g.bags), 0), [selectedSources]);
  const targetCurrentRemaining = targetGrn.closingBags ?? targetGrn.bags;
  const targetNewRemaining = targetCurrentRemaining + totalSourceBags;
  const isTargetLoanHold = targetGrn.loanStatus === 'TAKEN';

  const hasPreviousSeason = useMemo(() => selectedSources.some((s) => seasonYearForInwardDate(s.date) < targetSeason), [selectedSources, targetSeason]);
  const isTargetDiff = (targetGrn.smallBagPrice != null || targetGrn.bigBagPrice != null) && targetGrn.smallBagPrice !== targetGrn.bigBagPrice;
  const isTargetUnverified = !isBagCompositionVerified({ bagType: targetGrn.bagType, bags: targetGrn.bags, smallBags: targetGrn.smallBags, bigBags: targetGrn.bigBags });
  const hasDiffRates = isTargetDiff || selectedSources.some((s) => (s.smallBagPrice != null || s.bigBagPrice != null) && s.smallBagPrice !== s.bigBagPrice);
  const hasUnconfirmedMix = hasDiffRates && (isTargetUnverified || selectedSources.some((s) => !isBagCompositionVerified({ bagType: s.bagType, bags: s.bags, smallBags: s.smallBags, bigBags: s.bigBags })));
  const isTargetHybrid = (!isTargetDiff && targetGrn.bagPrice != null) || isHybridBagCategory(targetGrn.bagType);

  const isRepackRequired = repackMode || hasUnconfirmedMix;
  const isRepackFilled = typeof repackSmall === 'number' && typeof repackBig === 'number' && Number.isInteger(repackSmall) && Number.isInteger(repackBig);
  const patchConfirmation = (patch: Partial<BagConfirmationValue>) => setConfirmation((prev) => ({ ...prev, ...patch }));

  const targetCommodity = useMemo(() => commodities?.find((c) => c.id === targetGrn.commodityId), [commodities, targetGrn.commodityId]);
  const commodityHamaliRate = useMemo(() => {
    if (!targetCommodity) return 0;
    const isApp = targetCommodity.isHamaliApplicable ?? (targetCommodity.hamaliRate ?? 0) > 0;
    return isApp ? (targetCommodity.hamaliRate ?? 0) : 0;
  }, [targetCommodity]);
  const repackHamaliCharge = useMemo(() => {
    if (!isRepackFilled || totalSourceBags <= 0 || commodityHamaliRate <= 0) return 0;
    return calculateHamaliAmount(totalSourceBags, commodityHamaliRate);
  }, [isRepackFilled, totalSourceBags, commodityHamaliRate]);

  const rawMovedSmall = selectedSources.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
  const rawMovedBig = selectedSources.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
  const scale = totalSourceBags > 0 && rawMovedSmall + rawMovedBig > 0 && rawMovedSmall + rawMovedBig !== totalSourceBags ? totalSourceBags / (rawMovedSmall + rawMovedBig) : 1;
  const defaultMovedSmall = scale === 1 ? rawMovedSmall : Math.round(rawMovedSmall * scale);
  const defaultMovedBig = scale === 1 ? rawMovedBig : totalSourceBags - defaultMovedSmall;
  // Backend allocator is authoritative; this preview mirrors it for display.
  const previewSplit = previewConfirmedSplit({ category: confirmation.category, rawSmall: rawMovedSmall, rawBig: rawMovedBig, total: totalSourceBags, defaultSmall: defaultMovedSmall, defaultBig: defaultMovedBig, repackSmall, repackBig, isRepackFilled });
  const movedSmall = previewSplit.small;
  const movedBig = previewSplit.big;
  // Hybrid rate visibility follows the confirmed (source) lot, as in outward.
  const confirmSource = selectedSources[0] ?? targetGrn;
  const resultingSmall = (targetGrn.smallBags ?? 0) + movedSmall;
  const resultingBig = (targetGrn.bigBags ?? 0) + movedBig;
  const resultingBagType = useMemo(() => resolveMergedBagType({
    targetBagType: targetGrn.bagType, sourceBagTypes: selectedSources.map((s) => s.bagType),
    newSmallBags: resultingSmall, newBigBags: resultingBig,
  }), [targetGrn.bagType, selectedSources, resultingSmall, resultingBig]);

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);
    const confirmError = validateBagConfirmation({
      category: confirmation.category, quantity: confirmation.quantity, bagPrice: confirmation.bagPrice, seasonalBagPrice: confirmation.seasonalBagPrice,
      monthlyBagPrice: confirmation.monthlyBagPrice, repackSmall, repackBig, totalMovedBags: totalSourceBags, isRepackRequired,
    });
    if (confirmError) return setValidationError(confirmError);
    if (aggregatePending > 0 && !rentAcknowledged) return setValidationError('Please acknowledge the reviewed source dues above. Amounts are revalidated at execution.');
    const srcPayment = typeof sourcePaymentAmount === 'number' && Number.isFinite(sourcePaymentAmount) && sourcePaymentAmount >= 0 ? sourcePaymentAmount : undefined;
    if (srcPayment != null && srcPayment > 0 && selectedSourceIds.length > 1) {
      return setValidationError('Previous-season settlement can only be collected when merging a single source GRN. Merge one source at a time when collecting payment.');
    }
    const confSmall = isRepackFilled ? Number(repackSmall) : undefined, confBig = isRepackFilled ? Number(repackBig) : undefined;
    const refWeight = typeof referenceWeight === 'number' && Number.isFinite(referenceWeight) && referenceWeight > 0 ? referenceWeight : undefined;
    const sendCat = (confirmation.category !== 'Small & Big' || isRepackRequired || isRepackFilled) ? confirmation.category : undefined;
    await onExecuteMerge(targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, confSmall, confBig, refWeight, srcPayment, sourcePaymentMode, sendCat, typeof confirmation.quantity === 'number' ? confirmation.quantity : undefined, typeof confirmation.bagPrice === 'number' ? confirmation.bagPrice : undefined, typeof confirmation.seasonalBagPrice === 'number' ? confirmation.seasonalBagPrice : undefined, typeof confirmation.monthlyBagPrice === 'number' ? confirmation.monthlyBagPrice : undefined);
  };

  return (
    <form id="merge-grn-form" onSubmit={handleMergeSubmit} className={styles.modalContent}>
      {validationError && (
        <div role="alert" className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>{validationError}</div>
      )}
      {hasUnconfirmedMix && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-warning-text)', borderColor: 'var(--color-warning)' }}>
          Target or source lot has unverified bag composition. Confirm repacked counts below before finalizing.
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
        <div className={styles.metaItem}><span className={styles.metaLabel}>Current Stock & Type</span><span className={styles.metaValue} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span>{targetCurrentRemaining} Bags</span><Badge variant="neutral">{isTargetHybrid ? 'Hybrid' : targetGrn.bagType}</Badge><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{isTargetHybrid ? '(Uniform Rate)' : `(${targetGrn.smallBags ?? 0}S · ${targetGrn.bigBags ?? 0}B)`}</span></span></div>
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
        {futureSeasonCount > 0 && (
          <div className={styles.noticeBox} style={{ color: 'var(--color-warning-text)', borderColor: 'var(--color-warning)' }}>
            {futureSeasonCount} future-season GRN{futureSeasonCount === 1 ? '' : 's'} excluded — same season or earlier only.
          </div>
        )}
        <MergeSourceTable
          eligibleSources={eligibleSources} selectedSourceIds={selectedSourceIds}
          targetGrnDate={targetGrn.date} submitting={submitting} onToggleSource={toggleSource}
        />
      </div>

      {/* Review & Audit Section */}
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}><span>3. Stock & Composition Confirmation</span><Badge variant="primary">Audit-Safe</Badge></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>{targetGrn.grnNumber} Initial:</span><span className={styles.detailValue}>{targetCurrentRemaining} bags {isTargetHybrid ? '(Hybrid)' : `(${targetGrn.smallBags ?? 0}S · ${targetGrn.bigBags ?? 0}B)`}</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>+ Merged Sources:</span><span className={styles.detailValue}>+{totalSourceBags} bags {!hasDiffRates ? '(Hybrid)' : `(${movedSmall}S · ${movedBig}B)`}</span></div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Combined Target Stock:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)' }}>{targetNewRemaining} Bags (Season {targetSeason})</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Resulting Composition:</span>
            <span className={styles.detailValue} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="primary">{!hasDiffRates ? 'Hybrid' : resultingBagType}</Badge>
              <strong>{!hasDiffRates ? `${targetNewRemaining} Hybrid Bags` : `${resultingSmall}S · ${resultingBig}B`}</strong>
            </span>
          </div>
          {repackHamaliCharge > 0 && (
            <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
              <span className={styles.detailLabel}>Repacking Hamali Labor:</span>
              <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>
                ₹{repackHamaliCharge} ({totalSourceBags} bags @ ₹{commodityHamaliRate}/bag)
              </span>
            </div>
          )}

          <MergeBagCategoryFields
            value={confirmation} onChange={patchConfirmation} totalMovedBags={totalSourceBags}
            rentType={confirmSource.rentType} inwardDate={confirmSource.date} movementDate={movementDate}
            repackMode={repackMode} onRepackModeChange={(v) => { setRepackMode(v); if (!v && !hasUnconfirmedMix) { setRepackSmall(''); setRepackBig(''); setReferenceWeight(''); } }}
            repackSmall={repackSmall} onRepackSmallChange={setRepackSmall} repackBig={repackBig} onRepackBigChange={setRepackBig}
            referenceWeight={referenceWeight} onReferenceWeightChange={setReferenceWeight}
            hasUnconfirmedMix={hasUnconfirmedMix} submitting={submitting}
          />
          <MergeRentAssessment
            facilityId={currentGrn.facilityId} sources={selectedSources} submitting={submitting} acknowledged={rentAcknowledged}
            onAcknowledgedChange={setRentAcknowledged} onPendingChange={setAggregatePending}
          />

          {hasPreviousSeason && (
            <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)', marginTop: '4px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', marginBottom: '4px' }}>Previous Season Settlement (₹0 or Partial Allowed)</div>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <Input id="source-payment" type="number" min={0} placeholder="Payment Received (₹)" aria-label="Previous season payment received in rupees" value={sourcePaymentAmount} onChange={(e) => setSourcePaymentAmount(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
                <Select id="source-pay-mode" aria-label="Payment mode" value={sourcePaymentMode} onChange={(e) => setSourcePaymentMode(e.target.value as PaymentMode)} disabled={submitting}>
                  <option value="Cash">Cash</option><option value="UPI">UPI</option>
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
          <div className={styles.noticeBox} style={{ marginTop: 'auto' }}>Stock completion ≠ Financial settlement. Original financial obligations, payments, and balances are preserved.</div>
        </div>
      </div>
    </form>
  );
}
