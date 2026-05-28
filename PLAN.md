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

## Post-MVP: Library Gallery (web-based, replaces the GitHub registry)

> **Update — web-based rewrite.** The community gallery is now a self-contained, in-app system backed by InstantDB with magic-code sign-in. The earlier GitHub PR–based registry (the `scribbly-libraries` repo, static `libraries.json`, Issue-Form submissions, CDN + SHA-256 install) has been **removed**. This section is the single source of truth for the gallery.

### Scoped authentication (deliberate deviation from "no auth")

The MVP "no authentication" rule still holds for the **canvas and rooms** — a room is reachable by URL slug with no login. Auth applies **only to the gallery**, via InstantDB magic codes (`db.auth.sendMagicCode` / `signInWithMagicCode` / `useAuth`). It exists because identity is the spam wall the old design outsourced to GitHub.

- **Browse + install:** open to everyone, no account.
- **Submit / manage your submissions / report:** require sign-in.
- **Admin (review queue + reports):** allowlisted emails hardcoded in `instant.perms.ts` (mirrored in `VITE_ADMIN_EMAILS` for client UI visibility only).

### Moderation: review queue

Submissions are created `status: "pending"` and stay out of public Browse until an **admin approves** (`published`) or rejects with a note (`rejected`) in the in-app **Review** tab. Editing a submission bumps `version` and resets it to `pending` for re-review. Permissions forbid non-admins from setting `status` to `published` or touching `publishedAt`.

### Account-synced personal libraries

Signed-in users' personal libraries are scoped to their account (`libraries.userId`) and follow them across devices; anonymous users keep the localStorage `ownerKey`. On first sign-in the sidebar offers a one-time migration that stamps the local key's libraries with the account `userId`. `.scribblylib` file export/import remains for portability.

### Schema (InstantDB)

- `galleryLibraries`: `ownerId` (auth uid), `slug` (unique), `name`, `description`, `tags` (json), `license`, `authorHandle`, `itemCount`, `coverPreview` (data URL), `payload` (full `.scribblylib` content — install is a pure DB read, no CDN/SHA), `status` (`pending`|`published`|`rejected`), `rejectionNote?`, `version`, timestamps, `publishedAt?`.
- `galleryReports`: `reporterId`, `librarySlug`, `reason`, `detail?`, `resolved`, `createdAt`.
- `libraries.userId?` added for account-sync.

### Permissions (`instant.perms.ts`)

- `galleryLibraries` — view: published OR owner OR admin. create: signed-in, own `ownerId`, forced `pending`. update: admin, or owner (status may only become `pending`; never `publishedAt`). delete: owner or admin.
- `galleryReports` — create: signed-in, own `reporterId`. view/update/delete: admin only.
- `rooms` / `elements` / `libraries` / `libraryItems` stay open (`"true"`) — unchanged trust model.

### App structure

```
src/
├── auth/                 # useSession, isAdmin, SignInDialog, AccountControl
├── libraries/gallery/    # types, slug, useGallery, useMyPublications,
│   │                     # useReviewQueue (+ useReports), publish, install,
│   │                     # moderation, report, deepLink (?library=<slug>)
│   └── migrateToAccount.ts
└── ui/                   # BrowseTab (DB-backed), LibraryCard, ReportDialog,
                          # PublishLibraryDialog, MySubmissions, ReviewQueue,
                          # GalleryDeepLink
```

### Deep link

`?library=<slug>` opens the Browse tab with the install dialog pre-filled. Replaces the old `?addLibrary=<cdn-url>` + trusted-host allowlist.

### Env

- `VITE_ADMIN_EMAILS` — comma-separated admin allowlist (UI only; the perms file is authoritative).
- Removed: `VITE_LIBRARY_REGISTRY_URL`, `VITE_LIBRARY_TRUSTED_HOSTS`, `VITE_LIBRARY_REGISTRY_REPO`.

### Out of scope (still)

- Ratings / comments / download counts.
- Updating a published library's *items* in place (unpublish + resubmit instead).
- Public author profiles, paid libraries, non-English localization.
