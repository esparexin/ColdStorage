import { describe, expect, it } from 'vitest';
import {
  assignGrnsSchema,
  auditEventTypeSchema,
  can,
  createGroupSchema,
  groupNameSchema,
  groupQuerySchema,
  groupRemarksSchema,
  groupSchema,
  moveGrnsSchema,
  unassignGrnsSchema,
  updateGroupSchema,
} from '../index.js';

describe('Group Contracts & Permissions SSOT', () => {
  it('validates group name boundaries and trims whitespace', () => {
    expect(groupNameSchema.parse('  Kisan Traders  ')).toBe('Kisan Traders');
    expect(groupNameSchema.parse('A')).toBe('A');
    expect(groupNameSchema.parse('g'.repeat(50))).toHaveLength(50);
    expect(() => groupNameSchema.parse('g'.repeat(51))).toThrow();
    expect(() => groupNameSchema.parse('')).toThrow();
    expect(() => groupNameSchema.parse('   ')).toThrow();
  });

  it('validates remarks length up to 500 characters', () => {
    expect(groupRemarksSchema.parse(null)).toBeNull();
    expect(groupRemarksSchema.parse(undefined)).toBeUndefined();
    expect(groupRemarksSchema.parse('Lot 2026 Season')).toBe('Lot 2026 Season');
    expect(groupRemarksSchema.parse('r'.repeat(500))).toHaveLength(500);
    expect(() => groupRemarksSchema.parse('r'.repeat(501))).toThrow();
  });

  it('validates createGroupSchema strictly', () => {
    const valid = createGroupSchema.parse({
      name: 'Ramesh Agro Traders',
      remarks: 'Primary consignment group',
      customerId: 'cust-1234',
    });
    expect(valid.name).toBe('Ramesh Agro Traders');
    expect(valid.customerId).toBe('cust-1234');

    expect(() =>
      createGroupSchema.parse({
        name: 'Valid Name',
        unknownField: 'bad',
      } as unknown),
    ).toThrow();
  });

  it('validates updateGroupSchema strictly', () => {
    const validRename = updateGroupSchema.parse({ name: 'Renamed Traders' });
    expect(validRename.name).toBe('Renamed Traders');

    const validRemarksOnly = updateGroupSchema.parse({ remarks: 'Updated note' });
    expect(validRemarksOnly.remarks).toBe('Updated note');
  });

  it('validates assign, unassign and move payloads', () => {
    expect(assignGrnsSchema.parse({ grnIds: ['grn-1', 'grn-2'] }).grnIds).toEqual([
      'grn-1',
      'grn-2',
    ]);
    expect(() => assignGrnsSchema.parse({ grnIds: [] })).toThrow();

    expect(unassignGrnsSchema.parse({ grnIds: ['grn-1'] }).grnIds).toEqual(['grn-1']);
    expect(() => unassignGrnsSchema.parse({ grnIds: [] })).toThrow();

    expect(
      moveGrnsSchema.parse({ targetGroupId: 'grp-target', grnIds: ['grn-1'] }),
    ).toEqual({ targetGroupId: 'grp-target', grnIds: ['grn-1'] });
    expect(() => moveGrnsSchema.parse({ targetGroupId: '', grnIds: ['grn-1'] })).toThrow();
  });

  it('validates groupQuerySchema defaults and bounds', () => {
    const parsed = groupQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sortBy).toBe('createdAt');
    expect(parsed.sortDir).toBe('desc');
  });

  it('validates group entity parsing', () => {
    const group = groupSchema.parse({
      id: 'grp-uuid-1',
      facilityId: 'fac-1',
      name: 'Trader Suresh Lot',
      grnCount: 5,
      stockSummary: { totalBags: 100, smallBags: 40, bigBags: 60 },
      createdBy: 'user-admin',
    });
    expect(group.id).toBe('grp-uuid-1');
    expect(group.grnCount).toBe(5);
    expect(group.stockSummary?.totalBags).toBe(100);
  });

  it('enforces RBAC matrix for group permissions', () => {
    expect(can('SUPER_ADMIN', 'group:view')).toBe(true);
    expect(can('ADMIN', 'group:view')).toBe(true);
    expect(can('OPERATOR', 'group:view')).toBe(true);
    expect(can('READ_ONLY', 'group:view')).toBe(true);

    expect(can('SUPER_ADMIN', 'group:manage')).toBe(true);
    expect(can('ADMIN', 'group:manage')).toBe(true);
    expect(can('OPERATOR', 'group:manage')).toBe(true);
    expect(can('READ_ONLY', 'group:manage')).toBe(false);

    expect(can('SUPER_ADMIN', 'group:delete')).toBe(true);
    expect(can('ADMIN', 'group:delete')).toBe(true);
    expect(can('OPERATOR', 'group:delete')).toBe(false);
    expect(can('READ_ONLY', 'group:delete')).toBe(false);
  });

  it('includes group audit event types in the SSOT schema', () => {
    expect(auditEventTypeSchema.parse('GROUP_CREATED')).toBe('GROUP_CREATED');
    expect(auditEventTypeSchema.parse('GROUP_RENAMED')).toBe('GROUP_RENAMED');
    expect(auditEventTypeSchema.parse('GROUP_DELETED')).toBe('GROUP_DELETED');
    expect(auditEventTypeSchema.parse('GROUP_GRNS_ASSIGNED')).toBe('GROUP_GRNS_ASSIGNED');
    expect(auditEventTypeSchema.parse('GROUP_GRNS_UNASSIGNED')).toBe('GROUP_GRNS_UNASSIGNED');
    expect(auditEventTypeSchema.parse('GROUP_GRNS_MOVED')).toBe('GROUP_GRNS_MOVED');
  });
});
