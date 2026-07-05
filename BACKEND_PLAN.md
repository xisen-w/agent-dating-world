# Aicoo Dating World — Backend Plan (100% Aicoo Stack)

> Goal: the dating-world simulation becomes the first real third-party app on Aicoo infra,
> and the vehicle for testing **"Login with Aicoo"** OAuth end-to-end.
> No own database. No own auth system. Aicoo *is* the backend.

---

## 0. What already exists on Aicoo (verified in pulse repo, 2026-07-05)

| Capability | Where | Status |
|---|---|---|
| OAuth2/OIDC provider | `lib/auth.ts` → `@better-auth/oauth-provider` plugin | ✅ Live |
| Discovery docs | `/.well-known/openid-configuration`, `/.well-known/oauth-authorization-server` | ✅ Live |
| Login + consent screens | `/auth/signin`, `/auth/consent` | ✅ Live |
| Dynamic client registration | `allowDynamicClientRegistration: true` (unauthenticated allowed, rate-limited) | ✅ Live |
| Pairwise subject IDs | `pairwiseSecret` — per-app `sub`, no cross-app tracking | ✅ Live |
| Token lifetimes | access 15 min / refresh 30 d / id 1 h / code 60 s | ✅ Live |
| API keys (BYOK) | `lib/api-keys.ts`, `aicoo_sk_live_/test_`, Bearer or `x-api-key` | ✅ Live |
| Storage surface | `/api/v1/os/{notes,folders,snapshots,memory,todos}` | ✅ Live |
| Agent-to-agent RPC | `/api/v1/agent/message` | ✅ Live |
| Relationship graph + permissions | `/api/v1/network/*`, `/api/v1/os/tool-namespaces` | ✅ Live |
| Autonomy loop | `/api/v1/heartbeat/*` | ✅ Live |

**The two real gaps:**

1. **Scopes are MCP-era**: only `digest:read`, `messages:read`, `todos:write` (`lib/mcp/oauth.ts`).
   Nothing covers notes/folders/snapshots/agent-message — the surface this app needs.
2. **`/api/v1/*` only accepts API keys** (`validateApiKeyWithUser`). OAuth access tokens
   are not yet accepted as resource-API credentials.

Closing those two gaps *is* the "Login with Aicoo" launch. The dating app is the test harness.

---

## Architecture

```
┌─────────────────────────┐
│  agent-dating-world SPA │  Vite + React (existing pixel-art town)
│  (public, no secrets)   │
└───────────┬─────────────┘
            │ session cookie
┌───────────▼─────────────┐      OAuth code + PKCE      ┌──────────────────────┐
│  BFF (thin server)      │ ◄─────────────────────────► │  Aicoo Auth          │
│  - holds client secret  │   /authorize /token /consent │  (better-auth OIDC)  │
│  - token refresh        │                              └──────────────────────┘
│  - date engine          │      Bearer tokens / API keys
│  - NO database          │ ◄─────────────────────────► ┌──────────────────────┐
└─────────────────────────┘                              │  Aicoo v1 API        │
                                                         │  os/notes  os/folders│
   Per-user data → user's own token, user's own workspace│  os/snapshots        │
   World data    → operator account (API key)            │  agent/message       │
                                                         │  network/* heartbeat │
                                                         └──────────────────────┘
```

- **Two credential classes**: each player's OAuth token (or BYOK API key) touches only
  *their* workspace; a **world-operator Aicoo account** (plain API key) owns shared state.
- **No own DB**: notes/folders are the database, snapshots are the audit log,
  network permissions are the policy layer.

---

## Phase 0 — Platform work in `pulse` (enable "Login with Aicoo" as a real resource grant)

| # | Step | Verify |
|---|---|---|
| 0.1 | Add resource scopes to the OAuth provider: `os.notes:read`, `os.notes:write`, `os.snapshots:read`, `os.snapshots:write`, `agent.message:send`. Map scope → tool-namespace (per the namespace-permissions convergence decision — no new hardcoded access columns). | Discovery doc lists new scopes; consent screen renders them |
| 0.2 | `resolveV1Auth(request)` in `app/api/v1/_lib/`: try API key first (existing path, unchanged), else validate OAuth bearer token → `{ userId, authType: 'api-key'\|'oauth', scopes }`. Adopt in the 6 routes the app needs: `os/notes`, `os/notes/[id]`, `os/folders`, `os/snapshots`, `os/snapshots/[noteId]`, `agent/message`. | Unit tests per route × {api-key, oauth token, missing scope → 403, expired token → 401} |
| 0.3 | Resolve open question: are access tokens JWTs (verify via JWKS, stateless) or opaque (lookup in `oauthAccessToken` table)? Pick one, document it. | Test proves tokens survive server restart / work cross-instance |
| 0.4 | Register the dating app as a **confidential client** (seeded, not dynamic — we also want to exercise the dynamic-registration path separately in the test matrix). Redirect URI: `<bff>/auth/callback`. | `curl` authorize → consent → code → token round-trip |

