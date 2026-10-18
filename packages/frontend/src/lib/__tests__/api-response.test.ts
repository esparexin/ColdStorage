import { describe, expect, it } from 'vitest';
import { formatApiErrorMessage, parseApiResponse } from '../api-response';

describe('Frontend API Response & Error Parser SSOT', () => {
  it('parses successful 200 JSON responses', async () => {
    const mockRes = new Response(JSON.stringify({ id: 'grn-1', bags: 100 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const parsed = await parseApiResponse<{ id: string; bags: number }>(mockRes);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.status).toBe(200);
      expect(parsed.data.id).toBe('grn-1');
      expect(parsed.data.bags).toBe(100);
    }
  });

  it('handles non-JSON HTML 502/504 responses safely without throwing SyntaxError', async () => {
    const mockRes = new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });

    const parsed = await parseApiResponse(mockRes);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.status).toBe(502);
      expect(parsed.error).toContain('Server is temporarily unavailable');
    }
  });

  it('extracts error message, code, and structured Zod fieldErrors from 400 responses', async () => {
    const mockRes = new Response(
      JSON.stringify({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: {
          fieldErrors: {
            chamber: ['Chamber is required'],
            bags: ['Bags must be a positive integer'],
          },
          formErrors: [],
        },
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const parsed = await parseApiResponse(mockRes);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.status).toBe(400);
      expect(parsed.error).toBe('Validation failed');
      expect(parsed.code).toBe('VALIDATION_ERROR');
      expect(parsed.fieldErrors?.chamber).toContain('Chamber is required');
      expect(parsed.fieldErrors?.bags).toContain('Bags must be a positive integer');

      const formatted = formatApiErrorMessage(parsed);
      expect(formatted).toContain('chamber: Chamber is required');
      expect(formatted).toContain('bags: Bags must be a positive integer');
    }
  });

  it('formats fallback messages for 401, 403, 404, and 409 when body is empty', async () => {
    const notFoundRes = new Response(JSON.stringify({}), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });

    const parsed404 = await parseApiResponse(notFoundRes);
    expect(parsed404.ok).toBe(false);
    if (!parsed404.ok) {
      expect(parsed404.error).toBe('The requested resource was not found.');
    }

    const conflictRes = new Response(JSON.stringify({}), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });

    const parsed409 = await parseApiResponse(conflictRes);
    expect(parsed409.ok).toBe(false);
    if (!parsed409.ok) {
      expect(parsed409.error).toBe('A conflicting record already exists.');
    }
  });
});
