import { Router, type Request, type Response } from 'express';
import { changePasswordInputSchema, loginInputSchema } from '@cold-storage/contracts';
import { authenticate } from '../middleware/auth.middleware.js';
import { authService } from '../modules/auth/auth.service.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parseResult = loginInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const result = await authService.login(parseResult.data);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    res.status(401).json({ error: message });
  }
});

authRouter.post('/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parseResult = changePasswordInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const result = await authService.changePassword(req.user!.userId, parseResult.data);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Password change failed';
    res.status(400).json({ error: message });
  }
});

authRouter.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.status(200).json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User retrieval failed';
    res.status(404).json({ error: message });
  }
});
