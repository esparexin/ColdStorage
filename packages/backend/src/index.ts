import { createApp } from './app.js';
import { config } from './config.js';
import { connectToDatabase } from './database/connection.js';
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
  await userRepository.bootstrapSuperAdminFromEnv();
  app.listen(config.port, () => {
    logger.info('Backend server listening', { port: config.port });
  });
}
