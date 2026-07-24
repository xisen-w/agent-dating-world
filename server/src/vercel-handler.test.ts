import assert from 'node:assert/strict';
import test from 'node:test';
import { handler, resolveRequestUrl } from '../../api/handler.js';

test('Vercel relative request URLs resolve against the configured public origin', () => {
  const url = resolveRequestUrl('/api/health?__route=%2Fapi%2Fhealth&path=health');

  assert.equal(url.pathname, '/api/health');
  assert.equal(url.searchParams.get('__route'), '/api/health');
});

test('Vercel relative requests reach the intended Hono route', async () => {
  const request = new Request('https://example.test/api/handler?__route=%2Fapi%2Fhealth');
  Object.defineProperty(request, 'url', {
    value: '/api/handler?__route=%2Fapi%2Fhealth&path=health',
  });

  const response = await handler(request);
  const payload = (await response.json()) as { ok?: boolean };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
});
