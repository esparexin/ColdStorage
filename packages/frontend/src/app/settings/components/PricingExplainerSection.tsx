'use client';

import React from 'react';
import { SEASONAL_RENT_MONTHS } from '@cold-storage/contracts';
import styles from './PricingExplainerSection.module.css';

/**
 * Read-only Bag Pricing & Rent explanation.
 *
 * Text-only: describes the current canonical calculation and collection model.
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
          <strong>Seasonal:</strong> Total bags × bag price × {SEASONAL_RENT_MONTHS} months
        </li>
        <li>
          <strong>Monthly:</strong> Total bags × bag price × months entered
        </li>
        <li>
          <strong>Rent Amount:</strong> The amount is calculated when the GRN is created and
          stored on the GRN.
        </li>
        <li>
          <strong>Remaining Rent:</strong> Rent Amount − Amount Paid.
        </li>
        <li>
          <strong>Paid:</strong> Remaining rent is ₹0.
        </li>
        <li>
          <strong>Unpaid:</strong> Remaining rent is greater than ₹0.
        </li>
        <li>
          <strong>Delivery:</strong> Delivery changes the bag quantity, not the original rent
          amount.
        </li>
        <li>
          <strong>Manual Rent:</strong> If a valid manual rent amount is entered, that amount is
          used.
        </li>
        <li>
          <strong>Zero Rent:</strong> A GRN cannot be created without either a valid bag price or
          a valid rent amount.
        </li>
      </ul>
    </section>
  );
}
