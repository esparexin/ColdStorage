import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { authenticate } from './middleware/auth.middleware.js';
import { requireFacilityScope } from './middleware/facility.middleware.js';
import { requirePermission } from './middleware/rbac.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'cold-storage-backend', phase: 'P2' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);

  // Facility-scoped test endpoint for P2 authorization verification
  app.get(
    '/api/facilities/:facilityId/ping',
    authenticate,
    requirePermission('storage:view'),
    requireFacilityScope((req) => req.params.facilityId),
    (req: Request, res: Response) => {
      res.status(200).json({
        message: 'Access granted to facility',
        facilityId: req.params.facilityId,
        user: req.user?.username,
      });
    },
  );

  return app;
}
