/**
 * "Login with Aicoo" — OAuth 2 authorization-code + PKCE client.
 *
 * The BFF is a confidential client. If no client credentials are configured,
 * it self-registers once via Aicoo's dynamic client registration endpoint and
 * caches the result in .oauth-client.json (config cache, not a database).
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { APP_SCOPES, config, oauthPaths, redirectUri, v1Resource } from './config.js';

const CLIENT_CACHE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.oauth-client.json'
);

interface ClientCredentials {
  clientId: string;
  /** Empty for public (PKCE-only) clients. */
  clientSecret: string;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

let cachedClient: ClientCredentials | null = null;

export function base64url(input: Buffer): string {
  return input.toString('base64url');
}

export function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Resolve OAuth client credentials: env → cache file → dynamic registration.
 */
export async function getClient(): Promise<ClientCredentials> {
  if (config.clientId && config.clientSecret) {
    return { clientId: config.clientId, clientSecret: config.clientSecret };
  }
  if (cachedClient) return cachedClient;

  try {
    cachedClient = JSON.parse(readFileSync(CLIENT_CACHE, 'utf8')) as ClientCredentials;
    return cachedClient;
  } catch {
    /* no cache yet */
  }

  // Aicoo only allows UNAUTHENTICATED dynamic registration for public
  // clients, so self-registration uses PKCE with no client secret. Provide
  // AICOO_CLIENT_ID/SECRET env vars to run as a seeded confidential client.
  const res = await fetch(oauthPaths.register, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Aicoo Agent Fights',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: APP_SCOPES.join(' '),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Dynamic client registration failed (${res.status}): ${await res.text()}`);
  }

  const registered = (await res.json()) as { client_id: string; client_secret?: string };
  cachedClient = { clientId: registered.client_id, clientSecret: registered.client_secret ?? '' };
  writeFileSync(CLIENT_CACHE, JSON.stringify(cachedClient, null, 2));
  console.log(`[oauth] Registered as OAuth client ${cachedClient.clientId}`);
  return cachedClient;
}

export async function buildAuthorizeUrl(state: string, codeChallenge: string): Promise<string> {
  const { clientId } = await getClient();
  const url = new URL(oauthPaths.authorize);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', APP_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', v1Resource);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = await getClient();
  // Confidential clients authenticate with Basic; public clients pass
  // client_id in the body and prove possession via PKCE.
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const body = new URLSearchParams(params);
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
  }
  const res = await fetch(oauthPaths.token, {
    method: 'POST',
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Token endpoint error (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as TokenSet;
}

export function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    resource: v1Resource,
  });
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    resource: v1Resource,
  });
}

export async function revokeToken(token: string): Promise<void> {
  const { clientId, clientSecret } = await getClient();
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const body = new URLSearchParams({ token });
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
  }
  const res = await fetch(oauthPaths.revoke, {
    method: 'POST',
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Token revocation failed (${res.status})`);
  }
}

export interface UserInfo {
  sub: string;
  name?: string;
  email?: string;
  preferred_username?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(oauthPaths.userinfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`userinfo failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as UserInfo;
}
