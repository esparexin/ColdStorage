import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { AuditEventType, AuditSeverity, Role } from '@cold-storage/contracts';

export interface AuditLogDoc extends Document {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  facilityId: string | null;
  userId: string;
  username: string;
  userRole: Role | 'ANONYMOUS' | 'SYSTEM';
  ipAddress: string;
  userAgent: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    eventType: {
      type: String,
      required: true,
      index: true,
      enum: [
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
      ],
    },
    severity: {
      type: String,
      required: true,
      index: true,
      enum: ['INFO', 'WARN', 'SECURITY', 'CRITICAL'],
    },
    facilityId: { type: String, default: null, index: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    userRole: {
      type: String,
      required: true,
      enum: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY', 'ANONYMOUS', 'SYSTEM'],
    },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true, maxlength: 255 },
    resource: { type: String, required: true },
    resourceId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // strictly append-only, no updatedAt
    versionKey: false,
  },
);

// Compound indexes for fast query filtering
auditLogSchema.index({ facilityId: 1, timestamp: -1 });
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });

/**
 * Append-only immutability guard:
 * Strictly reject all updates, replacements, and deletions on AuditLog collection.
 */
function throwImmutabilityError(operation: string): never {
  throw new Error(`AUDIT_LOG_IMMUTABLE: ${operation} operation is strictly prohibited on AuditLog`);
}

auditLogSchema.pre('updateOne', function () {
  throwImmutabilityError('updateOne');
});
auditLogSchema.pre('updateMany', function () {
  throwImmutabilityError('updateMany');
});
auditLogSchema.pre('findOneAndUpdate', function () {
  throwImmutabilityError('findOneAndUpdate');
});
auditLogSchema.pre('replaceOne', function () {
  throwImmutabilityError('replaceOne');
});
auditLogSchema.pre('deleteOne', function () {
  throwImmutabilityError('deleteOne');
});
auditLogSchema.pre('deleteMany', function () {
  throwImmutabilityError('deleteMany');
});
auditLogSchema.pre('findOneAndDelete', function () {
  throwImmutabilityError('findOneAndDelete');
});

auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(
      new Error('AUDIT_LOG_IMMUTABLE: Modification of existing AuditLog document is prohibited'),
    );
    return;
  }
  next();
});

export const AuditLogModel: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ||
  mongoose.model<AuditLogDoc>('AuditLog', auditLogSchema);
