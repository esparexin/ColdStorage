import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';

export async function deleteGroup(
  facilityId: string,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const group = await GroupModel.findOne({ id: groupId, facilityId }).exec();
  if (!group) {
    throw new Error(`Group '${groupId}' not found in facility '${facilityId}'`);
  }

  const count = await GrnModel.countDocuments({ facilityId, groupId }).exec();
  if (count > 0) {
    throw new Error(
      `Cannot delete group '${group.name}' because it contains ${count} assigned GRN(s). Unassign or move member GRNs first.`,
    );
  }

  await GroupModel.deleteOne({ id: groupId, facilityId }).exec();

  await auditService.log({
    eventType: 'GROUP_DELETED',
    severity: 'WARN',
    facilityId,
    userId,
    resource: 'group',
    resourceId: groupId,
    details: { name: group.name },
  });

  return true;
}
