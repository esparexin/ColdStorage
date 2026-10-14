import { describe, expect, it } from 'vitest';
import { formatCountdown, LoginApiError, parseLoginResponse } from '../auth-errors';

describe('formatCountdown', () => {
  it('formats seconds under one minute', () => {
    expect(formatCountdown(0)).toBe('0s');
    expect(formatCountdown(5)).toBe('5s');
    expect(formatCountdown(59)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatCountdown(60)).toBe('1m 00s');
    expect(formatCountdown(65)).toBe('1m 05s');
    expect(formatCountdown(840)).toBe('14m 00s');
    expect(formatCountdown(863)).toBe('14m 23s');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatCountdown(3600)).toBe('1h 00m 00s');
    expect(formatCountdown(3665)).toBe('1h 01m 05s');
  });

  it('handles negative or decimal values safely', () => {
    expect(formatCountdown(-10)).toBe('0s');
    expect(formatCountdown(45.9)).toBe('45s');
  });
});

describe('parseLoginResponse', () => {
  it('returns token and user on 200 OK', async () => {
    const mockRes = new Response(
      JSON.stringify({
        token: 'mock-jwt-token',
        user: { userId: 'u1', username: 'admin' },
        mustChangePassword: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const result = await parseLoginResponse(mockRes);
    expect(result.token).toBe('mock-jwt-token');
    expect(result.user).toEqual({ userId: 'u1', username: 'admin' });
    expect(result.mustChangePassword).toBe(false);
  });

  it('throws LoginApiError with countdown on 429 using JSON body', async () => {
    const mockRes = new Response(
      JSON.stringify({
        error: 'TOO_MANY_REQUESTS: Rate limit exceeded',
        retryAfterSeconds: 840,
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );

    await expect(parseLoginResponse(mockRes)).rejects.toThrow(LoginApiError);
    try {
      await parseLoginResponse(
        new Response(
          JSON.stringify({ retryAfterSeconds: 120 }),
          { status: 429 },
        ),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LoginApiError);
      const apiErr = err as LoginApiError;
      expect(apiErr.statusCode).toBe(429);
      expect(apiErr.retryAfterSeconds).toBe(120);
      expect(apiErr.isRateLimit).toBe(true);
      expect(apiErr.message).toContain('2m 00s');
    }
  });

  it('throws LoginApiError with countdown on 429 using Retry-After header', async () => {
    const mockRes = new Response(
      'Rate limit exceeded',
      { status: 429, headers: { 'Retry-After': '90' } },
    );

    try {
      await parseLoginResponse(mockRes);
    } catch (err) {
      expect(err).toBeInstanceOf(LoginApiError);
      const apiErr = err as LoginApiError;
      expect(apiErr.statusCode).toBe(429);
      expect(apiErr.retryAfterSeconds).toBe(90);
      expect(apiErr.message).toContain('1m 30s');
    }
  });

  it('throws friendly message on 401 with custom error', async () => {
    const mockRes = new Response(
      JSON.stringify({ error: 'Invalid credentials provided' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );

    try {
      await parseLoginResponse(mockRes);
    } catch (err) {
      expect(err).toBeInstanceOf(LoginApiError);
      const apiErr = err as LoginApiError;
      expect(apiErr.statusCode).toBe(401);
      expect(apiErr.message).toBe('Invalid credentials provided');
    }
  });

  it('throws friendly message on 502 HTML without SyntaxError crash', async () => {
    const mockRes = new Response(
      '<html><body><h1>502 Bad Gateway</h1></body></html>',
      { status: 502, headers: { 'Content-Type': 'text/html' } },
    );

    try {
      await parseLoginResponse(mockRes);
    } catch (err) {
      expect(err).toBeInstanceOf(LoginApiError);
      const apiErr = err as LoginApiError;
      expect(apiErr.statusCode).toBe(502);
      expect(apiErr.message).toContain('Server is temporarily starting up or unavailable');
    }
  });
});
