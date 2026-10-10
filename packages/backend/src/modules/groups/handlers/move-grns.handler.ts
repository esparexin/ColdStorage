import type { MoveGrnsInput } from '@cold-storage/contracts';
import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';

export async function moveGrns(
  facilityId: string,
  sourceGroupId: string,
  input: MoveGrnsInput,
  userId: string,
): Promise<{ movedCount: number; targetGroupId: string }> {
  if (sourceGroupId === input.targetGroupId) {
    throw new Error('Source and target groups must be different');
  }

  const [sourceGroup, targetGroup] = await Promise.all([
    GroupModel.findOne({ id: sourceGroupId, facilityId }).lean().exec(),
    GroupModel.findOne({ id: input.targetGroupId, facilityId }).lean().exec(),
  ]);

  if (!sourceGroup) {
    throw new Error(`Source group '${sourceGroupId}' not found in facility '${facilityId}'`);
  }
  if (!targetGroup) {
    throw new Error(`Target group '${input.targetGroupId}' not found in facility '${facilityId}'`);
  }

  const grns = await GrnModel.find({
    id: { $in: input.grnIds },
    facilityId,
    groupId: sourceGroupId,
  })
    .lean()
    .exec();

  if (grns.length !== input.grnIds.length) {
    throw new Error('One or more selected GRNs are not members of the source group');
  }

  await GrnModel.updateMany(
    { id: { $in: input.grnIds }, facilityId, groupId: sourceGroupId },
    { $set: { groupId: input.targetGroupId } },
  ).exec();

  await auditService.log({
    eventType: 'GROUP_GRNS_MOVED',
    severity: 'INFO',
    facilityId,
    userId,
    resource: 'group',
    resourceId: sourceGroupId,
    details: {
      sourceGroupName: sourceGroup.name,
      targetGroupId: targetGroup.id,
      targetGroupName: targetGroup.name,
      movedGrnIds: input.grnIds,
      movedGrnNumbers: grns.map((g) => g.grnNumber),
    },
  });

  return { movedCount: input.grnIds.length, targetGroupId: input.targetGroupId };
}