Phase 0 is the only pulse-repo work. Everything after lives in `agent-dating-world/`.

## Phase 1 — Dating backend (BFF), zero own persistence

| # | Step | Verify |
|---|---|---|
| 1.1 | Add `server/` (Hono or Express, TS) next to the Vite app. Routes: `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/apikey` (BYOK), `/me`, `/world`, `/agent`, `/dyads/:id`, `/tick`. Session = encrypted cookie carrying refresh token + pairwise sub; access tokens refreshed on demand (15-min expiry makes refresh path exercise itself). | Login round-trip lands back in SPA with a session |
| 1.2 | BYOK path: user pastes `aicoo_sk_*`; validate via `/v1/os/status`; same session shape, `authType: 'api-key'`. | Same app behavior under both credential types |
| 1.3 | Per-user storage layout (written with the *user's* credential into *their* workspace): `DatingWorld/AGENT.md`, `DatingWorld/memory/grand.md`, `DatingWorld/dyads/<dyadId>.md`, `DatingWorld/policy.md`. Snapshot (`/v1/os/snapshots`) after every dyad write = tamper-evident proof log. | Files visible in the user's own Aicoo workspace UI |
| 1.4 | World storage (operator API key): `World/roster.md`, `World/ticks/<n>.md`, `World/events.md`. Roster holds pairwise subs + display personas only — never other users' tokens. | Roster updates when a second account joins |
| 1.5 | Date engine: one date = N rounds of `/v1/agent/message` between the two players' agents. Before each outbound turn, check the dyad policy gate (network permissions + `policy.md` boundaries). Transcript delta → *each side's own* `dyads/<dyadId>.md` (each side keeps its own view — dyad memory is per-perspective, matching the product thesis and the privacy research angle). | A scripted date between two test accounts produces two distinct dyad files + snapshots |
| 1.6 | World tick: heartbeat on the operator account (or cron → `POST /tick`): matchmaking pass over roster, schedule dates, advance day counter. | Two ticks in a row produce consistent, append-only tick logs |

## Phase 2 — Frontend wiring (existing Vite SPA)

| # | Step | Verify |
|---|---|---|
| 2.1 | Login screen: **"Login with Aicoo"** button (primary) + API-key field (fallback). | Both paths reach the town |
| 2.2 | Agent setup panel writes real `AGENT.md` via the user's credential. | Edit in app → file changes in Aicoo workspace |
| 2.3 | Town + relationship inspector read real data: roster from world notes, dyad memory/trust/spark/boundaries from the user's dyad files, proof log from snapshot history. | Inspector shows a real date's artifacts |

## Phase 3 — OAuth test matrix (the actual point of all this)

Run against staging with ≥2 real Aicoo accounts:

- [ ] Authorization code + PKCE happy path; consent screen shows the new scopes
- [ ] **Pairwise sub**: same user → different `sub` for dating app vs. another client; `sub` ≠ internal Aicoo user id
- [ ] **Refresh flow**: play >15 min, confirm silent refresh; revoke refresh token → forced re-login
- [ ] **Scope enforcement**: token minus `os.snapshots:write` → snapshot call 403s; token can never touch another user's workspace
- [ ] **Consent revocation** from Aicoo settings → BFF session invalidated on next refresh
- [ ] **Dynamic client registration**: register a throwaway client via the public endpoint, complete a login with it, confirm rate limit (10 / 5 min)
- [ ] **BYOK parity**: every app feature works identically with API key; usage lands in `apiUsage`/credits
- [ ] **Negative**: expired code (60 s), reused code, wrong redirect_uri, tampered state — all rejected

Deliverable: a findings doc (`OAUTH_TEST_REPORT.md`) — every rough edge found here is a
pre-launch fix for "Login with Aicoo" itself.

---

## Order & effort

1. **Phase 0** (pulse): ~1 day. Blocks everything; 0.2/0.3 are the substance.
2. **Phase 1** (BFF): ~1–2 days. 1.5 date engine is the fun part; the rest is plumbing.
3. **Phase 2** (SPA): ~1 day against the existing `App.tsx` town.
4. **Phase 3**: continuous from the moment Phase 1.1 works; formal pass at the end.

## Open decisions (defaults chosen, flag if wrong)

- **BFF placement**: separate `server/` inside `agent-dating-world` (keeps the "third-party app" boundary honest — it must not import pulse code, only call public APIs).
- **Confidential client for the app itself**; dynamic registration exercised only as a test case.
- **Dyad memory is per-perspective** (each user's workspace holds their own view), not a shared single file — better privacy semantics and it matches the per-dyad thesis.
- **LLM turns for dates** run through Aicoo's agent runtime via `/v1/agent/message` — the app never calls a model provider directly. That's what "entirely on Aicoo stack" means here.
