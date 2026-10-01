import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { authRouter } from './routes/auth.routes.js';
import { commodityRouter } from './routes/commodity.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { facilityRouter } from './routes/facility.routes.js';
import { deliveryRouter } from './routes/delivery.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { grnRouter } from './routes/grn.routes.js';
import { hierarchyRouter } from './routes/hierarchy.routes.js';
import { inventoryRouter } from './routes/inventory.routes.js';
import { userRouter } from './routes/user.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'cold-storage-backend', phase: 'P4' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/facilities', facilityRouter);
  app.use('/api', hierarchyRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/commodities', commodityRouter);
  app.use('/api', grnRouter);
  app.use('/api', inventoryRouter);
  app.use('/api', deliveryRouter);
  app.use('/api', dashboardRouter);

  return app;
}
