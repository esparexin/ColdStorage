import { randomUUID } from 'node:crypto';
import type { CreateGroupInput, Group } from '@cold-storage/contracts';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { FacilityModel } from '../../../database/models/facility.model.js';
import { GroupModel } from '../../../database/models/group.model.js';
import { auditService } from '../../audit/audit.service.js';
import { toGroupEntity } from '../group.mappers.js';

export async function createGroup(
  facilityId: string,
  input: CreateGroupInput,
  userId: string,
): Promise<Group> {
  const facility = await FacilityModel.findOne({ id: facilityId }).lean().exec();
  if (!facility || !facility.isActive) {
    throw new Error(`Facility '${facilityId}' not found or inactive`);
  }

  const name = input.name.trim();
  const nameNormalized = name.toLowerCase().replace(/\s+/g, ' ');

  const existing = await GroupModel.findOne({ facilityId, nameNormalized }).lean().exec();
  if (existing) {
    throw new Error(`Group with name '${name}' already exists in this facility`);
  }

  let customerName: string | null = null;
  if (input.customerId) {
    const customer = await CustomerModel.findOne({ id: input.customerId, facilityIds: facilityId })
      .lean()
      .exec();
    if (!customer) {
      throw new Error(`Customer '${input.customerId}' not found or not registered for this facility`);
    }
    customerName = customer.name;
  }

  const id = `grp-${randomUUID()}`;
  let doc;
  try {
    doc = await GroupModel.create({
      id,
      facilityId,
      name,
      nameNormalized,
      remarks: input.remarks?.trim() || null,
      customerId: input.customerId || null,
      createdBy: userId,
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      throw new Error(`Group with name '${name}' already exists in this facility`);
    }
    throw err;
  }

  await auditService.log({
    eventType: 'GROUP_CREATED',
    severity: 'INFO',
    facilityId,
    userId,
    resource: 'group',
    resourceId: id,
    details: { name, customerId: input.customerId || null },
  });

  return toGroupEntity(doc, { grnCount: 0, customerName: customerName ?? undefined });
}
