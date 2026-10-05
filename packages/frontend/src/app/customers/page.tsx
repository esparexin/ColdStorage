'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type Customer, type Role } from '@cold-storage/contracts';
import { Button, FeedbackStates, SearchBar } from '@/components/ui';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  noMatchMessage,
} from '@/components/ui/stateCopy';
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
    totalCustomers,
    totalPages,
    page,
    setPage,
    pageSize,
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
        </div>
        {canManage && (
          <Button
            id="add-customer-btn"
            variant="primary"
            onClick={openCreateModal}
            leftIcon={<Plus size={16} aria-hidden="true" />}
          >
            Add Customer
          </Button>
        )}
      </div>

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search by name…"
        ariaLabel="Search customers"
      />

      {loading ? (
        <FeedbackStates.Loading label={LOADING_LABELS.customers} />
      ) : error ? (
        <FeedbackStates.Error
          title={ERROR_TITLES.customers}
          message={error}
          onRetry={() => void fetchCustomers()}
        />
      ) : customers.length === 0 ? (
        <FeedbackStates.Empty
          message={EMPTY_MESSAGES.customersEmpty}
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
        <FeedbackStates.Empty message={noMatchMessage('customers', searchTerm)} />
      ) : (
        <CustomerTable
          customers={customers}
          canManage={canManage}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalCustomers={totalCustomers}
          onPageChange={setPage}
          onEdit={openEditModal}
        />
      )}

      {isModalOpen && (
        <CustomerFormModal
          customer={editingCustomer}
          selectedFacilityId={selectedFacilityId}
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
