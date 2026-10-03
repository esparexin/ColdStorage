import { randomUUID } from 'node:crypto';
import type { Role } from '@cold-storage/contracts';
import { UserModel } from '../../database/models/user.model.js';
import { generateAccessToken, hashPassword } from '../../utils/crypto.js';

export interface TokenClaims {
  userId: string;
  username: string;
  role: Role;
  facilityIds: string[];
  mustChangePassword: boolean;
}

export type SignToken = (claims: TokenClaims, expiresInSeconds?: number) => string;

export interface AuthFixture {
  userId: string;
  token: string;
}

/**
 * Binds the real JWT signer to a test secret so fixtures never re-implement token signing.
 */
export function authTokenSigner(jwtSecret: string): SignToken {
  return (claims, expiresInSeconds) =>
    generateAccessToken(claims, jwtSecret, expiresInSeconds);
}

export interface SeedAuthUserOptions {
  username: string;
  role: Role;
  userId?: string;
  facilityIds?: string[];
  mustChangePassword?: boolean;
  status?: 'ACTIVE' | 'DISABLED';
  expiresInSeconds?: number;
}

/**
 * Shared authentication fixture for route tests.
 *
 * The production `authenticate` guard resolves account activation from MongoDB (the
 * architecture lock designates it as the single identity/session SSOT), so a signed token
 * alone is not enough for a request to be served. Test tokens must therefore be backed by a
 * real, persisted account. This helper is the single canonical way to mint one, replacing
 * the per-file ad-hoc `generateAccessToken(...)` blocks that previously produced valid
 * tokens for users that were never persisted.
 */
export async function seedAuthUser(
  signToken: SignToken,
  options: SeedAuthUserOptions,
): Promise<AuthFixture> {
  const userId = options.userId ?? `usr-${randomUUID()}`;
  const facilityIds = options.facilityIds ?? [];
  const mustChangePassword = options.mustChangePassword ?? false;
  const status = options.status ?? 'ACTIVE';

  await UserModel.create({
    id: userId,
    fullName: options.username,
    username: options.username,
    employeeId: `EMP-${userId.slice(-6)}`,
    mobile: '9876543210',
    email: `${options.username}@coldstorage.local`,
    role: options.role,
    facilityIds,
    status,
    passwordHash: await hashPassword('FixturePassword123!'),
    mustChangePassword,
    lastLoginAt: null,
  });

  const claims: TokenClaims = {
    userId,
    username: options.username,
    role: options.role,
    facilityIds,
    mustChangePassword,
  };

  return { userId, token: signToken(claims, options.expiresInSeconds) };
}

/**
 * Binds the signer to a secret once per suite so fixtures do not repeat
 * `authTokenSigner(config.jwtSecret)` at every call site.
 */
export function createAuthSeeder(
  jwtSecret: string,
): (options: SeedAuthUserOptions) => Promise<AuthFixture> {
  const signToken = authTokenSigner(jwtSecret);
  return (options) => seedAuthUser(signToken, options);
}