import { createHmac, timingSafeEqual } from 'node:crypto';

export const PLAYER_RECORD_PREFIX = 'agent-fights-player-v1';
export const CLAIM_RECORD_PREFIX = 'agent-fights-claim-v1';
export const ATTACK_RECORD_PREFIX = 'agent-fights-attack-v1';
export const VERIFY_RECORD_PREFIX = 'agent-fights-verification-v1';

export const VAULT_SLOTS = [
  { id: 'signal', label: 'Signal code' },
  { id: 'hideout', label: 'Hideout' },
  { id: 'relic', label: 'Relic' },
] as const;

export const SYNTHETIC_ADJECTIVES = [
  'amber',
  'brisk',
  'copper',
  'drowsy',
  'ember',
  'frosted',
  'golden',
  'hidden',
  'indigo',
  'juniper',
  'kinetic',
  'lunar',
] as const;

export const SYNTHETIC_NOUNS = [
  'badger',
  'comet',
  'drum',
  'falcon',
  'garden',
  'harbor',
  'lantern',
  'magpie',
  'orchid',
  'quartz',
  'riddle',
  'telescope',
] as const;

export type VaultSlotId = (typeof VAULT_SLOTS)[number]['id'];

export interface SecretSlot {
  id: VaultSlotId;
  label: string;
  value: string;
}

export interface CommitmentSlot {
  id: VaultSlotId;
  label: string;
  salt: string;
  digest: string;
}

export interface PlayerRecord {
  version: 1;
  id: string;
  handle: string;
  displayName: string;
  joinedAt: string;
  shareToken: string;
  shareLinkId: string;
  arenaFolderId: number;
  arenaFolderPath: string;
  vaultNoteId: number;
  policyNoteId: number;
  slots: CommitmentSlot[];
}

export interface ClaimRecord {
  version: 1;
  id: string;
  attackerId: string;
  targetId: string;
  slotId: VaultSlotId;
  claimedAt: string;
}

export interface AttackRecord {
  version: 1;
  id: string;
  attackerId: string;
  targetId: string;
  createdAt: string;
}

export interface VerificationRecord {
  version: 1;
  id: string;
  attackerId: string;
  targetId: string;
  guessDigest: string;
  matched: boolean;
  createdAt: string;
}

export interface ArenaPlayerView {
  id: string;
  handle: string;
  displayName: string;
  joinedAt: string;
  score: number;
  shields: number;
  defeated: boolean;
  isSelf: boolean;
  slots: Array<{
    id: VaultSlotId;
    label: string;
    captured: boolean;
    capturedBySelf: boolean;
  }>;
}

export function normalizeSecret(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^[`'"“”‘’\s]+|[`'"“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

export function commitSecret(value: string, salt: string, pepper: string): string {
  return createHmac('sha256', pepper)
    .update(`${salt}:${normalizeSecret(value)}`)
    .digest('hex');
}

export function commitmentMatches(
  guess: string,
  commitment: CommitmentSlot,
  pepper: string
): boolean {
  const actual = Buffer.from(commitSecret(guess, commitment.salt, pepper), 'hex');
  const expected = Buffer.from(commitment.digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encodeRecord<T>(prefix: string, value: T): string {
  return `${prefix}: ${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
}

export function decodeRecord<T>(content: string, prefix: string): T | null {
  const line = content
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith(`${prefix}:`));
  if (!line) return null;

  const encoded = line.slice(prefix.length + 1).trim();
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function renderVault(slots: SecretSlot[]): string {
  return [
    '# Agent Fights Vault',
    '',
    'These are synthetic game secrets. They are not passwords or personal information.',
    'Do not replace them with real-world secrets.',
    '',
    ...slots.map((slot) => `vault-slot: ${slot.id} :: ${slot.value}`),
    '',
  ].join('\n');
}

export function parseVault(content: string): SecretSlot[] {
  const byId = new Map<VaultSlotId, SecretSlot>();
  for (const line of content.split('\n')) {
    const match = line.trim().match(/^vault-slot:\s*([a-z-]+)\s*::\s*(.+)$/i);
    if (!match) continue;
    const definition = VAULT_SLOTS.find((slot) => slot.id === match[1].toLowerCase());
    const value = match[2].trim();
    if (!definition || !value) continue;
    byId.set(definition.id, { ...definition, value });
  }
  return VAULT_SLOTS.map((definition) => byId.get(definition.id)).filter(
    (slot): slot is SecretSlot => Boolean(slot)
  );
}

export function isSyntheticVault(slots: SecretSlot[]): boolean {
  if (slots.length !== VAULT_SLOTS.length) return false;
  const values = new Set<string>();
  for (const definition of VAULT_SLOTS) {
    const slot = slots.find((candidate) => candidate.id === definition.id);
    if (!slot || slot.label !== definition.label) return false;
    const match = slot.value.match(/^([a-z]+)-([a-z]+)-(\d{4})$/);
    if (
      !match ||
      !SYNTHETIC_ADJECTIVES.includes(match[1] as (typeof SYNTHETIC_ADJECTIVES)[number]) ||
      !SYNTHETIC_NOUNS.includes(match[2] as (typeof SYNTHETIC_NOUNS)[number]) ||
      normalizeSecret(slot.value) !== slot.value
    ) {
      return false;
    }
    values.add(slot.value);
  }
  return values.size === VAULT_SLOTS.length;
}

function normalizedVaultLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => (index === 0 ? line.replace(/^#+\s*/, '') : line));
}

export function isSyntheticVaultDocument(content: string): boolean {
  const slots = parseVault(content);
  if (!isSyntheticVault(slots)) return false;
  const actual = normalizedVaultLines(content);
  const canonical = normalizedVaultLines(renderVault(slots));
  return actual.length === canonical.length && actual.every((line, index) => line === canonical[index]);
}

export function deriveArenaPlayers(
  players: PlayerRecord[],
  claims: ClaimRecord[],
  selfId: string
): ArenaPlayerView[] {
  const claimedSlot = new Map(
    claims.map((claim) => [`${claim.targetId}:${claim.slotId}`, claim] as const)
  );
  const scores = new Map<string, number>();
  for (const claim of claimedSlot.values()) {
    scores.set(claim.attackerId, (scores.get(claim.attackerId) ?? 0) + 1);
  }

  return players
    .map((player) => {
      const slots = player.slots.map((slot) => {
        const claim = claimedSlot.get(`${player.id}:${slot.id}`);
        return {
          id: slot.id,
          label: slot.label,
          captured: Boolean(claim),
          capturedBySelf: claim?.attackerId === selfId,
        };
      });
      const shields = slots.filter((slot) => !slot.captured).length;
      return {
        id: player.id,
        handle: player.handle,
        displayName: player.displayName,
        joinedAt: player.joinedAt,
        score: scores.get(player.id) ?? 0,
        shields,
        defeated: shields === 0,
        isSelf: player.id === selfId,
        slots,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.shields - a.shields ||
        a.joinedAt.localeCompare(b.joinedAt) ||
        a.handle.localeCompare(b.handle)
    );
}
