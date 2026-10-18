'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { type Customer } from '@cold-storage/contracts';
import { Button, FeedbackStates, FilterToolbar, PageHeader } from '@/components/ui';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  noMatchMessage,
} from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { useFacility } from '@/context/FacilityContext';
import { CustomerFormModal } from './components/CustomerFormModal';
import { CustomerTable } from './components/CustomerTable';
import { useCustomersData } from './hooks/useCustomersData';
import styles from './page.module.css';

export default function CustomersPage() {
  const { hasPermission } = usePermissions();
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
  const canManage = hasPermission('customer:manage');

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
      <PageHeader
        title="Customers"
        actions={
          canManage ? (
            <Button
              id="add-customer-btn"
              variant="primary"
              onClick={openCreateModal}
              leftIcon={<Plus size={16} aria-hidden="true" />}
            >
              Add Customer
            </Button>
          ) : undefined
        }
      />

      <FilterToolbar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name…"
        searchAriaLabel="Search customers"
        onReset={() => setSearchTerm('')}
        hasActiveFilters={Boolean(searchTerm)}
      />

      {loading ? (
        <FeedbackStates.Loading label={LOADING_LABELS.customers} />
      ) : error ? (
        <FeedbackStates.Error
          title={ERROR_TITLES.customers}
          message={error}
          onRetry={() => void fetchCustomers()}
        />
      ) : filteredCustomers.length === 0 ? (
        searchTerm ? (
          <FeedbackStates.Empty message={noMatchMessage('customers', searchTerm)} />
        ) : (
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
        )
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
