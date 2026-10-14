import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import {
  createUserSchema,
  hasGlobalFacilityScope,
  paginationSchema,
  permissionsForRole,
  resetUserPasswordSchema,
  roleSchema,
  updateUserSchema,
  type PermissionKey,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { userService } from '../modules/users/user.service.js';
import { roleService } from '../modules/roles/role.service.js';
import { getParamId } from '../utils/params.js';
import { sendInternalError } from '../utils/http-error.js';

export const userRouter = asyncRouter();

// All user management routes require authentication, forced-password-change completion, and 'user:manage' permission
userRouter.use(authenticate);
userRouter.use(requirePasswordChanged);
userRouter.use(requirePermission('user:manage'));

/**
 * Prevents privilege escalation: the actor may only assign roles whose
 * permissions are a subset of their own, and may not grant global facility
 * scope unless they hold it themselves.
 */
async function assertAssignable(actorUserId: string, roleId?: string, role?: string): Promise<void> {
  if (!roleId && !role) return;
  const target = roleId
    ? await roleService.getRole(roleId)
    : await roleService.getRole(role as string);
  let targetPermissions: readonly PermissionKey[];
  let targetHasGlobalScope: boolean;
  if (target) {
    targetPermissions = target.permissions;
    targetHasGlobalScope = target.hasGlobalFacilityScope;
  } else {
    // RoleDefinitions may be unseeded (tests seed users directly; production seeds
    // on boot outside test). Fall back to the same static matrix role.service uses
    // so legacy roles stay assignable; unknown custom keys still throw below.
    const parsed = roleSchema.safeParse(role);
    if (!roleId && parsed.success) {
      targetPermissions = permissionsForRole(parsed.data);
      targetHasGlobalScope = hasGlobalFacilityScope(parsed.data);
    } else {
      throw new Error(`Role '${roleId ?? role}' not found`);
    }
  }
  // Resolve actor from gateState-backed request context via DB lookup of the actor user.
  const { userRepository } = await import('../modules/users/user.repository.js');
  const actorUser = await userRepository.findById(actorUserId);
  if (!actorUser) {
    throw new Error('Acting user not found');
  }
  const actorResolved = await roleService.resolvePermissionsForUser(actorUser);
  const actorPerms = new Set<string>(actorResolved.permissions);
  const unheld = targetPermissions.filter((perm: PermissionKey) => !actorPerms.has(perm));
  if (unheld.length > 0) {
    throw new Error(`Cannot assign permissions you do not hold: ${unheld.join(', ')}`);
  }
  if (targetHasGlobalScope && !actorResolved.hasGlobalScope) {
    throw new Error('Cannot grant global facility scope without holding it');
  }
}

userRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    await assertAssignable(req.user!.userId, parseResult.data.roleId, parseResult.data.role);
    const user = await userService.createUser(parseResult.data, req.user!.userId);
    res.status(201).json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User creation failed';
    res.status(400).json({ error: message });
  }
});

userRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const query = paginationSchema.safeParse(req.query);
  const page = query.success ? query.data.page : 1;
  const limit = query.success ? query.data.limit : 20;

  try {
    const result = await userService.listUsers(page, limit);
    res.status(200).json(result);
  } catch (err: unknown) {
        sendInternalError(res, err, 'User listing failed');
  }
});

/**
 * Partial lifecycle update (profile, role, facility scope, and status).
 * Deactivation is expressed via `status: 'DISABLED'` rather than record deletion so the
 * immutable audit trail keeps its referent; the service also revokes live sessions.
 */
userRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parseResult = updateUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  const targetId = getParamId(req.params.id);
  if (targetId === req.user?.userId && parseResult.data.status === 'DISABLED') {
    res.status(400).json({ error: 'An administrator cannot disable their own account' });
    return;
  }

  try {
    await assertAssignable(req.user!.userId, parseResult.data.roleId, parseResult.data.role);
    const user = await userService.updateUser(targetId, parseResult.data, req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User update failed';
    res.status(400).json({ error: message });
  }
});

/**
 * P0-Decision 8: Admin re-issues a temporary password; the user must change it on next login.
 */
userRouter.post('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parseResult = resetUserPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const user = await userService.resetUserPassword(
      getParamId(req.params.id),
      parseResult.data,
      req.user!.userId,
    );
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Password reset failed';
    res.status(400).json({ error: message });
  }
});