import { config } from '../../config.js';

/**
 * Off-site backup destination (BKP-02).
 *
 * Local encrypted archive is authoritative. Off-site (Google Drive per P0
 * Decision 7, or any S3-compatible provider via env) is attempted only when
 * BACKUP_OFFSITE_PROVIDER + BACKUP_OFFSITE_DESTINATION are set. Until
 * credentials are wired, status reports configured:false with a documented
 * gap instead of claiming success.
 */
export interface OffsiteUploadResult {
  attempted: boolean;
  uploaded: boolean;
  provider: string | null;
  error: string | null;
}

export function getOffsiteStatus(): {
  configured: boolean;
  provider: string | null;
  lastUploadedAt: Date | null;
  lastError: string | null;
} {
  const provider = config.backupOffsiteProvider?.trim() || null;
  const destination = config.backupOffsiteDestination?.trim() || null;
  return {
    configured: Boolean(provider && destination),
    provider,
    lastUploadedAt: lastUploadedAt,
    lastError: lastOffsiteError,
  };
}

let lastUploadedAt: Date | null = null;
let lastOffsiteError: string | null = null;

export async function tryOffsiteUpload(
  filename: string,
  content: Buffer,
): Promise<OffsiteUploadResult> {
  const { configured, provider } = getOffsiteStatus();
  void filename;
  void content;
  if (!configured) {
    return { attempted: false, uploaded: false, provider, error: 'OFFSITE_NOT_CONFIGURED' };
  }
  // Provider SDK wiring is intentionally deferred until hosting (Render vs
  // Railway) + Drive service-account approval. Record the attempt so
  // operators see a monitored failure instead of silence.
  lastOffsiteError = `OFFSITE_UPLOAD_DEFERRED: provider ${provider} has no SDK credentials in this build`;
  return { attempted: true, uploaded: false, provider, error: lastOffsiteError };
}

export function markOffsiteUploaded(): void {
  lastUploadedAt = new Date();
  lastOffsiteError = null;
}
