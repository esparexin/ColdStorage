import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Environment loading (SSOT).
 *
 * `.env.local` at the repository root is the documented local configuration file, but nothing
 * previously loaded it, so every documented variable silently fell back to the defaults below.
 * It is loaded here, before any `process.env` read, and with `override: false` so a real
 * environment variable (CI, container runtime, shell export) always wins over the file.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadDotenv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });

export interface AppConfig {
  port: number;
  jwtSecret: string;
  accessTokenExpirySeconds: number;
  refreshTokenExpiryDays: number;
  mongoUri?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
  rateLimitWindowMsAuth: number;
  rateLimitMaxAuth: number;
  rateLimitWindowMsMutations: number;
  rateLimitMaxMutations: number;
  rateLimitWindowMsGeneral: number;
  rateLimitMaxGeneral: number;
  cloudinaryUrl?: string;
  /** 64 hex characters. Required to run encrypted backups; absent means backups are unconfigured. */
  backupEncryptionKey?: string;
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required in production.');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required in production.');
  }
}

/**
 * Resolves the MongoDB URI with strict environment isolation.
 * In test mode (NODE_ENV === 'test'), tests are strictly forbidden from targeting the live
 * database ('cold_storage'). If MONGODB_TEST_URI is set, it is used; otherwise, the database
 * path of MONGODB_URI (or default fallback) is rewritten to 'cold_storage_test'.
 */
export function resolveMongoUri(): string | undefined {
  if (process.env.NODE_ENV === 'test') {
    if (process.env.MONGODB_TEST_URI) {
      return process.env.MONGODB_TEST_URI;
    }
    const baseUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    const [withoutQuery, query] = baseUri.split('?');
    const lastSlash = withoutQuery.lastIndexOf('/');
    const server = lastSlash === -1 ? withoutQuery : withoutQuery.slice(0, lastSlash);
    return `${server}/cold_storage_test${query ? `?${query}` : ''}`;
  }
  return process.env.MONGODB_URI;
}

const resolvedMongoUri = resolveMongoUri();
if (process.env.NODE_ENV === 'test' && resolvedMongoUri) {
  process.env.MONGODB_URI = resolvedMongoUri;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-super-secret-jwt-key-cold-storage-2026',
  accessTokenExpirySeconds: Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 900, // 15m
  refreshTokenExpiryDays: Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7, // 7d
  mongoUri: resolvedMongoUri,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  rateLimitWindowMsAuth: Number(process.env.RATE_LIMIT_WINDOW_MS_AUTH) || 15 * 60 * 1000, // 15m
  rateLimitMaxAuth: Number(process.env.RATE_LIMIT_MAX_AUTH) || 10,
  rateLimitWindowMsMutations: Number(process.env.RATE_LIMIT_WINDOW_MS_MUTATIONS) || 5 * 60 * 1000, // 5m
  rateLimitMaxMutations: Number(process.env.RATE_LIMIT_MAX_MUTATIONS) || 5,
  rateLimitWindowMsGeneral: Number(process.env.RATE_LIMIT_WINDOW_MS_GENERAL) || 60 * 1000, // 1m
  rateLimitMaxGeneral: Number(process.env.RATE_LIMIT_MAX_GENERAL) || 200,
  cloudinaryUrl: process.env.CLOUDINARY_URL,
  backupEncryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
};

