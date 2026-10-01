import { createHash, createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { TokenPayload } from '@cold-storage/contracts';

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
  // Access tokens are short-lived (default: 15 minutes = 900s)
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

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

    const expectedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSignature) return null;

    const decodedPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: decodedPayload.userId,
      username: decodedPayload.username,
      role: decodedPayload.role,
      facilityIds: decodedPayload.facilityIds,
      mustChangePassword: decodedPayload.mustChangePassword,
    };
  } catch {
    return null;
  }
}
