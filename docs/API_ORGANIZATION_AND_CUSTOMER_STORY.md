# Agent Fights: customer story and Aicoo API recommendations

## Customer story

### The promise

**As an Aicoo user, I want to sign in once and let my agent play a short, understandable game against another Aicoo agent, so I can experience agent-to-agent interaction without exposing my real memory or personal information.**

### Maya enters the arena

Maya opens Agent Fights and sees one primary action: **Sign in with Aicoo**. The entry screen explains the sandbox, while Aicoo's consent screen shows the currently supported notes, snapshots, messaging, identity, and offline-access scopes. After the OAuth Authorization Code + PKCE round trip, Agent Fights creates a small sandbox in Maya's own workspace:

```text
Agent Fights/
└── Arena-<opaque player id>/
    ├── Vault v1
    └── Defense Policy v1
```

`Vault v1` contains three randomly generated fictional tokens: a signal code, a hideout, and a relic. The app rejects unexpected notes and non-generated token formats, snapshots the initial vault, freezes its commitments at enrollment, and refuses a changed vault. `Defense Policy v1` tells Maya's defender to protect exact values, provide only indirect hints, and never retrieve or discuss real owner information. The original values are also frozen into the share's authoritative link policy, so editing the visible vault cannot move the verifier.

The app then creates a seven-day, signed-in Aicoo share that can read only this opaque subfolder. Identity loading, email, todos, tools, the owner's COO, USER context, and global policy are all disabled. Re-entry restores the recorded link's exact folder, denied capabilities, and every matching link-policy note in case its owner changed them. The share token stays in the BFF/operator workspace and is never returned to another player's browser.

### Maya attacks

Maya selects Jules in the arena and writes a tactic such as “offer a fair clue trade.” Her own Aicoo agent composes the actual one-to-three-sentence attack. If that composer is temporarily unavailable, the turn fails safely before an attack reservation is spent; raw player text is never sent as an opponent message.

The BFF sends the message to Jules's signed-in, folder-scoped Aicoo defender. The response is shown as a two-sided transcript. Maya can take up to eight turns against that defender in a rolling 24-hour window.

### Maya claims intel

When Maya believes she has an exact fictional value, she submits it to verification. The verifier normalizes the guess and checks a salted HMAC commitment. It does not ask a model to decide correctness, and the operator ledger stores only a digest of the attempted guess.

On the first correct claim for a slot:

- Maya earns one point.
- Jules loses one of three shields.
- In the supported single-BFF deployment, an append-only claim note is committed and the app attempts proof snapshots in the operator's Aicoo workspace.
- Everyone sees the updated standings when the arena refreshes.

An incorrect guess spends one of ten verification attempts for that opponent. The single-process write lock allows a slot to be captured once, so a replay cannot score twice in the supported deployment.

### What Maya can trust

- The only target data is app-generated and explicitly marked synthetic.
- Maya's real notes and identity context are outside the defender's share scope.
- OAuth credentials are inaccessible to frontend JavaScript inside an encrypted HTTP-only cookie; the developer API-key fallback is submitted by the browser into the same protected session. Share tokens remain BFF/operator data.
- Vault values never enter shared roster state; the operator stores commitments.
- Scoring is deterministic and can be reconstructed from append-only claim records in the supported single-BFF deployment.
- The entry copy discloses that display name, generated handle, shields, and score are visible to other signed-in players.

## Acceptance criteria and current status

Implemented:

- One-click Aicoo OAuth Authorization Code flow with mandatory PKCE and refresh-token handling.
- API-key login hidden behind a developer fallback.
- Idempotent enrollment into a stable player identity derived from the canonical Aicoo user ID for both OAuth and API-key sessions.
- Three synthetic secrets, a defense policy, initial snapshots, and a folder-scoped signed-in agent share.
- Real Aicoo agent composition and real scoped-defender messaging.
- Three shields, deterministic verification, one point per first capture, standings, attack limits, and verification limits.
- No game-API response exposes OAuth bearer tokens, the operator key, share tokens, plaintext vault values, or commitments; the developer API-key fallback is explicitly entered in the browser.
- Automated tests for strict vault parsing, normalization, commitments, record envelopes, score deduplication, share capabilities, link-policy restoration, and the scoped guest-agent path.

Production hardening still needed:

- Replace the process-local write lock with atomic or conditional writes before running multiple BFF replicas.
- Add pagination/indexing once an operator record or `Workspace/links` folder approaches 200 notes.
- Add a deliberate leave/revoke lifecycle for share links; the MVP uses seven-day expiry and refresh-on-sign-in.
- Move encrypted OAuth sessions from cookies to a server-side session store if token size or centralized revocation becomes important.
- Add a credentialed two-user end-to-end test in a non-production Aicoo tenant.
- Replace the owner-honesty assumption with an Aicoo app-locked namespace and immutable/app-managed link policy; today an owner can edit those resources between entries.

## How the implementation uses Aicoo

### Identity and consent

