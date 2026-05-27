# Scribbly — MVP Build Plan

## Project Overview

Build **Scribbly**, a collaborative open-canvas drawing app with a hand-drawn sketch aesthetic via Rough.js, real-time multiplayer collaboration, and persistent scene storage — all powered by InstantDB (replacing Firebase + Socket.io + Workbox). No authentication. Users land directly on the canvas.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| Drawing engine | Rough.js + HTML5 Canvas |
| Realtime + Persistence | InstantDB |
| Styling | SASS (CSS Modules) |
| Geometry utils | `points-on-curve`, `path-data-parser`, `points-on-path` |
| Color palette | `open-color` |
| Image utils | `pica` |
| Compression | `pako` |
| Performance | `lodash.debounce`, `lodash.throttle` |

**No Firebase. No Socket.io. No Workbox. No login.**

---

## InstantDB Architecture

InstantDB natively covers all three replaced services:

- **Firebase (persistence)** → InstantDB `db.transact()` to save scene elements; `db.useQuery()` to load them. Scene is stored as a flat collection of elements per room.
- **Socket.io (realtime sync)** → InstantDB's built-in reactive subscriptions. All connected clients subscribed to the same room query automatically receive live updates with zero manual socket management.
- **Workbox (offline/PWA)** → InstantDB's optimistic local writes keep the canvas functional during transient disconnects. No service worker needed for MVP.

### Schema

```typescript
// instant.schema.ts
import { i } from "@instantdb/react";

const schema = i.schema({
  entities: {
    rooms: i.entity({
      // NOTE: InstantDB auto-generates `id` as a UUID — do NOT declare it explicitly.
      slug: i.string().unique().indexed(), // short nanoid used in the share URL
      name: i.string(),
      createdAt: i.number(),
    }),
    elements: i.entity({
      roomId: i.string(),       // foreign key to room
      type: i.string(),         // rectangle, ellipse, line, arrow, text, freedraw
      x: i.number(),
      y: i.number(),
      width: i.number(),
      height: i.number(),
      angle: i.number(),
      strokeColor: i.string(),
      backgroundColor: i.string(),
      fillStyle: i.string(),    // hachure, cross-hatch, solid
      strokeWidth: i.number(),
      roughness: i.number(),
      opacity: i.number(),
      points: i.json(),         // for lines, arrows, freedraw
      text: i.string(),
      fontSize: i.number(),
      fontFamily: i.string(),
      textAlign: i.string(),
      seed: i.number(),         // Rough.js reproducible seed
      version: i.number(),      // for conflict resolution
      isDeleted: i.boolean(),
      updatedAt: i.number(),
    }),
  },
});

export default schema;
```

### Room Strategy (no auth)

- On app load, check URL for `?room=<slug>`. If present, query `rooms` by `slug`.
- If no slug in URL, generate a short `nanoid(10)` slug, write it to URL.
- If the queried room doesn't exist yet, create it: the entity `id` is a **UUID** generated via `id()` from `@instantdb/react` (InstantDB rejects non-UUID entity ids); the `slug` field stores the URL-visible nanoid.
- All other entities (elements, etc.) must also use `id()` for their primary key — never raw `nanoid()`.
- Share URL = share canvas. No login required.

---

## Project Structure

