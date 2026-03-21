# Conviction Editor — Design Document

**Author:** Kai
**Date:** March 20, 2026
**Status:** Draft

---

## The Problem

A 122,000-word novel exists as a rewrite. A 190,000-word original manuscript exists as raw material. Somewhere between these two bodies of text is the finished book. The author needs a system to:

1. Grade every piece of writing on a conviction scale (how close is this to final?)
2. Surface the best pieces as context for rewriting the weak ones
3. Track relationships between pieces (what follows what, what echoes what)
4. Run new drafts where high-conviction pieces anchor and low-conviction pieces get rewritten
5. Never lose provenance — every score, every relationship, every draft run is permanent history

---

## The Metaphor

A beach covered in soda cans connected by strings. Each can is a piece of writing. Each string is a relationship. If you pick up the structure by the right string, it self-sorts — the heavy cans (high conviction) anchor at the bottom and the light ones (low conviction) dangle where they need to be replaced.

**The topology IS the novel.** Conviction scores + relationships = a weighted graph. The finished novel is the state where every node is 100% and every edge is 100%.

---

## Core Concepts

### Piece

The atomic unit. A piece is any contiguous span of text with a single identity: a paragraph, a scene, a chapter, a sentence. Pieces nest — a chapter contains scenes, scenes contain paragraphs. The system is fractal.

```
Piece {
  id:               uuid
  content:          text
  level:            "sentence" | "paragraph" | "scene" | "chapter" | "part"
  source:           "rewrite" | "original" | "draft-run-{n}" | "manual"
  provenance: {
    created_at:     timestamp
    parent_ids:     uuid[]          // what this was derived from
    draft_run:      number | null   // which generation pass
    method:         "human" | "ai" | "hybrid"
  }
  conviction:       0.0 — 1.0      // author's gut score
  conviction_history: [
    { score: 0.0-1.0, timestamp, reason?: string }
  ]
  tags:             string[]        // "voice-good", "pacing-slow", "nora-approved", etc.
  annotations:      Annotation[]
}
```

### Relationship

An edge between two pieces. Relationships have their own conviction scores — you might be 90% sure a scene is good AND 40% sure it belongs after scene 12.

```
Relationship {
  id:               uuid
  from_piece:       uuid
  to_piece:         uuid
  kind:             "follows" | "precedes" | "echoes" | "contradicts"
                    | "depends-on" | "replaces" | "variant-of"
  conviction:       0.0 — 1.0
  conviction_history: [
    { score: 0.0-1.0, timestamp, reason?: string }
  ]
  metadata:         Record<string, any>
}
```

### Annotation

A mark on a piece — a highlight, a comment, a grade. Annotations are how the author talks to the system.

```
Annotation {
  id:               uuid
  piece_id:         uuid
  range:            { start: number, end: number } | null  // character offsets, null = whole piece
  kind:             "highlight" | "comment" | "grade" | "flag"
  value:            string | number
  created_at:       timestamp
}
```

### Draft Run

A generation pass. The system takes the current topology (pieces + relationships + conviction scores), uses high-conviction pieces as anchoring context, and rewrites low-conviction pieces. Each run produces new pieces with provenance pointing back to what they replaced.

```
DraftRun {
  id:               number          // monotonically increasing
  created_at:       timestamp
  strategy:         string          // "rewrite-below-0.5", "rewrite-chapter-7", etc.
  anchor_threshold: number          // conviction floor for anchoring (e.g. 0.7)
  target_pieces:    uuid[]          // what got rewritten
  produced_pieces:  uuid[]          // what came out
  notes:            string
}
```

---

## The Invariants

1. **Nothing is deleted.** Pieces are replaced, never erased. Old versions remain in the graph with their provenance intact. The system is append-only.

2. **Conviction only goes up or sideways.** You can revise a conviction score, but the history is permanent. If you scored something 0.8 and later score it 0.3, both entries exist. The current score is the latest entry. The trajectory is visible.

3. **Relationships are never deleted.** A relationship can be scored 0.0 (meaning "I don't think these connect anymore") but it stays in the graph. The topology remembers every connection ever proposed.

4. **Provenance is sacred.** Every piece knows where it came from: which draft run, which parent pieces, which method (human/ai/hybrid). The chain is unbroken from the first imported paragraph to the final novel.

5. **The graph self-sorts.** At any point, you can ask: "Show me the novel at conviction threshold X." At threshold 0.5, you see the rough shape. At 0.8, you see the strong draft. At 1.0, you see the finished book. The topology defines reading order through relationship conviction.

---

## How It Works

### Phase 1: Import

The system ingests two PDFs (or markdown directories):
- The **rewrite** (122k words, 35 chapters)
- The **original manuscript** (190k words, raw scenes)

Each is broken into pieces at every level: parts → chapters → scenes → paragraphs. Pieces from the rewrite get `source: "rewrite"`. Pieces from the original get `source: "original"`.

Relationships are auto-generated:
- Sequential pieces get `follows/precedes` relationships with default conviction 0.5
- Pieces that share character names, locations, or phrases across sources get `variant-of` relationships

Everything starts at conviction 0.0 — ungraded.

### Phase 2: Grading

The author reads through the PDF in the editor. For each piece:
- **Highlight green** = high conviction (the system prompts for a number, default 0.8)
- **Highlight yellow** = medium conviction (default 0.5)
- **Highlight red** = low conviction (default 0.2)
- **Comment** = free-form annotation
- **Flag** = "needs work" / "voice wrong" / "pacing off" / "nora would flag this"

Grading can happen at any level — grade a whole chapter 0.9, then drill into a paragraph and grade it 0.3. The system respects the most specific score.

### Phase 3: Topology Emerges

