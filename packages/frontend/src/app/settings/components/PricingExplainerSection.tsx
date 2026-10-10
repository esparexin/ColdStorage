'use client';

import React from 'react';
import { pricingExamples } from './pricingExamples';
import styles from './PricingExplainerSection.module.css';

/**
 * Read-only Bag Pricing & Rent explanation.
 *
 * Explains the existing business logic; it never re-implements it. All numbers
 * below come from `pricingExamples`, which calls the canonical contracts SSOT
 * (`calculateRentAmount`, `calculateExtensionRent`, `totalRentDue`,
 * `SEASONAL_RENT_MONTHS`). No inputs, no state, no API calls.
 */
export function PricingExplainerSection() {
  const ex = pricingExamples;
  return (
    <section className={styles.section} aria-labelledby="pricing-explainer-heading">
      <h2 id="pricing-explainer-heading" className={styles.title}>
        How Bag Pricing &amp; Rent Works
      </h2>

      <p className={styles.lede}>
        Seasonal rent is the whole-season total (<code>bags × seasonal rate</code>) fixed at inward
        time and stored once as <code>Grn.rentAmount</code>. Delivery never rewrites that original
        amount — it only reduces remaining bags. Later seasons and months after December are
        additive periods under the same GRN. Balances are always <code>Total due − Amount paid</code>.
      </p>

      <ul className={styles.list}>
        <li>
          <strong>Seasonal (Mar–Dec):</strong> whole-season total; {ex.seasonalMonths} months informational only.
        </li>
        <li>
          <strong>January &amp; February periods:</strong> if bags remain after December, one
          Monthly charge per month applies, based on bags remaining at the month-start snapshot.
        </li>
        <li>
          <strong>Seasonal renewals:</strong> each subsequent season is recorded as its own period
          under the same GRN, priced at the applicable seasonal rate from the Mar 01 snapshot.
        </li>
        <li>
          <strong>Manual override:</strong> an authorized user may set a manual extension amount with
          a reason; otherwise the calculated amount applies.
        </li>
        <li>
          <strong>Original rent is immutable:</strong> the stored <code>Grn.rentAmount</code> is never
          modified — extensions are separate persisted records.
        </li>
        <li>
          <strong>After February:</strong> the next Seasonal period starts in March.
        </li>
      </ul>

      <div className={styles.examples}>
        <article className={styles.card} aria-labelledby="ex-original">
          <h3 id="ex-original" className={styles.cardTitle}>
            1 · Original Seasonal rent
          </h3>
          <p className={styles.formula}>{ex.seasonalFormula}</p>
          <p className={styles.hint}>Stored once as Grn.rentAmount. Delivery does not change it.</p>
        </article>

        <article className={styles.card} aria-labelledby="ex-mixed">
          <h3 id="ex-mixed" className={styles.cardTitle}>
            2 · Mixed S+B bags
          </h3>
          <p className={styles.formula}>{ex.mixedFormula}</p>
          <p className={styles.hint}>Small and big bag rates stay distinct.</p>
        </article>

        <article className={styles.card} aria-labelledby="ex-extension">
          <h3 id="ex-extension" className={styles.cardTitle}>
            3 · January extension (additional rent)
          </h3>
          <p className={styles.formula}>{ex.januaryFormula}</p>
          <p className={styles.hint}>
            Snapshot Jan 01 · no proration — the month is billed whole once finalized.
          </p>
        </article>

        <article className={styles.card} aria-labelledby="ex-total">
          <h3 id="ex-total" className={styles.cardTitle}>
            4 · Total due, paid &amp; remaining
          </h3>
          <dl className={styles.amounts}>
            <div>
              <dt>Original rent</dt>
              <dd>{ex.inr(ex.seasonalOriginal)}</dd>
            </div>
            <div>
              <dt>Additional / extension rent</dt>
              <dd>{ex.inr(ex.januaryExtension)}</dd>
            </div>
            <div>
              <dt>Total due</dt>
              <dd>{ex.inr(ex.totalDueExample)}</dd>
            </div>
            <div>
              <dt>Amount paid</dt>
              <dd>{ex.inr(ex.paidExample)}</dd>
            </div>
            <div>
              <dt>Remaining balance</dt>
              <dd>{ex.inr(ex.remainingExample)}</dd>
            </div>
          </dl>
          <p className={styles.formula}>{ex.totalFormula}</p>
          <p className={styles.formula}>{ex.remainingFormula}</p>
          <p className={styles.hint}>Status: {ex.remainingExample === 0 ? 'Settled' : 'Not Settled'} (derived, never stored).</p>
        </article>

        <article className={styles.card} aria-labelledby="ex-delivery">
          <h3 id="ex-delivery" className={styles.cardTitle}>
            5 · Effect of delivery on remaining bags
          </h3>
          <table className={styles.table}>
            <caption className={styles.caption}>Delivery reduces bags, not original rent</caption>
            <thead>
              <tr>
                <th scope="col">Opening</th>
                <th scope="col">Delivered</th>
                <th scope="col">Remaining</th>
                <th scope="col">Original rent</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>100 bags</td>
                <td>60 bags</td>
                <td>40 bags</td>
                <td>{ex.inr(ex.seasonalOriginal)} (unchanged)</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.hint}>
            The 40 remaining bags are what the January extension is calculated from.
          </p>
        </article>
      </div>

      <p className={styles.warning} role="note">
        The original <code>Grn.rentAmount</code> is never modified. Extensions and payments only
        affect total due and remaining balance.
      </p>
    </section>
  );
}
