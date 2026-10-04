'use client';

import React from 'react';
import { Input, Select } from '@/components/ui';
import styles from './OrgIdentitySection.module.css';

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

/**
 * Organization identity and operating details.
 *
 * Fields use the shared Input and Select primitives so accessible-name association is handled
 * by the primitives. The previous markup paired a real <label> with an aria-label holding the
 * placeholder text, which made the placeholder override the visible label for screen readers.
 */
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
    <div className={styles.grid}>
      <Input
        id="org-name"
        label="Organization / Company Legal Name"
        required
        maxLength={160}
        placeholder="e.g. Kisan Cold Storage"
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
      />

      <Input
        id="org-gstin"
        label="GSTIN Registration Number"
        maxLength={15}
        placeholder="e.g. 09AAACB1234D1Z5"
        value={gstin}
        onChange={(e) => setGstin(e.target.value.toUpperCase())}
        className={styles.narrow}
      />

      <Input
        id="org-address"
        label="Registered Business Address"
        required
        maxLength={500}
        placeholder="e.g. Plot 42, Cold Zone, Lucknow"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className={styles.fullWidth}
      />

      <Input
        id="org-contact"
        label="Official Contact Numbers / Email"
        required
        maxLength={200}
        placeholder="e.g. +91 98765 43210"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        className={styles.fullWidth}
      />

      <Select
        id="org-timezone"
        label="System Operational Timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className={styles.narrow}
      >
        <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
      </Select>

      <div className={styles.fullWidth}>
        <label htmlFor="org-footer" className={styles.footerLabel}>
          Document Print Footer Notes
        </label>
        <textarea
          id="org-footer"
          rows={2}
          maxLength={500}
          className={styles.textarea}
          placeholder="e.g. Goods stored at owner's risk."
          value={printFooter}
          onChange={(e) => setPrintFooter(e.target.value)}
        />
      </div>
    </div>
  );
}