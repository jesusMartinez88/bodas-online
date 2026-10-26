import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { securityHeaders } from './security-headers';

describe('security headers policy', () => {
  it('sets browser hardening headers on every response', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    securityHeaders({} as Request, response, next);

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('microphone=()');
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(headers.get('Content-Security-Policy')).toContain(
      'https://boda-backend-4e6z.onrender.com',
    );
    expect(headers.get('Content-Security-Policy')).not.toContain('http://localhost:3000');
    expect(next).toHaveBeenCalledOnce();
  });
});
