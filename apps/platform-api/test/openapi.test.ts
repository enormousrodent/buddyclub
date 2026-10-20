import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

describe('OpenAPI document', () => {
  it('describes /v1/me as bearer-protected with 200 and 401 responses', async () => {
    const { app } = await createTestApp();
    const doc = app.swagger() as unknown as {
      openapi: string;
      paths: Record<
        string,
        Record<string, { security?: unknown[]; responses: Record<string, unknown> }>
      >;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.securitySchemes['bearerAuth']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });

    const me = doc.paths['/v1/me']?.['get'];
    expect(me).toBeDefined();
    expect(me?.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(me?.responses ?? {})).toEqual(expect.arrayContaining(['200', '401']));

    expect(doc.paths['/healthz']?.['get']).toBeDefined();
    expect(doc.paths['/readyz']?.['get']).toBeDefined();
    await app.close();
  });

  it('serves the JSON document in non-production environments', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().info.title).toBe('Buddy Club Platform API');
    await app.close();
  });
});
