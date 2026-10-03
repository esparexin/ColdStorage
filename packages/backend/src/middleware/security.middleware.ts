import type { Request, Response, NextFunction } from 'express';

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_HSTS === 'true') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

function containsForbiddenKeys(target: unknown): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  if (Array.isArray(target)) {
    for (const item of target) {
      if (containsForbiddenKeys(item)) {
        return true;
      }
    }
    return false;
  }

  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (containsForbiddenKeys(value)) {
      return true;
    }
  }

  return false;
}

export function noSqlInjectionGuard(req: Request, res: Response, next: NextFunction): void {
  if (
    containsForbiddenKeys(req.body) ||
    containsForbiddenKeys(req.query) ||
    containsForbiddenKeys(req.params)
  ) {
    res.status(400).json({
      error: 'INVALID_INPUT_KEYS: Keys starting with $ or containing . are forbidden',
    });
    return;
  }

  next();
}

export function hppGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        res.status(400).json({
          error: `PARAMETER_POLLUTION: Duplicate or array query parameter '${key}' is forbidden`,
        });
        return;
      }
    }
  }

  next();
}

/**
 * CSRF protection middleware for cookie-authenticated endpoints.
 * Validates Origin / Referer against CORS_ORIGIN for state-changing requests with cookies.
 */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // If no cookies are attached, the request is not cookie-authenticated (e.g. Bearer token only)
  if (!req.cookies || Object.keys(req.cookies).length === 0) {
    return next();
  }

  const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin && origin !== allowedOrigin) {
    res.status(403).json({ error: 'CSRF_VALIDATION_FAILED: Invalid origin header' });
    return;
  }

  if (!origin && referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== allowedOrigin) {
        res.status(403).json({ error: 'CSRF_VALIDATION_FAILED: Invalid referer header' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'CSRF_VALIDATION_FAILED: Malformed referer header' });
      return;
    }
  }

  next();
}

