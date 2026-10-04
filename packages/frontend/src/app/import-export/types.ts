/**
 * Import responses are the canonical server contract; the local
 * ImportSummaryResult shape that predated it never matched the API.
 */
export type { ImportSummary as ImportSummaryResult } from '@cold-storage/contracts';