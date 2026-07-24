import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRequestUrl } from '../../api/handler.js';

test('Vercel relative request URLs resolve against the configured public origin', () => {
  const url = resolveRequestUrl('/api/health?__route=%2Fapi%2Fhealth&path=health');

  assert.equal(url.pathname, '/api/health');
  assert.equal(url.searchParams.get('__route'), '/api/health');
});