```
src/
├── canvas/
│   ├── Canvas.tsx               # Main HTML5 canvas component
│   ├── renderer.ts              # Rough.js render loop
│   ├── elements.ts              # Element factory functions
│   ├── hitTest.ts               # Click/selection detection
│   ├── geometry.ts              # Bounding boxes, transforms
│   └── cursors.ts               # Cursor state per tool
├── tools/
│   ├── SelectionTool.ts
│   ├── RectangleTool.ts
│   ├── EllipseTool.ts
│   ├── LineTool.ts
│   ├── ArrowTool.ts
│   ├── TextTool.ts
│   └── FreeDrawTool.ts
├── ui/
│   ├── Toolbar.tsx              # Left tool picker
│   ├── PropertiesPanel.tsx      # Right side: stroke, fill, roughness
│   ├── ZoomControls.tsx
│   └── ShareButton.tsx          # Copy room URL to clipboard
├── db/
│   ├── instant.ts               # InstantDB init + app ID
│   ├── schema.ts                # InstantDB schema
│   ├── useRoom.ts               # Room create/join hook
│   ├── useElements.ts           # useQuery for elements in room
│   └── mutations.ts             # addElement, updateElement, deleteElement via transact()
├── store/
│   ├── appState.ts              # Zustand: activeTool, selectedIds, viewTransform
│   └── canvasState.ts           # Local optimistic element state before DB write
├── hooks/
│   ├── useHistory.ts            # Undo/redo stack (local)
│   ├── useKeyboard.ts           # Keyboard shortcuts
│   └── usePointer.ts            # Unified mouse/touch/pen events
├── utils/
│   ├── math.ts
│   ├── color.ts
│   └── export.ts                # PNG/SVG export
├── App.tsx
└── main.tsx
```

---

## Core Features — MVP

### 1. Drawing Tools
- **Selection** — move, resize, rotate elements
- **Rectangle** — with Rough.js fill styles
- **Ellipse** — with Rough.js fill styles
- **Line** — straight, with arrowheads optional
- **Arrow** — single/double head
- **Text** — inline editing on double-click
- **Free Draw** — pressure-independent smooth pen

### 2. Canvas Interactions
- Pan — middle mouse drag or Space+drag
- Zoom — scroll wheel, pinch on touch, +/- buttons
- Multi-select — drag selection box, Shift+click
- Move — drag selected elements
- Resize — 8-handle bounding box
- Rotate — rotation handle above bounding box
- Delete — Backspace/Delete key
- Duplicate — Ctrl/Cmd+D
- Group/Ungroup — Ctrl/Cmd+G

### 3. Styling Properties
- Stroke color (open-color palette)
- Background/fill color
- Fill style: hachure, cross-hatch, solid, none
- Stroke width: thin / bold / extra-bold
- Roughness: 0 (architect) → 2 (sketchy)
- Opacity slider
- Font family + size (for text elements)

### 4. Realtime Collaboration via InstantDB
- Auto-join or create room from URL param
- Subscribe to `elements` filtered by `roomId` via `db.useQuery()`
- On local draw complete → `db.transact(db.tx.elements[id].update({...}))`
- Remote changes stream in automatically via InstantDB reactivity
- Optimistic local updates: render immediately, DB confirms async
- Conflict resolution: `version` field, last-write-wins per element

### 5. Persistence
- Scene auto-saves to InstantDB on every element change (debounced 300ms)
- Reload URL → full scene restored from DB query
- No manual save button needed

### 6. Export
- Export as PNG (canvas `toDataURL`)
- Export as SVG (reconstruct SVG from element data)
- Copy to clipboard (PNG)

### 7. Undo / Redo
- Local history stack only (not synced across peers for MVP)
- Ctrl+Z / Ctrl+Shift+Z
- Max 50 history states

---

## Rendering Architecture

```
InstantDB useQuery
       ↓
  elements[] (source of truth)
       ↓
  local optimistic layer (Zustand)
       ↓
  render loop (requestAnimationFrame)
       ↓
  Rough.js → CanvasRenderingContext2D
```

- Each element has a `seed` (integer). Rough.js uses the seed to produce the same hand-drawn jitter on every render — critical for consistency across clients.
- The render loop redraws the full canvas on every frame when dirty. No incremental patching for MVP.
- Text elements use native `ctx.fillText()` — no Rough.js.
- View transform (pan/zoom) applied as `ctx.setTransform()` before drawing.

---

## InstantDB Integration Details

