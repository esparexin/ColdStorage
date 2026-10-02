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

export const config: AppConfig = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-super-secret-jwt-key-cold-storage-2026',
  accessTokenExpirySeconds: Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 900, // 15m
  refreshTokenExpiryDays: Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7, // 7d
  mongoUri: process.env.MONGODB_URI,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  rateLimitWindowMsAuth: Number(process.env.RATE_LIMIT_WINDOW_MS_AUTH) || 15 * 60 * 1000, // 15m
  rateLimitMaxAuth: Number(process.env.RATE_LIMIT_MAX_AUTH) || 10,
  rateLimitWindowMsMutations: Number(process.env.RATE_LIMIT_WINDOW_MS_MUTATIONS) || 5 * 60 * 1000, // 5m
  rateLimitMaxMutations: Number(process.env.RATE_LIMIT_MAX_MUTATIONS) || 5,
  rateLimitWindowMsGeneral: Number(process.env.RATE_LIMIT_WINDOW_MS_GENERAL) || 60 * 1000, // 1m
  rateLimitMaxGeneral: Number(process.env.RATE_LIMIT_MAX_GENERAL) || 200,
};
