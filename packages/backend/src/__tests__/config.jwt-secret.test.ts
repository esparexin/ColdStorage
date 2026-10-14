import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config, MIN_JWT_SECRET_LENGTH, resolveJwtSecret } from '../config.js';

/**
 * Regression guard for the hardcoded-JWT-secret finding.
 *
 * `config.ts` previously fell back to the literal
 * `'dev-super-secret-jwt-key-cold-storage-2026'` whenever `JWT_SECRET` was
 * absent, guarded only by `NODE_ENV === 'production'`. Any staging, preview or
 * container deployment therefore signed and verified tokens with a key that
 * was public in the repository, allowing a forged SUPER_ADMIN token.
 *
 * `resolveJwtSecret()` is exercised directly because it reads `process.env`
 * at call time. Re-importing the module is not viable here: `config.ts` calls
 * `loadDotenv` at import, which repopulates `JWT_SECRET` from `.env.local`
 * after the test deletes it, so the "secret is missing" cases are
 * unreachable through module re-evaluation.
 */
describe('JWT secret resolution', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('exports a minimum-length constant used for entropy validation', () => {
    expect(MIN_JWT_SECRET_LENGTH).toBe(32);
  });

  it('the module-level config never carries a repository-committed literal', () => {
    expect(config.jwtSecret).not.toBe('dev-super-secret-jwt-key-cold-storage-2026');
    expect(config.jwtSecret).not.toContain('dev-super-secret');
  });

  it('generates an ephemeral per-process secret in test when unset', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
    const secret = resolveJwtSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different secret on each call, so no known key can validate', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
    expect(resolveJwtSecret()).not.toBe(resolveJwtSecret());
  });

  it('honours a supplied secret that meets the entropy floor', () => {
    process.env.JWT_SECRET = 'a'.repeat(MIN_JWT_SECRET_LENGTH);
    expect(resolveJwtSecret()).toBe('a'.repeat(MIN_JWT_SECRET_LENGTH));
  });

  it('rejects a supplied secret shorter than the entropy floor', () => {
    process.env.JWT_SECRET = 'short-secret';
    expect(() => resolveJwtSecret()).toThrow(/at least 32 characters/);
    process.env.JWT_SECRET = 'a'.repeat(MIN_JWT_SECRET_LENGTH - 1);
    expect(() => resolveJwtSecret()).toThrow(/at least 32 characters/);
  });

  it('rejects a missing secret outside test, including staging-like NODE_ENV values', () => {
    delete process.env.JWT_SECRET;
    for (const nodeEnv of ['development', 'staging', 'prod', 'preview', '']) {
      process.env.NODE_ENV = nodeEnv;
      expect(() => resolveJwtSecret(), `NODE_ENV=${nodeEnv}`).toThrow(
        /JWT_SECRET environment variable is required/,
      );
    }
    delete process.env.NODE_ENV;
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET environment variable is required/);
  });
});