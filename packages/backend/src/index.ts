import { createApp } from './app.js';
import { config } from './config.js';

export * from './app.js';
export * from './config.js';
export * from './utils/crypto.js';
export * from './modules/users/user.service.js';
export * from './modules/auth/auth.service.js';

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  app.listen(config.port, () => {
    // Standard startup notification
    console.log(`Backend server listening on port ${config.port}`);
  });
}
