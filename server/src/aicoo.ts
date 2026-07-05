/**
 * Thin client for the Aicoo v1 REST surface. Every call authenticates with a
 * bearer credential — either the user's OAuth access token ("Login with
 * Aicoo") or an Aicoo API key (BYOK / world operator). Aicoo notes are the
 * database; snapshots are the audit log.
 */
import { config } from './config.js';

export class AicooError extends Error {
  constructor(
    public status: number,
    public body: string,
    message?: string
  ) {
    super(message ?? `Aicoo API error ${status}: ${body.slice(0, 300)}`);
  }
}

async function api<T>(bearer: string, method: string, apiPath: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.aicooBaseUrl}/api/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new AicooError(res.status, text);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AicooError(res.status, text, 'Aicoo returned non-JSON response');
  }
}

// ─── Folders & notes ────────────────────────────────────────────────

export interface NoteSummary {
  id: number;
  title: string;
  updatedAt?: string;
}

export async function ensureFolder(bearer: string, pathSpec: string): Promise<number> {
  const res = await api<{ folder: { id: number } }>(bearer, 'POST', '/os/folders', {
    path: pathSpec,
  });
  return res.folder.id;
}

export async function listNotes(bearer: string, folderName: string): Promise<NoteSummary[]> {
  try {
    const res = await api<{ notes: NoteSummary[] }>(
      bearer,
      'GET',
      `/os/notes?folderName=${encodeURIComponent(folderName)}&limit=200`
    );
    return res.notes ?? [];
  } catch (error) {
    // Folder not created yet (first-time user) → no notes.
    if (error instanceof AicooError && error.status === 404) return [];
    throw error;
  }
}

export async function createNote(
  bearer: string,
  args: { title: string; content: string; folderId?: number }
): Promise<{ success: boolean; result: unknown }> {
  return api(bearer, 'POST', '/os/notes', args);
}

/**
 * Aicoo stores note bodies as rich-text HTML. Collapse block tags to
 * newlines and strip the rest so app-level parsers see plain text again.
 */
export function noteHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|div|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function getNote(bearer: string, noteId: number): Promise<string> {
  const res = await api<{ result: unknown }>(bearer, 'GET', `/os/notes/${noteId}`);
  // Tool results come back as { success, note: { content } } — sometimes
  // pre-serialized as a JSON string.
  let result: unknown = res.result ?? res;
  if (typeof result === 'string') {
    const raw: string = result;
    try {
      result = JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  const note = (result as { note?: { content?: string }; content?: string }) ?? {};
  const html = note.note?.content ?? note.content ?? '';
  return noteHtmlToText(html);
}

export async function editNote(
  bearer: string,
  noteId: number,
  args: { content?: string; title?: string }
): Promise<unknown> {
  return api(bearer, 'PATCH', `/os/notes/${noteId}`, args);
}

/** Find a note by exact title within a folder; create it if missing. */
export async function upsertNote(
  bearer: string,
  folderPath: string,
  title: string,
  content: string
): Promise<number> {
  const folderId = await ensureFolder(bearer, folderPath);
  const leafName = folderPath.split('/').pop()!;
  const existing = (await listNotes(bearer, leafName)).find((n) => n.title === title);

  if (existing) {
    await editNote(bearer, existing.id, { content });
    return existing.id;
  }

  await createNote(bearer, { title, content, folderId });
  const after = (await listNotes(bearer, leafName)).find((n) => n.title === title);
  if (!after) throw new Error(`Note "${title}" was not created in ${folderPath}`);
  return after.id;
}

// ─── Snapshots (proof log) ──────────────────────────────────────────

export async function saveSnapshot(
  bearer: string,
  noteId: number,
  label: string
): Promise<unknown> {
  return api(bearer, 'POST', `/os/snapshots/${noteId}`, { label });
}

export async function listSnapshots(bearer: string, noteId: number): Promise<unknown> {
  return api(bearer, 'GET', `/os/snapshots/${noteId}?limit=50`);
}

// ─── Own-COO chat (turn composition) ────────────────────────────────

export interface CooChatReply {
  conversationId: string;
  response: string;
}

/**
 * Ask the caller's OWN COO to compose a message (non-streaming agent-v04).
 * Pass conversationId to keep one continuous thread per hangout.
 */
export async function cooChat(
  bearer: string,
  message: string,
  conversationId?: string
): Promise<CooChatReply> {
  return api(bearer, 'POST', '/chat', {
    message,
    stream: false,
    ...(conversationId ? { conversationId } : {}),
  });
}

// ─── Agent messaging ────────────────────────────────────────────────

export interface AgentReply {
  success: boolean;
  mode?: string;
  agentName?: string;
  ownerName?: string;
  response: string | null;
  conversationId?: number;
}

export async function messageAgent(
  bearer: string,
  to: string,
  message: string,
  intent: 'query' | 'inform' = 'query'
): Promise<AgentReply> {
  return api(bearer, 'POST', '/agent/message', { to, message, intent });
}

// ─── Identity ───────────────────────────────────────────────────────

export interface AicooIdentity {
  success: boolean;
  profile: {
    userId: string;
    username: string | null;
    name: string;
    agentName: string | null;
    email: string | null;
  };
}

/** Used to validate BYOK keys and resolve the caller's identity.
 *  (API-key only today — OAuth sessions resolve identity via OIDC userinfo.) */
export async function getIdentity(bearer: string): Promise<AicooIdentity> {
  return api(bearer, 'GET', '/identity');
}
