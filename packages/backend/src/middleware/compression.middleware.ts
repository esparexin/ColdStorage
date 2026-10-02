import type { NextFunction, Request, Response } from 'express';
import zlib from 'node:zlib';

/**
 * Response compression middleware.
 * Compresses JSON and text payloads > 1 KB using gzip encoding.
 * Explicitly bypasses streaming CSV export routes to preserve chunked backpressure.
 */
export function compressionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Explicit bypass for streaming CSV export endpoints
  if (req.path.includes('/export/')) {
    next();
    return;
  }

  // 2. Verify client accepts gzip encoding
  const acceptEncoding = req.headers['accept-encoding'];
  if (!acceptEncoding || typeof acceptEncoding !== 'string' || !acceptEncoding.includes('gzip')) {
    next();
    return;
  }

  const originalSend = res.send.bind(res);

  res.send = function (body: unknown): Response {
    if (res.headersSent) {
      return originalSend(body);
    }

    let payload: Buffer | null = null;
    const contentType = res.getHeader('content-type');

    if (typeof body === 'string') {
      payload = Buffer.from(body);
      if (!contentType) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
    } else if (Buffer.isBuffer(body)) {
      payload = body;
    } else if (body !== null && typeof body === 'object') {
      const jsonStr = JSON.stringify(body);
      payload = Buffer.from(jsonStr);
      if (!contentType) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    }

    if (payload && payload.length > 1024) {
      try {
        const compressed = zlib.gzipSync(payload);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.removeHeader('Content-Length');
        return originalSend(compressed);
      } catch {
        return originalSend(body);
      }
    }

    return originalSend(body);
  };

  next();
}
