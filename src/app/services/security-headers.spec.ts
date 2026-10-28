import type { NextFunction, Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { securityHeaders } from './security-headers';

/** Normaliza una cabecera CSP para poder compararla sin depender del orden. */
const normalizeCsp = (csp: string): string =>
  csp
    .split(';')
    .map((directive) => directive.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort()
    .join('; ');

/**
 * Extrae el valor de la cabecera CSP declarada en `render.yaml`.
 *
 * En el YAML la cabecera usa el bloque escalado `value: >-`, así que las
 * líneas se unen con espacios (bloque plegado). Se recogen todas las líneas
 * más indentadas que la de `value:`.
 */
const extractCspFromRenderYaml = (yaml: string): string => {
  const lines = yaml.split(/\r?\n/);
  const nameIndex = lines.findIndex((line) =>
    line.trim() === 'name: Content-Security-Policy',
  );
  expect(nameIndex, 'render.yaml debe declarar la cabecera CSP').toBeGreaterThan(-1);

  const valueIndex = lines.findIndex(
    (line, index) => index > nameIndex && line.includes('value:'),
  );
  expect(valueIndex, 'render.yaml debe declarar el valor de la CSP').toBeGreaterThan(-1);

  const baseIndent = lines[valueIndex].search(/\S/);
  const collected: string[] = [];
  for (let index = valueIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.search(/\S/) <= baseIndent) break;
    collected.push(line.trim());
  }
  return collected.join(' ');
};

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

  it('allows the Stripe origins that Stripe.js actually needs', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;

    securityHeaders({} as Request, response, vi.fn() as unknown as NextFunction);

    const csp = headers.get('Content-Security-Policy') ?? '';

    // https://docs.stripe.com/security/guide
    expect(csp).toContain('https://js.stripe.com');
    // Stripe recomienda `*.js.stripe.com` para poder arrancar frames en otros orígenes.
    expect(csp).toContain('https://*.js.stripe.com');
    // Payment Element y challenge 3-D Secure.
    expect(csp).toContain('https://hooks.stripe.com');
    // Origen al que Stripe.js hace XHR.
    expect(csp).toContain('https://q.stripe.com');
    expect(csp).toContain('https://api.stripe.com');
  });

  it('does not open the policy to any origin', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;

    securityHeaders({} as Request, response, vi.fn() as unknown as NextFunction);

    const csp = headers.get('Content-Security-Policy') ?? '';
    const directives = Object.fromEntries(
      csp
        .split(';')
        .map((directive) => directive.trim().split(/\s+/))
        .filter((parts) => parts.length > 0)
        .map((parts) => [parts[0], parts.slice(1)]),
    );

    expect(directives['script-src']).not.toContain('https:');
    expect(directives['connect-src']).not.toContain('https:');
    expect(directives['frame-src']).not.toContain('https:');
    expect(directives['default-src']).not.toContain('https:');
  });

  it('keeps render.yaml in sync with the CSP of the SSR server', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;

    securityHeaders({} as Request, response, vi.fn() as unknown as NextFunction);

    const yaml = readFileSync(resolve(process.cwd(), 'render.yaml'), 'utf8');
    const yamlCsp = extractCspFromRenderYaml(yaml);

    expect(yamlCsp.length).toBeGreaterThan(0);
    expect(normalizeCsp(yamlCsp)).toBe(
      normalizeCsp(headers.get('Content-Security-Policy') ?? ''),
    );
  });
});
