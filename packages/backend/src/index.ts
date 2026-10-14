import { createApp } from './app.js';
import { config } from './config.js';
import { connectToDatabase, disconnectDatabase } from './database/connection.js';
import { roleService } from './modules/roles/role.service.js';
import { userRepository } from './modules/users/user.repository.js';
import { logger } from './utils/logger.js';
import { stopMemoryStoreSweep } from './middleware/rate-limiter.middleware.js';

export * from './app.js';
export * from './config.js';
export * from './utils/crypto.js';
export * from './modules/users/user.service.js';
export * from './modules/auth/auth.service.js';

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  await connectToDatabase();
  await roleService.seedSystemRoles();
  await userRepository.bootstrapSuperAdminFromEnv();
  const { startBackupScheduler } = await import('./modules/backup/backup.scheduler.js');
  startBackupScheduler();
  const server = app.listen(config.port, () => {
    logger.info('Backend server listening', { port: config.port });
  });
  // Process-level safety net. asyncRouter() already routes handler rejections
  // to the terminal JSON error handler, so these are defence in depth for
  // rejections thrown outside a request (background jobs, the backup
  // scheduler) and for genuinely unexpected faults.
  //
  // Node >= 15 defaults to --unhandled-rejections=throw, which would terminate
  // the process and drop every in-flight request. Logging and continuing keeps
  // the API available; an uncaughtException is logged and then the process
  // still exits, because the runtime state after one is not trustworthy.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });

  // Graceful shutdown (F28): drain in-flight transactions on rolling deploys.
  const shutdown = (signal: string): void => {
    logger.info('Backend shutdown received', { signal });
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    void stopMemoryStoreSweep();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
