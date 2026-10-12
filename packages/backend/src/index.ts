import { createApp } from './app.js';
import { config } from './config.js';
import { connectToDatabase, disconnectDatabase } from './database/connection.js';
import { roleService } from './modules/roles/role.service.js';
import { userRepository } from './modules/users/user.repository.js';
import { logger } from './utils/logger.js';

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
  const server = app.listen(config.port, () => {
    logger.info('Backend server listening', { port: config.port });
  });
  // Graceful shutdown (F28): drain in-flight transactions on rolling deploys.
  const shutdown = (signal: string): void => {
    logger.info('Backend shutdown received', { signal });
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
