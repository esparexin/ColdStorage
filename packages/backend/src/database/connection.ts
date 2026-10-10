import mongoose from 'mongoose';
import type { DatabaseState } from '@cold-storage/contracts';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Bounded MongoDB timeouts (Phase 2 fail-fast).
 *
 * Previously `mongoose.connect()` was called with no options, inheriting
 * Mongoose v8 defaults (`serverSelectionTimeoutMS:30000`, `socketTimeoutMS:0`,
 * `bufferCommands:true`). A degraded network then buffered each sequential
 * auth op (`findByUsername` → `AuditLog.create` → …) instead of fast-failing,
 * and two consecutive 30s windows summed to the observed ~60s spinner hold
 * behind the Next.js rewrite (which itself has no proxy timeout).
 *
 * These bounds keep MongoDB as the canonical SSOT while ensuring
 * login/refresh fail fast (≈5s) so the frontend 12s abort can surface the
 * login form with a meaningful error instead of hanging the gate.
 */
export const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5000;
export const MONGO_CONNECT_TIMEOUT_MS = 5000;
export const MONGO_SOCKET_TIMEOUT_MS = 10000;

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

  const connectStart = Date.now();
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: MONGO_CONNECT_TIMEOUT_MS,
    socketTimeoutMS: MONGO_SOCKET_TIMEOUT_MS,
    // Fail fast instead of buffering auth ops while disconnected. Per-request
    // ops then reject within the selection timeout above rather than hanging
    // the Express handler indefinitely.
    bufferCommands: false,
  });
  const connectMs = Date.now() - connectStart;
  if (connectMs > 1000) {
    logger.warn('MongoDB connect slow', { connectMs });
  }

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

/**
 * Active database name without secrets (e.g. `cold_storage`). Null when no
 * connection has been established yet. Exposed via /api/health so operators
 * can verify the backend talks to the intended database.
 */
export function getDatabaseName(): string | null {
  return mongoose.connection.name || null;
}

