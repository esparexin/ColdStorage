import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { TokenPayload } from '@cold-storage/contracts';

/** JWT issuer/audience isolates tokens per deployment and prevents cross-env replay. */
export const JWT_ISSUER = 'cold-storage-api';
export const JWT_AUDIENCE = 'cold-storage-app';
/** Hard cap for access-token lifetime (15m). Env override above this is clamped. */
export const MAX_ACCESS_TOKEN_EXPIRY_SECONDS = 900;

/**
 * Constant-time mitigation hash for unknown usernames.
 * Verifying against this ensures USER_NOT_FOUND takes ~argon2 time instead of
 * returning instantly, closing the timing enumeration oracle without changing
 * the public error message (UX preserved).
 */
const TIMING_MITIGATION_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Bok01VNyDQTk/ylmS1OcEA$yA2GdER1sK0pDMqp1qAEriqVCZtZCoEakX6rN197QxA';

export async function verifyTimingMitigationPassword(password = 'timing-mitigation-fallback-secret'): Promise<void> {
  try {
    await argon2.verify(TIMING_MITIGATION_HASH, password);
  } catch {
    // Intentionally ignored — only timing matters.
  }
}

/**
 * P2 Password Hashing: Strictly Argon2id (SSOT architecture).
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * Secure opaque token generator for refresh tokens and session identifiers.
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/**
 * Hash an opaque token (e.g. refresh token) with SHA-256 for safe storage.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Standard JWT Access Token implementation using native HMAC SHA-256.
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function generateAccessToken(payload: TokenPayload, secret: string, expiresInSeconds = 900): string {
  // Clamp env override: never mint access tokens longer than 15 minutes.
  const clampedExpiry = Math.min(Math.max(60, expiresInSeconds), MAX_ACCESS_TOKEN_EXPIRY_SECONDS);
  // Access tokens are short-lived (default: 15 minutes = 900s)
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + clampedExpiry;
  const fullPayload = {
    ...payload,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    jti: randomUUID(),
    iat: nowSeconds,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token: string, secret: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;

    // Enforce explicit HS256 header — rejects alg:none / RS256 confusion by design.
    try {
      const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string };
      if (header.alg !== 'HS256') return null;
    } catch {
      return null;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    // Compare raw HMAC bytes (not base64url strings) to avoid length oracle.
    const sigBytes = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const expectedBytes = Buffer.from(
      expectedSignature.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );
    if (sigBytes.length !== expectedBytes.length || !timingSafeEqual(sigBytes, expectedBytes)) {
      return null;
    }

    const decodedPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    // Issuer/audience binding prevents cross-environment replay when secrets are reused.
    if (decodedPayload.iss && decodedPayload.iss !== JWT_ISSUER) return null;
    if (decodedPayload.aud && decodedPayload.aud !== JWT_AUDIENCE) return null;
    // Strict for newly minted tokens; legacy tokens without iss/aud still verify
    // until rotation (mint always sets them, so this window closes in ≤15m).

    return {
      userId: decodedPayload.userId,
      username: decodedPayload.username,
      role: decodedPayload.role,
      roleId: decodedPayload.roleId,
      permissions: decodedPayload.permissions,
      facilityIds: decodedPayload.facilityIds,
      mustChangePassword: decodedPayload.mustChangePassword,
    };
  } catch {
    return null;
  }
}
