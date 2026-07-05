/**
 * Shared world state, stored in the world-operator Aicoo account.
 * The operator never holds user tokens — only public roster facts.
 *
 *   DatingWorld-World/roster.md — one line per resident (markdown table)
 *   DatingWorld-World/ticks.md  — append-only world tick log
 */
import { config } from './config.js';
import { getNote, listNotes, saveSnapshot, upsertNote } from './aicoo.js';

const WORLD_FOLDER = 'DatingWorld-World';
const ROSTER_TITLE = 'roster';
const TICKS_TITLE = 'ticks';

export interface Resident {
  username: string;
  displayName: string;
  vibe: string;
  joinedAt: string;
}

function operatorKey(): string {
  if (!config.operatorApiKey) {
    throw new Error('AICOO_OPERATOR_API_KEY is not configured — world features are disabled.');
  }
  return config.operatorApiKey;
}

// Notes survive a markdown→HTML→text round trip, so world state uses plain
// `resident: a :: b :: c :: d` lines rather than markdown tables.
function renderRoster(residents: Resident[]): string {
  const header = 'Dating World Roster\n\n';
  const rows = residents
    .map(
      (r) =>
        `resident: ${r.username} :: ${r.displayName.replace(/::/g, ':')} :: ${r.vibe.replace(/::/g, ':')} :: ${r.joinedAt}`
    )
    .join('\n');
  return header + rows + '\n';
}

function parseRoster(content: string): Resident[] {
  const residents: Resident[] = [];
  for (const line of content.split('\n')) {
    const match = line.trim().match(/^resident:\s*(.+)$/i);
    if (!match) continue;
    const cells = match[1].split('::').map((c) => c.trim());
    if (cells.length >= 4 && cells[0]) {
      residents.push({
        username: cells[0],
        displayName: cells[1],
        vibe: cells[2],
        joinedAt: cells[3],
      });
    }
  }
  return residents;
}

async function findWorldNote(title: string): Promise<number | null> {
  const notes = await listNotes(operatorKey(), WORLD_FOLDER);
  return notes.find((n) => n.title === title)?.id ?? null;
}

export async function getRoster(): Promise<Resident[]> {
  const noteId = await findWorldNote(ROSTER_TITLE);
  if (!noteId) return [];
  return parseRoster(await getNote(operatorKey(), noteId));
}

export async function joinWorld(resident: Omit<Resident, 'joinedAt'>): Promise<Resident[]> {
  const roster = await getRoster();
  if (!roster.some((r) => r.username === resident.username)) {
    roster.push({ ...resident, joinedAt: new Date().toISOString().slice(0, 10) });
    const noteId = await upsertNote(
      operatorKey(),
      WORLD_FOLDER,
      ROSTER_TITLE,
      renderRoster(roster)
    );
    await saveSnapshot(operatorKey(), noteId, `join:${resident.username}`);
  }
  return roster;
}

export interface TickResult {
  day: number;
  pairs: Array<[string, string]>;
}

/** Read the tick log to find the current day counter. */
async function getTickLog(): Promise<{ noteId: number | null; content: string; day: number }> {
  const noteId = await findWorldNote(TICKS_TITLE);
  if (!noteId) return { noteId: null, content: 'Dating World Ticks\n', day: 0 };
  const content = await getNote(operatorKey(), noteId);
  const days = [...content.matchAll(/^Day (\d+) —/gm)].map((m) => Number(m[1]));
  return { noteId, content, day: days.length ? Math.max(...days) : 0 };
}

/**
 * Advance the world one day: rotate-pair matchmaking over the roster.
 * Returns the proposed pairs; the caller decides which dates actually run.
 */
export async function tickWorld(): Promise<TickResult> {
  const roster = await getRoster();
  const { content, day } = await getTickLog();
  const nextDay = day + 1;

  // Round-robin rotation so residents meet someone new each day.
  const names = roster.map((r) => r.username);
  const pairs: Array<[string, string]> = [];
  if (names.length >= 2) {
    const fixed = names[0];
    const rest = names.slice(1);
    const rotated = rest.slice(nextDay % rest.length).concat(rest.slice(0, nextDay % rest.length));
    const ring = [fixed, ...rotated];
    for (let i = 0; i + 1 < ring.length; i += 2) {
      pairs.push([ring[i], ring[i + 1]]);
    }
  }

  const entry =
    `\nDay ${nextDay} — ${new Date().toISOString()}\n` +
    (pairs.length
      ? pairs.map(([a, b]) => `date: ${a} × ${b}`).join('\n') + '\n'
      : 'no pairs (need at least 2 residents)\n');

  const noteId = await upsertNote(operatorKey(), WORLD_FOLDER, TICKS_TITLE, content + entry);
  await saveSnapshot(operatorKey(), noteId, `day:${nextDay}`);

  return { day: nextDay, pairs };
}

export async function getWorldSummary(): Promise<{ roster: Resident[]; day: number }> {
  const roster = await getRoster();
  const { day } = await getTickLog();
  return { roster, day };
}
