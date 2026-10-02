'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Search, X } from 'lucide-react';
import { can, type Customer, type Role } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

export default function CustomersPage() {
  const { user } = useAuth();
  const { selectedFacilityId } = useFacility();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formMobile, setFormMobile] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formGstin, setFormGstin] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'customer:manage');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = selectedFacilityId
        ? `/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`
        : '/api/customers';
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Customer[] };
      setCustomers(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.mobile.includes(term) ||
        (c.gstin && c.gstin.toLowerCase().includes(term)),
    );
  }, [customers, searchTerm]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormMobile('');
    setFormAddress('');
    setFormGstin('');
    setFormIsActive(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormName(customer.name);
    setFormMobile(customer.mobile);
    setFormAddress(customer.address ?? '');
    setFormGstin(customer.gstin ?? '');
    setFormIsActive(customer.isActive);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setModalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // Validation
    const trimmedName = formName.trim();
    const trimmedMobile = formMobile.trim();
    if (!trimmedName) {
      setModalError('Customer name is required');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(trimmedMobile)) {
      setModalError('Mobile must be a valid 10-digit Indian number (starts with 6-9)');
      return;
    }

    const trimmedGstin = formGstin.trim().toUpperCase();
    if (trimmedGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(trimmedGstin)) {
      setModalError('Invalid Indian GSTIN format');
      return;
    }

    const facilityIds = selectedFacilityId ? [selectedFacilityId] : (user?.facilityIds ?? []);
    if (facilityIds.length === 0) {
      setModalError('At least one facility must be selected or assigned');
      return;
    }

    setSubmitting(true);
    try {
      if (editingCustomer) {
        // Update existing customer
        const res = await requestWithAuth(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            mobile: trimmedMobile,
            address: formAddress.trim() || null,
            gstin: trimmedGstin || null,
            isActive: formIsActive,
          }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? 'Failed to update customer');
        }
      } else {
        // Create new customer
        const res = await requestWithAuth('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            mobile: trimmedMobile,
            address: formAddress.trim() || null,
            gstin: trimmedGstin || null,
            facilityIds,
            isActive: formIsActive,
          }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? 'Failed to register customer');
        }
      }

      closeModal();
      await fetchCustomers();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Customer Name',
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: 'mobile',
      header: 'Mobile',
      render: (row) => <code>+91 {row.mobile}</code>,
    },
    {
      key: 'address',
      header: 'Address',
      render: (row) => row.address || '—',
    },
    {
      key: 'gstin',
      header: 'GSTIN',
      render: (row) => (row.gstin ? <code>{row.gstin}</code> : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={row.isActive ? styles.statusActive : styles.statusInactive}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (row: Customer) => (
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => openEditModal(row)}
                title="Edit customer details"
              >
                <Edit2 size={13} aria-hidden="true" />
                <span>Edit</span>
              </button>
            ),
            align: 'right' as const,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Customers</h1>
          <p className={styles.pageSub}>Directory of registered farmers, traders, and institutional clients</p>
        </div>
        {canManage && (
          <button
            id="add-customer-btn"
            type="button"
            className={styles.primaryBtn}
            onClick={openCreateModal}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Add Customer</span>
          </button>
        )}
      </div>

      <div className={styles.searchBar}>
        <Search size={16} aria-hidden="true" color="var(--color-text-muted)" />
        <input
          type="search"
          placeholder="Search by name, mobile, or GSTIN…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
          aria-label="Search customers"
        />
      </div>

      {loading ? (
        <FeedbackStates.Loading label="Loading customers…" />
      ) : error ? (
        <FeedbackStates.Error message={error} onRetry={() => void fetchCustomers()} />
      ) : customers.length === 0 ? (
        <FeedbackStates.Empty
          message="No customers registered yet."
          action={
            canManage
              ? {
                  id: 'empty-add-customer-btn',
                  label: '+ Add Customer',
                  onClick: openCreateModal,
                }
              : undefined
          }
        />
      ) : filteredCustomers.length === 0 ? (
        <FeedbackStates.Empty message={`No customers matching "${searchTerm}".`} />
      ) : (
        <DataTable
          columns={columns}
          rows={filteredCustomers}
          rowKey={(row) => row.id}
          caption="Registered customer directory"
        />
      )}

      {/* Accessible Customer Modal */}
      {isModalOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 id="modal-title" className={styles.modalTitle}>
                {editingCustomer ? 'Edit Customer' : 'Register New Customer'}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.modalForm}>
              {modalError && (
                <div className={styles.modalError} role="alert">
                  {modalError}
                </div>
              )}

              <div className={styles.fieldGroup}>
                <label htmlFor="customer-name" className={styles.fieldLabel}>
                  Full Name / Entity Name *
                </label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  maxLength={150}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ramesh Agro Traders"
                  className={styles.fieldInput}
                  disabled={submitting}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="customer-mobile" className={styles.fieldLabel}>
                  Mobile Number (10 Digits) *
                </label>
                <input
                  id="customer-mobile"
                  type="tel"
                  required
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  value={formMobile}
                  onChange={(e) => setFormMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 9876543210"
                  className={styles.fieldInput}
                  disabled={submitting}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="customer-address" className={styles.fieldLabel}>
                  Address
                </label>
                <input
                  id="customer-address"
                  type="text"
                  maxLength={300}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Village / Tehsil / City"
                  className={styles.fieldInput}
                  disabled={submitting}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="customer-gstin" className={styles.fieldLabel}>
                  GSTIN (Optional)
                </label>
                <input
                  id="customer-gstin"
                  type="text"
                  maxLength={15}
                  value={formGstin}
                  onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 06AAAAA1234A1Z5"
                  className={styles.fieldInput}
                  disabled={submitting}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    disabled={submitting}
                  />
                  <span>Active KYC & Operational</span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  id="save-customer-btn"
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Saving…' : editingCustomer ? 'Update Customer' : 'Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
