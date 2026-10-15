import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import { changePasswordInputSchema, loginInputSchema } from '@cold-storage/contracts';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimiter, generalRateLimiter, resetAuthRateLimit } from '../middleware/rate-limiter.middleware.js';
import { authService } from '../modules/auth/auth.service.js';

export const authRouter = asyncRouter();

function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  // Escape RegExp chars in cookie name (defense-in-depth; current name is static).
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(^|;\\s*)${escaped}=([^;]*)`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
}

function refreshCookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: 'strict'; maxAge: number; path: string } {
  return {
    httpOnly: true,
    // Default-secure: a deployment must opt OUT for plain-http local use.
    // Deriving this from NODE_ENV meant any staging/preview box that did not
    // set NODE_ENV=production sent the 7-day refresh cookie in cleartext.
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'strict',
    maxAge: config.refreshTokenExpiryDays * 86400 * 1000,
    path: '/api/auth',
  };
}

function clearRefreshCookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: 'strict'; path: string } {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'strict',
    path: '/api/auth',
  };
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

    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());

    res.status(200).json({
      token: result.accessToken,
      user: result.user,
      mustChangePassword: result.mustChangePassword,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    const status = message.includes('temporarily locked') ? 423 : 401;
    res.status(status).json({ error: message });
  }
});

authRouter.post('/refresh', generalRateLimiter, async (req: Request, res: Response): Promise<void> => {
  // Cookie-only: HttpOnly binding must not be bypassable via JSON body (XSS replay).
  const refreshToken = getCookie(req, 'refreshToken');
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token cookie is required' });
    return;
  }

  try {
    const result = await authService.refresh(refreshToken);
    void resetAuthRateLimit(req);

    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());

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
  try {
    const refreshToken = getCookie(req, 'refreshToken');
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
  } catch {
    // Logout is idempotent: a stale token still clears the cookie below.
  }

  res.clearCookie('refreshToken', clearRefreshCookieOptions());
  res.status(200).json({ message: 'Logged out successfully' });
});

authRouter.post('/logout-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  await authService.logoutAll(req.user!.userId);
  res.clearCookie('refreshToken', clearRefreshCookieOptions());
  res.status(200).json({ message: 'Logged out from all sessions successfully' });
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
      res.clearCookie('refreshToken', clearRefreshCookieOptions());
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
