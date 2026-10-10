import { RoleModel, type IRoleDocument } from '../../database/models/role.model.js';
import type { PermissionKey } from '@cold-storage/contracts';

export interface RoleEntity {
  id: string;
  key: string;
  displayName: string;
  description: string;
  permissions: PermissionKey[];
  hasGlobalFacilityScope: boolean;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toEntity(doc: IRoleDocument): RoleEntity {
  return {
    id: doc.id,
    key: doc.key,
    displayName: doc.displayName,
    description: doc.description ?? '',
    permissions: [...doc.permissions] as PermissionKey[],
    hasGlobalFacilityScope: doc.hasGlobalFacilityScope,
    isSystem: doc.isSystem,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function sanitizeKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^A-Z0-9_]/g, '').slice(0, 40);
}

function sanitizeId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

export class RoleRepository {
  public async findById(id: string): Promise<RoleEntity | null> {
    const doc = await RoleModel.findOne({ id: { $eq: sanitizeId(id) } }).lean().exec();
    return doc ? toEntity(doc as unknown as IRoleDocument) : null;
  }

  public async findByKey(key: string): Promise<RoleEntity | null> {
    const normalized = sanitizeKey(String(key).toUpperCase().trim());
    const doc = await RoleModel.findOne({ key: { $eq: normalized } }).lean().exec();
    return doc ? toEntity(doc as unknown as IRoleDocument) : null;
  }

  public async listRoles(): Promise<RoleEntity[]> {
    const docs = await RoleModel.find().sort({ isSystem: -1, key: 1 }).lean().exec();
    return docs.map((d) => toEntity(d as unknown as IRoleDocument));
  }

  public async createRole(entity: Omit<RoleEntity, 'createdAt' | 'updatedAt'>): Promise<RoleEntity> {
    const doc = await RoleModel.create({
      id: entity.id,
      key: entity.key.toUpperCase().trim(),
      displayName: entity.displayName,
      description: entity.description,
      permissions: entity.permissions,
      hasGlobalFacilityScope: entity.hasGlobalFacilityScope,
      isSystem: entity.isSystem,
      createdBy: entity.createdBy,
    });
    return toEntity(doc as unknown as IRoleDocument);
  }

  public async updateById(
    id: string,
    fields: Partial<Pick<RoleEntity, 'displayName' | 'description' | 'permissions' | 'hasGlobalFacilityScope'>>,
  ): Promise<RoleEntity | null> {
    const doc = await RoleModel.findOneAndUpdate(
      { id: { $eq: sanitizeId(id) } },
      { ...fields, updatedAt: new Date() },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc as unknown as IRoleDocument) : null;
  }

  public async deleteById(id: string): Promise<boolean> {
    const result = await RoleModel.deleteOne({ id: { $eq: sanitizeId(id) } }).exec();
    return result.deletedCount === 1;
  }

  public async countByRoleId(roleId: string): Promise<number> {
    const { UserModel } = await import('../../database/models/user.model.js');
    return UserModel.countDocuments({ roleId: { $eq: sanitizeId(roleId) } }).exec();
  }

  public async resetForTesting(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('resetForTesting can only be called in test environment');
    }
    await RoleModel.deleteMany({}).exec();
  }
}

export const roleRepository = new RoleRepository();
