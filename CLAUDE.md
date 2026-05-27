# CLAUDE.md

## Project
Scribbly — a collaborative hand-drawn whiteboard app backed by InstantDB. Read PLAN.md fully before writing any code — it is the single source of truth for architecture, schema, file structure, and implementation order. Do not deviate from it without flagging the reason.

## Naming
The app is called **Scribbly**. Do not use the name of any other drawing app in code, UI, comments, file names, or docs. Library file extension: `.scribblylib`.

## Rules
- Follow the 14-step implementation order in PLAN.md exactly. Complete each step before starting the next.
- TypeScript strict mode everywhere. No `any`.
- All DB reads via `db.useQuery()`, all writes via `db.transact()`. Never write raw fetch calls to InstantDB.
- Zustand for local UI state only. InstantDB is the source of truth for elements.
- Every drawn element must include a `seed` (integer) for Rough.js reproducibility.
- Debounce DB writes 300ms. Never write on every mouse move event.
- No Firebase, no Socket.io, no Workbox, no service workers.
- No authentication. Room ID from URL param `?room=<id>` is the only access control.

## Stack
React 19 + TypeScript + Vite + Rough.js + InstantDB + Zustand + SASS. See PLAN.md for full dependency list.

## Env
`VITE_INSTANT_APP_ID` — required. Read from `.env`. Never hardcode.

## Code Style
- Functional components only, no class components.
- Co-locate types with the module that owns them.
- Canvas rendering logic stays in `src/canvas/` — never in React components.
- React components handle input/state only; pass element data down to renderer.

## On Errors
If a step in PLAN.md is ambiguous or technically conflicting, stop and ask before proceeding. Do not guess and move on.