'use client';

import React, { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { can, type Customer, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { CustomerFormModal } from './components/CustomerFormModal';
import { CustomerTable } from './components/CustomerTable';
import { useCustomersData } from './hooks/useCustomersData';
import styles from './page.module.css';

export default function CustomersPage() {
  const { user } = useAuth();
  const { selectedFacilityId } = useFacility();
  const {
    customers,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filteredCustomers,
    fetchCustomers,
  } = useCustomersData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'customer:manage');

  const openCreateModal = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

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
        <CustomerTable
          customers={filteredCustomers}
          canManage={canManage}
          onEdit={openEditModal}
        />
      )}

      {isModalOpen && (
        <CustomerFormModal
          customer={editingCustomer}
          selectedFacilityId={selectedFacilityId}
          userFacilityIds={user?.facilityIds}
          existingCustomers={customers}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            void fetchCustomers();
          }}
        />
      )}
    </div>
  );
}
