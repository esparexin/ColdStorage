import { z } from 'zod';

/**
 * Frontend <-> Backend connectivity contract.
 *
 * This is the single shape both sides use to report whether the browser can reach the API and
 * whether the API can reach the datastore. It reports observed state only, so it never advertises
 * a capability the backend does not actually provide.
 */

/** Mongoose connection states, mirrored so the contract does not depend on mongoose. */
export const databaseStateSchema = z.enum([
  'connected',
  'connecting',
  'disconnected',
  'disconnecting',
  'unconfigured',
]);

export type DatabaseState = z.infer<typeof databaseStateSchema>;

export const healthResponseSchema = z.object({
  /** 'ok' only when the API process is serving and the datastore is connected. */
  status: z.enum(['ok', 'degraded']),
  service: z.literal('cold-storage-backend'),
  database: z.object({
    state: databaseStateSchema,
    /** True when a datastore URI is configured at all. */
    configured: z.boolean(),
    /** Active database name (no URI, no secrets) for operational verification. */
    name: z.string().nullable().optional(),
  }),
  /** ISO-8601 timestamp of the response. */
  checkedAt: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;