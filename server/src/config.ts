/**
 * BFF configuration. Everything comes from env — the server keeps no
 * database; Aicoo is the backend.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export const config = {
  /** Aicoo deployment this app runs against. */
  aicooBaseUrl: (process.env.AICOO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),

  /** OAuth client credentials. Left empty → the BFF self-registers via
   *  dynamic client registration on first login and caches the result. */
  clientId: process.env.AICOO_CLIENT_ID ?? '',
  clientSecret: process.env.AICOO_CLIENT_SECRET ?? '',

  port: Number(process.env.PORT ?? 8787),
  publicUrl: (process.env.BFF_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(
    /\/$/,
    ''
  ),
  spaUrl: (process.env.SPA_URL ?? 'http://localhost:5173').replace(/\/$/, ''),

  /** Secret for encrypting the session cookie (any long random string). */
  sessionSecret: required(
    'SESSION_SECRET',
    process.env.NODE_ENV === 'production' ? undefined : 'dating-world-dev-secret-change-me'
  ),

  /** World-operator Aicoo account API key — owns roster + tick log. */
  operatorApiKey: process.env.AICOO_OPERATOR_API_KEY ?? '',
  /** Shared secret required to call POST /api/tick. */
  tickSecret: process.env.OPERATOR_TICK_SECRET ?? '',
};

export const oauthPaths = {
  authorize: `${config.aicooBaseUrl}/api/auth/oauth2/authorize`,
  token: `${config.aicooBaseUrl}/api/auth/oauth2/token`,
  register: `${config.aicooBaseUrl}/api/auth/oauth2/register`,
  userinfo: `${config.aicooBaseUrl}/api/auth/oauth2/userinfo`,
  revoke: `${config.aicooBaseUrl}/api/auth/oauth2/revoke`,
};

export const redirectUri = process.env.AICOO_REDIRECT_URI ?? `${config.publicUrl}/auth/callback`;

/** RFC 8707 resource: makes Aicoo mint a JWT access token audienced to /api/v1. */
export const v1Resource = `${config.aicooBaseUrl}/api/v1`;

/** Scopes the dating app needs. */
export const APP_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'os.notes:read',
  'os.notes:write',
  'os.snapshots:read',
  'os.snapshots:write',
  'agent.message:send',
] as const;