```typescript
// db/instant.ts
import { init } from "@instantdb/react";
import schema from "./schema";

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema,
});

// db/useElements.ts
export function useElements(roomId: string) {
  const { data, isLoading } = db.useQuery({
    elements: {
      $: { where: { roomId, isDeleted: false } },
    },
  });
  return { elements: data?.elements ?? [], isLoading };
}

// db/mutations.ts
export function addElement(element: ScribblyElement) {
  db.transact(
    db.tx.elements[element.id].update({
      ...element,
      updatedAt: Date.now(),
    })
  );
}

export function updateElement(id: string, patch: Partial<ScribblyElement>) {
  db.transact(
    db.tx.elements[id].merge({
      ...patch,
      version: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

export function deleteElement(id: string) {
  db.transact(db.tx.elements[id].update({ isDeleted: true }));
}
```

---

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  [Toolbar — left vertical strip]                │
│  Select / Rect / Ellipse / Line / Arrow /       │
│  Text / FreeDraw / Eraser                       │
│                                                 │
│              < Canvas >                         │
│                                                 │
│                         [Properties — right]    │
│                         Stroke / Fill /         │
│                         Roughness / Opacity     │
│                                                 │
│  [Zoom controls — bottom left]    [Share — BR]  │
└─────────────────────────────────────────────────┘
```

- Toolbar: icon buttons, active tool highlighted
- Properties panel: only visible when a tool or element is active
- Share button: copies `?room=<id>` URL to clipboard
- No top nav bar, no sidebar — full canvas

---

## Environment Variables

```
VITE_INSTANT_APP_ID=your_instantdb_app_id
```

---

## Implementation Order

1. **Scaffold** — Vite + React + TS + SASS, install all deps
2. **InstantDB setup** — `instant.ts`, `schema.ts`, push schema with `npx instant-cli push-schema`
3. **Room logic** — URL param handling, room create/join, `useRoom.ts`
4. **Canvas foundation** — blank canvas, pan/zoom, coordinate transforms
5. **Rough.js renderer** — render a hardcoded rectangle to verify pipeline
6. **Element model** — TypeScript types for all element variants
7. **Drawing tools** — Rectangle first, then Ellipse, Line, Arrow, FreeDraw, Text
8. **Selection + transform** — hit test, bounding box, move, resize, rotate
9. **Properties panel** — wire stroke/fill/roughness to element state
10. **InstantDB sync** — replace local-only state with DB reads/writes
11. **Undo/redo** — local history stack
12. **Export** — PNG + SVG
13. **Share button** — URL copy
14. **Polish** — keyboard shortcuts, cursor changes, zoom controls

---

## Dependencies

```json
{
  "dependencies": {
    "@instantdb/react": "latest",
    "roughjs": "^4.6.4",
    "open-color": "^1.4.3",
    "pako": "^2.1.0",
    "pica": "^9.0.1",
    "lodash.debounce": "^4.0.8",
    "lodash.throttle": "^4.1.1",
    "nanoid": "^5.0.0",
    "zustand": "^4.5.0",
    "points-on-curve": "latest",
    "path-data-parser": "latest",
    "points-on-path": "latest",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sass": "^1.77.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "latest",
    "typescript": "^5.4.0",
    "vite": "^5.0.0"
  }
}
```

---

## Out of Scope for MVP

- Authentication / user accounts
- Cursors of other users shown on canvas (presence)
- Element locking
- Frames / sections
- Dark mode
- Mobile touch full support (desktop-first)
- PWA / offline service worker
- Libraries (shape collections) — planned as a post-MVP feature, see **Post-MVP: Libraries** below

---

## Post-MVP: Libraries

> Ship this **after** the 14-step MVP order completes. It is additive — no MVP step depends on it.

### Concept

A **library** is a saveable, shareable set of reusable shape groups ("library items") that a user can drop onto any canvas like a sticker pack. Each library item is a small array of regular Scribbly elements — same schema as canvas elements. Two things must work:

1. **Personal libraries that follow the user across devices.** Live-synced via InstantDB, addressable by a long random ID stored in `localStorage` (and copy-pasteable for moving between machines). Same trust model as rooms — no auth.
2. **Portability via file export/import.** A `.scribblylib` JSON file the user can download, share over any channel, and re-import on any device or in any compatible tool.

Both ship together. (1) gives day-to-day convenience, (2) gives durability and ecosystem reach (e.g. future community marketplace).

### File format — `.scribblylib` v1

```jsonc
{
  "type": "scribblylib",
  "version": 1,
  "source": "https://scribbly.app",
  "libraryItems": [
    {
      "id": "<uuid>",
      "name": "Server Rack",
      "elements": [ /* ScribblyElement[] — same shape as canvas elements */ ],
      "preview": "data:image/png;base64,...",   // optional, used for sidebar thumbnails
      "createdAt": 1700000000000
    }
  ]
}
```

- `elements` arrays MUST be self-contained: any element referenced by `boundElements`, group ids, or arrow bindings must also be present in the item.
- Items are positioned relative to the item's own top-left corner (item is normalized on save). On insert, the importer re-offsets to the drop point.

### Schema additions (InstantDB)

```typescript
libraries: i.entity({
  ownerKey: i.string().indexed(),     // long random string from localStorage; the "share key"
  name: i.string(),
  isPublic: i.boolean(),              // future: community catalog flag
  source: i.string(),                 // origin URL; defaults to scribbly.app
  createdAt: i.number(),
  updatedAt: i.number(),
}),
libraryItems: i.entity({
  libraryId: i.string().indexed(),    // foreign key to libraries
  name: i.string(),
  elements: i.json(),                 // ScribblyElement[]
  preview: i.string(),                // data URL or empty string
  createdAt: i.number(),
}),
```

Same id rules as the rest of the schema: every entity id is a UUID via `id()` from `@instantdb/react`; `ownerKey` is a separate user-facing string (similar to a room slug).

### Cross-device access (no auth)

- On first launch, generate `ownerKey = nanoid(24)`; persist to `localStorage` under `scribbly:libraryKey`.
- All personal libraries are created with that `ownerKey`. Settings panel exposes "My library key" with copy/paste — pasting a key on another device switches Scribbly to that key, instantly listing the same libraries.
- Anyone with the key has full read/write. That is the explicit trust model — same as room slugs today.

### File structure

```
src/
├── libraries/
│   ├── types.ts                # ScribblyLibrary, LibraryItem types + .scribblylib v1 schema
│   ├── useLibraries.ts         # db.useQuery wrapper (lists by ownerKey)
│   ├── useLibraryItems.ts      # db.useQuery wrapper (items of a library)
│   ├── mutations.ts            # createLibrary, addItem, deleteItem, renameItem via db.transact
│   ├── normalize.ts            # strip ids, recompute new ids+seeds, offset to (0,0) on save
│   ├── insertItem.ts           # clone item elements with fresh ids/seeds at a drop point
│   ├── exportLibrary.ts        # serialize to .scribblylib JSON blob + download
│   ├── importLibrary.ts        # parse .scribblylib, validate, write items via transact
│   └── preview.ts              # render item elements offscreen via Rough.js → data URL
└── ui/
    └── LibrarySidebar.tsx      # right-side panel: list, search, drag-to-canvas, export/import buttons
