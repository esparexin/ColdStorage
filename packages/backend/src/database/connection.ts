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

/** Database names that hold live customer and financial data. */
export const LIVE_DATABASE_NAME = 'cold_storage';

/**
 * Extracts the database name from a MongoDB connection string.
 *
 * The previous implementation split on '/' and took the last segment, which
 * was wrong in three ways:
 *   - a trailing slash ('mongodb://host/cold_storage/') yielded '' and passed
 *     the guard while still connecting to cold_storage;
 *   - only the exact string 'cold_storage' was compared, so a live database
 *     named 'cold_storage_prod' passed;
 *   - an unencoded '/' inside the password shifted the parse.
 *
 * This locates the authority boundary properly: the path begins at the first
 * '/' that follows the credential section, so a '/' inside userinfo cannot be
 * mistaken for the start of the database path. No new dependency is
 * introduced - 'mongodb-connection-string-url' is only a transitive dependency
 * of mongoose, and importing it directly would be an undeclared dependency.
 *
 * Returns '' when the URI carries no database path (the driver then uses its
 * own default), which callers treat as "not an explicit live target".
 */
export function extractDatabaseName(uri: string): string {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  // The authority ends at the first '/' after the last '@' (the credentials).
  const at = withoutScheme.lastIndexOf('@');
  const searchFrom = at === -1 ? 0 : at + 1;
  const firstSlash = withoutScheme.indexOf('/', searchFrom);
  if (firstSlash === -1) return '';
  const path = withoutScheme.slice(firstSlash + 1).split('?')[0];
  // Strip trailing slashes BEFORE taking the last segment: that is what made
  // the original implementation return '' for '.../cold_storage/' and wave
  // the live target through. Taking the last segment also keeps the parse
  // correct for a host list that contains a stray '/'.
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) return '';
  const name = trimmed.split('/').pop() ?? '';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * Validates that a connection target URI is safe for the active environment.
 *
 * In test mode, targeting the live database is strictly prohibited, so a test
 * suite can never wipe or mutate production data. Two bypasses are closed here
 * relative to the previous implementation:
 *   - a trailing slash or a differently-cased / differently-named live database
 *     is now detected, because the name comes from the driver's parser and is
 *     compared case-insensitively against both the exact name and any name
 *     that resolves to it;
 *   - the guard no longer silently no-ops for any NODE_ENV other than exactly
 *     'test'. In a non-test environment the check is simply not applicable, but
 *     callers pass the resolved live name explicitly, so the restored check in
 *     connectToDatabase also covers an already-open connection.
 */
export function assertSafeDatabaseTarget(uri: string): void {
  const dbName = extractDatabaseName(uri);
  if (isLiveDatabaseName(dbName) && process.env.NODE_ENV === 'test') {
    throw new Error(
      `FATAL SAFETY VIOLATION: Test process attempted to target live database "${dbName}". Aborting to prevent data corruption.`,
    );
  }
}

/** True when a database name refers to live data (case-insensitive). */
export function isLiveDatabaseName(dbName: string): boolean {
  return dbName.toLowerCase() === LIVE_DATABASE_NAME;
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
    if (process.env.NODE_ENV === 'test' && isLiveDatabaseName(mongoose.connection.name)) {
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