As the author grades, a weighted graph forms. High-conviction pieces cluster. Low-conviction pieces dangle. Relationships between pieces get their own scores: "Yes, this scene follows that one" (0.9) vs. "I'm not sure this belongs here" (0.3).

The editor visualizes this as a **force-directed graph** — heavy nodes (high conviction) settle to the center, light nodes (low conviction) float to the edges. Strings (relationships) pull connected pieces together. The author can literally see the novel's shape.

### Phase 4: Draft Runs

The author triggers a draft run:
1. Set an **anchor threshold** (e.g. 0.7) — pieces above this are treated as immovable anchoring context
2. Set a **target** — pieces below a threshold, or a specific chapter, or pieces with a certain tag
3. The system generates new drafts of the target pieces, using the anchoring context as style/voice/plot reference
4. New pieces are created with `source: "draft-run-{n}"` and `parent_ids` pointing to what they replace
5. The old pieces remain. The new pieces get conviction 0.0 — they need to be graded.

The author grades the new pieces. Some are better (conviction goes up). Some aren't (conviction stays low). The topology evolves.

### Phase 5: Convergence

The novel converges when:
- Every piece has conviction ≥ threshold (e.g. 0.95)
- Every `follows/precedes` relationship has conviction ≥ threshold
- The reading order (determined by relationship conviction) produces a coherent sequence

At that point: **export.** The system flattens the graph into a linear document following the highest-conviction path through the topology. That's the finished novel.

---

## The Editor UI

### PDF View (left panel)
- Renders the current highest-conviction draft as a readable document
- Supports highlighting, commenting, grading at any granularity
- Inline conviction badges: small colored dots next to each paragraph showing its score
- Click a paragraph to see its provenance chain (what it was before, what draft run produced it)

### Graph View (right panel)
- Force-directed graph of all pieces and relationships
- Node size = word count, node color = conviction (red → yellow → green)
- Edge thickness = relationship conviction
- Filter by: level (chapter/scene/paragraph), source, draft run, conviction range
- Drag to reorder — dragging a node adjusts relationship convictions
- "Pick up by the string": click any relationship edge and the graph reflows with that edge as the spine

### Timeline View (bottom panel)
- Horizontal timeline of draft runs
- Each run shows: what was targeted, what was produced, net conviction change
- Click a run to see before/after diffs

### Provenance Panel (on selection)
- Select any piece → see its full history: every ancestor, every score, every annotation
- Visual diff between the current version and any ancestor
- "Why is this here?" — traces the chain back to the original import

---

## Data Model (SQLite)

```sql
CREATE TABLE pieces (
  id            TEXT PRIMARY KEY,
  content       TEXT NOT NULL,
  level         TEXT NOT NULL,
  source        TEXT NOT NULL,
  parent_ids    TEXT,           -- JSON array of uuids
  draft_run     INTEGER,
  method        TEXT,
  created_at    TEXT NOT NULL,
  conviction    REAL DEFAULT 0.0,
  tags          TEXT            -- JSON array
);

CREATE TABLE conviction_history (
  id            TEXT PRIMARY KEY,
  piece_id      TEXT NOT NULL REFERENCES pieces(id),
  score         REAL NOT NULL,
  created_at    TEXT NOT NULL,
  reason        TEXT
);

CREATE TABLE relationships (
  id            TEXT PRIMARY KEY,
  from_piece    TEXT NOT NULL REFERENCES pieces(id),
  to_piece      TEXT NOT NULL REFERENCES pieces(id),
  kind          TEXT NOT NULL,
  conviction    REAL DEFAULT 0.5,
  metadata      TEXT            -- JSON
);

CREATE TABLE relationship_conviction_history (
  id            TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  score         REAL NOT NULL,
  created_at    TEXT NOT NULL,
  reason        TEXT
);

CREATE TABLE annotations (
  id            TEXT PRIMARY KEY,
  piece_id      TEXT NOT NULL REFERENCES pieces(id),
  range_start   INTEGER,
  range_end     INTEGER,
  kind          TEXT NOT NULL,
  value         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE draft_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL,
  strategy      TEXT,
  anchor_threshold REAL,
  target_pieces TEXT,           -- JSON array of uuids
  produced_pieces TEXT,         -- JSON array of uuids
  notes         TEXT
);
```

---

## Stack

Same as Hassan Editor — keep it familiar:
- **Frontend:** Vite + vanilla TypeScript + TipTap (for PDF annotation / rich text)
- **Backend:** Express + SQLite (via `better-sqlite3`)
- **PDF rendering:** pdf.js for in-browser PDF display with annotation overlay
- **Graph viz:** d3-force for the topology view
- **Tests:** Vitest + Supertest

---

## What This Enables

1. **Parallel comparison.** The rewrite and the original sit side by side in the same graph. A rewrite chapter can have a `variant-of` relationship to the original scene. The author picks which version has higher conviction.

2. **Incremental perfection.** Instead of "rewrite the whole novel," the author says "rewrite everything below 0.5 in chapter 7, using chapters 1-6 (all above 0.8) as context." Surgical.

3. **Memory.** Every editorial decision is recorded. "Why did I change this?" is always answerable. The system never forgets.

4. **Self-sorting topology.** The soda-can metaphor made real: score everything, pick up the string, watch the novel assemble itself into the order that has the highest total conviction.

5. **Convergence metric.** At any point, the author can see: "The novel is 67% converged." That number is: (sum of all piece convictions × relationship convictions) / (total possible). When it hits the target, the book is done.

---

## First Steps

1. Build the SQLite schema and import pipeline (ingest the rewrite chapters)
2. Build a minimal PDF viewer with highlight-to-grade functionality
3. Build the conviction graph (d3-force visualization)
4. Build the draft-run engine (AI rewrite with anchoring context)
5. Build the convergence dashboard

The novel is the test case. The tool is the product.