```

### Insert flow (the only non-trivial bit)

For each element in the item:
- new `id` via `id()`
- new `seed` (random integer) so the same item dropped twice has different roughness jitter
- new group ids and `boundElements` references re-mapped through a local `oldId → newId` map
- offset by `dropPoint - itemBoundsTopLeft`

Then a single `db.transact([...])` batches all inserts. Use the standard 300 ms write debounce only for in-flight library *edits*; the drop-insert is a one-shot user action — transact immediately.

### Out of scope for this Post-MVP slice

- Community marketplace / public library catalog. That's a separate downstream surface: a static catalog (Next.js or plain HTML) holding `libraries.json` manifests + `.scribblylib` files, with a deep-link `?addLibrary=<url>` handler on Scribbly to import.
- Library item editing inside the sidebar (open original group on canvas to edit, then "Save changes").
- Per-item versioning / change history.
- Library-level access controls beyond the `ownerKey` model.

### Implementation order (post-MVP step 15+)

15. Schema additions + push (`libraries`, `libraryItems`)
16. `ownerKey` generation and persistence
17. Mutations + queries (`useLibraries`, `useLibraryItems`)
18. "Save selection to library" flow (normalize → store)
19. `LibrarySidebar` UI with previews
20. Drag/click insert with re-id/re-seed
21. `.scribblylib` export (download as JSON file)
22. `.scribblylib` import (file picker + drag-and-drop file onto sidebar)
23. Settings: show/copy/paste library key for cross-device sync

---

## Post-MVP: Library Marketplace (Community Gallery)

> Ship after the personal-library slice (steps 15–23) is stable. Goal: let anyone browse and one-click install community-curated `.scribblylib` packs from inside Scribbly, **without introducing auth, a backend, or moderation staff Scribbly has to pay for**.

### Why a PR-based registry (and not a free-for-all upload form)

Excalidraw runs the same model and it is the only sane spam control for an unauthenticated app:

- No login → no rate limit, no abuse signal, no takedown lever besides removing the content.
- A public upload endpoint without those levers becomes a porn/malware/scam host within a week.
- GitHub already gives us identity (the PR author), free hosting (Pages or raw content), free CI (Actions), and free moderation tooling (PR review + revert).

So the marketplace is a **separate public GitHub repo** — `scribbly-libraries` — that holds approved `.scribblylib` files and a generated `libraries.json` manifest. Scribbly's in-app gallery is a read-only client over that manifest. No new server, no DB tables, no admin panel.

### Submission flow (the spam wall is the PR review)

1. Author exports a `.scribblylib` from Scribbly.
2. Author opens a PR in `scribbly-libraries` adding two files under `submissions/<github-handle>/<library-slug>/`:
   - `library.scribblylib` — the file itself
   - `meta.yaml` — human-edited metadata (name, description, tags, license, homepage)
3. CI runs `validate.ts`:
   - JSON Schema validation against `.scribblylib` v1 + meta schema
   - **Hard rejects** any submission that fails any of the **automated rules** below — the maintainer never even sees malformed PRs.
4. Maintainer reviews remaining PRs against the **content guidelines** (subjective rules below). Approves or requests changes.
5. On merge, a release Action regenerates `libraries.json`, renders missing `preview.png` files, writes a SHA-256 to each entry, and publishes to `https://libraries.scribbly.app/` (GitHub Pages).

