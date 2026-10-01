export interface AppConfig {
  port: number;
  jwtSecret: string;
  accessTokenExpirySeconds: number;
  refreshTokenExpiryDays: number;
  mongoUri?: string;
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
};
