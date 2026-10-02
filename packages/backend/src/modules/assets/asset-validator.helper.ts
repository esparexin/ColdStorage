import path from 'node:path';

export interface DetectedImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  format: 'png' | 'jpg' | 'webp';
}

/**
 * Validates image buffer using strict magic byte checks.
 * Prohibits SVGs, XML, HTML scripts, and non-whitelisted formats.
 */
export function detectAndValidateImageFormat(buffer: Buffer, originalname: string): DetectedImage {
  if (!buffer || buffer.length === 0) {
    throw new Error('INVALID_FILE: Empty file buffer');
  }

  if (buffer.length < 12) {
    throw new Error('INVALID_FILE: File is too small to be a valid image');
  }

  // Extension check
  const ext = path.extname(originalname).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  if (!allowedExtensions.includes(ext)) {
    throw new Error('UNSUPPORTED_FORMAT: Only PNG, JPEG, and WebP image formats are permitted');
  }

  // Reject SVG, XML, and HTML injection vectors
  const headerUtf8 = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').toLowerCase();
  if (
    headerUtf8.includes('<svg') ||
    headerUtf8.includes('<?xml') ||
    headerUtf8.includes('<!doctype html') ||
    headerUtf8.includes('<html') ||
    headerUtf8.includes('<script')
  ) {
    throw new Error('UNSUPPORTED_FORMAT: SVG, HTML, and XML formats are strictly prohibited');
  }

  // 1. PNG check: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (isPng) {
    return { mimeType: 'image/png', format: 'png' };
  }

  // 2. JPEG check: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) {
    return { mimeType: 'image/jpeg', format: 'jpg' };
  }

  // 3. WebP check: starts with 'RIFF' and bytes 8..11 are 'WEBP'
  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (isWebp) {
    return { mimeType: 'image/webp', format: 'webp' };
  }

  throw new Error('UNSUPPORTED_FORMAT: Only PNG, JPEG, and WebP image formats are permitted');
}
