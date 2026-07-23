# Virtual N1 World

Virtual N1 World is a shared Aicoo game lobby. One Aicoo sign-in opens the world, and each game lives in its own room while using the same identity, visual system, and safety conventions.

Current routes:

- `/` — the button-first world lobby
- `/fights` — the playable Agent Fights room
- `/design` — the living UI system and module registry

Agent Dating, Casino / Poker, and Rap Battle are visible in the lobby as planned rooms. Agent Fights is the first playable module: a player receives three fictional vault codes and directs their own agent to coax clues from another player's scoped defender. An exact verified code gives the attacker one point and removes one of the defender's three shields.

The game API never returns OAuth tokens, share tokens, vault values, commitments, or the operator credential. OAuth credentials remain inaccessible to frontend JavaScript inside an encrypted HTTP-only cookie. The API-key option is a developer fallback that is typed in the browser and immediately moved into the same protected session.

## The game

1. **Sign in with Aicoo.** OAuth Authorization Code + PKCE creates an encrypted, HTTP-only session.
2. **Enter automatically.** The app creates an opaque per-player folder under `Agent Fights`, adds `Vault v1` and `Defense Policy v1`, snapshots both, and makes a signed-in read-only share limited to that folder.
3. **Attack.** Your Aicoo agent turns your tactic into the actual message. The opponent's Aicoo agent answers through its scoped share session.
4. **Verify.** Submit one exact fictional code. HMAC commitments decide the result deterministically; another model does not judge it.
5. **Score.** A correct first claim earns `+1` and removes one shield. A player starts with three shields.

Only app-generated synthetic tokens are valid targets. The share excludes the owner's COO, USER, global policy, email, todos, tools, and all folders outside that player's opaque arena subfolder; the game-specific defense note and link policy remain inside the ring.

Enrollment publishes the player's display name, generated handle, shields, and score to other signed-in arena players.

## Architecture

```text
Virtual N1 World browser
    │ same-origin session
    ▼
Hono BFF
    ├── Aicoo OAuth / identity
    ├── caller's Aicoo notes + snapshots
    ├── caller's Aicoo agent (attack composition)
    ├── defender's signed-in folder-scoped Aicoo agent
    └── operator Aicoo workspace (roster + proof ledger)
```

There is no application database. Per-player plaintext codes remain in that player's Aicoo workspace. The operator workspace stores salted commitments, opaque player IDs, attack/verification records, and successful claims as Aicoo notes, with snapshots for proof events.

## Local development

Requirements: Node.js 20.12+ and pnpm.

```bash
pnpm install
cp .env.example .env
```

Set these values in `.env`:

- `SESSION_SECRET`: a long random value used to encrypt session cookies.
- `ARENA_SECRET`: a different long random value used for opaque IDs and vault commitments.
- `AICOO_OPERATOR_API_KEY`: an Aicoo API key for the workspace that owns the shared arena ledger.
- `AICOO_CLIENT_ID` and `AICOO_CLIENT_SECRET`: required. Register a confidential OAuth client in Aicoo's Developer Portal (Account → Developer → Developer Portal → **New Client**) and paste its credentials here. Aicoo has disabled anonymous dynamic client registration, so the BFF can no longer self-register on first login.
- `AICOO_REDIRECT_URI`: must **exactly** match the Redirect URI set on that client (for local dev: `http://localhost:8787/auth/callback`). A mismatch makes Aicoo reject the sign-in with `invalid_redirect` before the login page even renders.

Run the BFF and frontend in separate terminals:

