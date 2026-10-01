import { randomBytes } from 'node:crypto';
import type {
  AuditEventType,
  AuditLogsResponse,
  AuditQuery,
  AuditSeverity,
  Role,
} from '@cold-storage/contracts';
import { AuditLogModel, type AuditLogDoc } from '../../database/models/audit-log.model.js';

export interface AuditEventInput {
  eventType: AuditEventType;
  severity: AuditSeverity;
  facilityId?: string | null;
  userId?: string;
  username?: string;
  userRole?: Role | 'ANONYMOUS' | 'SYSTEM';
  ipAddress?: string;
  userAgent?: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
}

export class AuditService {
  private static readonly REDACTED_KEYS = new Set([
    'password',
    'temporarypassword',
    'currentpassword',
    'newpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'secret',
  ]);

  /**
   * Sanitizes details object by recursively redacting sensitive keys and enforcing size limit.
   */
  public sanitizeDetails(obj: unknown, depth = 0): Record<string, unknown> {
    if (!obj || typeof obj !== 'object' || depth > 5) {
      return {};
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (AuditService.REDACTED_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDetails(value, depth + 1);
      } else if (Array.isArray(value)) {
        sanitized[key] = value
          .slice(0, 50)
          .map((item) =>
            typeof item === 'object' && item !== null
              ? this.sanitizeDetails(item, depth + 1)
              : item,
          );
      } else {
        sanitized[key] = value;
      }
    }

    // Enforce 4 KB details payload cap
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > 4096) {
      return { truncated: true, message: 'Details payload exceeded 4KB limit' };
    }

    return sanitized;
  }

  /**
   * Normalizes IP address to safe standard format.
   */
  public normalizeIp(rawIp?: string): string {
    if (!rawIp) return '127.0.0.1';
    const firstIp = rawIp.split(',')[0].trim();
    return firstIp.replace(/^::ffff:/, '') || '127.0.0.1';
  }

  /**
   * Normalizes User-Agent to max 255 chars.
   */
  public normalizeUserAgent(rawAgent?: string): string {
    if (!rawAgent) return 'Unknown';
    return rawAgent.substring(0, 255);
  }

  /**
   * Asynchronously records an audit event in an append-only collection.
   * Catches errors locally so domain transactions are never blocked by audit logger failures.
   */
  public async log(input: AuditEventInput): Promise<AuditLogDoc | null> {
    try {
      const id = `audit_${Date.now()}_${randomBytes(4).toString('hex')}`;
      const doc = await AuditLogModel.create({
        id,
        timestamp: new Date(),
        eventType: input.eventType,
        severity: input.severity,
        facilityId: input.facilityId ?? null,
        userId: input.userId ?? 'SYSTEM',
        username: input.username ?? 'SYSTEM',
        userRole: input.userRole ?? 'SYSTEM',
        ipAddress: this.normalizeIp(input.ipAddress),
        userAgent: this.normalizeUserAgent(input.userAgent),
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        details: this.sanitizeDetails(input.details ?? {}),
      });

      return doc;
    } catch {
      // Non-blocking error handling: Domain transactions must not abort on audit logging issues
      return null;
    }
  }

  /**
   * Queries audit logs with facility scoping, date range, pagination, and event type filtering.
   * - authorizedFacilityIds === null means SUPER_ADMIN (global scope).
   * - authorizedFacilityIds !== null means ADMIN (restricted to assigned facilities).
   */
  public async queryLogs(
    query: AuditQuery,
    authorizedFacilityIds: string[] | null,
  ): Promise<AuditLogsResponse> {
    const filter: Record<string, unknown> = {};

    // 1. Facility scoping
    if (authorizedFacilityIds === null) {
      // SUPER_ADMIN: can filter by specific facilityId if provided, or view all
      if (query.facilityId) {
        filter.facilityId = query.facilityId;
      }
    } else {
      // ADMIN: must filter strictly within assigned facilityIds
      if (query.facilityId) {
        if (!authorizedFacilityIds.includes(query.facilityId)) {
          throw new Error('ACCESS_DENIED: Cannot query audit logs for unassigned facility');
        }
        filter.facilityId = query.facilityId;
      } else {
        filter.facilityId = { $in: authorizedFacilityIds };
      }
    }

    // 2. Event type and severity
    if (query.eventType) {
      filter.eventType = query.eventType;
    }
    if (query.severity) {
      filter.severity = query.severity;
    }

    // 3. User filter
    if (query.userId) {
      filter.userId = query.userId;
    }

    // 4. Timestamp date range
    if (query.from || query.to) {
      const timeFilter: Record<string, Date> = {};
      if (query.from) {
        timeFilter.$gte = new Date(query.from);
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (query.to.length === 10) {
          toDate.setUTCHours(23, 59, 59, 999);
        }
        timeFilter.$lte = toDate;
      }
      filter.timestamp = timeFilter;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [logs, totalCount] = await Promise.all([
      AuditLogModel.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean().exec(),
      AuditLogModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        eventType: log.eventType,
        severity: log.severity,
        facilityId: log.facilityId,
        userId: log.userId,
        username: log.username,
        userRole: log.userRole,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        resource: log.resource,
        resourceId: log.resourceId,
        details: (log.details as Record<string, unknown>) ?? {},
      })),
      totalCount,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Retrieves single audit log by ID with facility scope check.
   */
  public async getLogById(
    id: string,
    authorizedFacilityIds: string[] | null,
  ): Promise<AuditLogDoc | null> {
    const log = await AuditLogModel.findOne({ id }).lean().exec();
    if (!log) return null;

    if (authorizedFacilityIds !== null && log.facilityId) {
      if (!authorizedFacilityIds.includes(log.facilityId)) {
        throw new Error('ACCESS_DENIED: Target audit record belongs to an unassigned facility');
      }
    }

    return log as unknown as AuditLogDoc;
  }
}

export const auditService = new AuditService();
