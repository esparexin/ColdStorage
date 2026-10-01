import { describe, expect, it } from 'vitest';
import {
  bagAccountingSchema,
  bagTypeSchema,
  can,
  chamberSchema,
  changePasswordInputSchema,
  createUserSchema,
  facilitySchema,
  getAuthoritativeWeight,
  gpNumberSchema,
  grnNumberSchema,
  inFacilityScope,
  levelSchema,
  loginInputSchema,
  positionSchema,
  rackSchema,
  receiptNumberSchema,
  rentReceiptNumberSchema,
  systemSettingsSchema,
  userSummarySchema,
} from './index.js';

describe('P1 Governance & Shared Contracts Foundation', () => {
  it('enforces independent business identifiers and optional opaque GP', () => {
    expect(grnNumberSchema.parse('GRN-25-26-0001')).toBe('GRN-25-26-0001');
    expect(receiptNumberSchema.parse('RCPT-2025-0042')).toBe('RCPT-2025-0042');
    expect(rentReceiptNumberSchema.parse('RRCPT-25-26-0001')).toBe('RRCPT-25-26-0001');
    expect(gpNumberSchema.parse(undefined)).toBeUndefined();
    expect(gpNumberSchema.parse('GP-OPAQUE-123')).toBe('GP-OPAQUE-123');
    expect(gpNumberSchema.parse(null)).toBeNull();
  });

  it('enforces strictly controlled bag types (S, B, S+B)', () => {
    expect(bagTypeSchema.parse('S')).toBe('S');
    expect(bagTypeSchema.parse('B')).toBe('B');
    expect(bagTypeSchema.parse('S+B')).toBe('S+B');

    expect(() => bagTypeSchema.parse('SMALL')).toThrow();
    expect(() => bagTypeSchema.parse('LARGE')).toThrow();
    expect(() => bagTypeSchema.parse('OTHER')).toThrow();
  });

  it('derives authoritative weight with actual weighbridge priority', () => {
    const nominalOnly = bagAccountingSchema.parse({
      bagType: 'S',
      bags: 100,
      nominalUnitWeight: 50,
      nominalTotalWeight: 5000,
    });
    expect(getAuthoritativeWeight(nominalOnly)).toBe(5000);

    const actualWeighed = bagAccountingSchema.parse({
      bagType: 'B',
      bags: 100,
      nominalUnitWeight: 50,
      nominalTotalWeight: 5000,
      actualWeight: 5085,
    });
    expect(getAuthoritativeWeight(actualWeighed)).toBe(5085);
  });

  it('validates the approved storage hierarchy (Facility -> Chamber -> Rack -> Level -> Position)', () => {
    const facility = facilitySchema.parse({ id: 'fac-1', name: 'Main Unit', code: 'FAC1' });
    const chamber = chamberSchema.parse({ id: 'ch-1', facilityId: facility.id, chamberNumber: 'CH-01' });
    const rack = rackSchema.parse({ id: 'rk-1', chamberId: chamber.id, code: 'R-01' });
    const level = levelSchema.parse({ id: 'lvl-1', rackId: rack.id, levelNumber: 1, code: 'L1' });
    const position = positionSchema.parse({ id: 'pos-1', levelId: level.id, code: 'P1-01', capacityBags: 120 });

    expect(facility.id).toBe('fac-1');
    expect(chamber.chamberNumber).toBe('CH-01');
    expect(rack.code).toBe('R-01');
    expect(level.levelNumber).toBe(1);
    expect(position.capacityBags).toBe(120);
  });

  it('enforces machine-readable permissions and facility scoping', () => {
    expect(can('SUPER_ADMIN', 'settings:manage')).toBe(true);
    expect(can('ADMIN', 'settings:manage')).toBe(false);
    expect(can('OPERATOR', 'grn:create')).toBe(true);
    expect(can('OPERATOR', 'rent:collect')).toBe(true);
    expect(can('READ_ONLY', 'rent:collect')).toBe(false);
    expect(can('READ_ONLY', 'rent:view')).toBe(true);

    // Super Admin has global facility scope
    expect(inFacilityScope('SUPER_ADMIN', [], 'facility-north')).toBe(true);

    // Other roles are restricted to assigned facilities
    expect(inFacilityScope('ADMIN', ['fac-1', 'fac-2'], 'fac-1')).toBe(true);
    expect(inFacilityScope('ADMIN', ['fac-1'], 'fac-2')).toBe(false);
  });

  it('applies standard system settings defaults', () => {
    const settings = systemSettingsSchema.parse({
      orgName: 'Agro Cold Storage Ltd',
      address: 'Plot 42, Cold Chain Zone, Maharashtra',
      contact: '+91 9876543210',
    });

    expect(settings.timezone).toBe('Asia/Kolkata');
    expect(settings.backupPolicy.atlasRetentionDays).toBe(7);
    expect(settings.backupPolicy.driveRetentionDays).toBe(30);
    expect(settings.documentNumbering.grnPrefix).toBe('GRN');
    expect(settings.documentNumbering.rentReceiptPrefix).toBe('RRCPT');
  });

  it('validates user provisioning and authentication schemas', () => {
    const newUser = createUserSchema.parse({
      fullName: 'Ramesh Sharma',
      username: 'ramesh.s',
      employeeId: 'EMP-1001',
      mobile: '9876543210',
      email: 'ramesh@example.com',
      role: 'OPERATOR',
      facilityIds: ['fac-1'],
      temporaryPassword: 'SamplePassword#2026',
    });
    expect(newUser.username).toBe('ramesh.s');
    expect(newUser.role).toBe('OPERATOR');

    const loginInput = loginInputSchema.parse({
      username: 'ramesh.s',
      password: 'SamplePassword#2026',
    });
    expect(loginInput.username).toBe('ramesh.s');

    const changePasswordInput = changePasswordInputSchema.parse({
      currentPassword: 'SamplePassword#2026',
      newPassword: 'NewSecurePassword456!',
    });
    expect(changePasswordInput.newPassword).toBe('NewSecurePassword456!');

    const summary = userSummarySchema.parse({
      id: 'usr-1',
      fullName: newUser.fullName,
      username: newUser.username,
      employeeId: newUser.employeeId,
      mobile: newUser.mobile,
      email: newUser.email,
      role: newUser.role,
      facilityIds: newUser.facilityIds,
      status: 'ACTIVE',
      mustChangePassword: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(summary.mustChangePassword).toBe(true);
  });
});
