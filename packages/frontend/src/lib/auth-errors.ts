/**
 * Structured error class representing authentication API failures.
 */
export class LoginApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'LoginApiError';
  }

  get isRateLimit(): boolean {
    return this.statusCode === 429;
  }
}

/**
 * Formats a duration in seconds into a friendly human countdown: e.g. "14m 20s" or "45s".
 */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export interface LoginSuccessPayload<T = unknown> {
  token: string;
  user: T;
  mustChangePassword?: boolean;
}

/**
 * Safely parses the login response, converting non-200 statuses (401, 429, 502, etc.)
 * into friendly typed LoginApiErrors.
 */
export async function parseLoginResponse<T = unknown>(
  res: Response,
): Promise<LoginSuccessPayload<T>> {
  if (res.ok) {
    const data = (await res.json()) as {
      token?: string;
      accessToken?: string;
      user: T;
      mustChangePassword?: boolean;
    };
    const token = data.token ?? data.accessToken ?? '';
    return {
      token,
      user: data.user,
      mustChangePassword: data.mustChangePassword,
    };
  }

  let bodyError: string | undefined;
  let bodyRetryAfter: number | undefined;

  try {
    const body = (await res.json()) as { error?: string; retryAfterSeconds?: number };
    if (body && typeof body.error === 'string') {
      bodyError = body.error;
    }
    if (body && typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0) {
      bodyRetryAfter = body.retryAfterSeconds;
    }
  } catch {
    // Non-JSON response (e.g. HTML 502/503 from reverse proxy)
  }

  if (res.status === 429) {
    let retryAfter = bodyRetryAfter;
    if (!retryAfter) {
      const headerVal = res.headers.get('Retry-After');
      if (headerVal) {
        const parsed = parseInt(headerVal, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          retryAfter = parsed;
        }
      }
    }
    const safeRetry = retryAfter ?? 60;
    const msg = `Too many login attempts. Please wait ${formatCountdown(safeRetry)} before trying again.`;
    throw new LoginApiError(msg, 429, safeRetry);
  }

  if (res.status === 401) {
    const msg = bodyError ?? 'Invalid username or password. Please try again.';
    throw new LoginApiError(msg, 401);
  }

  if (res.status === 400) {
    const msg = bodyError ?? 'Please enter a valid username and password.';
    throw new LoginApiError(msg, 400);
  }

  if (res.status >= 500) {
    throw new LoginApiError(
      'Server is temporarily starting up or unavailable. Please wait a moment and try again.',
      res.status,
    );
  }

  throw new LoginApiError(bodyError ?? 'Login failed. Please try again.', res.status);
}