Author identity = GitHub handle. Removal = revert PR + republish manifest. Reports = pre-filled GitHub issue, accessible from a "Report" button in the gallery.

### Automated rules (CI rejects before human review)

| Rule | Enforced by |
|---|---|
| File parses as valid JSON | `JSON.parse` |
| Matches `.scribblylib` v1 JSON Schema | `ajv` |
| File size ≤ 512 KB | `fs.statSync` |
| Each `libraryItems[].elements` is self-contained (no dangling `boundElements` / group ids) | `validate.ts` |
| ≥ 3 items per library | length check |
| Each item ≥ 2 elements **or** a non-trivial single element (text > 0 chars, freedraw with > 10 points, etc.) | `validate.ts` — blocks "library of single arrows" submissions |
| All `seed` values are integers | type check |
| All text content passes `is-english` (basic Latin + common punctuation, ≥ 90% characters) | regex |
| `meta.yaml` declares a valid SPDX license id from an allowlist: `MIT`, `Apache-2.0`, `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0` | SPDX check |
| `meta.yaml.name` ≤ 60 chars; `description` ≤ 280 chars; ≤ 8 tags from a controlled vocabulary | string checks |
| Slug `<github-handle>/<library-slug>` is unique and not previously used by a different handle | filesystem + git history |
| No binary blobs other than the optional embedded preview PNG in the `.scribblylib` | type check on JSON values |

