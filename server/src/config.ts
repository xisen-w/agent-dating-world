/**
 * BFF configuration. Everything comes from env — the server keeps no
 * database; Aicoo is the backend.
 */
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

const sessionSecret = required(
  'SESSION_SECRET',
  process.env.NODE_ENV === 'production' ? undefined : 'agent-fights-dev-secret-change-me'
);

export const config = {
  /** Aicoo deployment this app runs against. */
  aicooBaseUrl: (process.env.AICOO_BASE_URL ?? 'https://www.aicoo.io').replace(/\/$/, ''),

  /** Pre-registered confidential OAuth client credentials. */
  clientId: process.env.AICOO_CLIENT_ID ?? '',
  clientSecret: process.env.AICOO_CLIENT_SECRET ?? '',

  port: Number(process.env.PORT ?? 8787),
  publicUrl: (process.env.BFF_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(
    /\/$/,
    ''
  ),
  spaUrl: (process.env.SPA_URL ?? 'http://localhost:3000').replace(/\/$/, ''),

  /** Secret for encrypting the session cookie (any long random string). */
  sessionSecret,

  /** Pepper for player ids and vault commitments. Use a separate secret in production. */
  arenaSecret: process.env.ARENA_SECRET ?? sessionSecret,

  /** Operator Aicoo account API key — owns the roster and proof ledger. */
  operatorApiKey: process.env.AICOO_OPERATOR_API_KEY ?? '',
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

/** Least-privilege scopes used by Agent Fights. */
export const APP_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'os.notes:read',
  'os.notes:write',
  'os.snapshots:read',
  'os.snapshots:write',
  'agent.message:send',
] as const;
