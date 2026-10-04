import type { NextFunction, Request, Response } from 'express';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';

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

  // Already-compressed payloads (e.g. a PNG served from the asset route) must not
  // be gzipped again; that costs CPU and grows the response.
  const contentEncoding = res.getHeader('Content-Encoding');
  if (typeof contentEncoding === 'string' && contentEncoding !== 'identity') {
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
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.removeHeader('Content-Length');

      // Stream the compression instead of gzipSync. The synchronous variant
      // blocks the event loop for the whole payload, so a burst of concurrent
      // responses queued behind each other instead of being served in parallel.
      const gzip = zlib.createGzip();
      gzip.on('error', () => {
        // The response is already committed; the client sees a truncated body,
        // which is preferable to an unhandled stream error taking down the process.
        res.destroy();
      });
      pipeline(gzip, res, () => {
        /* completion and teardown are handled by the pipeline */
      });
      gzip.end(payload);
      return res;
    }

    return originalSend(body);
  };

  next();
}