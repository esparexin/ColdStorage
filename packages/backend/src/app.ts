import cors from 'cors';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { HealthResponse } from '@cold-storage/contracts';
import { config } from './config.js';
import { getDatabaseName, getDatabaseState } from './database/connection.js';
import { logger } from './utils/logger.js';
import {
  securityHeadersMiddleware,
  noSqlInjectionGuard,
  hppGuard,
} from './middleware/security.middleware.js';
import { compressionMiddleware } from './middleware/compression.middleware.js';
import { generalRateLimiter } from './middleware/rate-limiter.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { commodityRouter } from './routes/commodity.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { facilityRouter } from './routes/facility.routes.js';
import { deliveryRouter } from './routes/delivery.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { grnRouter } from './routes/grn.routes.js';
import { importExportRouter } from './routes/import-export.routes.js';
import { inventoryRouter } from './routes/inventory.routes.js';
import { documentRouter } from './routes/document.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { userRouter } from './routes/user.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { backupRouter } from './routes/backup.routes.js';
import { rentRouter } from './routes/rent.routes.js';
import { assetRouter } from './routes/asset.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(securityHeadersMiddleware);
  const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.use(
    cors({
      origin: allowedOrigin,
      credentials: true, // required for HTTP-only refreshToken cookie
    }),
  );
  app.use(compressionMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(noSqlInjectionGuard);
  app.use(hppGuard);

  // Liveness probe. Kept at the root, unauthenticated and datastore-independent so uptime
  // monitoring never depends on the database being reachable.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'cold-storage-backend' });
  });

  // Connectivity probe for the administration UI. Registered under /api so the frontend
  // rewrite in next.config.mjs (which proxies /api/:path* only) can actually reach it, and
  // reports the observed datastore state rather than assuming it.
  app.get('/api/health', (_req: Request, res: Response) => {
    const database = {
      state: getDatabaseState(),
      configured: Boolean(config.mongoUri),
      name: getDatabaseName(),
    };
    const healthy = database.state === 'connected';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'cold-storage-backend',
      database,
      checkedAt: new Date().toISOString(),
    } satisfies HealthResponse);
  });

  app.use('/api', generalRateLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api', assetRouter);
  app.use('/api/users', userRouter);
  app.use('/api/facilities', facilityRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/commodities', commodityRouter);
  app.use('/api', grnRouter);
  app.use('/api', inventoryRouter);
  app.use('/api', deliveryRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', importExportRouter);
  app.use('/api', settingsRouter);
  app.use('/api', documentRouter);
  app.use('/api', auditRouter);
  app.use('/api', backupRouter);
  app.use('/api', rentRouter);

  // Global payload size and parse error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (
      err &&
      typeof err === 'object' &&
      ('type' in err || 'status' in err || 'statusCode' in err)
    ) {
      const e = err as { type?: string; status?: number; statusCode?: number; message?: string };
      if (e.type === 'entity.too.large' || e.status === 413 || e.statusCode === 413) {
        res.status(413).json({ error: 'PAYLOAD_TOO_LARGE: Request entity exceeds 1 MB limit' });
        return;
      }
      const isSyntaxError = err instanceof SyntaxError;
      const hasBody = typeof err === 'object' && err !== null && 'body' in err;
      if (e.type === 'entity.parse.failed' || (isSyntaxError && hasBody) || e.status === 400) {
        res.status(400).json({ error: 'Invalid JSON payload', code: 'INVALID_JSON' });
        return;
      }
    }
    next(err);
  });

  // Unknown API routes return JSON (not Express HTML) so clients can branch on `error`.
  app.use('/api', (_req: Request, res: Response): void => {
    res.status(404).json({ error: 'API route not found', code: 'NOT_FOUND' });
  });

  // Terminal JSON error handler: unhandled rejections become 500 JSON (never HTML).
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('Unhandled request error', {
      path: req.originalUrl || req.path,
      method: req.method,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
