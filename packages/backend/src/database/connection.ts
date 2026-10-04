import mongoose from 'mongoose';
import type { DatabaseState } from '@cold-storage/contracts';
import { config } from '../config.js';

/**
 * Validates that a connection target URI is safe for the active environment.
 * If NODE_ENV is 'test', attempting to connect to the live 'cold_storage' database is
 * strictly prohibited to guarantee test suites cannot wipe or mutate live data.
 */
export function assertSafeDatabaseTarget(uri: string): void {
  if (process.env.NODE_ENV === 'test') {
    const withoutQuery = uri.split('?')[0];
    const lastSlash = withoutQuery.lastIndexOf('/');
    const dbName = lastSlash === -1 ? '' : withoutQuery.slice(lastSlash + 1);
    if (dbName === 'cold_storage') {
      throw new Error(
        'FATAL SAFETY VIOLATION: Test process attempted to target live database "cold_storage". Aborting to prevent data corruption.',
      );
    }
  }
}

export async function connectToDatabase(uri?: string): Promise<boolean> {
  const mongoUri = uri || config.mongoUri;
  if (!mongoUri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI environment variable is required in production.');
    }
    return false;
  }

  assertSafeDatabaseTarget(mongoUri);

  if (mongoose.connection.readyState === 1) {
    if (process.env.NODE_ENV === 'test' && mongoose.connection.name === 'cold_storage') {
      await mongoose.disconnect();
      throw new Error(
        'FATAL SAFETY VIOLATION: Active connection is pointing to live database "cold_storage" during test execution.',
      );
    }
    return true;
  }

  await mongoose.connect(mongoUri);

  if (process.env.NODE_ENV === 'test' && mongoose.connection.name === 'cold_storage') {
    await mongoose.disconnect();
    throw new Error(
      'FATAL SAFETY VIOLATION: Test process connected to live database "cold_storage". Aborting to prevent data corruption.',
    );
  }

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

