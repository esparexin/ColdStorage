'use client';

import React from 'react';
import styles from './SettingsView.module.css';

interface OrgIdentityViewProps {
  orgName: string;
  address: string;
  contact: string;
  gstin: string;
  printFooter: string;
  timezone: string;
}

function valueOrDash(value: string): string {
  return value && value.trim().length > 0 ? value : '—';
}

export function OrgIdentityView({
  orgName,
  address,
  contact,
  gstin,
  printFooter,
  timezone,
}: OrgIdentityViewProps) {
  return (
    <dl className={styles.viewList}>
      <div className={styles.row}>
        <dt>Organization Name</dt>
        <dd>{valueOrDash(orgName)}</dd>
      </div>
      <div className={styles.row}>
        <dt>Registered Business Address</dt>
        <dd>{valueOrDash(address)}</dd>
      </div>
      <div className={styles.row}>
        <dt>Official Contact Numbers / Email</dt>
        <dd>{valueOrDash(contact)}</dd>
      </div>
      <div className={styles.row}>
        <dt>GSTIN Registration Number</dt>
        <dd>{valueOrDash(gstin)}</dd>
      </div>
      <div className={styles.row}>
        <dt>Document Print Footer Notes</dt>
        <dd>{valueOrDash(printFooter)}</dd>
      </div>
      <div className={styles.row}>
        <dt>System Operational Timezone</dt>
        <dd>{valueOrDash(timezone)}</dd>
      </div>
    </dl>
  );
}
