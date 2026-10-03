import { Router, type Request, type Response } from 'express';
import {
  createUserSchema,
  paginationSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { userService } from '../modules/users/user.service.js';
import { getParamId } from '../utils/params.js';

export const userRouter = Router();

// All user management routes require authentication, forced-password-change completion, and 'user:manage' permission
userRouter.use(authenticate);
userRouter.use(requirePasswordChanged);
userRouter.use(requirePermission('user:manage'));

userRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const user = await userService.createUser(parseResult.data);
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
    const message = err instanceof Error ? err.message : 'User listing failed';
    res.status(500).json({ error: message });
  }
});

userRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await userService.getUserById(getParamId(req.params.id));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User retrieval failed';
    res.status(500).json({ error: message });
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