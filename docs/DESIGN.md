# Hassan Editor — Design Document

**Version:** 0.1 "The Well"
**Author:** Kai Deng + Claude Opus 4.6
**Date:** March 18, 2026
**Status:** Foundation

---

## 1. Vision

A prose-first editor that treats a novel like a codebase: structured, version-controlled, AI-augmented, and built for the long haul. Scrivener's soul in VS Code's body.

Hassan Editor is not a general-purpose word processor. It is a **literary engineering environment** — purpose-built for one novel, extensible for any narrative project.

### Principles

1. **Files are truth.** No proprietary formats. Markdown + YAML frontmatter. Git-friendly. Your filesystem IS the database.
2. **Focus is sacred.** One keystroke to enter deep writing mode. No menus, no chrome, no distractions.
3. **Structure is visible.** The binder, the scene rubric, the character cloud — all views into the same data.
4. **AI is a service, not a co-pilot.** AI generates, the author decides. Every AI-touched word is marked. The author's keystrokes are GOLDEN; extrapolated text is clearly secondary.
5. **Performance is non-negotiable.** Instant load. Instant save. No spinners. VS Code taught us this.

---

## 2. Architecture

```
hassan-editor/
├── index.html              # Shell
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── server/                 # Tiny file-system API
│   ├── index.ts            # Express server (port 3001)
│   └── routes/
│       ├── files.ts        # GET/PUT /api/files/:path
│       ├── tree.ts         # GET /api/tree (directory listing)
│       └── search.ts       # GET /api/search?q= (grep)
│
├── src/                    # Frontend (Vite SPA)
│   ├── main.ts             # Bootstrap
│   ├── app.ts              # App shell, layout manager
│   │
│   ├── editor/
│   │   ├── EditorPane.ts   # TipTap editor wrapper
│   │   ├── extensions.ts   # Custom TipTap extensions
│   │   └── wordcount.ts    # Live word/char counter
│   │
│   ├── sidebar/
│   │   ├── Sidebar.ts      # Binder panel
│   │   └── TreeNode.ts     # Recursive tree component
│   │
│   ├── focus/
│   │   └── FocusMode.ts    # Focus mode controller
│   │
│   ├── metadata/           # v0.2
│   │   └── MetadataPanel.ts
│   │
│   └── styles/
│       ├── base.css        # Reset, variables, typography
│       ├── sidebar.css     # Binder styles
│       ├── editor.css      # Prose editor styles
│       └── focus.css       # Focus mode overrides
│
└── docs/
    └── DESIGN.md           # This document
```

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Build     | Vite 5 | Instant HMR, proven in ai-cabal |
| Language  | TypeScript | Type safety, IDE support |
| Editor    | TipTap 2 (ProseMirror) | Prose-first rich text. Not a code editor. |
| Server    | Express 5 | Minimal file I/O API. No ORM, no DB. |
| Styling   | Vanilla CSS + custom properties | Full control, no framework bloat |
| Data      | Markdown + YAML frontmatter | Human-readable, git-diffable |
| Version   | Git | The content IS a repo |

---

## 3. Data Format

Every scene is a markdown file with YAML frontmatter containing the scene rubric:

