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

  // A valid signature proves identity, not authority. Deactivation and the
  // forced-password-change flag must take effect immediately rather than lingering
  // until the access token expires, so both resolve from the canonical MongoDB
  // record rather than the (potentially stale) token claims.
  const gate = await userRepository.findGateStateById(payload.userId);
  if (!gate) {
    res.status(401).json({ error: 'Account no longer exists' });
    return;
  }
  if (gate.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is disabled. Contact an administrator.' });
    return;
  }

  req.user = { ...payload, mustChangePassword: gate.mustChangePassword };
  next();
}

/**
 * Guard to ensure users with forced password change cannot execute business routes.
 *
 * Database state is authoritative: the JWT `mustChangePassword` claim is stale as
 * soon as a password change (or admin reset) lands, so this guard re-resolves the
 * flag from MongoDB. A stale `true` in the token must not block after the DB is
 * `false`, and a fresh `true` in the DB must block even if the token says `false`.
 */
export async function requirePasswordChanged(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  try {
    const gate = await userRepository.findGateStateById(userId);
    if (!gate) {
      res.status(401).json({ error: 'Account no longer exists' });
      return;
    }
    // Keep downstream handlers consistent with the authoritative value.
    req.user = { ...req.user!, mustChangePassword: gate.mustChangePassword };
    if (gate.mustChangePassword) {
      res.status(403).json({
        error: 'Password change is required before proceeding with operations',
        mustChangePassword: true,
      });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Authorization check failed' });
  }
}