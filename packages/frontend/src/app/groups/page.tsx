'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { type Group } from '@cold-storage/contracts';
import { Button, FeedbackStates, FilterToolbar, PageHeader } from '@/components/ui';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  noMatchMessage,
} from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { useFacility } from '@/context/FacilityContext';
import { AssignGrnsModal } from './components/AssignGrnsModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { DeleteGroupConfirmModal } from './components/DeleteGroupConfirmModal';
import { GroupDetailModal } from './components/GroupDetailModal';
import { GroupTable } from './components/GroupTable';
import { MoveGrnsModal } from './components/MoveGrnsModal';
import { RenameGroupModal } from './components/RenameGroupModal';
import { useGroupsData } from './hooks/useGroupsData';
import styles from './page.module.css';

export default function GroupsPage() {
  const { hasPermission } = usePermissions();
  const { selectedFacilityId } = useFacility();
  const {
    groups,
    totalGroups,
    totalPages,
    page,
    setPage,
    pageSize,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    customers,
    fetchGroups,
  } = useGroupsData(selectedFacilityId);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<Group | null>(null);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [assignGroup, setAssignGroup] = useState<Group | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<Group | null>(null);
  const [moveState, setMoveState] = useState<{ sourceGroup: Group; grnIds: string[] } | null>(null);
  const canManage = hasPermission('group:manage');
  const canDelete = hasPermission('group:delete');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Groups of Goods"
        actions={
          canManage && selectedFacilityId ? (
            <Button
              id="create-group-header-btn"
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus size={16} aria-hidden="true" />}
            >
              Create Group
            </Button>
          ) : undefined
        }
      />

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityGroups} />
      ) : (
        <>
          <FilterToolbar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search groups by name…"
            searchAriaLabel="Search groups"
            onReset={() => setSearchTerm('')}
            hasActiveFilters={Boolean(searchTerm)}
          />

          {loading ? (
            <FeedbackStates.Loading label={LOADING_LABELS.groups} />
          ) : error ? (
            <FeedbackStates.Error
              title={ERROR_TITLES.groups}
              message={error}
              onRetry={() => void fetchGroups()}
            />
          ) : groups.length === 0 ? (
            searchTerm ? (
              <FeedbackStates.Empty message={noMatchMessage('groups', searchTerm)} />
            ) : (
              <FeedbackStates.Empty
                message={EMPTY_MESSAGES.groupsEmpty}
                action={
                  canManage
                    ? {
                        id: 'empty-add-group-btn',
                        label: '+ Create Group',
                        onClick: () => setIsCreateOpen(true),
                      }
                    : undefined
                }
              />
            )
          ) : (
            <GroupTable
              groups={groups}
              canManage={canManage}
              canDelete={canDelete}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalGroups={totalGroups}
              onPageChange={setPage}
              onViewDetails={setDetailGroup}
              onEdit={setEditGroup}
              onAssign={setAssignGroup}
              onDelete={setDeleteGroup}
            />
          )}
        </>
      )}

      {isCreateOpen && selectedFacilityId && (
        <CreateGroupModal
          selectedFacilityId={selectedFacilityId}
          customers={customers}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setIsCreateOpen(false);
            void fetchGroups();
          }}
        />
      )}

      {editGroup && selectedFacilityId && (
        <RenameGroupModal
          selectedFacilityId={selectedFacilityId}
          group={editGroup}
          onClose={() => setEditGroup(null)}
          onSuccess={() => {
            setEditGroup(null);
            void fetchGroups();
          }}
        />
      )}

      {assignGroup && selectedFacilityId && (
        <AssignGrnsModal
          selectedFacilityId={selectedFacilityId}
          group={assignGroup}
          onClose={() => setAssignGroup(null)}
          onSuccess={() => {
            setAssignGroup(null);
            void fetchGroups();
          }}
        />
      )}

      {detailGroup && selectedFacilityId && (
        <GroupDetailModal
          selectedFacilityId={selectedFacilityId}
          group={detailGroup}
          canManage={canManage}
          onClose={() => setDetailGroup(null)}
          onAssignMore={() => {
            const target = detailGroup;
            setDetailGroup(null);
            setAssignGroup(target);
          }}
          onMoveGrn={(grnId) => {
            const target = detailGroup;
            setDetailGroup(null);
            setMoveState({ sourceGroup: target, grnIds: [grnId] });
          }}
          onRefreshParent={() => void fetchGroups()}
        />
      )}

      {moveState && selectedFacilityId && (
        <MoveGrnsModal
          selectedFacilityId={selectedFacilityId}
          sourceGroup={moveState.sourceGroup}
          grnIds={moveState.grnIds}
          availableGroups={groups}
          onClose={() => setMoveState(null)}
          onSuccess={() => {
            setMoveState(null);
            void fetchGroups();
          }}
        />
      )}

      {deleteGroup && selectedFacilityId && (
        <DeleteGroupConfirmModal
          selectedFacilityId={selectedFacilityId}
          group={deleteGroup}
          onClose={() => setDeleteGroup(null)}
          onSuccess={() => {
            setDeleteGroup(null);
            void fetchGroups();
          }}
        />
      )}
    </div>
  );
}
