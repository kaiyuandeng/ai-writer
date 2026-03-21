# Hassan Editor

An AI-assisted writing and visualization tool for complex, multi-timeline stories. Built to help one author see, query, and reshape a novel — not to serve millions of users.

## Rules

These are the aesthetics and development rules for this repo. They are enforced by `.cursor/rules/*.mdc` and compiled here for human readability.

1. **Speed over scale.** Ship the fastest feature that works. This is a workbench, not a product. If it takes more than a session, break it down.
2. **Flexibility over perfection.** The app must be easy to extend. New visualization or query technique = small, localized change. Flat is better than nested. Direct is better than clever.
3. **Visualization is first-class.** Every interesting dimension of the novel (arc, timeline, status, word count, provenance) should be visualizable. Try techniques freely — graphs, kanban, timelines, heatmaps, diffs. Rough charts that reveal structure beat polished ones that don't.
4. **Self-contained components.** Each visualization is its own module. Add, remove, or replace without touching the rest of the app. Data comes from the API; UI is stateless and swappable.
5. **Tests cover stability.** Every API endpoint and every new feature gets tests in the same session. Tests are the safety net that lets you move fast. Vitest + supertest, in-memory SQLite, no external deps.
6. **Provenance is sacred.** `GOLD` scenes are the author's original words — immutable, never overwritten. All AI-generated or edited content is tagged (`EDITED`, `EXTRAPOLATED`). Revisions are snapshots, not diffs.
7. **SQLite is the entire backend.** No ORM layers. Raw SQL is fine. One file database, zero infrastructure.
8. **Ship complete.** Feature + tests + README update in one pass. Dead code removed. Codebase stays the same size or shrinks.
9. **Agent autonomy.** Full read/write/exec. Non-destructive: no force-push, no deleting the database, no overwriting GOLD content.
10. **Cameron protocol.** Fragments and trail-offs = enough signal. If 80% clear, ship it. No preamble. Code speaks.

## Features

- Scene editor with live word count and session delta tracking.
- Sidebar tree for movements, scenes, and imported raw files.
- Deep links for direct scene/raw navigation via URL hash.
- Focus mode for distraction-free writing.
- Kanban-style board to navigate scene cards quickly.
- Gulper intake flow for ingesting notes/files into project memory.
- Scene link graph with publishing, chronology, arc, and custom order edges.
- Story health analysis endpoints (gold sanity and heroic cycle metrics).
- Provenance model (`GOLD`, `EDITED`, `EXTRAPOLATED`) with immutability guardrails.
- Revision snapshots and restore-friendly history endpoints.
- Batch promotion endpoint to move `GOLD` scenes into editable state safely.
- Raw content import from local text and markdown files.

## Run

```bash
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| App | http://localhost:9000/ |
| API | http://localhost:9001 |
| Test Dashboard | http://localhost:9002/tests/ |

## Test

```bash
npm test                # run all tests
npm run test:report     # generate HTML report in test-report/
```

To launch the live test dashboard:

```bash
npm exec vitest -- --ui --api 9002 --watch
```