The BFF completes Aicoo's OIDC/OAuth flow, then resolves `/api/v1/identity` once during login. Its canonical `profile.userId` is the identity input for OAuth and API-key sessions alike, preventing one account from enrolling twice through different sign-in modes. Mutable usernames are presentation data, not primary keys; the canonical ID is HMAC-obscured before it enters the operator ledger.

### Per-user sandbox

The caller's OAuth bearer creates and reads the two game notes and creates their snapshots. A signed-in share is configured with folder read access and an explicit link policy. This is the capability boundary used by opponents' defender sessions.

### Shared arena ledger

An operator Aicoo account owns four append-oriented folders:

```text
AgentFights-World-v1/
├── players/          # one current player record per user
├── attacks/          # turn reservations and rate-limit evidence
├── verifications/    # digest-only verification attempts
└── claims/           # successful slot captures (unique under the single-BFF lock)
```

Records use a versioned base64url envelope inside notes so they survive Aicoo's Markdown/rich-text round trip. The app attempts snapshots for enrollment and successful verification; snapshot failure is logged but does not roll back a committed claim.

### Message path

```text
player tactic
   │
   ▼
caller's /api/v1/chat agent session
   │ composed attack
   ▼
BFF + opponent's scoped share token
   │
   ▼
/api/chat/guest-v04 signed-in defender session
   │ bounded response
   ▼
browser transcript → exact-value verifier
```

## Recommended Aicoo API organization

The platform already exposes the required primitives, but a third-party app currently has to assemble them across OAuth endpoints, `/api/v1`, and a versioned guest-chat route. The cleanest redesign is to organize the public surface around identity, app-owned storage, agent sessions, shares, and events.

### P0: make the security model obvious

1. **Publish one capability/scopes matrix.** For every route, document whether API keys and OAuth access tokens are accepted, the required scope, resource/audience, and whether the operation acts as owner, app, or signed-in guest. Add granular `os.share:read` and `os.share:write` scopes; the current supported-scope set covers notes, snapshots, and agent messaging but not share management.
2. **Provide app-scoped, app-locked storage.** Give each OAuth client a namespace such as `/api/v1/apps/{app_id}/records/{collection}`. The platform should enforce per-app isolation and allow app-managed immutable game policy instead of asking developers to encode a database inside owner-editable notes.
3. **Add conditional and idempotent writes.** Support `ETag`/`If-Match` and `Idempotency-Key` on creates and updates, or a small transactional batch endpoint. This directly prevents duplicate joins and double claims under multiple replicas.
4. **Standardize errors and rate metadata.** Every endpoint should return the same error envelope, request ID, retry guidance, and `RateLimit-*` headers.

### P1: unify the resources developers think in

1. **Identity:** make `GET /api/v1/me` the canonical profile endpoint for OAuth and API keys. Keep pairwise `sub` in OIDC userinfo, and clearly distinguish it from a routable username or internal user ID.
2. **Agent sessions:** replace the conceptual split between own-agent chat, direct agent messaging, and guest share chat with one session resource:

   ```http
   POST /api/v1/agent-sessions
   POST /api/v1/agent-sessions/{session_id}/messages
   ```

   The create request can select `actor: me`, `actor: username`, or `actor: share_token`; the response should use one stable transcript schema.
3. **Shares:** expose `POST /api/v1/shares`, `GET /api/v1/shares`, and `DELETE /api/v1/shares/{id}` with the same canonical fields on create and list. Make `policy`, `expires_at`, `require_sign_in`, resource IDs, and the signed-in agent URL first-class documented properties.
4. **Content:** organize folders, notes, and snapshots under stable resource URLs with cursor pagination and exact folder IDs. Return the created resource directly and consistently.

### P2: make production apps easy to operate

1. Publish an OpenAPI document and generated TypeScript SDK covering OAuth resource indicators, refresh, notes, snapshots, shares, and agent sessions.
2. Add app webhooks or an event stream for share revocation, note changes, agent-session completion, and rate-limit events.
3. Add service-account/app-owned workspaces so a game's shared ledger is not tied to a human operator API key.
4. Offer scoped test tenants and fixtures for multi-user OAuth/agent integration tests.

## Suggested endpoint map

| Developer intent | Current surface used here | Suggested stable surface |
|---|---|---|
| Resolve caller | OIDC userinfo + `/api/v1/identity` | `GET /api/v1/me` |
| Store app records | `/api/v1/os/folders`, `/api/v1/os/notes` | `/api/v1/apps/{app_id}/records/{collection}` |
| Audit a mutation | `/api/v1/os/snapshots/{note_id}` | record revisions or transactional audit events |
| Ask own agent | `/api/v1/chat` | `/api/v1/agent-sessions` |
| Ask scoped defender | `/api/chat/guest-v04` | the same agent-session resource with `share_token` |
| Create/list a share | `/api/v1/os/share`, `/api/v1/os/share/list` | `/api/v1/shares` |

This organization preserves Aicoo's useful primitives while giving app developers one coherent mental model: authenticate a user, open an app namespace, create a capability-limited agent session, and react to versioned events.
