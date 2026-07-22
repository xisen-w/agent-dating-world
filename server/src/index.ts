/**
 * Virtual N1 World BFF. Agent Fights is the first playable room.
 *
 * Aicoo handles identity, agent turns, scoped sharing, notes, and snapshots.
 * This server keeps credentials out of the browser and owns no database.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { randomBytes } from 'node:crypto';
import { AicooError, getIdentity } from './aicoo.js';
import { authResultUrl, normalizeReturnTo } from './auth-redirect.js';
import { config } from './config.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserInfo,
  makePkcePair,
  refreshTokens,
  revokeToken,
} from './oauth.js';
import {
  clearSession,
  consumeFlowState,
  getSession,
  setFlowState,
  setSession,
  type Session,
} from './session.js';
import {
  FightError,
  getArenaView,
  joinArena,
  runAttack,
  verifyGuess,
  type FightIdentity,
} from './fights.js';

const app = new Hono();

app.use('*', cors({ origin: config.spaUrl, credentials: true }));
app.use('*', async (c, next) => {
  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 20_000) {
    return jsonError(c, 413, 'Request body is too large.');
  }
  await next();
});

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

function fightError(c: Context, error: unknown) {
  if (error instanceof FightError) return jsonError(c, error.status, error.message);
  if (error instanceof AicooError) {
    console.warn(`[agent-fights] Aicoo request failed (${error.status}):`, error.body.slice(0, 500));
    if (error.status === 401) return jsonError(c, 401, 'Your Aicoo session expired. Sign in again.');
    if (error.status === 403) return jsonError(c, 403, 'Aicoo did not grant a required capability.');
    if (error.status === 429) return jsonError(c, 429, 'Aicoo is rate limiting the arena. Try again shortly.');
    return jsonError(c, 502, 'Aicoo could not complete the arena request.');
  }
  console.error('[agent-fights] request failed:', error);
  return jsonError(c, 500, 'Agent Fights could not complete the request.');
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
  await setFlowState(c, {
    state,
    codeVerifier: verifier,
    returnTo: normalizeReturnTo(c.req.query('return_to')),
  });
  return c.redirect(await buildAuthorizeUrl(state, challenge));
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const oauthError = c.req.query('error');

  const flow = await consumeFlowState(c);
  if (!state || !flow || flow.state !== state) {
    return jsonError(c, 400, 'OAuth state mismatch or missing code — restart login.');
  }

  if (oauthError) {
    return c.redirect(authResultUrl(config.spaUrl, flow.returnTo, { loginError: oauthError }));
  }

  if (!code) {
    return c.redirect(authResultUrl(config.spaUrl, flow.returnTo, { loginError: 'missing_code' }));
  }

  try {
    const tokens = await exchangeCode(code, flow.codeVerifier);
    const info = await fetchUserInfo(tokens.access_token);

    // UserInfo proves the OIDC login and supplies standards-based profile
    // fields. Identity supplies one canonical user id shared with API-key
    // sessions, preventing the same account from enrolling twice.
    const aicooIdentity = await getIdentity(tokens.access_token);

    await setSession(c, {
      authType: 'oauth',
      sub: aicooIdentity.profile.userId,
      username: aicooIdentity.profile.username ?? info.preferred_username,
      displayName:
        aicooIdentity.profile.name ?? info.name ?? info.preferred_username ?? 'Aicoo player',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    });

    return c.redirect(authResultUrl(config.spaUrl, flow.returnTo, { login: 'ok' }));
  } catch (error) {
    console.error('[auth] callback failed:', error);
    return c.redirect(
      authResultUrl(config.spaUrl, flow.returnTo, { loginError: 'token_exchange_failed' })
    );
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

app.post('/auth/logout', async (c) => {
  const session = await getSession(c);
  if (session?.authType === 'oauth') {
    const tokens = [session.refreshToken, session.accessToken].filter(
      (token): token is string => Boolean(token)
    );
    await Promise.allSettled(tokens.map((token) => revokeToken(token)));
  }
  clearSession(c);
  return c.json({ ok: true });
});

app.get('/api/me', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ signedIn: false });
  return c.json({
    signedIn: true,
    authType: session.authType,
    username: session.username ?? null,
    displayName: session.displayName ?? null,
  });
});

async function fightIdentityFor(
  _c: Context,
  auth: { bearer: string; session: Session }
): Promise<FightIdentity> {
  return {
    subject: auth.session.sub,
    username: auth.session.username,
    displayName: auth.session.displayName,
  };
}

// ─── Agent Fights ───────────────────────────────────────────────────

app.get('/api/fights', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  try {
    return c.json(await getArenaView(await fightIdentityFor(c, auth)));
  } catch (error) {
    return fightError(c, error);
  }
});

app.post('/api/fights/join', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  try {
    return c.json(await joinArena(auth.bearer, await fightIdentityFor(c, auth)));
  } catch (error) {
    return fightError(c, error);
  }
});

app.post('/api/fights/attack', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json(
      await runAttack(auth.bearer, await fightIdentityFor(c, auth), {
        targetId: typeof body.targetId === 'string' ? body.targetId : '',
        tactic: typeof body.tactic === 'string' ? body.tactic : '',
        attackerConversationId:
          typeof body.attackerConversationId === 'string'
            ? body.attackerConversationId
            : undefined,
        defenderSessionKey:
          typeof body.defenderSessionKey === 'string' ? body.defenderSessionKey : undefined,
        previousDefenderReply:
          typeof body.previousDefenderReply === 'string' ? body.previousDefenderReply : undefined,
      })
    );
  } catch (error) {
    return fightError(c, error);
  }
});

app.post('/api/fights/verify', async (c) => {
  const auth = await requireBearer(c);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json(
      await verifyGuess(await fightIdentityFor(c, auth), {
        targetId: typeof body.targetId === 'string' ? body.targetId : '',
        guess: typeof body.guess === 'string' ? body.guess : '',
      })
    );
  } catch (error) {
    return fightError(c, error);
  }
});

app.get('/api/health', (c) => c.json({ ok: true, service: 'virtual-n1-world' }));

app.all('/api/*', (c) => jsonError(c, 404, 'API route not found.'));
app.all('/auth/*', (c) => jsonError(c, 404, 'Auth route not found.'));

// A production process can serve the Vite build and BFF from one origin.
if (process.env.NODE_ENV === 'production') {
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[virtual-n1-world] BFF listening on http://localhost:${info.port}`);
  console.log(`[virtual-n1-world] Aicoo backend: ${config.aicooBaseUrl}`);
});
