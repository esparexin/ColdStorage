'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, DataTable, type DataTableColumn } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { ERROR_TITLES, LOADING_LABELS } from '@/components/ui/stateCopy';
import styles from './ConnectivitySection.module.css';

/**
 * Connectivity probe for the administration UI.
 *
 * Reports the browser's resolved API base URL and the observed result of the backend's
 * `/api/health` endpoint. It deliberately does not create a second health mechanism: the
 * endpoint, the wire shape and the state vocabulary are all owned by the backend and
 * `@cold-storage/contracts`.
 */

interface ConnectivityRow {
  label: string;
  value: string;
  state: 'ok' | 'fail';
}

interface ConnectivityState {
  rows: ConnectivityRow[];
  checkedAt: string | null;
  error: string | null;
  checking: boolean;
}

/** Same-origin relative paths: the browser talks to the Next.js rewrite, which proxies to the API. */
function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') return 'same-origin (/api)';
  return `${window.location.origin}/api`;
}

export function ConnectivitySection() {
  const [state, setState] = useState<ConnectivityState>({
    rows: [],
    checkedAt: null,
    error: null,
    checking: true,
  });

  const check = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));
    const apiBaseUrl = resolveApiBaseUrl();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}/health`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } finally {
        clearTimeout(timeout);
      }

      const body = (await response.json()) as {
        status?: string;
        service?: string;
        database?: { state?: string; configured?: boolean };
        checkedAt?: string;
      };

      const reachable = response.ok;
      setState({
        rows: [
          { label: 'API base URL', value: apiBaseUrl, state: 'ok' },
          {
            label: 'API reachable',
            value: reachable ? `HTTP ${response.status}` : `HTTP ${response.status}`,
            state: reachable ? 'ok' : 'fail',
          },
          {
            label: 'Service',
            value: body.service ?? 'unreported',
            state: body.service ? 'ok' : 'fail',
          },
          {
            label: 'Database',
            value: body.database?.configured
              ? (body.database.state ?? 'unknown')
              : 'not configured',
            state: body.database?.state === 'connected' ? 'ok' : 'fail',
          },
        ],
        checkedAt: body.checkedAt ?? new Date().toISOString(),
        error: null,
        checking: false,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Request timed out after 8s'
          : err instanceof Error
            ? err.message
            : 'Network request failed';
      setState({
        rows: [{ label: 'API base URL', value: apiBaseUrl, state: 'ok' }],
        checkedAt: null,
        error: message,
        checking: false,
      });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const columns: DataTableColumn<ConnectivityRow>[] = [
    { key: 'label', header: 'Check', render: (row) => row.label },
    {
      key: 'value',
      header: 'Result',
      render: (row) => (
        <span className={row.state === 'ok' ? styles.valueOk : styles.valueFail}>{row.value}</span>
      ),
    },
  ];

  return (
    <Card aria-labelledby="connectivity-heading">
      <div className={styles.header}>
        <h2 id="connectivity-heading" className={styles.title}>
          Connectivity
        </h2>
        <Button
          id="check-connectivity-btn"
          variant="outline"
          size="sm"
          onClick={() => void check()}
          disabled={state.checking}
          isLoading={state.checking}
        >
          {state.checking ? LOADING_LABELS.connectivity : 'Check Connection'}
        </Button>
      </div>

      {state.error ? (
        <FeedbackStates.Error
          title={ERROR_TITLES.connectivity}
          message={`${state.error}. Confirm the backend is running and that BACKEND_URL points at it.`}
          onRetry={() => void check()}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={state.rows}
          rowKey={(row) => row.label}
          caption="Frontend to Backend connectivity"
        />
      )}

      {state.checkedAt && (
        <p className={styles.checkedAt}>Last checked {new Date(state.checkedAt).toLocaleTimeString()}</p>
      )}
    </Card>
  );
}