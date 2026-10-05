import type { GrnInventorySummary } from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import styles from '../page.module.css';

interface DeliveryBagCompositionFieldsProps {
  summary: GrnInventorySummary;
  withdrawal: GrnWithdrawal;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
}

/**
 * Bag composition entry for an outward delivery.
 *
 * The two ceilings come from the selected GRN's available stock and are enforced per bag type,
 * because a receipt may hold both sizes and the combined total alone would permit a withdrawal
 * the chamber cannot satisfy. The backend re-checks both inside the issuing transaction.
 */
export function DeliveryBagCompositionFields({
  summary,
  withdrawal,
  onSmallBagsChange,
  onBigBagsChange,
}: DeliveryBagCompositionFieldsProps) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label htmlFor="delivery-small-bags" className={styles.fieldLabel}>
          Small Bags to Deliver *
        </label>
        <span className={styles.fieldHint}>
          {summary.availableSmallBags} small and {summary.availableBigBags} big bags are in
          stock in chamber {summary.chamber} (of {summary.totalBags} received).
        </span>
        <input
          id="delivery-small-bags"
          type="number"
          inputMode="numeric"
          min={0}
          max={summary.availableSmallBags}
          placeholder="Small bags to deliver"
          className={styles.fieldInput}
          value={withdrawal.smallBags}
          onChange={(e) =>
            onSmallBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')
          }
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label htmlFor="delivery-big-bags" className={styles.fieldLabel}>
          Big Bags to Deliver *
        </label>
        <input
          id="delivery-big-bags"
          type="number"
          inputMode="numeric"
          min={0}
          max={summary.availableBigBags}
          placeholder="Big bags to deliver"
          className={styles.fieldInput}
          value={withdrawal.bigBags}
          onChange={(e) =>
            onBigBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')
          }
        />
      </div>

      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
        Total Delivering:{' '}
        <span style={{ color: 'var(--color-primary)' }}>
          {(typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0) +
            (typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0)}
        </span>{' '}
        bags
      </div>
    </>
  );
}