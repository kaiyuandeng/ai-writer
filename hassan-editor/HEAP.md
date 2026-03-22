# THE HEAP — Associative Writing System

**Status:** Plan — ready for Codex handoff
**Principle:** Nothing is deleted. Everything is a piece. Associations are permanent.

---

## Philosophy

The heap is a pile of writing. Every piece ever written goes in. You never remove a piece — you add associations that give the pile structure. When you pull on a golden piece, everything connected to it lifts out of the heap. The sieve reveals the novel.

The current system has `scenes`, `raw_files`, `gulped`, `characters` — separate tables with separate schemas. The heap replaces this with two primitives:

1. **Piece** — any unit of writing
2. **Association** — a typed, permanent link between two pieces

Everything else (timelines, story arcs, scene orders, provenance) becomes metadata on pieces or typed associations between them.

---

## Data Model

### `pieces` table

The universal container. Replaces scenes, raw_files, and gulped as the single source of truth for all writing.

```sql
CREATE TABLE pieces (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,          -- 'scene', 'raw', 'fragment', 'note', 'gulped', 'character-sketch'
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  word_count    INTEGER NOT NULL DEFAULT 0,
  conviction    INTEGER NOT NULL DEFAULT 0,  -- 0-100, replaces 'golden' boolean
  provenance    TEXT NOT NULL DEFAULT 'GOLD',
  tags          TEXT NOT NULL DEFAULT '[]',  -- JSON array of free-form tags
  meta          TEXT NOT NULL DEFAULT '{}',  -- JSON object for kind-specific metadata
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pieces_kind ON pieces(kind);
CREATE INDEX idx_pieces_conviction ON pieces(conviction);
```

**`kind`** is a soft classifier, not a schema splitter. A scene and a fragment live in the same table. The difference is the tag, not the container.

**`conviction`** is 0–100. Replaces the binary `golden` flag. 0 = raw dump. 100 = ready for print. The sieve sorts by this.

**`meta`** holds kind-specific fields as JSON. A scene's meta might be `{"movement": "01", "scene_number": 3, "story_arc": "B", "pov": "Valentine"}`. A raw file's meta might be `{"filename": "scrivener-export-42.md", "source": "opus/raw"}`. No rigid columns — the schema stays flat.

**`tags`** are free-form: `["island", "valentine", "act-one", "needs-rewrite"]`. Queryable via JSON functions.

### `associations` table

The flexible connective tissue. Every link between any two pieces.

```sql
CREATE TABLE associations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES pieces(id),
  target_id     INTEGER NOT NULL REFERENCES pieces(id),
  kind          TEXT NOT NULL,          -- the association type
  label         TEXT NOT NULL DEFAULT '',-- human-readable description
  weight        REAL NOT NULL DEFAULT 1.0,
  meta          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, kind)
);

CREATE INDEX idx_assoc_source ON associations(source_id);
CREATE INDEX idx_assoc_target ON associations(target_id);
CREATE INDEX idx_assoc_kind ON associations(kind);
```

**`kind`** is the association type. Examples:

| kind | meaning |
|------|---------|
| `follows` | A follows B in a reading order |
| `echoes` | A echoes a theme/image from B |
| `rewrites` | A is a rewrite attempt of B |
| `dreams` | A is a dream sequence referencing B |
| `source` | A was derived from raw material B |
| `belongs-to` | A belongs to collection/arc B (where B is a virtual "arc" piece) |
| `character-in` | character sketch A appears in scene B |
| `ready-for-print` | editorial marker: A is print-ready relative to position B |
| `contradicts` | A contradicts B (continuity flag) |

Authors invent new kinds freely. The system doesn't enforce a fixed vocabulary — it just tracks what kinds exist and lets you filter by them.

**`weight`** lets you express strength: a weak echo vs. a direct rewrite. Defaults to 1.0.

**`label`** is the human note: "Valentine's first tears echo the Frog scene" or "This chapter is the dream version of Ch 12."

### Heap invariant

```sql
-- Pieces are permanent. No deletions.
CREATE TRIGGER heap_no_delete
BEFORE DELETE ON pieces
BEGIN
  SELECT RAISE(ABORT, 'HEAP INVARIANT: pieces are never deleted');
END;

-- Associations are permanent. No deletions.
CREATE TRIGGER heap_assoc_no_delete
BEFORE DELETE ON associations
BEGIN
  SELECT RAISE(ABORT, 'HEAP INVARIANT: associations are never deleted');
END;
```

