import mongoose from 'mongoose';
import type { DatabaseState } from '@cold-storage/contracts';
import { config } from '../config.js';

export async function connectToDatabase(uri?: string): Promise<boolean> {
  const mongoUri = uri || config.mongoUri;
  if (!mongoUri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI environment variable is required in production.');
    }
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  await mongoose.connect(mongoUri);
  return true;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Reports the observed datastore state for the connectivity endpoint. Mongoose's readyState is
 * mapped onto the contract's vocabulary here so the wire shape is owned by @cold-storage/contracts.
 */
export function getDatabaseState(): DatabaseState {
  if (!config.mongoUri) return 'unconfigured';
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}

