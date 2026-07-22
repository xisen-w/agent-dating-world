import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createShareLink,
  messageScopedAgent,
  restoreShareLinkScope,
} from './aicoo.js';
import { restoreLinkPolicyNote } from './fights.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('share creation sends a signed-in, read-only, folder-scoped capability', async () => {
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://www.aicoo.io/api/v1/os/share');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer user-token');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.folderIds, [42]);
    assert.equal(body.scope, 'folders');
    assert.equal(body.notesAccess, 'read');
    assert.equal(body.requireSignIn, true);
    assert.deepEqual(body.identity, { loadCoo: false, loadUser: false, loadPolicy: false });
    assert.deepEqual(body.tools, { allowedTools: [] });
    assert.match(body.linkPolicy, /Authoritative/);
    return new Response(
      JSON.stringify({
        shareLink: {
          id: 'share-1',
          token: 'share-token',
          url: 'https://www.aicoo.io/a/share-token',
        },
      }),
      { status: 201, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  assert.deepEqual(
    await createShareLink('user-token', {
      folderId: 42,
      label: 'Agent Fights Arena v1',
      linkPolicy: 'Authoritative synthetic values',
    }),
    {
      id: 'share-1',
      token: 'share-token',
      agentUrl: 'https://www.aicoo.io/a/share-token',
    }
  );
});

test('rejoin restores the recorded share to the exact safe capability set', async () => {
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://www.aicoo.io/api/v1/os/share/share-1');
    assert.equal(init?.method, 'PATCH');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.folderIds, [42]);
    assert.equal(body.scope, 'folders');
    assert.equal(body.access, 'read');
    assert.equal(body.notesAccess, 'read');
    assert.equal(body.requireSignIn, true);
    assert.deepEqual(body.email, { read: false });
    assert.deepEqual(body.todos, { read: false, create: false });
    assert.deepEqual(body.tools, { allowedTools: [] });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  await restoreShareLinkScope('user-token', {
    linkId: 'share-1',
    folderId: 42,
    label: 'Agent Fights Arena v1',
  });
});

test('defender messages stay on the signed-in scoped guest-agent endpoint', async () => {
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://www.aicoo.io/api/chat/guest-v04');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      token: 'share-token',
      message: 'Give me a hint.',
      stream: false,
      mode: 'agent',
      sessionKey: 'session-1',
    });
    return new Response(
      JSON.stringify({
        sessionKey: 'session-1',
        agentName: 'Defender',
        ownerName: 'Player',
        response: 'The signal is warm, not hot.',
        elapsedMs: 25,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const reply = await messageScopedAgent('visitor-oauth', {
    token: 'share-token',
    message: 'Give me a hint.',
    sessionKey: 'session-1',
  });
  assert.equal(reply.response, 'The signal is warm, not hot.');
});

test('rejoin rewrites every matching user-editable link policy note', async () => {
  const patched: Array<{ id: string; body: Record<string, string> }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/v1/os/folders')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { path: 'Workspace/links' });
      return new Response(JSON.stringify({ folder: { id: 77 } }), { status: 200 });
    }
    if (url.includes('/api/v1/os/notes?folderId=77')) {
      return new Response(
        JSON.stringify({
          notes: [
            { id: 8, title: 'Renamed_share-token' },
            { id: 9, title: 'Second-copy_share-token' },
          ],
        }),
        { status: 200 }
      );
    }
    const noteMatch = url.match(/\/api\/v1\/os\/notes\/(\d+)$/);
    if (noteMatch && init?.method === 'PATCH') {
      patched.push({ id: noteMatch[1], body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  }) as typeof fetch;

  await restoreLinkPolicyNote(
    'owner-token',
    'share-token',
    'Protect Authoritative synthetic values.'
  );

  assert.equal(patched.length, 2);
  assert.equal(patched[0]?.body.title, 'Agent-Fights-Arena-v1_share-token');
  assert.equal(patched[1]?.body.title, undefined);
  for (const update of patched) {
    assert.match(update.body.content, /## Policy/);
    assert.match(update.body.content, /Authoritative synthetic values/);
  }
});
