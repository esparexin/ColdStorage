import type { AssignGrnsInput } from '@cold-storage/contracts';
import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';

export async function assignGrns(
  facilityId: string,
  groupId: string,
  input: AssignGrnsInput,
  userId: string,
): Promise<{ assignedCount: number; groupId: string }> {
  const group = await GroupModel.findOne({ id: groupId, facilityId }).lean().exec();
  if (!group) {
    throw new Error(`Group '${groupId}' not found in facility '${facilityId}'`);
  }

  const grns = await GrnModel.find({ id: { $in: input.grnIds }, facilityId })
    .lean()
    .exec();

  if (grns.length !== input.grnIds.length) {
    throw new Error('One or more selected GRNs do not exist in this facility');
  }

  const conflicting = grns.filter((g) => g.groupId && g.groupId !== groupId);
  if (conflicting.length > 0) {
    throw new Error(
      `GRN '${conflicting[0].grnNumber}' is already assigned to another group. Use Move operation to reassign.`,
    );
  }

  await GrnModel.updateMany(
    { id: { $in: input.grnIds }, facilityId },
    { $set: { groupId } },
  ).exec();

  await auditService.log({
    eventType: 'GROUP_GRNS_ASSIGNED',
    severity: 'INFO',
    facilityId,
    userId,
    resource: 'group',
    resourceId: groupId,
    details: {
      groupName: group.name,
      assignedGrnIds: input.grnIds,
      assignedGrnNumbers: grns.map((g) => g.grnNumber),
    },
  });

  return { assignedCount: input.grnIds.length, groupId };
}
