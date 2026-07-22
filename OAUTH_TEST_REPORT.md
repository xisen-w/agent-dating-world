# Login with Aicoo — OAuth Test Matrix (v1)

> **Historical baseline.** This report predates the Agent Fights UI and fight engine; the OAuth findings remain useful, but current verification commands and boundaries are documented in [`README.md`](README.md).

> Date: 2026-07-06 · Tester: Claude (with Xisen)
> System under test: pulse working tree (`codex/pact-submission-benchmark` + Phase 0 changes),
> local dev server at `localhost:3000`, production `www.aicoo.io` for API-key paths.
> Client under test: `agent-dating-world` BFF (`server/`).

## Results

| # | Case | Result | Evidence |
|---|------|--------|----------|
| 1 | Discovery doc advertises OS scopes | ✅ PASS | `/.well-known/oauth-authorization-server` lists `os.notes:read/write`, `os.snapshots:read/write`, `agent.message:send` |
| 2 | Dynamic client registration — public client (PKCE, `token_endpoint_auth_method: none`) with OS scopes | ✅ PASS | client_id issued, full requested scope granted |
| 3 | Dynamic client registration — confidential client, unauthenticated | ⚠️ FINDING | Rejected: "Authentication required for confidential client registration". Unauthenticated DCR is public-clients-only. BFF adjusted to register as public+PKCE; confidential requires seeded credentials. |
| 4 | Authorize: valid client + OS scopes + PKCE + resource | ✅ PASS | 302 → signed `/auth/signin` redirect carrying full OAuth context |
| 5 | Authorize: unknown scope (`os.admin:godmode`) | ✅ PASS | 302 → redirect_uri with `error=invalid_scope` naming the invalid scope |
| 6 | Authorize: `resource` not in validAudiences | 📝 OBSERVATION | Not rejected at authorize; plugin validates resource at the **token endpoint** (fails late). Acceptable per RFC 8707 but means bad integrations discover it only after login+consent. |
| 7 | v1 resource route with garbage Bearer (non-API-key) | ✅ PASS | 401 `unauthorized` with actionable message pointing at the resource parameter requirement (OAuth code path engaged) |
| 8 | v1 resource route with no credential | ✅ PASS | 401 with API-key-or-token guidance |
| 9 | v1 resource route with valid API key (BYOK parity) | ✅ PASS | Full dating-app loop ran against production with an API key: identity, folders, notes, snapshots, agent messaging |
| 10 | Scope enforcement unit tests (`resolveV1Auth`) | ✅ PASS | 9/9 jest tests: missing scope → 403 `insufficient_scope`, expired/garbage JWT → 401, unknown-user sub → 401, scope normalization |
| 11 | Existing API-key routes unaffected | ✅ PASS | `agent/message` test suite passes; `tsc --noEmit` clean repo-wide |
| 12 | Full authorize → consent → code → token → userinfo | ⏳ PENDING STAGING | Requires a real signed-in browser user; Phase 0 not yet deployed |
| 13 | Refresh flow (15-min expiry) | ⏳ PENDING STAGING | BFF implements silent refresh (60s pre-expiry window); needs live tokens |
| 14 | Pairwise sub isolation | ⏳ PENDING STAGING | Access-token `sub` confirmed to be the real user id in plugin source (pairwise applies to ID token/userinfo only) — needs runtime confirmation |
| 15 | Consent revocation → session invalidation | ⏳ PENDING STAGING | |
| 16 | DCR rate limit (10 per 5 min) | ⏳ PENDING STAGING | Deliberately not hammered on the shared dev server |

## Pre-launch fixes recommended for "Login with Aicoo"

1. **Public-vs-confidential DCR asymmetry** (case 3) should be documented for
   third-party developers; today the error message is the only documentation.
2. **Late resource validation** (case 6): consider validating `resource` at the
   authorize endpoint too, so misconfigured apps fail before user login.
3. The v1 401 message for non-JWT bearers is developer-friendly — keep it.
4. `/api/v1/identity` is still API-key-only; a "Login with Aicoo" app has to use
   OIDC userinfo instead. Either scope-enable identity or document the split.
5. Only 6 of ~57 v1 route handlers accept OAuth tokens so far (notes list/get/
   create/edit, folders, snapshots list/save, agent message). The rest —
   including `os/notes/search`, `os/notes/grep`, move/pin/copy, snapshot
   restore — still hard-require API keys and need the same `resolveV1Auth`
   migration before GA.
