import type { ErrorCode, ValidationDetails } from '@cold-storage/contracts';

export interface ParsedApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ParsedApiError {
  ok: false;
  status: number;
  error: string;
  code?: ErrorCode;
  details?: ValidationDetails;
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

export type ParsedApiResponse<T> = ParsedApiSuccess<T> | ParsedApiError;

/**
 * Safely parses any fetch Response (from requestWithAuth or direct fetch),
 * handling JSON syntax errors, proxy HTML responses, and unpacking
 * structured validation fieldErrors and error codes.
 */
export async function parseApiResponse<T = unknown>(res: Response): Promise<ParsedApiResponse<T>> {
  let body: unknown = null;
  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  }

  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      data: (body ?? {}) as T,
    };
  }

  const errObj = (typeof body === 'object' && body !== null ? body : {}) as {
    error?: string;
    code?: ErrorCode;
    details?: {
      fieldErrors?: Record<string, string[]>;
      formErrors?: string[];
    };
  };

  const status = res.status;
  let fallbackMessage = `Request failed with HTTP ${status}`;
  if (status === 401) fallbackMessage = 'Session expired or unauthorized. Please log in again.';
  else if (status === 403) fallbackMessage = 'You do not have permission to perform this action.';
  else if (status === 404) fallbackMessage = 'The requested resource was not found.';
  else if (status === 409) fallbackMessage = 'A conflicting record already exists.';
  else if (status >= 500) fallbackMessage = 'Server is temporarily unavailable. Please try again later.';

  const error =
    typeof errObj.error === 'string' && errObj.error.trim().length > 0
      ? errObj.error
      : fallbackMessage;

  const fieldErrors = errObj.details?.fieldErrors;
  const formErrors = errObj.details?.formErrors;

  return {
    ok: false,
    status,
    error,
    code: errObj.code,
    details: errObj.details
      ? { fieldErrors: fieldErrors ?? {}, formErrors: formErrors ?? [] }
      : undefined,
    fieldErrors,
    formErrors,
  };
}

/**
 * Extracts a user-facing formatted message from an API error response.
 * If validation field errors exist, formats them legibly: "Error: field: msg1 | field2: msg2".
 */
export function formatApiErrorMessage(err: ParsedApiError): string {
  if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
    const lines = Object.entries(err.fieldErrors).map(
      ([field, msgs]) => `${field}: ${msgs.join(', ')}`,
    );
    return `${err.error}: ${lines.join(' | ')}`;
  }
  if (err.formErrors && err.formErrors.length > 0) {
    return `${err.error}: ${err.formErrors.join(' | ')}`;
  }
  return err.error;
}
