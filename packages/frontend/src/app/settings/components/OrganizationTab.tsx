'use client';

import React from 'react';
import { Pencil } from 'lucide-react';
import { Banner, Button } from '@/components/ui';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { OrgIdentitySection } from './OrgIdentitySection';
import { OrgIdentityView } from './OrgIdentityView';
import styles from '../page.module.css';

interface OrganizationTabProps {
  orgName: string;
  setOrgName: (val: string) => void;
  address: string;
  setAddress: (val: string) => void;
  contact: string;
  setContact: (val: string) => void;
  gstin: string;
  setGstin: (val: string) => void;
  timezone: string;
  setTimezone: (val: string) => void;
  printFooter: string;
  setPrintFooter: (val: string) => void;
  isEditing: boolean;
  isDirty: boolean;
  saving: boolean;
  saveSuccess: string | null;
  saveError: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function OrganizationTab(props: OrganizationTabProps) {
  const { isEditing, isDirty, saving, saveSuccess, saveError, onEdit, onCancel, onSave } = props;
  return (
    <section
      id="settings-panel-organization"
      role="tabpanel"
      aria-labelledby="settings-tab-organization"
      className={styles.tabPanel}
    >
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Organization Identity &amp; Operating Details</h2>
          <p className={styles.panelDescription}>
            Legal identity printed on GRNs, challans and rent receipts. Fields stay read-only
            until you choose Edit.
          </p>
        </div>
        {!isEditing && (
          <div className={styles.panelActions}>
            <Button
              id="edit-org-btn"
              variant="outline"
              size="sm"
              onClick={onEdit}
              leftIcon={<Pencil size={14} aria-hidden="true" />}
            >
              Edit
            </Button>
          </div>
        )}
      </div>

      {saveSuccess && <Banner variant="success" message={saveSuccess} />}
      {saveError && <Banner message={saveError} id="org-save-error" />}

      {!isEditing ? (
        <OrgIdentityView
          orgName={props.orgName}
          address={props.address}
          contact={props.contact}
          gstin={props.gstin}
          printFooter={props.printFooter}
          timezone={props.timezone}
        />
      ) : (
        <>
          <OrgIdentitySection
            orgName={props.orgName}
            setOrgName={props.setOrgName}
            gstin={props.gstin}
            setGstin={props.setGstin}
            address={props.address}
            setAddress={props.setAddress}
            contact={props.contact}
            setContact={props.setContact}
            timezone={props.timezone}
            setTimezone={props.setTimezone}
            printFooter={props.printFooter}
            setPrintFooter={props.setPrintFooter}
          />
          <div className={styles.editActions}>
            {isDirty && <span className={styles.unsavedHint}>Unsaved changes</span>}
            <Button id="cancel-org-btn" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              id="save-org-btn"
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={saving}
              isLoading={saving}
            >
              {saving ? LOADING_LABELS.saving : 'Save Organization'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
