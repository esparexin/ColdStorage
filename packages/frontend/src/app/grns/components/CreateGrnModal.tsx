'use client';

import React from 'react';
import { X } from 'lucide-react';
import type {
  BagType,
  Chamber,
  Commodity,
  Customer,
  Grn,
  RentType,
} from '@cold-storage/contracts';
import { useCreateGrnForm } from '../hooks/useCreateGrnForm';
import styles from '../page.module.css';

interface CreateGrnModalProps {
  facilityId: string;
  customers: Customer[];
  commodities: Commodity[];
  chambers: Chamber[];
  onClose: () => void;
  onSuccess: (newGrn: Grn) => void;
}

export function CreateGrnModal({
  facilityId,
  customers,
  commodities,
  chambers,
  onClose,
  onSuccess,
}: CreateGrnModalProps) {
  const form = useCreateGrnForm(facilityId, customers, commodities, chambers, onSuccess);

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 id="create-modal-title" className={styles.modalTitle}>Inward Goods Receipt Note (GRN)</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit} className={styles.modalForm}>
          <div className={styles.modalBody}>
            {form.modalError && <div className={styles.modalError}>{form.modalError}</div>}

            <h3 className={styles.sectionHeading}>Basic Information</h3>
            <div className={styles.formGrid3}>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-date" className={styles.fieldLabel}>Inward Date *</label>
                <input id="create-date" type="date" required value={form.createDate} onChange={(e) => form.setCreateDate(e.target.value)} className={styles.fieldInput} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-customer" className={styles.fieldLabel}>Customer *</label>
                <select id="create-customer" required value={form.createCustomerId} onChange={(e) => form.setCreateCustomerId(e.target.value)} className={styles.fieldSelect}>
                  <option value="">Select Customer</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-commodity" className={styles.fieldLabel}>Commodity *</label>
                <select id="create-commodity" required value={form.createCommodityId} onChange={(e) => form.setCreateCommodityId(e.target.value)} className={styles.fieldSelect}>
                  <option value="">Select Commodity</option>
                  {commodities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            </div>

            <div className={styles.formGrid2}>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-chamber" className={styles.fieldLabel}>Chamber *</label>
                <select id="create-chamber" required value={form.createChamberId} onChange={(e) => form.setCreateChamberId(e.target.value)} className={styles.fieldSelect}>
                  <option value="">Select Chamber</option>
                  {chambers.map((ch) => (<option key={ch.id} value={ch.id}>Chamber {ch.chamberNumber}</option>))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-bag-type" className={styles.fieldLabel}>Bag Type *</label>
                <select id="create-bag-type" required value={form.createBagType} onChange={(e) => form.handleBagTypeChange(e.target.value as BagType)} className={styles.fieldSelect}>
                  <option value="S">S (Small)</option>
                  <option value="B">B (Big)</option>
                  <option value="S+B">S+B (Mixed)</option>
                </select>
              </div>
            </div>

            <h3 className={styles.sectionHeading}>Quantity & Weight Accounting</h3>
            {form.createBagType === 'S+B' ? (
              <>
                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-small-bags" className={styles.fieldLabel}>Small Bags *</label>
                    <input id="create-small-bags" type="number" min={0} max={100000} value={form.createSmallBags} onChange={(e) => form.handleSmallBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')} placeholder="e.g. 100" className={styles.fieldInput} />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-big-bags" className={styles.fieldLabel}>Big Bags *</label>
                    <input id="create-big-bags" type="number" min={0} max={100000} value={form.createBigBags} onChange={(e) => form.handleBigBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')} placeholder="e.g. 20" className={styles.fieldInput} />
                  </div>
                </div>
                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-bags-total" className={styles.fieldLabel}>Total Bags</label>
                    <input id="create-bags-total" type="number" disabled value={form.createBags} className={styles.fieldInput} />
                    <span className={styles.fieldHint}>Auto-calculated (Small + Big bags)</span>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="create-actual-weight" className={styles.fieldLabel}>Weighbridge Weight (kg)</label>
                    <input id="create-actual-weight" type="number" step="0.01" min={0} value={form.createActualWeight} onChange={(e) => form.setCreateActualWeight(e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g. 12500" className={styles.fieldInput} />
                    <span className={styles.fieldHint}>Authoritative when entered. Falls back to nominal total weight.</span>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="create-bags" className={styles.fieldLabel}>Total Bags *</label>
                  <input id="create-bags" type="number" required min={1} max={100000} value={form.createBags} onChange={(e) => form.handleBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')} placeholder="e.g. 250" className={styles.fieldInput} />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="create-actual-weight" className={styles.fieldLabel}>Weighbridge Weight (kg)</label>
                  <input id="create-actual-weight" type="number" step="0.01" min={0} value={form.createActualWeight} onChange={(e) => form.setCreateActualWeight(e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g. 12500" className={styles.fieldInput} />
                  <span className={styles.fieldHint}>Authoritative when entered. Falls back to nominal total weight.</span>
                </div>
              </div>
            )}

            <div className={styles.formGrid2}>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-unit-weight" className={styles.fieldLabel}>Nominal Unit Weight (kg/bag)</label>
                <input id="create-unit-weight" type="number" step="0.01" min={0} value={form.createNominalUnitWeight} onChange={(e) => form.handleUnitWeightChange(e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g. 50" className={styles.fieldInput} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-total-weight" className={styles.fieldLabel}>Nominal Total Weight (kg)</label>
                <input id="create-total-weight" type="number" step="0.01" min={0} value={form.createNominalTotalWeight} onChange={(e) => form.setCreateNominalTotalWeight(e.target.value ? parseFloat(e.target.value) : '')} placeholder="Auto-calculated (bags × unit weight)" className={styles.fieldInput} />
              </div>
            </div>

            <h3 className={styles.sectionHeading}>Rent Terms</h3>
            <div className={styles.formGrid3}>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-rent-type" className={styles.fieldLabel}>Rent Type *</label>
                <select id="create-rent-type" required value={form.createRentType} onChange={(e) => form.setCreateRentType(e.target.value as RentType)} className={styles.fieldSelect}>
                  <option value="Seasonal">Seasonal</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-rent-months" className={styles.fieldLabel}>Rent Months {form.createRentType === 'Monthly' ? '*' : ''}</label>
                <input id="create-rent-months" type="number" min={1} disabled={form.createRentType !== 'Monthly'} required={form.createRentType === 'Monthly'} value={form.createRentMonths} onChange={(e) => form.setCreateRentMonths(e.target.value ? parseInt(e.target.value, 10) : '')} placeholder={form.createRentType === 'Monthly' ? 'e.g. 6' : 'N/A for Seasonal'} className={styles.fieldInput} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="create-rent-amount" className={styles.fieldLabel}>Rent Amount (₹) *</label>
                <input id="create-rent-amount" type="number" min={0} step="0.01" required value={form.createRentAmount} onChange={(e) => form.setCreateRentAmount(e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g. 15000" className={styles.fieldInput} />
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
                <input id="create-vehicle" type="text" maxLength={15} value={form.createVehicleNumber} onChange={(e) => form.setCreateVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g. UP32AA1111" className={styles.fieldInput} />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="create-remarks" className={styles.fieldLabel}>Remarks / Notes</label>
              <textarea id="create-remarks" rows={2} maxLength={500} value={form.createRemarks} onChange={(e) => form.setCreateRemarks(e.target.value)} placeholder="Optional inward inspection notes or quality observations" className={styles.fieldInput} />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={form.submitting}>Cancel</button>
            <button id="submit-create-grn-btn" type="submit" className={styles.primaryBtn} disabled={form.submitting}>
              {form.submitting ? 'Creating...' : 'Create Inward GRN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
