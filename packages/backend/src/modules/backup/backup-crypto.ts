import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../../config.js';

/**
 * Reports whether a usable encryption key is present, without throwing. Used by the status
 * projection so the UI can disable backup actions instead of surfacing a configuration failure.
 */
export function isEncryptionKeyConfigured(overrideKey?: string): boolean {
  const rawKey = overrideKey ?? config.backupEncryptionKey ?? '';
  return /^[0-9a-fA-F]{64}$/.test(rawKey.trim());
}

/**
 * Validates that the backup encryption key is configured and formatted as exactly 64 hex chars
 * (32 bytes). The key is read from the canonical configuration singleton; `overrideKey` exists
 * for tests and for callers that supply a key explicitly.
 */
export function getValidEncryptionKey(overrideKey?: string): Buffer {
  const rawKey = overrideKey ?? config.backupEncryptionKey ?? '';
  const trimmed = rawKey.trim();

  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      'BACKUP_KEY_INVALID: BACKUP_ENCRYPTION_KEY environment variable must be a 64-character hexadecimal string',
    );
  }

  return Buffer.from(trimmed, 'hex');
}

/**
 * Encrypts payload with AES-256-GCM.
 * Output format: [IV (12 bytes)][AuthTag (16 bytes)][Ciphertext]
 */
export function encryptBackupPayload(
  plainTextBuffer: Buffer,
  keyBuffer: Buffer,
): { finalArchive: Buffer; checksum: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);

  const encryptedData = Buffer.concat([cipher.update(plainTextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const finalArchive = Buffer.concat([iv, authTag, encryptedData]);
  const checksum = createHash('sha256').update(finalArchive).digest('hex');

  return { finalArchive, checksum };
}

/**
 * Decrypts and verifies a generated backup archive (for testing and restoration).
 */
export function decryptBackupArchive(
  archiveBuffer: Buffer,
  keyHex: string,
): Record<string, unknown> {
  const key = Buffer.from(keyHex.trim(), 'hex');
  if (key.length !== 32) {
    throw new Error('BACKUP_KEY_INVALID: Master decryption key must be 32 bytes');
  }

  if (archiveBuffer.length < 28) {
    throw new Error('ARCHIVE_CORRUPTED: Buffer too small to contain IV and AuthTag');
  }

  const iv = archiveBuffer.subarray(0, 12);
  const authTag = archiveBuffer.subarray(12, 28);
  const ciphertext = archiveBuffer.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