Content can be updated (that's editing). But rows never leave the heap.

### Migration from current schema

The existing `scenes`, `raw_files`, `gulped` tables stay as-is. We add `pieces` and `associations` alongside them. A one-time migration script copies existing data into `pieces`:

- Each scene → a piece with `kind: 'scene'`, metadata from scene columns
- Each raw_file → a piece with `kind: 'raw'`
- Each gulped file → a piece with `kind: 'gulped'`
- Existing `scene_orders` → `follows` associations between pieces
- Existing `provenance_meta` (follows/precedes) → `follows` / `echoes` associations

Old tables remain read-only as a safety net. New features write to `pieces` + `associations` only.

---

## API

All new endpoints under `/api/heap/`.

### Pieces

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/heap/pieces` | List pieces. Filter: `?kind=scene&tags=valentine&conviction_min=80&q=searchterm` |
| GET | `/api/heap/pieces/:id` | Get one piece with its associations |
| POST | `/api/heap/pieces` | Create a piece |
| PUT | `/api/heap/pieces/:id` | Update piece content/metadata/conviction (no delete) |
| GET | `/api/heap/pieces/:id/network` | Get piece + all connected pieces (1 or 2 hops) |

### Associations

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/heap/associations` | List associations. Filter: `?kind=follows&source_id=5` |
| POST | `/api/heap/associations` | Create an association |
| PUT | `/api/heap/associations/:id` | Update label/weight/meta (no delete) |
| GET | `/api/heap/kinds` | List all association kinds currently in use (for autocomplete) |

### Sieve

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/heap/sieve` | The gold sieve: returns pieces above conviction threshold + their associations. `?min_conviction=70&kinds=follows,echoes` |
| GET | `/api/heap/graph` | Full heap as D3-compatible `{nodes, links}` with conviction as node weight |
| GET | `/api/heap/stats` | Aggregate stats: by kind, by conviction band, by association kind, total |

---

## Frontend: The Dashboard

Replace the single-view editor with a dashboard that hosts multiple visualization panels. The editor is one panel. The graph is another. New tools slot in as panels.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  ◉ editor   ⌗ graph   ◫ board   ⌾ sieve   ⊕ add   │  ← tab bar
├───────────┬─────────────────────────────────────────┤
│           │                                         │
│  sidebar  │           active panel                  │
│  (tree +  │     (editor / graph / board /           │
│   search) │      sieve / future tools)              │
│           │                                         │
├───────────┴─────────────────────────────────────────┤
│  statusbar                                          │
└─────────────────────────────────────────────────────┘
```

**Tab bar** across the top. Each tab is a dashboard panel. Panels:

### Panel 1: Editor (exists — adapt)
The TipTap editor. Now loads pieces instead of scenes. Sidebar shows the piece tree (grouped by kind, filterable by tags/conviction). Add an association drawer on the right edge — when a piece is open, show its associations and let the user create new ones via autocomplete.

### Panel 2: Graph (exists as separate page — integrate)
Move the D3 force graph from `/graph.html` into a dashboard panel. Nodes = pieces, sized by conviction. Links = associations, colored by kind. Clicking a node opens it in the editor panel. Add filters: by kind, by tags, by conviction range. The sieve interaction: drag a conviction slider and watch low-conviction nodes fade out, leaving the golden skeleton.

### Panel 3: Board (exists — adapt)
The Kanban board. Columns can be by status, by conviction band, or by custom grouping. Drag pieces between columns to update conviction or status.

### Panel 4: Sieve (new)
The signature visualization. A heap of nodes (pieces) piled loosely. Pull up a golden piece — everything associated with it lifts out, connected by strings. The rest falls away. This is the "picking up the string" metaphor made literal.

Implementation: D3 force layout with gravity. High-conviction pieces resist gravity (float up). Low-conviction pieces sink. Associations are visible strings. Click a piece to anchor it at the top — its network lifts. Everything unconnected drops to the bottom and dims.

### Panel 5+: Future tools
The dashboard is extensible. Each panel is a module that receives the heap API client and renders into a container div. Future panels: timeline view, character web, diff comparator, reading-order player, word-count heatmap, etc.

---

## Implementation Plan (Codex tasks)

Ordered by dependency. Each task is a self-contained PR.

### Phase 1: Data layer

**Task 1.1 — `pieces` and `associations` tables**
- Add tables + triggers to `server/db.ts` (as migration, not replacing existing tables)
- Add `Piece` and `Association` types to `src/entities/index.ts`
- Add indexes

**Task 1.2 — Heap API routes**
- Add `/api/heap/*` routes in a new `server/heap.ts` router
- Pieces CRUD (no delete), associations CRUD (no delete)
- Sieve endpoint (conviction filter + association traversal)
- Graph endpoint (D3-compatible output)
- Stats endpoint
- Kinds autocomplete endpoint
- Mount on the existing Express app in `server/app.ts`

**Task 1.3 — Migration script**
- `server/migrate-to-heap.ts`: reads existing scenes, raw_files, gulped → inserts into pieces
- Converts scene_orders into `follows` associations
- Converts provenance_meta links into associations
- Idempotent (safe to re-run)

### Phase 2: Dashboard shell

**Task 2.1 — Tab bar + panel system**
- Refactor `src/main.ts`: add a tab bar at the top
- Each panel is a class with `show()` / `hide()` / `mount(container)`
- Move existing editor, kanban, gulper into panel classes
- Add `src/styles/dashboard.css`
- Statusbar stays at the bottom, updates per active panel

**Task 2.2 — Sidebar: piece browser**
- Extend sidebar to browse pieces (grouped by kind, filterable by tags/conviction)
- Search box with full-text search across piece content
- Clicking a piece opens it in the editor panel

### Phase 3: Panels

**Task 3.1 — Editor panel: association drawer**
- Right-side drawer when a piece is open
- Lists all associations (incoming + outgoing) with kind badges
- "Add association" button: autocomplete search for target piece + kind picker
- Click an associated piece to navigate to it

**Task 3.2 — Graph panel (inline)**
- Move D3 graph from `graph.html` into a dashboard panel
- Nodes = pieces (sized by conviction, colored by kind)
- Links = associations (colored by kind)
- Conviction slider: fades out pieces below threshold
- Click node → open in editor

**Task 3.3 — Sieve panel**
- D3 force layout with gravity
- Conviction controls buoyancy (high floats, low sinks)
- Click/anchor a piece to lift its network
- Unconnected pieces dim and sink
- Association strings rendered as curved links with kind labels

**Task 3.4 — Board panel (adapt)**
- Kanban columns configurable: by status, by conviction band (0-25, 25-50, 50-75, 75-100), or by kind
- Drag to update conviction or status
- Works with pieces instead of scenes

### Phase 4: Polish

**Task 4.1 — Conviction scoring UX**
- Quick-score: select a piece in any panel, score 0-100 with a slider or keyboard shortcut
- Batch score: select multiple pieces, apply same conviction
- Visual: conviction shown as heat color everywhere (red 0 → gold 100)

**Task 4.2 — Association kind vocabulary**
- Seed with default kinds (follows, echoes, rewrites, dreams, source, belongs-to, etc.)
- Autocomplete from existing kinds when creating associations
- Allow free-form new kinds (auto-added to vocabulary)

---

## File changes summary

```
server/
  db.ts              — add pieces + associations tables, triggers, migrations
  heap.ts            — NEW: /api/heap/* router
  app.ts             — mount heap router
  migrate-to-heap.ts — NEW: migration script from old tables

src/
  entities/index.ts  — add Piece, Association, HeapGraph types
  main.ts            — refactor to dashboard shell with tab bar
  dashboard/
    Dashboard.ts     — NEW: tab bar + panel manager
    panels/
      EditorPanel.ts — wrap existing EditorPane
      GraphPanel.ts  — NEW: inline D3 graph
      SievePanel.ts  — NEW: the sieve visualization
      BoardPanel.ts  — wrap existing Kanban
  editor/
    AssociationDrawer.ts — NEW: right-side association panel
  sidebar/
    Sidebar.ts       — extend with piece browsing + search
  styles/
    dashboard.css    — NEW
    sieve.css        — NEW
```