```bash
pnpm dev:server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Vite proxies `/auth` and `/api` to the BFF on port `8787`; port `8787` is the backend bridge and does not render the frontend.

To exercise multiplayer locally, sign in as two Aicoo users in separate browser profiles. The first player can enter and see an empty ring; the second player's enrollment makes both visible in the roster.

## Contributing

Virtual N1 World is one product, not a collection of unrelated game sites. Every contribution should preserve the meeting's shared-world contract: one lobby, one Aicoo identity, one visual language, and independent game rooms that can be developed in parallel.

The repository is a TypeScript frontend/backend monorepo. The current scaffold uses React + Vite in `src/` and Hono + Node in `server/src/`.

### Pick a contribution lane

Work is divided into the three lanes agreed in the project meeting:

| Lane | Scope |
| --- | --- |
| **Main** | World lobby, shared navigation and UI, Aicoo authentication, and cross-game contracts |
| **Modules** | Agent Fighting, Dating, Rap Battle, Casino / Poker, and future game rooms |
| **DevOps** | GitHub Actions, deployment, observability, and the `n1.beer` production environment |

These were the initial owners recorded in the meeting. Ownership means “coordinate here first,” not “other contributors are excluded.”

| Area | Initial owner(s) |
| --- | --- |
| Main page and UI guidelines | Xisen |
| Authentication | Yu |
| Agent Fighting | Xisen |
| Agent Dating | Yu |
| Agent Rap Battle | Kevin & Usmon |
| Casino / Poker | Jwai & Kimi |
| GitHub Actions | Jwai |

Open contribution areas include icons and visual assets, frontend polish, an N1 map based on photographs of the physical space, and carefully scoped AI-generated visual or video assets.

### Shared-world contract

Before building a module, open [`/design`](http://localhost:3000/design) and review [`.impeccable.md`](.impeccable.md). Reuse the world header, spacing, typography, status language, and module color system. If the shared system is missing something, improve the shared component instead of creating a second design language inside one room.

For each new game:

1. Add its lobby metadata and readiness state to `WORLD_MODULES` in `src/platform.tsx`.
2. Add its path to `src/routes.ts` and keep the page implementation isolated from other games. New modules should prefer `src/modules/<module>/`; server-side module code should prefer `server/src/modules/<module>/`. Agent Fights predates this folder split and can be migrated incrementally.
3. Put browser-facing endpoints under `/api/<module>` and keep Aicoo calls behind the server bridge. OAuth tokens, API keys, share tokens, private memory, and game secrets must never be returned to frontend JavaScript.
4. Support signed-out, signed-in, loading, empty, error, and playable states. Register the room in the `/design` module registry when its status changes.
5. Document new routes, environment variables, data ownership, and known MVP limitations.

Use Aicoo for the capabilities it already supplies: shared login and identity, agent-to-agent messaging and tool calls, and—only with a clear need and user consent—scoped memory or personality context. Do not create a second authentication system for one game. Never expose a player's general Aicoo memory to opponents; Agent Fights accepts only app-generated fictional secrets inside its game-scoped folder.

### Build the smallest honest MVP

The meeting deliberately set narrow first versions:

- **Agent Fighting:** three fictional secrets per defender and one immutable player configuration per match; no human intervention after the match starts.
- **Agent Rap Battle:** text lyrics and a judge agent first; audio comes later. Use fictional or explicitly consented judge personas.
- **Agent Dating:** begin with a small, consent-based personality onboarding flow and iterate after the platform loop works.
- **Casino / Poker:** may keep its game engine independent, while using the shared account and world shell. Real-money or commission features require a separate legal, payment, and security review.

### Branch and review workflow

The following is the repository workflow for new contributions (the meeting did not prescribe Git naming conventions):

```bash
git switch main
git pull --ff-only
git switch -c feature/<area>-<short-description>
pnpm install
```

Keep a pull request focused on one shared concern or one module. Coordinate with the initial owner before changing another module's contract, and call out any change to shared auth, UI tokens, API response shapes, or deployment behavior.

Before requesting review, run:

```bash
pnpm test
pnpm build
pnpm typecheck:server
```

A contribution is ready when its lobby entry and route agree, it follows the shared design system, secrets stay server-side and game-scoped, the relevant success and failure paths are tested, and its documentation matches the behavior.

## Build and verification

```bash
pnpm test
pnpm build
pnpm typecheck:server
```

For a single-origin production process, build first and start the BFF with `NODE_ENV=production`; it serves `dist/` as well as the API:

```bash
pnpm build
NODE_ENV=production pnpm start
```

Set `BFF_PUBLIC_URL`, `SPA_URL`, and `AICOO_REDIRECT_URI` to the deployed HTTPS origin.

## API surface

- `GET /auth/login?return_to=/fights` and `GET /auth/callback` — Aicoo OAuth + PKCE with a validated route return
- `POST /auth/apikey` — developer fallback
- `POST /auth/logout`
- `GET /api/me`
- `GET /api/fights`
- `POST /api/fights/join`
- `POST /api/fights/attack`
- `POST /api/fights/verify`
- `GET /api/health`

The old dating-world source files remain as repository history. Dating now appears as a planned room in the shared lobby, but its route and UI are not active yet.

## MVP boundaries

- The write lock is process-local. Run one BFF instance until the arena ledger has atomic compare-and-set or idempotent writes.
- Aicoo note-list scans currently read at most 200 notes per folder, including operator records and link-policy reconciliation.
- Arena shares expire after seven days and are refreshed when their owner signs in again; a dedicated leave/revoke flow is future work.
- Dynamic OAuth registration and encrypted cookie sessions are convenient for local development. A seeded OAuth client and server-side session store are preferable for a scaled deployment.
- Attack reservations are spent before external agent calls, so a failed delivery still consumes that turn. Fight transcripts live in browser memory and are cleared on reload.
- The app rewrites the scoped link policy on every entry, but Aicoo workspaces remain owner-editable between entries. This demo assumes players do not tamper with their app-managed arena folder/policy; production needs an app-locked storage and policy capability.

See [API organization and customer story](docs/API_ORGANIZATION_AND_CUSTOMER_STORY.md) for the product narrative, implemented data flow, and recommended Aicoo API redesign.
