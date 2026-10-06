'use client';

import React from 'react';
import { SEASONAL_RENT_MONTHS } from '@cold-storage/contracts';
import styles from './PricingExplainerSection.module.css';

/**
 * Read-only Bag Pricing & Rent explanation.
 *
 * Text-only: describes the canonical calculation and collection model.
 * No calculation logic, no inputs, no API calls. The seasonal month count is
 * imported from the contracts SSOT so the prose cannot drift from the code.
 */
export function PricingExplainerSection() {
  return (
    <section className={styles.section} aria-labelledby="pricing-explainer-heading">
      <h2 id="pricing-explainer-heading" className={styles.title}>
        How Bag Pricing &amp; Rent Works
      </h2>

      <ul className={styles.list}>
        <li>
          <strong>Seasonal:</strong> March to December — {SEASONAL_RENT_MONTHS} months.
        </li>
        <li>
          <strong>Monthly:</strong> Used for additional months after the Seasonal period.
        </li>
        <li>
          <strong>January &amp; February:</strong> If bags remain after December, additional
          Monthly rent applies.
        </li>
        <li>
          <strong>Bag Price:</strong> Monthly extension rent is calculated using the applicable
          bag price and remaining bags.
        </li>
        <li>
          <strong>Manual Rent:</strong> Authorized users can enter a manual amount for the
          additional Monthly rent when required.
        </li>
        <li>
          <strong>Original Rent:</strong> The original Seasonal rent is kept unchanged.
        </li>
        <li>
          <strong>Remaining Rent:</strong> Total rent due − amount paid.
        </li>
        <li>
          <strong>Delivery:</strong> Delivery reduces the remaining bags but does not change the
          original Seasonal rent.
        </li>
        <li>
          <strong>After February:</strong> The next Seasonal period starts in March.
        </li>
      </ul>
    </section>
  );
}
