'use client';

import React, { useState } from 'react';
import type { BagType, Commodity, Customer, Grn, RentType } from '@cold-storage/contracts';
import { Button, ConfirmDialog, Input, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { BondLoanSection } from './BondLoanSection';
import { CustomerCombobox } from './CustomerCombobox';
import { TransportLogisticsSection } from './TransportLogisticsSection';
import { useCustomerCombobox } from '../hooks/useCustomerCombobox';
import { parseNumericInput, useCreateGrnForm } from '../hooks/useCreateGrnForm';
import { CustomerFormModal } from '../../customers/components/CustomerFormModal';
import { CommodityFormModal } from '../../commodities/components/CommodityFormModal';
import styles from '../page.module.css';

export interface CreateGrnModalProps {
  facilityId: string;
  customers: Customer[];
  commodities: Commodity[];
  onClose: () => void;
  onSuccess: (savedGrn: Grn) => void;
  onCustomerAdded?: () => void;
  onCommodityAdded?: () => void;
  mode?: 'create' | 'edit';
  initialGrn?: Grn | null;
  movementGuard?: { hasMovement: boolean; hasActiveIssued: boolean } | null;
}

export function CreateGrnModal({
  facilityId, customers, commodities, onClose, onSuccess, onCustomerAdded, onCommodityAdded,
  mode = 'create', initialGrn = null, movementGuard = null,
}: CreateGrnModalProps) {
  const isEdit = mode === 'edit' && Boolean(initialGrn);
  const isClosed = initialGrn?.status === 'CLOSED';
  const hasMovement = Boolean(
    movementGuard?.hasMovement || isClosed || (initialGrn && (initialGrn.netDeliveredBags ?? 0) > 0),
  );
  const structuralLocked = isEdit && (isClosed || hasMovement);
  const guardMessage = isClosed
    ? `Cannot correct GRN '${initialGrn?.grnNumber}': it is CLOSED and its stock has been fully delivered.`
    : isEdit && (initialGrn?.netDeliveredBags ?? 0) > 0
    ? `Partially delivered (${initialGrn?.netDeliveredBags} bags delivered). Customer, date, commodity and bag count are locked to preserve ledger integrity. Chamber, marks, vehicle, and remarks may be edited.`
    : isEdit && hasMovement
    ? `Stock has moved against this GRN. Core identity fields are locked. Chamber, marks, vehicle, and remarks may be edited.`
    : null;

  const form = useCreateGrnForm(
    facilityId, customers, commodities, onSuccess, mode, initialGrn, structuralLocked,
    isClosed ? 'closed' : hasMovement ? 'locked' : null,
  );
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [isAddingCommodity, setIsAddingCommodity] = useState(false);

  const customerBox = useCustomerCombobox(
    customers, form.createCustomerId, form.setCreateCustomerId, () => setIsAddingCustomer(true),
  );

  const { attemptExit, isConfirmOpen, confirmExit, cancelExit } = useUnsavedChanges(
    form.isDirty && !form.submitting,
  );
  const handleAttemptClose = () => attemptExit(onClose);

  return (
    <>
    <Modal
      isOpen onClose={handleAttemptClose}
      title={isEdit && initialGrn ? `Edit GRN: ${initialGrn.grnNumber}` : 'Inward of Goods'}
      subtitle={isEdit && initialGrn ? `Customer: ${initialGrn.customerName} • Receipt #${initialGrn.inwardReceiptNumber}` : undefined}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="outline" size="sm" onClick={handleAttemptClose} disabled={form.submitting}>
            Cancel
          </Button>
          <Button
            id="submit-create-grn-btn" form="create-grn-form" type="submit" variant="primary" size="sm"
            disabled={form.submitting || isClosed || (!isEdit && form.isGrnInvalid)} isLoading={form.submitting}
          >
            {isEdit ? 'Save Changes' : 'Create Inward of Goods'}
          </Button>
        </div>
      }
    >
      <form id="create-grn-form" noValidate onSubmit={form.handleSubmit} className={`${styles.modalForm} ${styles.formSections}`}>
        {form.modalError && <Banner message={form.modalError} id="grn-modal-error" />}
        {guardMessage && <Banner message={guardMessage} id="grn-guard-banner" />}

        <section className={styles.formSection}>
          <div className={styles.sectionHeadingRow}>
            <h3 className={styles.sectionHeading}>Basic Information</h3>
            {!isEdit && (
              <span className={styles.grnGuidance}>
                Last Created GRN: {form.lastCreatedGrn ?? '—'} · Next GRN: {form.suggestedGrnNumber || '—'}
              </span>
            )}
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-date" className={styles.fieldLabel}>Inward Date *</label>
              <input
                id="create-date" type="date" required disabled={structuralLocked}
                value={form.createDate} onChange={(e) => form.setCreateDate(e.target.value)}
                className={`${styles.fieldInput} ${structuralLocked ? styles.calculatedField : ''}`}
              />
            </div>
            <CustomerCombobox
              customerBox={customerBox} customerId={form.createCustomerId} customers={customers}
              error={form.fieldErrors.customer} disabled={structuralLocked}
              onAddCustomer={() => setIsAddingCustomer(true)}
            />
            <div className={styles.fieldGroup}>
              <Select
                id="create-commodity" label="Commodity" required disabled={structuralLocked}
                value={form.createCommodityId} onChange={(e) => form.setCreateCommodityId(e.target.value)}
                error={form.fieldErrors.commodity}
                rightAction={!structuralLocked ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingCommodity(true)}>+ Add</Button>
                ) : undefined}
              >
                <option value="">Select Commodity</option>
                {commodities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </Select>
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-gr-number" className={styles.fieldLabel}>GR Number *</label>
              <input
                id="create-gr-number" type="text" inputMode="numeric" required maxLength={4}
                disabled={isEdit} value={form.createGrnNumber} onChange={(e) => form.setCreateGrnNumber(e.target.value)}
                onBlur={form.handleGrnBlur}
                placeholder="Enter 4-digit GRN"
                className={`${styles.fieldInput} ${form.fieldErrors.grnNumber ? styles.inputError : ''} ${isEdit ? styles.calculatedField : ''}`}
                aria-invalid={Boolean(form.fieldErrors.grnNumber)}
                aria-describedby={form.fieldErrors.grnNumber ? 'create-gr-number-error' : undefined}
              />
              {form.fieldErrors.grnNumber && (
                <span id="create-gr-number-error" className={styles.fieldErrorText} role="alert">
                  {form.fieldErrors.grnNumber}
                </span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <Input
                id="create-chamber" label="Chamber" type="text" required maxLength={20}
                disabled={isClosed} value={form.createChamber} onChange={(e) => form.setCreateChamber(e.target.value)}
                error={form.fieldErrors.chamber} placeholder="e.g. A or CH-01"
              />
            </div>
            <div className={styles.fieldGroup}>
              <Select
                id="create-bag-type" label="Bag Type" required disabled={structuralLocked}
                value={form.createBagType} onChange={(e) => form.handleBagTypeChange(e.target.value as BagType)}
              >
                <option value="S">S — Small Bag</option>
                <option value="B">B — Big Bag</option>
                <option value="S+B">S&amp;B — Small &amp; Big Bags</option>
              </Select>
            </div>
          </div>
        </section>

        <section className={styles.formSection}>
          <h3 className={styles.sectionHeading}>Quantity &amp; Rent Terms</h3>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-bags" className={styles.fieldLabel}>Total Bags *</label>
              <input
                id="create-bags" type="text" inputMode="numeric" required disabled={structuralLocked}
                value={form.createBags} onChange={(e) => form.handleBagsChange(parseNumericInput(e.target.value))}
                placeholder="e.g. 250"
                className={`${styles.fieldInput} ${form.fieldErrors.bags ? styles.inputError : ''} ${structuralLocked ? styles.calculatedField : ''}`}
                aria-invalid={Boolean(form.fieldErrors.bags)}
              />
              {form.fieldErrors.bags && <span className={styles.fieldErrorText}>{form.fieldErrors.bags}</span>}
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-bag-price" className={styles.fieldLabel}>Bag Price (₹/bag)</label>
              <input
                id="create-bag-price" type="text" inputMode="decimal" disabled={structuralLocked}
                value={form.createBagPrice} onChange={(e) => form.handleBagPriceChange(parseNumericInput(e.target.value))}
                placeholder="e.g. 80" className={`${styles.fieldInput} ${structuralLocked ? styles.calculatedField : ''}`}
              />
            </div>
            <div className={styles.fieldGroup}>
              <Select
                id="create-rent-type" label="Rent Type" required disabled={structuralLocked}
                value={form.createRentType} onChange={(e) => form.createRentType !== e.target.value && form.handleRentTypeChange(e.target.value as RentType)}
              >
                <option value="Seasonal">Seasonal</option>
                <option value="Monthly">Monthly</option>
              </Select>
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-rent-months" className={styles.fieldLabel}>Rent Months {form.createRentType === 'Monthly' ? '(Optional)' : ''}</label>
              <input
                id="create-rent-months" type="number" min={1}
                disabled={structuralLocked || form.createRentType !== 'Monthly'}
                value={form.createRentType === 'Seasonal' ? form.seasonalRentMonths : form.createRentMonths}
                onChange={(e) => form.handleRentMonthsChange(e.target.value ? parseInt(e.target.value, 10) : '')}
                placeholder={form.createRentType === 'Monthly' ? 'e.g. 6' : '—'}
                readOnly={form.createRentType === 'Seasonal'}
                className={`${styles.fieldInput} ${form.fieldErrors.rentMonths ? styles.inputError : ''} ${structuralLocked ? styles.calculatedField : ''}`}
                aria-invalid={Boolean(form.fieldErrors.rentMonths)}
                aria-label={form.createRentType === 'Seasonal' ? `Rent Months (fixed at ${form.seasonalRentMonths} for Seasonal)` : 'Rent Months (Optional)'}
              />
              {form.fieldErrors.rentMonths && <span className={styles.fieldErrorText}>{form.fieldErrors.rentMonths}</span>}
            </div>
            <div className={`${styles.fieldGroup} ${styles.span2}`}>
              <label htmlFor="create-rent-amount" className={styles.fieldLabel}>Rent Amount (₹) {form.createRentType === 'Seasonal' ? '*' : '(Optional)'}</label>
              <input
                id="create-rent-amount" type="number" inputMode="decimal" min={0} step="0.01"
                required={form.createRentType === 'Seasonal'} disabled={structuralLocked}
                value={form.createRentAmount} onChange={(e) => form.setCreateRentAmount(parseNumericInput(e.target.value))}
                placeholder={form.createRentType === 'Seasonal' ? 'e.g. 50000' : 'Optional (Dynamic)'}
                className={`${styles.fieldInput} ${form.fieldErrors.rentAmount ? styles.inputError : ''} ${structuralLocked ? styles.calculatedField : ''}`}
                aria-invalid={Boolean(form.fieldErrors.rentAmount)}
              />
              {form.fieldErrors.rentAmount && <span className={styles.fieldErrorText}>{form.fieldErrors.rentAmount}</span>}
            </div>
          </div>
        </section>

        <TransportLogisticsSection
          grnNumber={form.createGrnNumber}
          vehicleNumber={form.createVehicleNumber} onVehicleNumberChange={form.setCreateVehicleNumber}
          vehicleError={form.fieldErrors.vehicleNumber}
          partyMark={form.createPartyMark} onPartyMarkChange={form.setCreatePartyMark}
          partyMarkError={form.fieldErrors.partyMark}
          remarks={form.createRemarks} onRemarksChange={form.setCreateRemarks}
        />
        {!isEdit && (
          <BondLoanSection
            isBondForLoan={form.isBondForLoan} onIsBondForLoanChange={form.setIsBondForLoan}
            grnNumber={form.createGrnNumber}
            loanStatus={form.loanStatus} onLoanStatusChange={form.setLoanStatus}
          />
        )}
      </form>
    </Modal>
    <ConfirmDialog
      isOpen={isConfirmOpen} title="Unsaved Changes"
      message="You have entered information that has not been saved. Are you sure you want to exit?"
      cancelLabel="Stay" confirmLabel="Exit" onCancel={cancelExit} onConfirm={confirmExit}
    />
    {isAddingCustomer && <CustomerFormModal customer={null} selectedFacilityId={facilityId} existingCustomers={customers} onClose={() => setIsAddingCustomer(false)} onSuccess={() => { setIsAddingCustomer(false); onCustomerAdded?.(); }} />}
    {isAddingCommodity && <CommodityFormModal onClose={() => setIsAddingCommodity(false)} onSuccess={() => { setIsAddingCommodity(false); onCommodityAdded?.(); }} />}
    </>
  );
}
