# Feature Brief: Heap + Sieve

This brief consolidates the original Opus concept and the Codex implementation track.

## Feature Intent

- Replace scene-specific modeling with two universal primitives:
  - `Piece of Writing`
  - `Association`
- Keep permanent history:
  - no delete semantics for heap rows
  - keep adding pieces and links over time
- Use conviction scoring as the sieve control:
  - high conviction pieces become the visible spine
  - links reveal narrative and editorial structure

## Opus Concept (Product Shape)

- "Heap" of writing where nothing is removed.
- Flexible association types (chronology, dream links, rewrite lineage, editorial readiness).
- Dashboard approach with multiple tools:
  - editor
  - graph
  - board
  - sieve visualization
- D3-style visual analysis for literary structure discovery.

## Codex Delivery Track (Engineering Shape)

- Phase 1 backend foundation (completed in this branch):
  - heap schema
  - heap API
  - migration utility
  - tests
- Phase 2 UI adapter (started in this branch):
  - in-app Heap panel for listing/filtering/editing pieces
  - association creation from selected piece
- Phase 3+:
  - integrated graph and sieve visual panels
  - advanced dashboard modularization

## Current Branch Scope

All work is contained in `ai-writer/hassan-editor` on `feature/heap-association-core`.
