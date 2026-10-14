import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import { createRoleSchema, updateRoleSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { roleService } from '../modules/roles/role.service.js';
import { getParamId } from '../utils/params.js';
import { sendInternalError } from '../utils/http-error.js';

export const roleRouter = asyncRouter();

roleRouter.use(authenticate);
roleRouter.use(requirePasswordChanged);

roleRouter.get('/', requirePermission('user:manage'), async (_req: Request, res: Response) => {
  try {
    const roles = await roleService.listRoles();
    res.status(200).json({ roles });
  } catch (err: unknown) {
        sendInternalError(res, err, 'Role listing failed');
  }
});

roleRouter.post('/', requirePermission('role:manage'), async (req: Request, res: Response) => {
  const parseResult = createRoleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }
  try {
    const role = await roleService.createRole(parseResult.data, req.user!.userId);
    res.status(201).json({ role });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Role creation failed';
    res.status(400).json({ error: message });
  }
});

roleRouter.patch('/:id', requirePermission('role:manage'), async (req: Request, res: Response) => {
  const parseResult = updateRoleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }
  try {
    const role = await roleService.updateRole(getParamId(req.params.id), parseResult.data, req.user!.userId);
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    res.status(200).json({ role });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Role update failed';
    res.status(400).json({ error: message });
  }
});

roleRouter.delete('/:id', requirePermission('role:manage'), async (req: Request, res: Response) => {
  try {
    const ok = await roleService.deleteRole(getParamId(req.params.id), req.user!.userId);
    if (!ok) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Role deletion failed';
    res.status(400).json({ error: message });
  }
});
