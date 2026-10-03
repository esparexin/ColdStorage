import { Writable } from 'node:stream';
import type { Response } from 'express';

/**
 * Shared response double for the export streaming tests.
 *
 * Exports write straight to the Express response through `streamCursor`, so the tests need a real
 * Writable that records headers and chunks instead of an Express app. One `MockResponse` per
 * export keeps every suite asserting against the same serialization.
 */

export class MockResponse extends Writable {
  public headers: Record<string, string> = {};
  public body = '';
  public destroyed = false;
  public headersSent = false;
  public writableEnded = false;

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
    this.headersSent = true;
  }

  public override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.body += String(chunk);
    callback();
  }

  public override end(cb?: () => void): this {
    this.writableEnded = true;
    super.end(cb);
    return this;
  }

  public override destroy(error?: Error): this {
    this.destroyed = true;
    super.destroy(error);
    return this;
  }
}

export interface CsvCapture {
  headers: Record<string, string>;
  body: string;
  /** Every non-empty CSV line, header row included. */
  rows: string[];
  /** The header row split into column names. */
  header: string[];
}

/** Runs one export against a fresh MockResponse and captures what was streamed. */
export async function captureCsv(run: (res: Response) => Promise<void>): Promise<CsvCapture> {
  const mock = new MockResponse();
  await run(mock as unknown as Response);
  const rows = mock.body.split('\r\n').filter((line) => line.length > 0);
  return { headers: mock.headers, body: mock.body, rows, header: (rows[0] ?? '').split(',') };
}
