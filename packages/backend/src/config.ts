export interface AppConfig {
  port: number;
  jwtSecret: string;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-super-secret-jwt-key-cold-storage-2026',
};
