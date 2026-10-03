/**
 * Canonical server-side logging entry point.
 *
 * Raw `console.*` calls were previously spread across the codebase and the architecture
 * boundary rule only policed `src/modules`, which let a bare `console.log` survive in the
 * process entry point. All process-level logging now goes through this module so the output
 * shape is uniform and the boundary rule can forbid `console.*` across the whole of `src`.
 */

type LogFields = Record<string, unknown>;

function emit(stream: 'log' | 'warn' | 'error', message: string, fields?: LogFields): void {
  const payload = {
    level: stream,
    time: new Date().toISOString(),
    message,
    ...(fields ?? {}),
  };
  console[stream](JSON.stringify(payload));
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('log', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};