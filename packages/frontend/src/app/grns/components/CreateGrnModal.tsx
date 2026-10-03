'use client';

import React, { useState } from 'react';
import type { BagType, Commodity, Customer, Grn, RentType } from '@cold-storage/contracts';
import { Button, Input, Modal, Select } from '@/components/ui';
import { BagAccountingSection } from './BagAccountingSection';
import { useCustomerCombobox } from '../hooks/useCustomerCombobox';
import { parseNumericInput, useCreateGrnForm } from '../hooks/useCreateGrnForm';
import { CustomerFormModal } from '../../customers/components/CustomerFormModal';
import { CommodityFormModal } from '../../commodities/components/CommodityFormModal';
import styles from '../page.module.css';

interface CreateGrnModalProps {
  facilityId: string; customers: Customer[]; commodities: Commodity[];
  onClose: () => void; onSuccess: (newGrn: Grn) => void;
  onCustomerAdded?: () => void; onCommodityAdded?: () => void;
}

export function CreateGrnModal({
  facilityId, customers, commodities, onClose, onSuccess, onCustomerAdded, onCommodityAdded,
}: CreateGrnModalProps) {
  const form = useCreateGrnForm(facilityId, customers, commodities, onSuccess);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [isAddingCommodity, setIsAddingCommodity] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const customerBox = useCustomerCombobox(
    customers,
    form.createCustomerId,
    form.setCreateCustomerId,
    () => setIsAddingCustomer(true),
  );

  const handleAttemptClose = () => {
    if (form.isDirty && !form.submitting) setShowExitConfirm(true);
    else onClose();
  };

  return (
    <>
    <Modal
      isOpen onClose={handleAttemptClose} title="Inward Goods Receipt Note (GRN)" size="lg"
      footer={<><Button variant="outline" onClick={handleAttemptClose} disabled={form.submitting}>Cancel</Button><Button id="submit-create-grn-btn" form="create-grn-form" type="submit" variant="primary" disabled={form.submitting} isLoading={form.submitting}>Create Inward GRN</Button></>}
    >
      <form id="create-grn-form" noValidate onSubmit={form.handleSubmit} className={styles.modalForm}>
        {form.modalError && <div id="modal-error-banner" className={styles.modalError} role="alert">{form.modalError}</div>}
        <h3 className={styles.sectionHeading}>Basic Information</h3>
        <div className={styles.formGrid3}>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-date" className={styles.fieldLabel}>Inward Date *</label>
            <input id="create-date" type="date" required value={form.createDate} onChange={(e) => form.setCreateDate(e.target.value)} className={styles.fieldInput} />
          </div>
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor="create-customer-search" className={styles.fieldLabel}>Customer *</label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingCustomer(true)}>+ Add</Button>
            </div>
            <div className={styles.comboboxWrapper} ref={customerBox.wrapperRef}>
              <input aria-label="Search customers by name…"
                id="create-customer-search" type="text" autoComplete="off"
                className={`${styles.comboboxInput} ${form.fieldErrors.customer ? styles.inputError : ''}`}
                value={customerBox.displayValue}
                placeholder="Search customers by name…"
                onFocus={customerBox.open}
                onChange={(e) => { customerBox.setQuery(e.target.value); customerBox.setHighlightIdx(0); }}
                onKeyDown={customerBox.handleKeyDown}
                aria-invalid={Boolean(form.fieldErrors.customer)}
              />
              {form.createCustomerId && !customerBox.isOpen && (
                <Button type="button" variant="ghost" size="sm" className={styles.comboboxClearBtn} onClick={customerBox.clear} aria-label="Clear customer selection">✕</Button>
              )}
              {form.fieldErrors.customer && <span className={styles.fieldErrorText}>{form.fieldErrors.customer}</span>}
              {customerBox.isOpen && (
                <div className={styles.comboboxDropdown} role="listbox">
                  {customerBox.matches.length > 0 ? (
                    customerBox.matches.map((c, idx) => (
                      <div key={c.id} role="option" aria-selected={c.id === form.createCustomerId} className={`${styles.comboboxOption} ${customerBox.highlightIdx === idx ? styles.comboboxOptionActive : ''}`} onMouseDown={() => customerBox.choose(c.id)}>
                        <span className={styles.comboboxOptionName}>{c.name}</span>
                      </div>
                    ))
                  ) : (
                    <div className={styles.comboboxEmpty}>
                      No customers found
                      <Button type="button" variant="ghost" size="sm" onMouseDown={(e) => { e.preventDefault(); customerBox.requestAdd(); }}>+ Add Customer</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <Select
              id="create-commodity"
              label="Commodity"
              required
              value={form.createCommodityId}
              onChange={(e) => form.setCreateCommodityId(e.target.value)}
              error={form.fieldErrors.commodity}
              rightAction={
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingCommodity(true)}>+ Add</Button>
              }
            >
              <option value="">Select Commodity</option>
              {commodities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </div>
        </div>
        <div className={styles.formGrid2}>
          <div className={styles.fieldGroup}>
            <Input
              id="create-chamber"
              label="Chamber"
              type="text"
              required
              maxLength={20}
              value={form.createChamber}
              onChange={(e) => form.setCreateChamber(e.target.value)}
              error={form.fieldErrors.chamber}
              placeholder="e.g. A or CH-01"
            />
          </div>
          <div className={styles.fieldGroup}>
            <Select id="create-bag-type" label="Bag Type" required value={form.createBagType} onChange={(e) => form.handleBagTypeChange(e.target.value as BagType)}>
              <option value="S">Small Bag (S)</option>
              <option value="B">Big Bag (B)</option>
              <option value="S+B">Mixed (Small + Big)</option>
            </Select>
          </div>
        </div>
        <BagAccountingSection
          values={{
            bagType: form.createBagType,
            bags: form.createBags,
            smallBags: form.createSmallBags,
            bigBags: form.createBigBags,
            nominalUnitWeight: form.createNominalUnitWeight,
            nominalTotalWeight: form.createNominalTotalWeight,
            actualWeight: form.createActualWeight,
            bagError: form.fieldErrors.bags,
          }}
          handlers={{
            onBagsChange: form.handleBagsChange,
            onSmallBagsChange: form.handleSmallBagsChange,
            onBigBagsChange: form.handleBigBagsChange,
            onUnitWeightChange: form.handleUnitWeightChange,
            onTotalWeightChange: form.setCreateNominalTotalWeight,
            onActualWeightChange: form.setCreateActualWeight,
          }}
        />
        <h3 className={styles.sectionHeading}>Rent Terms &amp; Bag Pricing</h3>
        {form.createBagType === 'S+B' ? (
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-small-bag-price" className={styles.fieldLabel}>Small Bag Price (₹/bag)</label>
              <input id="create-small-bag-price" type="number" inputMode="decimal" min={0} step="0.01" value={form.createSmallBagPrice} onChange={(e) => form.handleSmallBagPriceChange(parseNumericInput(e.target.value))} placeholder="e.g. 80" className={styles.fieldInput} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-big-bag-price" className={styles.fieldLabel}>Big Bag Price (₹/bag)</label>
              <input id="create-big-bag-price" type="number" inputMode="decimal" min={0} step="0.01" value={form.createBigBagPrice} onChange={(e) => form.handleBigBagPriceChange(parseNumericInput(e.target.value))} placeholder="e.g. 100" className={styles.fieldInput} />
            </div>
          </div>
        ) : (
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-bag-price" className={styles.fieldLabel}>Bag Price (₹/bag)</label>
              <input id="create-bag-price" type="number" inputMode="decimal" min={0} step="0.01" value={form.createBagPrice} onChange={(e) => form.handleBagPriceChange(parseNumericInput(e.target.value))} placeholder="e.g. 80" className={styles.fieldInput} />
            </div>
          </div>
        )}
        <div className={styles.formGrid3}>
          <div className={styles.fieldGroup}>
            <Select id="create-rent-type" label="Rent Type" required value={form.createRentType} onChange={(e) => form.createRentType !== e.target.value && form.handleRentTypeChange(e.target.value as RentType)}>
              <option value="Seasonal">Seasonal</option>
              <option value="Monthly">Monthly</option>
            </Select>
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-rent-months" className={styles.fieldLabel}>
              Rent Months {form.createRentType === 'Monthly' ? '*' : ''}
            </label>
            <input
              id="create-rent-months"
              type="number"
              min={1}
              disabled={form.createRentType !== 'Monthly'}
              required={form.createRentType === 'Monthly'}
              value={form.createRentType === 'Seasonal' ? form.seasonalRentMonths : form.createRentMonths}
              onChange={(e) => form.handleRentMonthsChange(e.target.value ? parseInt(e.target.value, 10) : '')}
              placeholder={form.createRentType === 'Monthly' ? 'e.g. 6' : '—'}
              readOnly={form.createRentType === 'Seasonal'}
              className={`${styles.fieldInput} ${form.fieldErrors.rentMonths ? styles.inputError : ''}`}
              aria-invalid={Boolean(form.fieldErrors.rentMonths)}
              aria-label={form.createRentType === 'Seasonal' ? `Rent Months (fixed at ${form.seasonalRentMonths} for Seasonal)` : 'Rent Months'}
            />
            {form.fieldErrors.rentMonths && <span className={styles.fieldErrorText}>{form.fieldErrors.rentMonths}</span>}
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-rent-amount" className={styles.fieldLabel}>
              Rent Amount (₹) *
            </label>
            <input
              id="create-rent-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              value={form.createRentAmount}
              onChange={(e) => form.setCreateRentAmount(parseNumericInput(e.target.value))}
              placeholder="e.g. 50000"
              className={`${styles.fieldInput} ${form.fieldErrors.rentAmount ? styles.inputError : ''}`}
              aria-invalid={Boolean(form.fieldErrors.rentAmount)}
            />
            {form.fieldErrors.rentAmount && <span className={styles.fieldErrorText}>{form.fieldErrors.rentAmount}</span>}
          </div>
        </div>
        <h3 className={styles.sectionHeading}>Transport & Logistics</h3>
        <div className={styles.formGrid2}>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-gp" className={styles.fieldLabel}>Gate Pass (GP) #</label>
            <input id="create-gp" type="text" maxLength={40} value={form.createGpNumber} onChange={(e) => form.setCreateGpNumber(e.target.value)} placeholder="e.g. GP-2026-09" className={styles.fieldInput} />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-vehicle" className={styles.fieldLabel}>Vehicle Registration</label>
            <input id="create-vehicle" type="text" maxLength={15} value={form.createVehicleNumber} onChange={(e) => form.setCreateVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g. UP32AA1111" className={`${styles.fieldInput} ${form.fieldErrors.vehicleNumber ? styles.inputError : ''}`} aria-invalid={Boolean(form.fieldErrors.vehicleNumber)} />
            {form.fieldErrors.vehicleNumber && <span className={styles.fieldErrorText}>{form.fieldErrors.vehicleNumber}</span>}
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-remarks" className={styles.fieldLabel}>Remarks / Notes</label>
          <textarea id="create-remarks" rows={2} maxLength={500} value={form.createRemarks} onChange={(e) => form.setCreateRemarks(e.target.value)} placeholder="Optional inward inspection notes or quality observations" className={styles.fieldInput} />
        </div>
      </form>
    </Modal>
    {showExitConfirm && (
      <Modal isOpen onClose={() => setShowExitConfirm(false)} title="Unsaved Changes" size="sm" footer={<><Button variant="outline" onClick={() => setShowExitConfirm(false)}>Stay</Button><Button variant="danger" onClick={() => { setShowExitConfirm(false); onClose(); }}>Exit</Button></>}>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
          You have entered information that has not been saved. Are you sure you want to exit?
        </p>
      </Modal>
    )}
    {isAddingCustomer && <CustomerFormModal customer={null} selectedFacilityId={facilityId} existingCustomers={customers} onClose={() => setIsAddingCustomer(false)} onSuccess={() => { setIsAddingCustomer(false); onCustomerAdded?.(); }} />}
    {isAddingCommodity && <CommodityFormModal onClose={() => setIsAddingCommodity(false)} onSuccess={() => { setIsAddingCommodity(false); onCommodityAdded?.(); }} />}
    </>
  );
}
