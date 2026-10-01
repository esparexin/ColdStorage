import type { NextFunction, Request, Response } from 'express';
import type { TokenPayload } from '@cold-storage/contracts';
import { config } from '../config.js';
import { verifyToken } from '../utils/crypto.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyToken(token, config.jwtSecret);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Optional guard: If a user must change password, block standard business operations until changed.
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
