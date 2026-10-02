'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import styles from '../page.module.css';

interface DocumentNumberingSectionProps {
  grnPrefix: string;
  setGrnPrefix: (val: string) => void;
  receiptPrefix: string;
  setReceiptPrefix: (val: string) => void;
  challanPrefix: string;
  setChallanPrefix: (val: string) => void;
  rentReceiptPrefix: string;
  setRentReceiptPrefix: (val: string) => void;
}

export function DocumentNumberingSection({
  grnPrefix,
  setGrnPrefix,
  receiptPrefix,
  setReceiptPrefix,
  challanPrefix,
  setChallanPrefix,
  rentReceiptPrefix,
  setRentReceiptPrefix,
}: DocumentNumberingSectionProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <FileText size={18} color="var(--color-primary)" aria-hidden="true" />
        <h2 className={styles.sectionTitle}>Document Numbering Prefixes</h2>
      </div>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="prefix-grn" className={styles.fieldLabel}>
            Inward GRN Number Prefix
          </label>
          <input
            id="prefix-grn"
            required
            maxLength={10}
            className={styles.fieldInput}
            value={grnPrefix}
            onChange={(e) => setGrnPrefix(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="prefix-receipt" className={styles.fieldLabel}>
            Inward Acknowledgement Receipt Prefix
          </label>
          <input
            id="prefix-receipt"
            required
            maxLength={10}
            className={styles.fieldInput}
            value={receiptPrefix}
            onChange={(e) => setReceiptPrefix(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="prefix-challan" className={styles.fieldLabel}>
            Outward Delivery Challan Prefix
          </label>
          <input
            id="prefix-challan"
            required
            maxLength={10}
            className={styles.fieldInput}
            value={challanPrefix}
            onChange={(e) => setChallanPrefix(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="prefix-rent" className={styles.fieldLabel}>
            Rent Payment Receipt Prefix
          </label>
          <input
            id="prefix-rent"
            required
            maxLength={10}
            className={styles.fieldInput}
            value={rentReceiptPrefix}
            onChange={(e) => setRentReceiptPrefix(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
