import { z } from 'zod';
import { roleSchema } from './permissions.js';

/**
 * Controlled audit event types SSOT (P10 Architecture Lock).
 */
export const auditEventTypeSchema = z.enum([
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_CHANGE',
  'GRN_CREATED',
  'INVENTORY_PUTAWAY',
  'DELIVERY_ISSUED',
  'DELIVERY_REVERSED',
  'SETTINGS_UPDATED',
  'IMPORT_EXECUTED',
  'EXPORT_EXECUTED',
  'BACKUP_TRIGGERED',
  'ACCESS_DENIED',
  'RENT_PAYMENT_COLLECTED',
  'USER_UPDATED',
  'USER_PASSWORD_RESET',
]);

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const auditSeveritySchema = z.enum(['INFO', 'WARN', 'SECURITY', 'CRITICAL']);

export type AuditSeverity = z.infer<typeof auditSeveritySchema>;

/**
 * Audit log entry DTO schema for API responses.
 */
export const auditLogRecordSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  eventType: auditEventTypeSchema,
  severity: auditSeveritySchema,
  facilityId: z.string().nullable().optional(),
  userId: z.string(),
  username: z.string(),
  userRole: z.union([roleSchema, z.literal('ANONYMOUS'), z.literal('SYSTEM')]),
  ipAddress: z.string(),
  userAgent: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable().optional(),
  details: z.record(z.unknown()).default({}),
});

export type AuditLogRecord = z.infer<typeof auditLogRecordSchema>;

/**
 * Query schema for filtering audit logs.
 */
export const auditQuerySchema = z.object({
  facilityId: z.string().trim().optional(),
  eventType: auditEventTypeSchema.optional(),
  severity: auditSeveritySchema.optional(),
  userId: z.string().trim().optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  to: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

/**
 * Paginated response for audit logs.
 */
export const auditLogsResponseSchema = z.object({
  logs: z.array(auditLogRecordSchema),
  totalCount: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;
