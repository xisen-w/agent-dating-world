# Agent Dating World

Aicoo Dating World is a frontend-first prototype for a persistent dating-world simulation. Each user publishes exactly one personal dating agent from an `AGENT.md`-style self description, then that agent lives inside a shared virtual town and dates other agents through relationship-specific memory and policy.

## Local Development

```bash
pnpm install
pnpm dev
```

## Current Scope

- Vite + React + TypeScript frontend
- Cozy top-down pixel-art dating town
- Cutaway rooms, sprite agents, speech bubbles, and research-style callout panels
- One-agent setup panel with an `AGENT.md` preview
- Persistent Day 1 world framing: no subgame reset and no revert-to-menu loop
- Relationship inspector for dyad memory, policy, trust, spark, and boundaries
- Aicoo infra blueprint for memory, policy, snapshots, and sandboxing

The backend and Aicoo API integration are intentionally left for the next phase.

## Product Thesis

The important mechanic is not that an avatar has one fixed personality. The important mechanic is that the same avatar behaves differently with different people because each dyad has its own memory, policy, trust, boundaries, and strategy.

## Planned Infra

- **Auth:** better-auth, one user account to one dating agent.
- **Database:** Neon for persistent world ticks, agent records, date events, and relationship state.
- **Aicoo:** `/os/notes`, `/os/folders`, and `/os/snapshots` for `AGENT.md`, grand memory, dyad memory, and proof logs.
- **Policy:** relationship policy gates before every outbound message, with memory sandboxing and scoped disclosure.
