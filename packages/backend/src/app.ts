import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'cold-storage-backend', phase: 'P2' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);

  return app;
}