```markdown
---
title: "The Arrival"
movement: 1
scene: 1
timeline: B        # A = Hassan, B = Enigram, C = Earth
pov: Valentine
characters:
  - Valentine (V9)
  - The Maestro (V0)
setting: "The Maestro's island. A stone house with a collapsed porch. Late afternoon, salt wind."
motivation: "Valentine wants to assert dominance — he is the replacement. The Maestro wants to be left alone to die."
theme: "Can perfection substitute for soul?"
hook: "The Maestro slams the door. Valentine hears violin music from upstairs — someone else is in the house."
audience_interest: "Instant conflict. Power dynamic. Mystery (who's upstairs?)."
writerly_interest: "The opening sets voice: acid, precise, funny. 'You still smell like goddam milk.'"
story_interest: "High. A stranger at the door of a dying man. Hitchcock-level setup."
status: DRAFTED
golden: true       # true = author-written, false = AI-extrapolated
word_count: 3200
---

"Yes — I am your Replacematon," a young man of about twenty-five said at the door...
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `timeline` | A/B/C — controls which narrative layer this scene belongs to |
| `golden` | **Critical.** `true` = author's own keystrokes. `false` = AI-generated filler. Never conflate the two. |
| `status` | BLANK → OUTLINED → DRAFTED → POLISHED → FINAL |
| `hook` | How does this scene end to make you turn the page? Crichton test. |
| `audience_interest` | Why does a reader care? |
| `writerly_interest` | Is the prose alive? What stylistic risks are being taken? |
| `story_interest` | Would you read this on a plane? Pacing, tension, surprise. |

---

## 4. v0.1 Features — "The Well"

### 4.1 Binder Sidebar
- Reads directory tree from `content/movements/`
- Collapsible folders for each movement
- File icons: color-coded by timeline (A = gold, B = blue, C = green)
- Click to open in editor
- Current file highlighted
- Word count per file shown inline

### 4.2 Prose Editor
- TipTap 2 with prose-optimized extensions
- Typography: Palatino/Georgia serif, 16px, 1.8 line height, max-width 680px
- Dark theme: `#1a1a1a` background, `#e0d6c8` text (warm parchment)
- Auto-save on pause (debounced 1s)
- Live word count in status bar
- Markdown shortcuts (**, *, #, etc.)
- No toolbar — keyboard-only formatting
- Frontmatter hidden by default, toggle to show

### 4.3 Focus Mode
- Trigger: `Cmd+Shift+F` or click the eye icon
- Sidebar slides out
- Editor centers on screen
- Background dims to near-black
- Only the current paragraph is fully bright (typewriter scrolling)
- Status bar shrinks to word count only
- `Escape` to exit

### 4.4 Status Bar
- Left: current file path, movement/scene
- Center: word count (session / document / project)
- Right: save status, golden/AI indicator

---

## 5. Content Structure

The existing Hassan content maps directly:

```
content/
├── project.json                    # Project manifest
├── movements/
│   ├── 00-prologue/
│   │   └── 01-father-i-fear.md
│   ├── 01-the-well/
│   │   ├── 01-the-arrival.md
│   │   ├── 02-the-violin-test.md
│   │   ├── 03-left-handed.md
│   │   ├── 04-finding-vera.md
│   │   ├── 05-valentines-birthday.md
│   │   ├── 06-the-lessons-begin.md
│   │   ├── 07-the-compliment.md
│   │   ├── 08-the-frog-and-the-well.md
│   │   ├── 09-the-golden-palace.md
│   │   ├── 10-the-fever-and-the-flood.md
│   │   ├── 11-the-collapse.md
│   │   ├── 12-the-mausoleum.md
│   │   ├── 13-i-am-v0.md
│   │   └── 14-the-burning.md
│   ├── 02-the-city/
│   │   └── ...
│   ├── 03-the-turn/
│   │   └── ...
│   ├── 04-the-woman-on-the-dune/
│   │   └── ...
│   ├── 05-the-three-sisters/
│   │   └── ...
│   ├── 06-the-pain-lord/
│   │   └── ...
│   ├── 07-the-deep-past/
│   │   └── ...
│   ├── 08-convergence/
│   │   └── ...
│   └── 09-the-way-home/
│       └── ...
└── raw/                            # Unstructured source material
    └── (153 files from Scrivener)
```

---

## 6. Roadmap

### v0.1 — "The Well" (NOW)
- [x] Design doc
- [ ] Binder sidebar
- [ ] TipTap prose editor
- [ ] Focus mode
- [ ] File server API
- [ ] Dark Scrivener theme

### v0.2 — "The City"
- [ ] Metadata panel (scene rubric visible/editable)
- [ ] Search across all files
- [ ] Split pane (two docs side by side)
- [ ] Timeline filter (show only A, B, or C scenes)

### v0.3 — "The Turn"
- [ ] Visualizer: story structure as a vertical spine with scene cards
- [ ] Character cloud: nodes = characters, edges = relationships, size = word count
- [ ] Motivation tracker: what does each character want, scene by scene?

### v0.4 — "The Dune"
- [ ] AI service integration (Claude API)
- [ ] Extrapolation mode: AI drafts filler scenes, marked `golden: false`
- [ ] Prose style transfer: feed author's golden text, match voice
- [ ] Scene rubric auto-fill from content

### v0.5 — "The Sisters"
- [ ] Teacher portal: shared view for writing mentor
- [ ] Correction interface: mentor marks up prose, corrections feed back
- [ ] RLHF pipeline: corrections improve AI prose generation over time

### v0.6 — "The Pain Lord"
- [ ] Multi-format export: Novel (manuscript format), Screenplay (Fountain), GameScript
- [ ] Print-ready PDF generation
- [ ] Compile to single manuscript with chapter headings

### v1.0 — "The Way Home"
- [ ] Full collaborative editing (CRDT-based)
- [ ] Plugin system for custom extensions
- [ ] Open-source release

---

## 7. Non-Goals for v0.1

- No AI integration (that's v0.4)
- No collaborative editing
- No export/compile
- No mobile support
- No user accounts
- No cloud sync (Git handles this)

---

## 8. Design Language

### Colors
```css
--bg-deep:      #111111;   /* Focus mode background */
--bg-main:      #1a1a1a;   /* Editor background */
--bg-sidebar:   #151515;   /* Binder background */
--bg-hover:     #252525;   /* Hover state */
--bg-active:    #2a2a2a;   /* Selected file */

--text-primary: #e0d6c8;   /* Warm parchment — prose text */
--text-secondary: #8a8278; /* Dimmed — metadata, counts */
--text-accent:  #c9a84c;   /* Gold — timeline A, highlights */

--timeline-a:   #c9a84c;   /* Hassan — gold */
--timeline-b:   #5b8ba8;   /* Enigram — blue */
--timeline-c:   #6b8a5e;   /* Earth — green */

--border:       #2a2a2a;
--focus-glow:   rgba(201, 168, 76, 0.08);
```

### Typography
```css
--font-prose:   'Palatino Linotype', 'Book Antiqua', Palatino, serif;
--font-ui:      'SF Pro Text', -apple-system, sans-serif;
--font-mono:    'SF Mono', 'Fira Code', monospace;

--prose-size:   17px;
--prose-height: 1.85;
--prose-width:  42em;        /* ~72 characters — manuscript standard */
```

---

## 9. The Philosophy

This editor embodies a thesis: **writing is engineering.**

Not in the reductive sense — not "novels are code." In the structural sense: a 200,000-word novel has the complexity of a large codebase. It has architecture, dependencies, interfaces, tests (does this scene work?), refactoring needs, technical debt (unresolved plot threads), and deployment (publication).

The tools writers use — Scrivener, Word, Google Docs — were designed for documents, not systems. Hassan Editor is designed for systems. It treats a novel as a living, structured, version-controlled, AI-augmentable system.

The author's keystrokes are the commits. The AI's extrapolations are the CI pipeline. The writing teacher's corrections are the code review. The reader is the user.

A new way of writing has begun.
