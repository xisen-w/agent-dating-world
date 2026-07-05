/**
 * Client for the dating-world BFF (server/). All state lives on Aicoo —
 * these calls ride the session cookie set by "Login with Aicoo" or BYOK.
 */

export interface Me {
  signedIn: boolean;
  authType?: 'oauth' | 'api-key';
  sub?: string;
  username?: string | null;
  displayName?: string | null;
}

export interface HangoutTurn {
  speaker: 'your-coo' | 'partner-coo';
  text: string;
}

export interface HangoutResult {
  partner: string;
  turns: HangoutTurn[];
  dyadNoteId: number;
}

export interface CooProfile {
  name: string | null;
  agentName: string | null;
  username: string | null;
}

export interface DyadSummary {
  id: number;
  partner: string;
}

export interface WorldSummary {
  roster: Array<{ username: string; displayName: string; vibe: string; joinedAt: string }>;
  day: number;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data?.message ?? `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  apiKeyLogin: (apiKey: string) =>
    request<{ ok: boolean; username?: string }>('POST', '/auth/apikey', { apiKey }),
  logout: () => request<{ ok: boolean }>('POST', '/auth/logout'),
  getCoo: () => request<CooProfile>('GET', '/api/coo'),
  getWorld: () => request<WorldSummary>('GET', '/api/world'),
  joinWorld: (vibe: string) => request<{ ok: boolean }>('POST', '/api/world/join', { vibe }),
  listDyads: () => request<{ dyads: DyadSummary[] }>('GET', '/api/dyads'),
  getDyad: (partner: string) =>
    request<{ content: string; snapshots: unknown }>(
      'GET',
      `/api/dyads/${encodeURIComponent(partner)}`
    ),
  runHangout: (partner: string, rounds: number, topic?: string) =>
    request<HangoutResult>('POST', '/api/hangouts', { partner, rounds, topic }),
};

/** Login with Aicoo entry point (full-page redirect through the BFF). */
export const LOGIN_WITH_AICOO_URL = '/auth/login';
