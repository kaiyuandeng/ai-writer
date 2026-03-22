/**
 * HASSAN ENTITIES
 * ===============
 * Single source of truth for all domain objects.
 * Every component imports from here — no local interface duplication.
 *
 * Watch this folder grow. If it gets unwieldy, split by domain.
 */

// ==========================================
// ENUMS & CONSTANTS
// ==========================================

export const STORY_ARCS = ['A', 'B', 'C'] as const;
export type StoryArc = (typeof STORY_ARCS)[number];

export const STATUSES = ['BLANK', 'OUTLINED', 'DRAFTED', 'POLISHED', 'FINAL'] as const;
export type Status = (typeof STATUSES)[number];

export const PROVENANCES = ['GOLD', 'EDITED', 'EXTRAPOLATED'] as const;
export type Provenance = (typeof PROVENANCES)[number];

/** @deprecated classification removed — all material is equal */

// ==========================================
// SCENE — the atomic unit of the novel
// ==========================================

export interface Scene {
  id: number;
  movement: string;
  scene_number: number;
  title: string;
  story_arc: StoryArc;
  pov: string | null;
  characters: string; // JSON array
  setting: string | null;
  motivation: string | null;
  theme: string | null;
  hook: string | null;
  audience_interest: string | null;
  writerly_interest: string | null;
  story_interest: string | null;
  status: Status;
  golden: number;
  content: string;
  word_count: number;
  provenance: Provenance;
  provenance_meta: string | null;
  source_raw_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Lightweight scene ref — what lists/nav/kanban need */
export interface SceneRef {
  id: number;
  movement: string;
  scene_number: number;
  title: string;
  story_arc: string;
  status: string;
  golden: number;
  word_count: number;
  pov: string | null;
  provenance: string;
  provenance_meta?: string | null;
}

// ==========================================
// SOURCE TEXT — original manuscripts from Scrivener
// ==========================================

export interface SourceText {
  id: number;
  filename: string;
  content: string;
  word_count: number;
  imported_at: string;
}

/** Lightweight ref — for sidebar listing */
export interface SourceTextRef {
  id: number;
  filename: string;
  word_count: number;
}

// ==========================================
// CHARACTER — named entity in the novel
// ==========================================

export interface Character {
  id: number;
  name: string;
  aliases: string; // JSON array
  story_arc: string | null;
  description: string | null;
  motivation: string | null;
  first_appearance: string | null;
}

// ==========================================
// GULPED FILE — anything the Gulper ingested
// ==========================================

export interface GulpedFile {
  id: number;
  filename: string;
  content: string;
  file_type: string;
  file_size: number;
  word_count: number;
  relations: string | null;
  provenance: Provenance;
  gulped_at: string;
}

/** Client-side result from a gulp operation */
export interface GulpResult {
  filename: string;
  words: number;
  stored_as: string;
  related_to: string[];
}

// ==========================================
// REVISION — snapshot of a scene before edit
// ==========================================

export interface Revision {
  id: number;
  scene_id: number;
  provenance: Provenance;
  content: string;
  word_count: number;
  note: string | null;
  created_at: string;
}

/** Lightweight revision ref — for listing without content */
export interface RevisionRef {
  id: number;
  provenance: string;
  word_count: number;
  note: string | null;
  created_at: string;
}

// ==========================================
// SCENE ORDER — a named reading sequence
// ==========================================

export interface SceneOrder {
  id: number;
  name: string;
  description: string | null;
  scene_ids: string; // JSON array of scene IDs
  created_at: string;
  updated_at: string;
}

// ==========================================
// TREE — the sidebar's composite view
// ==========================================

export interface TreeData {
  movements: Record<string, SceneRef[]>;
  rawFiles: SourceTextRef[];
}

// ==========================================
// STATS — aggregate dashboard numbers
// ==========================================

export interface Stats {
  totalScenes: number;
  totalWords: number;
  totalRawFiles: number;
  byStoryArc: { story_arc: string; scenes: number; words: number }[];
  byMovement: { movement: string; scenes: number; words: number }[];
  byStatus: { status: string; c: number }[];
}

export interface SceneGraphNode {
  id: number;
  title: string;
  scene_number: number;
  story_arc: string;
  movement: string;
  status: string;
  provenance: string;
}

export interface SceneGraphLink {
  source: number;
  target: number;
  kind: 'chronology' | 'publishing' | 'custom' | 'extrapolated';
  order: string;
  color: string;
  why?: string;
}

export interface SceneGraphOrderLegend {
  name: string;
  description: string;
  color: string;
}

export interface SceneGraph {
  nodes: SceneGraphNode[];
  links: SceneGraphLink[];
  legends: SceneGraphOrderLegend[];
}

// ==========================================
// HEAP — generalized writing primitives
// ==========================================

export interface Piece {
  id: number;
  kind: string;
  title: string;
  content: string;
  word_count: number;
  conviction: number;
  provenance: string;
  tags: string; // JSON array
  meta: string; // JSON object
  migrated_from_table: string | null;
  migrated_from_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Association {
  id: number;
  source_id: number;
  target_id: number;
  kind: string;
  label: string;
  weight: number;
  meta: string; // JSON object
  created_at: string;
}

export interface HeapGraph {
  nodes: Piece[];
  links: Association[];
  legend: { kind: string; count: number }[];
}
