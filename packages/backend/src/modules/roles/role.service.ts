import { randomUUID } from 'node:crypto';
import {
  PERMISSION_KEYS,
  hasGlobalFacilityScope,
  permissionsForRole,
  type CreateRole,
  type PermissionKey,
  type Role,
  type RoleDefinition,
  type UpdateRole,
} from '@cold-storage/contracts';
import { auditService } from '../audit/audit.service.js';
import { UserModel } from '../../database/models/user.model.js';
import { roleRepository, type RoleEntity } from './role.repository.js';

const SYSTEM_ROLES: Array<{ key: Role; displayName: string; description: string }> = [
  { key: 'SUPER_ADMIN', displayName: 'Super Admin', description: 'Complete system authority' },
  { key: 'ADMIN', displayName: 'Admin', description: 'Facility supervisor, approvals' },
  { key: 'OPERATOR', displayName: 'Operator', description: 'Weighbridge, GRN, put-away, challan' },
  { key: 'READ_ONLY', displayName: 'Read Only', description: 'Auditor, viewer' },
];

function systemRoleId(key: Role): string {
  return `rol-system-${key.toLowerCase().replace(/_/g, '-')}`;
}

export function toRoleDefinition(entity: RoleEntity): RoleDefinition {
  return {
    id: entity.id,
    key: entity.key,
    displayName: entity.displayName,
    description: entity.description,
    permissions: entity.permissions,
    hasGlobalFacilityScope: entity.hasGlobalFacilityScope,
    isSystem: entity.isSystem,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export class RoleService {
  private roleCache = new Map<string, RoleEntity>();

  constructor(private repo: typeof roleRepository = roleRepository) {}

  public clearCache(): void {
    this.roleCache.clear();
  }

  private async getCachedRole(identifier: string): Promise<RoleEntity | null> {
    const cached = this.roleCache.get(identifier);
    if (cached) return cached;
    const role = (await this.repo.findById(identifier)) ?? (await this.repo.findByKey(identifier));
    if (role) {
      this.roleCache.set(role.id, role);
      this.roleCache.set(role.key, role);
    }
    return role;
  }

  private validatePermissions(permissions: PermissionKey[]): void {
    const catalog = new Set<string>(PERMISSION_KEYS);
    for (const perm of permissions) {
      if (!catalog.has(perm)) {
        throw new Error(`Unknown permission '${perm}'`);
      }
    }
  }

  public async seedSystemRoles(): Promise<RoleEntity[]> {
    const seeded: RoleEntity[] = [];
    for (const sys of SYSTEM_ROLES) {
      const existing = await this.repo.findByKey(sys.key);
      if (existing) {
        seeded.push(existing);
        continue;
      }
      const created = await this.repo.createRole({
        id: systemRoleId(sys.key),
        key: sys.key,
        displayName: sys.displayName,
        description: sys.description,
        permissions: permissionsForRole(sys.key),
        hasGlobalFacilityScope: hasGlobalFacilityScope(sys.key),
        isSystem: true,
        createdBy: null,
      });
      seeded.push(created);
    }
    await this.backfillUserRoleIds();
    this.roleCache.clear();
    return seeded;
  }

  private async backfillUserRoleIds(): Promise<void> {
    const roles = await this.repo.listRoles();
    const byKey = new Map(roles.map((r) => [r.key, r.id]));
    const users = await UserModel.find({ $or: [{ roleId: null }, { roleId: { $exists: false } }] })
      .select('id role')
      .lean()
      .exec();
    for (const user of users) {
      const roleId = byKey.get((user as unknown as { role: string }).role);
      if (!roleId) continue;
      await UserModel.updateOne(
        { id: { $eq: (user as unknown as { id: string }).id } },
        { roleId, updatedAt: new Date() },
      ).exec();
    }
  }

  public async listRoles(): Promise<RoleDefinition[]> {
    const entities = await this.repo.listRoles();
    return entities.map(toRoleDefinition);
  }

  public async getRole(id: string): Promise<RoleDefinition | null> {
    const entity = await this.getCachedRole(id);
    return entity ? toRoleDefinition(entity) : null;
  }

  public async createRole(input: CreateRole, actingUserId: string): Promise<RoleDefinition> {
    this.validatePermissions(input.permissions);
    const key = input.key.toUpperCase().trim();
    const existing = await this.repo.findByKey(key);
    if (existing) {
      throw new Error(`Role '${key}' already exists`);
    }
    if (input.hasGlobalFacilityScope) {
      throw new Error('Only the system Super Admin role may hold global facility scope');
    }
    const entity = await this.repo.createRole({
      id: `rol-${randomUUID()}`,
      key,
      displayName: input.displayName.trim(),
      description: (input.description ?? '').trim(),
      permissions: [...input.permissions],
      hasGlobalFacilityScope: false,
      isSystem: false,
      createdBy: actingUserId,
    });
    this.roleCache.clear();
    await auditService.log({
      eventType: 'ROLE_CREATED',
      severity: 'INFO',
      userId: actingUserId,
      facilityId: null,
      resource: 'role',
      resourceId: entity.id,
      details: { key: entity.key, permissions: entity.permissions },
    });
    return toRoleDefinition(entity);
  }

  public async updateRole(id: string, input: UpdateRole, actingUserId: string): Promise<RoleDefinition | null> {
    const existing = await this.repo.findById(id);
    if (!existing) return null;
    if (existing.isSystem) {
      throw new Error('System roles are immutable');
    }
    if (input.permissions) this.validatePermissions(input.permissions);
    if (input.hasGlobalFacilityScope === true) {
      throw new Error('Only the system Super Admin role may hold global facility scope');
    }
    const updated = await this.repo.updateById(id, {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.permissions !== undefined ? { permissions: [...input.permissions] } : {}),
      ...(input.hasGlobalFacilityScope !== undefined
        ? { hasGlobalFacilityScope: input.hasGlobalFacilityScope }
        : {}),
    });
    if (updated) {
      this.roleCache.clear();
      await auditService.log({
        eventType: 'ROLE_UPDATED',
        severity: 'INFO',
        userId: actingUserId,
        facilityId: null,
        resource: 'role',
        resourceId: updated.id,
        details: { key: updated.key, permissions: updated.permissions },
      });
      return toRoleDefinition(updated);
    }
    return null;
  }

  public async deleteRole(id: string, actingUserId: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) return false;
    if (existing.isSystem) {
      throw new Error('System roles cannot be deleted');
    }
    const assigned = await this.repo.countByRoleId(id);
    if (assigned > 0) {
      throw new Error(`Role '${existing.key}' is assigned to ${assigned} user(s) and cannot be deleted`);
    }
    const ok = await this.repo.deleteById(id);
    if (ok) {
      this.roleCache.clear();
      await auditService.log({
        eventType: 'ROLE_DELETED',
        severity: 'INFO',
        userId: actingUserId,
        facilityId: null,
        resource: 'role',
        resourceId: id,
        details: { key: existing.key },
      });
    }
    return ok;
  }

  public async resolvePermissionsForUser(user: {
    role: Role;
    roleId?: string | null;
  }): Promise<{ permissions: PermissionKey[]; hasGlobalScope: boolean; roleKey: string }> {
    const role = user.roleId
      ? await this.getCachedRole(user.roleId)
      : await this.getCachedRole(user.role);
    if (role) {
      return { permissions: role.permissions, hasGlobalScope: role.hasGlobalFacilityScope, roleKey: role.key };
    }
    return {
      permissions: permissionsForRole(user.role),
      hasGlobalScope: hasGlobalFacilityScope(user.role),
      roleKey: user.role,
    };
  }
}

export const roleService = new RoleService();
