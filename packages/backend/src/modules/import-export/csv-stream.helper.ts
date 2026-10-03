import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import type { ExportDateRangeQuery } from '@cold-storage/contracts';
import { CsvSerializer } from './csv.serializer.js';

export function buildDateFilter(
  dateField: string,
  query: ExportDateRangeQuery,
): Record<string, unknown> {
  const from = query.from;
  const to = query.to;

  if (!from && !to) {
    return {};
  }

  const fromDate = from ? new Date(`${from}T00:00:00.000+05:30`) : undefined;
  const toDate = to ? new Date(`${to}T00:00:00.000+05:30`) : undefined;

  if (fromDate && toDate) {
    if (fromDate >= toDate) {
      throw new Error("INVALID_DATE_RANGE: 'from' date must be strictly earlier than 'to' date");
    }
    return { [dateField]: { $gte: fromDate, $lt: toDate } };
  }

  if (fromDate) {
    return { [dateField]: { $gte: fromDate } };
  }

  if (toDate) {
    return { [dateField]: { $lt: toDate } };
  }

  return {};
}


/**
 * Pipes a Mongoose cursor through CsvSerializer to Express response with backpressure,
 * client-disconnect cleanup, and error handling without buffering.
 */
export async function streamCursor<T>(
  cursor: AsyncIterable<T> & { close: () => Promise<void> },
  headers: string[],
  mapDocToCells: (doc: T) => unknown[],
  res: Response,
  filename: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Transfer-Encoding', 'chunked');

  let headerWritten = false;
  const transform = new Transform({
    objectMode: true,
    transform(doc: T, _encoding, callback) {
      let chunk = '';
      if (!headerWritten) {
        chunk += CsvSerializer.serializeRow(headers);
        headerWritten = true;
      }
      chunk += CsvSerializer.serializeRow(mapDocToCells(doc));
      callback(null, chunk);
    },
    flush(callback) {
      if (!headerWritten) {
        this.push(CsvSerializer.serializeRow(headers));
      }
      callback();
    },
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      cursor.close().catch(() => {});
      transform.destroy();
    }
  });

  try {
    await pipeline(cursor, transform, res);
  } catch (err: unknown) {
    if (!res.headersSent) {
      throw err;
    }
    res.destroy();
  }
}
