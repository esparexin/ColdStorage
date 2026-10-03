import type { NextFunction, Request, Response } from 'express';
import type { TokenPayload } from '@cold-storage/contracts';
import { config } from '../config.js';
import { userRepository } from '../modules/users/user.repository.js';
import { verifyAccessToken } from '../utils/crypto.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyAccessToken(token, config.jwtSecret);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  // A valid signature proves identity, not authority. Deactivation must take effect
  // immediately rather than lingering until the access token expires, so activation state
  // is always resolved from the canonical MongoDB record rather than the token claims.
  const status = await userRepository.findActivationStateById(payload.userId);
  if (status === null) {
    res.status(401).json({ error: 'Account no longer exists' });
    return;
  }
  if (status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is disabled. Contact an administrator.' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Guard to ensure users with forced password change cannot execute business routes.
 */
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.mustChangePassword) {
    res.status(403).json({
      error: 'Password change is required before proceeding with operations',
      mustChangePassword: true,
    });
    return;
  }
  next();
}