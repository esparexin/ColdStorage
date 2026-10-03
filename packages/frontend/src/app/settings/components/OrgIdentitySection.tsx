'use client';

import React from 'react';
import { Building } from 'lucide-react';
import { Select } from '@/components/ui';
import styles from '../page.module.css';

interface OrgIdentitySectionProps {
  orgName: string;
  setOrgName: (val: string) => void;
  gstin: string;
  setGstin: (val: string) => void;
  address: string;
  setAddress: (val: string) => void;
  contact: string;
  setContact: (val: string) => void;
  timezone: string;
  setTimezone: (val: string) => void;
  printFooter: string;
  setPrintFooter: (val: string) => void;
}

export function OrgIdentitySection({
  orgName,
  setOrgName,
  gstin,
  setGstin,
  address,
  setAddress,
  contact,
  setContact,
  timezone,
  setTimezone,
  printFooter,
  setPrintFooter,
}: OrgIdentitySectionProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <Building size={18} color="var(--color-primary)" aria-hidden="true" />
        <h2 className={styles.sectionTitle}>Organization Identity & Operating Details</h2>
      </div>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="org-name" className={styles.fieldLabel}>
            Organization / Company Legal Name *
          </label>
          <input aria-label="e.g. Kisan Cold Storage & Warehousing Pvt. Ltd."
            id="org-name"
            required
            maxLength={160}
            className={styles.fieldInput}
            placeholder="e.g. Kisan Cold Storage & Warehousing Pvt. Ltd."
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="org-gstin" className={styles.fieldLabel}>
            GSTIN Registration Number
          </label>
          <input aria-label="e.g. 09AAACB1234D1Z5"
            id="org-gstin"
            maxLength={15}
            className={styles.fieldInput}
            placeholder="e.g. 09AAACB1234D1Z5"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="org-address" className={styles.fieldLabel}>
          Registered Business Address *
        </label>
        <input aria-label="e.g. Plot No. 42, Industrial Cold Zone, Kanpur Road, Luck..."
          id="org-address"
          required
          maxLength={500}
          className={styles.fieldInput}
          placeholder="e.g. Plot No. 42, Industrial Cold Zone, Kanpur Road, Lucknow, UP - 226012"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="org-contact" className={styles.fieldLabel}>
            Official Contact Numbers / Email *
          </label>
          <input aria-label="e.g. +91 98765 43210, info@kisancoldstorage.in"
            id="org-contact"
            required
            maxLength={200}
            className={styles.fieldInput}
            placeholder="e.g. +91 98765 43210, info@kisancoldstorage.in"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <Select
          id="org-timezone"
          label="System Operational Timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          <option value="Asia/Kolkata">Asia/Kolkata (IST — UTC+5:30)</option>
        </Select>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="org-footer" className={styles.fieldLabel}>
          Document Print Footer Notes
        </label>
        <textarea aria-label="e.g. Goods stored at owner's risk under standard warehous..."
          id="org-footer"
          rows={2}
          maxLength={500}
          className={styles.fieldInput}
          placeholder="e.g. Goods stored at owner's risk under standard warehousing terms. Banking Details: Bank of India A/C: 1234567890."
          value={printFooter}
          onChange={(e) => setPrintFooter(e.target.value)}
        />
      </div>
    </div>
  );
}
