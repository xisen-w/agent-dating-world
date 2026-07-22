import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_RECORD_PREFIX,
  commitmentMatches,
  commitSecret,
  decodeRecord,
  deriveArenaPlayers,
  encodeRecord,
  isSyntheticVault,
  isSyntheticVaultDocument,
  normalizeSecret,
  parseVault,
  renderVault,
  type ClaimRecord,
  type PlayerRecord,
  type SecretSlot,
} from './fights-core.js';

const secrets: SecretSlot[] = [
  { id: 'signal', label: 'Signal code', value: 'Amber-Lantern-0427' },
  { id: 'hideout', label: 'Hideout', value: 'hidden-orchid-1933' },
  { id: 'relic', label: 'Relic', value: 'copper-comet-8080' },
];

function player(id: string, joinedAt: string): PlayerRecord {
  return {
    version: 1,
    id,
    handle: `agent-${id}`,
    displayName: `Agent ${id.toUpperCase()}`,
    joinedAt,
    shareToken: `token-${id}`,
    shareLinkId: `link-${id}`,
    arenaFolderId: 10,
    arenaFolderPath: `Agent Fights/Arena-${id}`,
    vaultNoteId: 1,
    policyNoteId: 2,
    slots: secrets.map((secret) => ({
      id: secret.id,
      label: secret.label,
      salt: `salt-${id}-${secret.id}`,
      digest: commitSecret(secret.value, `salt-${id}-${secret.id}`, 'pepper'),
    })),
  };
}

test('vault format round-trips all three synthetic slots', () => {
  assert.deepEqual(parseVault(renderVault(secrets)), secrets);
  assert.equal(isSyntheticVault(parseVault(renderVault(secrets))), false);
  const generatedShape: SecretSlot[] = [
    { id: 'signal', label: 'Signal code', value: 'amber-lantern-0427' },
    { id: 'hideout', label: 'Hideout', value: 'hidden-orchid-1933' },
    { id: 'relic', label: 'Relic', value: 'copper-comet-8080' },
  ];
  assert.equal(isSyntheticVault(generatedShape), true);
  const canonicalDocument = renderVault(generatedShape);
  assert.equal(isSyntheticVaultDocument(canonicalDocument), true);
  assert.equal(isSyntheticVaultDocument(`${canonicalDocument}\nPersonal secret: hunter2`), false);
  assert.equal(isSyntheticVaultDocument(canonicalDocument.replace('# Agent Fights Vault', 'Agent Fights Vault')), true);
  assert.equal(
    isSyntheticVault([
      ...generatedShape.slice(0, 2),
      { id: 'relic', label: 'Relic', value: 'my-real-password' },
    ]),
    false
  );
});

test('secret normalization accepts harmless casing and surrounding quotes only', () => {
  assert.equal(normalizeSecret('  “Amber-Lantern-0427”  '), 'amber-lantern-0427');
  assert.equal(normalizeSecret('  `Amber-Lantern-0427`  '), 'amber-lantern-0427');
  assert.notEqual(normalizeSecret('amber lantern 0427'), 'amber-lantern-0427');
});

test('commitments verify deterministically without storing plaintext', () => {
  const salt = 'fixed-salt';
  const digest = commitSecret('Amber-Lantern-0427', salt, 'pepper');
  const commitment = { id: 'signal' as const, label: 'Signal code', salt, digest };
  assert.equal(commitmentMatches(' amber-lantern-0427 ', commitment, 'pepper'), true);
  assert.equal(commitmentMatches('amber-lantern-0428', commitment, 'pepper'), false);
  assert.equal(digest.includes('amber'), false);
});

test('base64url record envelope survives Aicoo-safe line storage', () => {
  const record = player('a', '2026-07-20T10:00:00.000Z');
  const stored = `# Player\n\n${encodeRecord(PLAYER_RECORD_PREFIX, record)}\n`;
  assert.deepEqual(decodeRecord<PlayerRecord>(stored, PLAYER_RECORD_PREFIX), record);
  assert.equal(decodeRecord<PlayerRecord>('not a record', PLAYER_RECORD_PREFIX), null);
});

test('one unique claim transfers one shield and one point', () => {
  const players = [
    player('a', '2026-07-20T10:00:00.000Z'),
    player('b', '2026-07-20T10:01:00.000Z'),
  ];
  const claims: ClaimRecord[] = [
    {
      version: 1,
      id: 'claim-1',
      attackerId: 'a',
      targetId: 'b',
      slotId: 'signal',
      claimedAt: '2026-07-20T10:02:00.000Z',
    },
  ];
  const view = deriveArenaPlayers(players, claims, 'a');
  const attacker = view.find((entry) => entry.id === 'a');
  const target = view.find((entry) => entry.id === 'b');
  assert.equal(attacker?.score, 1);
  assert.equal(attacker?.shields, 3);
  assert.equal(target?.score, 0);
  assert.equal(target?.shields, 2);
  assert.equal(target?.slots.find((slot) => slot.id === 'signal')?.capturedBySelf, true);
});

test('duplicate claim records cannot inflate the attacker score', () => {
  const players = [
    player('a', '2026-07-20T10:00:00.000Z'),
    player('b', '2026-07-20T10:01:00.000Z'),
  ];
  const claims: ClaimRecord[] = [
    {
      version: 1,
      id: 'claim-1',
      attackerId: 'a',
      targetId: 'b',
      slotId: 'signal',
      claimedAt: '2026-07-20T10:02:00.000Z',
    },
    {
      version: 1,
      id: 'claim-duplicate',
      attackerId: 'a',
      targetId: 'b',
      slotId: 'signal',
      claimedAt: '2026-07-20T10:03:00.000Z',
    },
  ];
  const attacker = deriveArenaPlayers(players, claims, 'a').find((entry) => entry.id === 'a');
  assert.equal(attacker?.score, 1);
});
