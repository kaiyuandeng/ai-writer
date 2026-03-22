# Codex Implementation Plan

This plan supersedes the exploratory draft and is optimized for low-risk delivery.

## Non-Negotiable Invariants

- No write operations outside `ai-writer/hassan-editor`.
- Existing `scenes` editor behavior must keep working during migration.
- Heap data is append-only at row level:
  - no `DELETE` on `pieces`
  - no `DELETE` on `associations`
- Migration must be idempotent and safe to rerun.

## Phase 1 (Now): Backend Foundation

### 1) Schema
- Add `pieces` table (generalized writing unit).
- Add `associations` table (typed edges between pieces).
- Add indexes on `kind`, `conviction`, `source_id`, `target_id`.
- Add DB triggers to block deletes.

### 2) API Surface (`/api/heap/*`)
- Pieces:
  - `GET /pieces` with filters (`kind`, `q`, `tags`, `conviction_min`, `conviction_max`)
  - `GET /pieces/:id` (with incoming/outgoing edges)
  - `POST /pieces`
  - `PUT /pieces/:id`
  - `GET /pieces/:id/network?hops=1..3`
- Associations:
  - `GET /associations`
  - `POST /associations`
  - `PUT /associations/:id`
  - `GET /kinds`
- Analytics:
  - `GET /stats`
  - `GET /graph`
  - `GET /sieve`

### 3) Migration Utility
- Add `server/migrate-to-heap.ts`.
- Copy:
  - `scenes -> pieces(kind=scene)`
  - `raw_files -> pieces(kind=raw)`
  - `gulped -> pieces(kind=gulped)`
- Convert:
  - `scene_orders` chains -> `associations(kind=follows)`
  - `provenance_meta` follows/precedes links -> `associations(kind=follows)`
- Track source lineage via:
  - `migrated_from_table`
  - `migrated_from_id`

### 4) Test Gate (Required)
- `npm run test` must pass.
- Add/adjust tests for:
  - heap schema creation
  - no-delete triggers
  - core heap API happy paths
  - duplicate association conflict path

## Phase 2: UI Integration

- Add dashboard tabs to the existing shell (do not break editor flow).
- Keep old graph page available while new in-app graph is developed.
- Add association drawer in editor view first, then new panels.

## Phase 3: Sieve Visualization

- Implement D3 sieve panel using `/api/heap/sieve`.
- Progressive rendering for large graphs (cap initial nodes, add expansion).
- Filters: conviction threshold, association kinds, piece kinds.

## Delivery Strategy

- Ship in small PRs:
  1. schema + router + migration script
  2. tests
  3. UI adapter
  4. sieve panel
- Maintain dual-read compatibility until UI fully moved from `scenes` to `pieces`.
