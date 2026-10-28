import type { NextFunction, Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { securityHeaders } from './security-headers';

/**
 * Extrae el valor de una cabecera declarada en `render.yaml`.
 *
 * En el YAML la cabecera puede usar el bloque escalado `value: >-` (las
 * líneas se unen con espacios) o un valor en la misma línea
 * (`value: "camera=(), ..."`). Se soportan las dos formas.
 */
const extractHeaderFromRenderYaml = (yaml: string, headerName: string): string => {
  const lines = yaml.split(/\r?\n/);
  const nameIndex = lines.findIndex((line) => line.trim() === `name: ${headerName}`);
  expect(nameIndex, `render.yaml debe declarar la cabecera ${headerName}`).toBeGreaterThan(-1);

  const valueIndex = lines.findIndex(
    (line, index) => index > nameIndex && line.includes('value:'),
  );
  expect(valueIndex, `render.yaml debe declarar el valor de ${headerName}`).toBeGreaterThan(-1);

  const valueLine = lines[valueIndex];
  const inlineValue = valueLine.slice(valueLine.indexOf('value:') + 'value:'.length).trim();

  // `value: >-` (o `|`, `>-2`…) es un escalar de bloque: su contenido son las
  // líneas siguientes, más indentadas.
  const isBlockScalar = /^[>|][-+]?\d*$/.test(inlineValue);
  if (inlineValue && !isBlockScalar) {
    return inlineValue.replace(/^["']|["']$/g, '');
  }

  const baseIndent = valueLine.search(/\S/);
  const collected: string[] = [];
  for (let index = valueIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.search(/\S/) <= baseIndent) break;
    collected.push(line.trim());
  }
  return collected.join(' ');
};

/** Normaliza una cabecera CSP para poder compararla sin depender del orden. */
const normalizeCsp = (csp: string): string =>
  csp
    .split(';')
    .map((directive) => directive.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort()
    .join('; ');

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

  it('blocks inline scripts and inline event handlers', () => {
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

    // Sin `'unsafe-inline'` los `<script>` inline del HTML quedan bloqueados:
    // por eso el build no puede emitir el script de critical CSS (Beasties).
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    // `script-src-attr 'none'` bloquea los handlers en atributos (`onerror=…`).
    expect(directives['script-src-attr']).toEqual(["'none'"]);
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
    const yamlCsp = extractHeaderFromRenderYaml(yaml, 'Content-Security-Policy');

    expect(yamlCsp.length).toBeGreaterThan(0);
    expect(normalizeCsp(yamlCsp)).toBe(
      normalizeCsp(headers.get('Content-Security-Policy') ?? ''),
    );
  });

  it('keeps render.yaml in sync with the Permissions-Policy of the SSR server', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;

    securityHeaders({} as Request, response, vi.fn() as unknown as NextFunction);

    const yaml = readFileSync(resolve(process.cwd(), 'render.yaml'), 'utf8');
    const yamlPolicy = extractHeaderFromRenderYaml(yaml, 'Permissions-Policy');

    expect(yamlPolicy.length).toBeGreaterThan(0);
    expect(yamlPolicy).toBe(headers.get('Permissions-Policy') ?? '');
  });
});
