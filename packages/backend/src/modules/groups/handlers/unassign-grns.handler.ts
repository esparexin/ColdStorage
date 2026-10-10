import type { UnassignGrnsInput } from '@cold-storage/contracts';
import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';

export async function unassignGrns(
  facilityId: string,
  groupId: string,
  input: UnassignGrnsInput,
  userId: string,
): Promise<{ unassignedCount: number }> {
  const group = await GroupModel.findOne({ id: groupId, facilityId }).lean().exec();
  if (!group) {
    throw new Error(`Group '${groupId}' not found in facility '${facilityId}'`);
  }

  const grns = await GrnModel.find({
    id: { $in: input.grnIds },
    facilityId,
    groupId,
  })
    .lean()
    .exec();

  if (grns.length === 0) {
    return { unassignedCount: 0 };
  }

  const targetIds = grns.map((g) => g.id);
  await GrnModel.updateMany(
    { id: { $in: targetIds }, facilityId, groupId },
    { $set: { groupId: null } },
  ).exec();

  await auditService.log({
    eventType: 'GROUP_GRNS_UNASSIGNED',
    severity: 'INFO',
    facilityId,
    userId,
    resource: 'group',
    resourceId: groupId,
    details: {
      groupName: group.name,
      unassignedGrnIds: targetIds,
      unassignedGrnNumbers: grns.map((g) => g.grnNumber),
    },
  });

  return { unassignedCount: targetIds.length };
}
