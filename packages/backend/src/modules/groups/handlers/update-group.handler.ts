import type { Group, UpdateGroupInput } from '@cold-storage/contracts';
import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';
import { toGroupEntity } from '../group.mappers.js';

export async function updateGroup(
  facilityId: string,
  groupId: string,
  input: UpdateGroupInput,
  userId: string,
): Promise<Group> {
  const group = await GroupModel.findOne({ id: groupId, facilityId }).exec();
  if (!group) {
    throw new Error(`Group '${groupId}' not found in facility '${facilityId}'`);
  }

  let wasRenamed = false;
  const oldName = group.name;

  if (input.name && input.name.trim().toLowerCase().replace(/\s+/g, ' ') !== group.nameNormalized) {
    const name = input.name.trim();
    const nameNormalized = name.toLowerCase().replace(/\s+/g, ' ');

    const duplicate = await GroupModel.findOne({
      facilityId,
      nameNormalized,
      id: { $ne: groupId },
    })
      .lean()
      .exec();

    if (duplicate) {
      throw new Error(`Group with name '${name}' already exists in this facility`);
    }

    group.name = name;
    group.nameNormalized = nameNormalized;
    wasRenamed = true;
  }

  if (input.remarks !== undefined) {
    group.remarks = input.remarks ? input.remarks.trim() : null;
  }

  try {
    await group.save();
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      throw new Error(`Group with name '${group.name}' already exists in this facility`);
    }
    throw err;
  }

  if (wasRenamed) {
    await auditService.log({
      eventType: 'GROUP_RENAMED',
      severity: 'INFO',
      facilityId,
      userId,
      resource: 'group',
      resourceId: groupId,
      details: { oldName, newName: group.name },
    });
  }

  const grnCount = await GrnModel.countDocuments({ facilityId, groupId }).exec();
  return toGroupEntity(group, { grnCount });
}
