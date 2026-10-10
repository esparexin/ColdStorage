import type {
  AssignGrnsInput,
  CreateGroupInput,
  Grn,
  Group,
  GroupQueryInput,
  GroupStockSummary,
  MoveGrnsInput,
  UnassignGrnsInput,
  UpdateGroupInput,
} from '@cold-storage/contracts';
import { assignGrns } from './handlers/assign-grns.handler.js';
import { createGroup } from './handlers/create-group.handler.js';
import { deleteGroup } from './handlers/delete-group.handler.js';
import { listEligibleGrns } from './handlers/eligible-grns.handler.js';
import { getGroupById } from './handlers/get-group.handler.js';
import { listGroups } from './handlers/list-groups.handler.js';
import { moveGrns } from './handlers/move-grns.handler.js';
import { unassignGrns } from './handlers/unassign-grns.handler.js';
import { updateGroup } from './handlers/update-group.handler.js';

export class GroupService {
  public async createGroup(
    facilityId: string,
    input: CreateGroupInput,
    userId: string,
  ): Promise<Group> {
    return createGroup(facilityId, input, userId);
  }

  public async listGroups(
    facilityId: string,
    query: GroupQueryInput = {},
  ): Promise<{ items: Group[]; total: number; page: number; limit: number }> {
    return listGroups(facilityId, query);
  }

  public async getGroupById(
    facilityId: string,
    groupId: string,
  ): Promise<{ group: Group; stockSummary: GroupStockSummary; memberGrns: Grn[] } | null> {
    return getGroupById(facilityId, groupId);
  }

  public async updateGroup(
    facilityId: string,
    groupId: string,
    input: UpdateGroupInput,
    userId: string,
  ): Promise<Group> {
    return updateGroup(facilityId, groupId, input, userId);
  }

  public async deleteGroup(facilityId: string, groupId: string, userId: string): Promise<boolean> {
    return deleteGroup(facilityId, groupId, userId);
  }

  public async assignGrns(
    facilityId: string,
    groupId: string,
    input: AssignGrnsInput,
    userId: string,
  ): Promise<{ assignedCount: number; groupId: string }> {
    return assignGrns(facilityId, groupId, input, userId);
  }

  public async unassignGrns(
    facilityId: string,
    groupId: string,
    input: UnassignGrnsInput,
    userId: string,
  ): Promise<{ unassignedCount: number }> {
    return unassignGrns(facilityId, groupId, input, userId);
  }

  public async moveGrns(
    facilityId: string,
    sourceGroupId: string,
    input: MoveGrnsInput,
    userId: string,
  ): Promise<{ movedCount: number; targetGroupId: string }> {
    return moveGrns(facilityId, sourceGroupId, input, userId);
  }

  public async listEligibleGrns(
    facilityId: string,
    options: {
      search?: string;
      customerId?: string;
      commodityId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ items: Grn[]; total: number; page: number; limit: number }> {
    return listEligibleGrns(facilityId, options);
  }
}

export const groupService = new GroupService();
