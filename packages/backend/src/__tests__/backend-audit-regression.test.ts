import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { SessionModel } from '../database/models/session.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { verifyIndexDeclarations } from '../database/indexes.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { authService } from '../modules/auth/auth.service.js';
import { userRepository } from '../modules/users/user.repository.js';
import { updateGrnLoanStatus } from '../modules/grn/handlers/update-grn-loan-status.handler.js';
import { classifyDomainError, statusForDomainError } from '../utils/http-error.js';
import { hashPassword } from '../utils/crypto.js';

describe('Backend audit regression (F01-F03,F08,F19,F22)', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('rejects refresh replay when rotation misses (F01)', async () => {
    await userRepository.resetForTesting();
    await sessionRepository.resetForTesting();
    await userRepository.createUser({
      id: 'audit-replay-usr',
      fullName: 'Audit Replay',
      username: 'audit.replay',
      employeeId: 'AUD-001',
      mobile: '9876543210',
      email: 'audit.replay@coldstorage.local',
      role: 'OPERATOR',
      facilityIds: ['facility-a'],
      status: 'ACTIVE',
      passwordHash: await hashPassword('ReplayPassword123!'),
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const login = await authService.login({ username: 'audit.replay', password: 'ReplayPassword123!' });
    expect(login.refreshToken).toMatch(/^[0-9a-f]+$/);
    const first = await authService.refresh(login.refreshToken);
    expect(first.accessToken.length).toBeGreaterThan(10);
    await expect(authService.refresh(login.refreshToken)).rejects.toThrow(
      'Invalid, expired, or revoked refresh token',
    );
  });

  it('exposes session TTL and compound indexes (F02)', async () => {
    const indexes = SessionModel.schema.indexes().map(([fields, opts]) => ({ fields, opts }));
    const ttl = indexes.find((i) => (i.fields as Record<string, unknown>).expiresAt === 1);
    expect(ttl).toBeDefined();
    expect((ttl?.opts as Record<string, unknown>)?.expireAfterSeconds).toBe(0);
    const userCompound = indexes.find((i) => 'userId' in (i.fields as object));
    expect(userCompound).toBeDefined();
  });

  it('enforces ledger referenceId idempotency declaration (F03)', async () => {
    const indexes = InventoryTransactionModel.schema.indexes();
    const idem = indexes.find(
      ([fields]) =>
        'referenceId' in (fields as object) && 'transactionType' in (fields as object),
    );
    expect(idem).toBeDefined();
    expect((idem?.[1] as Record<string, unknown>)?.unique).toBe(true);
  });

  it('rejects loan-status update for unknown GRN (F08 failure path)', async () => {
    await expect(
      updateGrnLoanStatus('facility-a', 'grn-missing', { loanStatus: 'TAKEN' }, 'usr-x'),
    ).rejects.toThrow("not found in facility");
  });

  it('monitors Group and InternalMovement indexes (F19)', async () => {
    const reports = verifyIndexDeclarations().map((r) => r.modelName);
    expect(reports).toContain('Group');
    expect(reports).toContain('InternalMovement');
  });

  it('classifies domain errors without throwing (F22-adjacent)', async () => {
    expect(classifyDomainError('GRN foo not found')).toBe('notFound');
    expect(statusForDomainError('E11000 duplicate key')).toBe(409);
    expect(statusForDomainError('Unauthorized access')).toBe(403);
    expect(statusForDomainError('unexpected boom')).toBe(400);
  });
});
