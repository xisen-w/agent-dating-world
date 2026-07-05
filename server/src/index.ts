/**
 * Aicoo Dating World BFF.
 *
 * Zero own database, zero new agents: the town's residents are the users'
 * real Aicoo COOs. Identity comes from "Login with Aicoo" (OAuth) or a
 * pasted Aicoo API key; all persistence is Aicoo notes/snapshots; hangouts
 * run COO-to-COO over Aicoo's own /v1/chat + /v1/agent/message.
 * See ../../BACKEND_PLAN.md.
 */
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { randomBytes } from 'node:crypto';
import { AicooError, getIdentity } from './aicoo.js';
import { config } from './config.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserInfo,
  makePkcePair,
  refreshTokens,
} from './oauth.js';
import {
  clearSession,
  consumeFlowState,
  getSession,
  setFlowState,
  setSession,
  type Session,
} from './session.js';
import { getDyad, listDyads, runHangout } from './hangouts.js';
import { getWorldSummary, joinWorld, tickWorld } from './world.js';

const app = new Hono();

app.use('*', cors({ origin: config.spaUrl, credentials: true }));

// ─── Session credential resolution (with silent refresh) ───────────

async function resolveBearer(c: Context): Promise<{
  bearer: string;
  session: Session;
} | null> {
  const session = await getSession(c);
  if (!session) return null;

  if (session.authType === 'api-key' && session.apiKey) {
    return { bearer: session.apiKey, session };
  }

  if (session.authType === 'oauth' && session.accessToken) {
    // 15-minute access tokens: refresh when within 60s of expiry.
    const stale =
      !session.accessTokenExpiresAt || session.accessTokenExpiresAt - Date.now() < 60_000;
    if (!stale) return { bearer: session.accessToken, session };

    if (!session.refreshToken) return null;
    try {
      const tokens = await refreshTokens(session.refreshToken);
      const updated: Session = {
        ...session,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? session.refreshToken,
        accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      };
      await setSession(c, updated);
      return { bearer: updated.accessToken!, session: updated };
    } catch (error) {
      console.warn('[auth] refresh failed:', error);
      return null;
    }
  }

  return null;
}

function jsonError(c: Context, status: number, message: string) {
  return c.json({ error: true, message }, status as ContentfulStatusCode);
}

async function requireBearer(c: Context): Promise<{ bearer: string; session: Session } | Response> {
  const resolved = await resolveBearer(c);
  if (!resolved) return jsonError(c, 401, 'Not signed in (or session expired).');
  return resolved;
}

// ─── Auth: Login with Aicoo ─────────────────────────────────────────

app.get('/auth/login', async (c) => {
  const state = randomBytes(16).toString('base64url');
  const { verifier, challenge } = makePkcePair();
  await setFlowState(c, { state, codeVerifier: verifier });
  return c.redirect(await buildAuthorizeUrl(state, challenge));
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const oauthError = c.req.query('error');

  if (oauthError) {
    return c.redirect(`${config.spaUrl}/?login_error=${encodeURIComponent(oauthError)}`);
  }

  const flow = await consumeFlowState(c);
  if (!code || !state || !flow || flow.state !== state) {
    return jsonError(c, 400, 'OAuth state mismatch or missing code — restart login.');
  }

  try {
    const tokens = await exchangeCode(code, flow.codeVerifier);
    const info = await fetchUserInfo(tokens.access_token);

    await setSession(c, {
      authType: 'oauth',
      sub: info.sub,
      username: info.preferred_username,
      displayName: info.name ?? info.preferred_username ?? 'Resident',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    });

    return c.redirect(`${config.spaUrl}/?login=ok`);
  } catch (error) {
    console.error('[auth] callback failed:', error);
    return c.redirect(`${config.spaUrl}/?login_error=token_exchange_failed`);
  }
});

app.post('/auth/apikey', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!/^(aicoo|pulse)_sk_/.test(apiKey)) {
    return jsonError(c, 400, 'Provide an Aicoo API key (aicoo_sk_...).');
  }

  try {
    const identity = await getIdentity(apiKey);
    await setSession(c, {
      authType: 'api-key',
      sub: identity.profile.userId,
      username: identity.profile.username ?? undefined,
      displayName: identity.profile.name,
      apiKey,
    });
    return c.json({ ok: true, username: identity.profile.username, name: identity.profile.name });
  } catch (error) {
    const status = error instanceof AicooError ? error.status : 500;
    return jsonError(c, status === 401 ? 401 : 502, 'Aicoo rejected that API key.');
  }
});

app.post('/auth/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

app.get('/api/me', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ signedIn: false });
  return c.json({
    signedIn: true,
    authType: session.authType,
    sub: session.sub,
    username: session.username ?? null,
    displayName: session.displayName ?? null,
  });
});

// ─── Your COO (the resident — no new agent is created) ─────────────

app.get('/api/coo', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;

  if (auth.session.authType === 'api-key') {
    const identity = await getIdentity(auth.bearer);
    return c.json({
      name: identity.profile.name,
      agentName: identity.profile.agentName,
      username: identity.profile.username,
    });
  }

  // OAuth sessions: /v1/identity is API-key-only today, so fall back to the
  // session fields captured from OIDC userinfo at login.
  return c.json({
    name: auth.session.displayName ?? null,
    agentName: null,
    username: auth.session.username ?? null,
  });
});

// ─── World ──────────────────────────────────────────────────────────

app.get('/api/world', async (c) => {
  try {
    const summary = await getWorldSummary();
    return c.json(summary);
  } catch (error) {
    return jsonError(c, 503, error instanceof Error ? error.message : 'World unavailable');
  }
});

app.post('/api/world/join', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  if (!auth.session.username) {
    return jsonError(c, 400, 'Your Aicoo profile has no username — set one in Aicoo first.');
  }
  const body = await c.req.json().catch(() => ({}));
  const roster = await joinWorld({
    username: auth.session.username,
    displayName: auth.session.displayName ?? auth.session.username,
    vibe: typeof body.vibe === 'string' ? body.vibe.slice(0, 120) : 'new in town',
  });
  return c.json({ ok: true, roster });
});

/** World tick — heartbeat/cron calls this with the operator secret. */
app.post('/api/tick', async (c) => {
  if (!config.tickSecret || c.req.header('x-tick-secret') !== config.tickSecret) {
    return jsonError(c, 401, 'Bad or missing x-tick-secret.');
  }
  const result = await tickWorld();
  return c.json(result);
});

// ─── Hangouts & dyads ───────────────────────────────────────────────

app.get('/api/dyads', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  return c.json({ dyads: await listDyads(auth.bearer) });
});

app.get('/api/dyads/:partner', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  const dyad = await getDyad(auth.bearer, c.req.param('partner'));
  if (!dyad) return jsonError(c, 404, 'No dyad with that partner yet.');
  return c.json(dyad);
});

app.post('/api/hangouts', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const partner = typeof body.partner === 'string' ? body.partner.trim() : '';
  if (!partner) return jsonError(c, 400, 'Provide "partner" (Aicoo username).');

  try {
    const result = await runHangout(
      auth.bearer,
      partner,
      Math.min(Number(body.rounds) || 1, 3),
      typeof body.topic === 'string' ? body.topic.slice(0, 200) : undefined
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof AicooError) {
      return jsonError(c, error.status, `Aicoo: ${error.body.slice(0, 300)}`);
    }
    throw error;
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[dating-world] BFF listening on http://localhost:${info.port}`);
  console.log(`[dating-world] Aicoo backend: ${config.aicooBaseUrl}`);
});