### Content guidelines (subjective — human review)

Borrowed from Excalidraw's published rules, tightened slightly:

1. **English only** in titles, descriptions, tags, and any in-item text labels.
2. **Original work** or clearly attributed remix with permission compatible with the declared license. No copies of other published libraries without significant added value.
3. **Broad utility** — the library is useful to someone who is not the author. Pure personal-use libraries (your team's org chart, your D&D campaign map) are out.
4. **Thematic coherence** — items in one library belong together. Mixed-bag libraries are split or rejected.
5. **Grouped items** — multi-element items must be saved as groups so they insert as a single unit. (Validator can't always tell intent; reviewer enforces.)
6. **No trivially reproducible content** — single arrows, single rectangles, single text labels. The validator's "non-trivial" check catches the obvious cases; the reviewer catches the rest.
7. **Safe content** — no porn, gore, hate symbols, real-person likenesses without consent, brand logos used in misleading ways, or content designed to deceive (fake UI mocking real bank login pages, etc.). Removal is unilateral.

These live in `CONTRIBUTING.md` in the registry repo, linked from the PR template.

### Registry repo layout

```
scribbly-libraries/
├── README.md
├── CONTRIBUTING.md             # the rules above, plus PR walkthrough
├── LICENSE
├── package.json
├── schemas/
│   ├── scribblylib.schema.json # JSON Schema for .scribblylib v1
│   └── meta.schema.json        # JSON Schema for meta.yaml
├── scripts/
│   ├── validate.ts             # runs in CI on each PR
│   ├── build-manifest.ts       # regenerates libraries.json + previews on merge
│   └── render-preview.ts       # headless canvas → preview.png (uses shared renderer pkg)
├── submissions/
│   └── <github-handle>/
│       └── <library-slug>/
│           ├── library.scribblylib
│           ├── meta.yaml
│           └── preview.png     # generated on merge; do not commit by hand
├── libraries.json              # generated; the only file the app reads
└── .github/
    ├── workflows/
    │   ├── validate.yml        # on PR → validate
    │   └── publish.yml         # on push to main → build manifest + deploy Pages
    └── PULL_REQUEST_TEMPLATE.md
```

### Manifest format — `libraries.json` v1

```jsonc
{
  "type": "scribbly-libraries-manifest",
  "version": 1,
  "generatedAt": 1700000000000,
  "libraries": [
    {
      "slug": "wissam/server-rack",
      "name": "Server Rack",
      "description": "Datacenter rack units, switches, cables. Good for infra diagrams.",
      "author": { "handle": "wissam", "url": "https://github.com/wissam" },
      "homepage": "https://example.com/server-rack",
      "license": "CC-BY-4.0",
      "tags": ["infrastructure", "diagrams"],
      "itemCount": 12,
      "version": "1.0.0",                                              // semver, bumped per merged update
      "preview": "https://libraries.scribbly.app/p/wissam/server-rack.png",
      "download": "https://libraries.scribbly.app/d/wissam/server-rack-1.0.0.scribblylib",
      "sha256": "<hex>",                                               // integrity check at install time
      "publishedAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

- **Versioning** — bumping `meta.yaml.version` is the only way to publish an update to an existing slug. Old versions stay reachable at their pinned URL so deep links don't break.
- **Integrity** — the in-app importer computes SHA-256 after download and refuses to install on mismatch. Mitigates a compromised CDN serving tampered bytes.

### In-app: gallery UI

A new tab inside the existing `LibrarySidebar`:

- **My libraries** (current) | **Browse**
- Browse tab fetches `https://libraries.scribbly.app/libraries.json` once per session (HTTP cache headers handle revalidation).
- Search by name / tag, filter by license.
- Each card: preview thumbnail, name, author handle (link to GitHub), item count, license badge, **Install** button, overflow menu with **Report** (pre-filled GitHub issue link) and **View source** (link to the registry path).
- **Install** = `PromptDialog` ("Add to your libraries as…") → fetch `.scribblylib` → verify SHA-256 → reuse the existing `importLibraryFromFile` path → land in the user's personal libraries under the chosen `ownerKey`.
- A small banner on installed cards: "Installed — v1.0.0. Update available" when manifest version > installed version.

### Deep-link install

`https://scribbly.app/?addLibrary=<download-url>` opens Scribbly, fetches the file, shows the install confirm dialog with the metadata pre-filled. Only URLs whose host is in an allowlist (`libraries.scribbly.app` initially) auto-confirm; anything else shows a "third-party library — proceed?" warning explaining that the file has not been reviewed by Scribbly maintainers.

This is what makes "share a library" feel like a single link instead of "download file, open Scribbly, import."

### File structure additions in the app

```
src/
├── libraries/
│   ├── marketplace/
│   │   ├── manifest.ts         # fetch + cache libraries.json
│   │   ├── installFromUrl.ts   # fetch .scribblylib + SHA-256 verify + import
│   │   └── types.ts            # ManifestEntry, ManifestV1
│   └── … (existing personal-library files)
└── ui/
    ├── LibrarySidebar.tsx      # add tab switcher
    ├── BrowseTab.tsx           # gallery grid
    ├── LibraryCard.tsx         # single entry card
    └── InstallLibraryDialog.tsx # confirm + name + install
```

No new env vars. The manifest URL is a build-time constant: `VITE_LIBRARY_REGISTRY_URL`, defaulting to `https://libraries.scribbly.app/libraries.json`.

### Out of scope for this slice

- Ratings, comments, download counts. (Adding them needs auth or invites spam-bots back in.)
- In-app upload / "Publish to gallery" button. The PR-based flow is intentionally manual — friction is the feature, not a bug.
- Author profile pages or following.
- Paid libraries.
- Localized non-English libraries. (Possible later via a per-language manifest, but not v1.)
- Library updates auto-applied without user consent.

### Implementation order (post-MVP step 24+)

**Registry repo (separate from this app):**

24. Bootstrap `scribbly-libraries` repo: README, CONTRIBUTING (the guidelines above), LICENSE, PR template.
25. Write `scribblylib.schema.json` + `meta.schema.json` and unit-test against fixtures.
26. Write `validate.ts` covering all automated rules in the table above; wire to `validate.yml` on PR.
27. Write `render-preview.ts` (shared renderer extracted to an `@scribbly/renderer` package or imported from this repo as a submodule) + `build-manifest.ts`; wire to `publish.yml` on push to main; configure GitHub Pages.
28. Seed the registry with 3–5 first-party libraries so the gallery is non-empty at launch.

**Scribbly app:**

29. `src/libraries/marketplace/manifest.ts` — fetch + 1h memory cache + session storage fallback for offline.
30. `BrowseTab.tsx` + `LibraryCard.tsx` — grid, search, tag filter, license badges.
31. `installFromUrl.ts` — fetch, SHA-256 verify, hand off to existing `importLibraryFromFile`.
32. `InstallLibraryDialog.tsx` — name confirmation, target `ownerKey` selection.
33. Deep-link handler in `App.tsx` for `?addLibrary=` with allowlist + third-party warning.
34. "Update available" banner driven by manifest `version` vs installed `version` (store `sourceSlug` + `sourceVersion` on imported libraries to enable this).
35. Report button → pre-filled GitHub issue URL builder.