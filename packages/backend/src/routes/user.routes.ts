import { Router, type Request, type Response } from 'express';
import { createUserSchema, paginationSchema } from '@cold-storage/contracts';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { userService } from '../modules/users/user.service.js';

export const userRouter = Router();

// All user management routes require authentication and 'user:manage' permission
userRouter.use(authenticate);
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await userService.getUserById(id);
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
