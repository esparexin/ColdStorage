import { Router, type Request, type Response } from 'express';
import { changePasswordInputSchema, loginInputSchema } from '@cold-storage/contracts';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimiter, resetAuthRateLimit } from '../middleware/rate-limiter.middleware.js';
import { authService } from '../modules/auth/auth.service.js';

export const authRouter = Router();

function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : undefined;
}

authRouter.post('/login', authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const parseResult = loginInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const result = await authService.login(parseResult.data);
    void resetAuthRateLimit(req);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: config.refreshTokenExpiryDays * 86400 * 1000,
      path: '/api/auth',
    });

    res.status(200).json({
      token: result.accessToken,
      user: result.user,
      mustChangePassword: result.mustChangePassword,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    res.status(401).json({ error: message });
  }
});

authRouter.post('/refresh', authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const refreshToken = getCookie(req, 'refreshToken') || req.body?.refreshToken;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token cookie or payload is required' });
    return;
  }

  try {
    const result = await authService.refresh(refreshToken);
    void resetAuthRateLimit(req);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: config.refreshTokenExpiryDays * 86400 * 1000,
      path: '/api/auth',
    });

    res.status(200).json({
      token: result.accessToken,
      user: result.user,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Refresh failed';
    res.status(401).json({ error: message });
  }
});

authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const refreshToken = getCookie(req, 'refreshToken') || req.body?.refreshToken;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.status(200).json({ message: 'Logged out successfully' });
});

authRouter.post(
  '/change-password',
  authRateLimiter,
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = changePasswordInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await authService.changePassword(req.user!.userId, parseResult.data);
      void resetAuthRateLimit(req);
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Password change failed';
      res.status(400).json({ error: message });
    }
  },
);

authRouter.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.status(200).json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User retrieval failed';
    res.status(404).json({ error: message });
  }
});
