import Database from 'better-sqlite3';
import path from 'path';

const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, '../hassan.db');

export function createDb(dbPath?: string): Database.Database {
  const db = new Database(dbPath ?? DEFAULT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement TEXT NOT NULL,
      scene_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      timeline TEXT NOT NULL DEFAULT 'B',
      story_arc TEXT NOT NULL DEFAULT 'B',
      pov TEXT,
      characters TEXT,
      setting TEXT,
      motivation TEXT,
      theme TEXT,
      hook TEXT,
      audience_interest TEXT,
      writerly_interest TEXT,
      story_interest TEXT,
      status TEXT NOT NULL DEFAULT 'BLANK',
      golden INTEGER NOT NULL DEFAULT 1,
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      provenance TEXT NOT NULL DEFAULT 'GOLD',
      provenance_meta TEXT,
      source_raw_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(movement, scene_number)
    );

    CREATE TABLE IF NOT EXISTS raw_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      aliases TEXT,
      timeline TEXT,
      story_arc TEXT,
      description TEXT,
      motivation TEXT,
      first_appearance TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scenes_movement ON scenes(movement);
    CREATE INDEX IF NOT EXISTS idx_scenes_timeline ON scenes(timeline);

    CREATE TABLE IF NOT EXISTS gulped (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      file_type TEXT NOT NULL DEFAULT 'text',
      file_size INTEGER NOT NULL DEFAULT 0,
      classification TEXT NOT NULL DEFAULT 'misc',
      word_count INTEGER NOT NULL DEFAULT 0,
      relations TEXT,
      provenance TEXT NOT NULL DEFAULT 'GOLD',
      gulped_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER NOT NULL,
      provenance TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_revisions_scene ON revisions(scene_id);

    CREATE TABLE IF NOT EXISTS scene_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      scene_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pieces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      conviction INTEGER NOT NULL DEFAULT 0,
      provenance TEXT NOT NULL DEFAULT 'GOLD',
      tags TEXT NOT NULL DEFAULT '[]',
      meta TEXT NOT NULL DEFAULT '{}',
      migrated_from_table TEXT,
      migrated_from_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS associations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL DEFAULT 1.0,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id, kind),
      FOREIGN KEY (source_id) REFERENCES pieces(id),
      FOREIGN KEY (target_id) REFERENCES pieces(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pieces_kind ON pieces(kind);
    CREATE INDEX IF NOT EXISTS idx_pieces_conviction ON pieces(conviction);
    CREATE INDEX IF NOT EXISTS idx_assoc_source ON associations(source_id);
    CREATE INDEX IF NOT EXISTS idx_assoc_target ON associations(target_id);
    CREATE INDEX IF NOT EXISTS idx_assoc_kind ON associations(kind);
  `);

  // ===================================================
  // GOLD INVARIANT — enforced at the database level.
  // GOLD content can never be deleted and never overwritten.
  // These triggers are the last line of defense.
  // ===================================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS gold_scenes_no_delete
    BEFORE DELETE ON scenes
    WHEN OLD.provenance = 'GOLD'
    BEGIN
      SELECT RAISE(ABORT, 'INVARIANT VIOLATION: GOLD scenes cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS gold_scenes_no_content_overwrite
    BEFORE UPDATE OF content ON scenes
    WHEN OLD.provenance = 'GOLD' AND NEW.content != OLD.content
    BEGIN
      SELECT RAISE(ABORT, 'INVARIANT VIOLATION: GOLD scene content is immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS gold_gulped_no_delete
    BEFORE DELETE ON gulped
    WHEN OLD.provenance = 'GOLD'
    BEGIN
      SELECT RAISE(ABORT, 'INVARIANT VIOLATION: GOLD gulped content cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS gold_gulped_no_content_overwrite
    BEFORE UPDATE OF content ON gulped
    WHEN OLD.provenance = 'GOLD' AND NEW.content != OLD.content
    BEGIN
      SELECT RAISE(ABORT, 'INVARIANT VIOLATION: GOLD gulped content is immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS heap_pieces_no_delete
    BEFORE DELETE ON pieces
    BEGIN
      SELECT RAISE(ABORT, 'HEAP INVARIANT: pieces are permanent and cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS heap_associations_no_delete
    BEFORE DELETE ON associations
    BEGIN
      SELECT RAISE(ABORT, 'HEAP INVARIANT: associations are permanent and cannot be deleted');
    END;
  `);

  // --- Migrations: add provenance columns if missing ---
  const cols = db.prepare("PRAGMA table_info(scenes)").all() as { name: string }[];
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('provenance')) {
    db.exec("ALTER TABLE scenes ADD COLUMN provenance TEXT NOT NULL DEFAULT 'GOLD'");
  }
  if (!colNames.has('provenance_meta')) {
    db.exec("ALTER TABLE scenes ADD COLUMN provenance_meta TEXT");
  }
  if (!colNames.has('source_raw_id')) {
    db.exec("ALTER TABLE scenes ADD COLUMN source_raw_id INTEGER");
  }
  if (!colNames.has('story_arc')) {
    db.exec("ALTER TABLE scenes ADD COLUMN story_arc TEXT NOT NULL DEFAULT 'B'");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_scenes_story_arc ON scenes(story_arc)");

  // Backfill canonical story_arc from legacy timeline.
  db.exec("UPDATE scenes SET story_arc = COALESCE(story_arc, timeline, 'B')");

  // Gulped table: add provenance if missing
  const gulpCols = db.prepare("PRAGMA table_info(gulped)").all() as { name: string }[];
  const gulpColNames = new Set(gulpCols.map(c => c.name));
  if (!gulpColNames.has('provenance')) {
    db.exec("ALTER TABLE gulped ADD COLUMN provenance TEXT NOT NULL DEFAULT 'GOLD'");
  }

  const charCols = db.prepare("PRAGMA table_info(characters)").all() as { name: string }[];
  const charColNames = new Set(charCols.map((c) => c.name));
  if (!charColNames.has('story_arc')) {
    db.exec("ALTER TABLE characters ADD COLUMN story_arc TEXT");
  }
  db.exec("UPDATE characters SET story_arc = COALESCE(story_arc, timeline)");

  const pieceCols = db.prepare("PRAGMA table_info(pieces)").all() as { name: string }[];
  const pieceColNames = new Set(pieceCols.map((c) => c.name));
  if (!pieceColNames.has('migrated_from_table')) {
    db.exec("ALTER TABLE pieces ADD COLUMN migrated_from_table TEXT");
  }
  if (!pieceColNames.has('migrated_from_id')) {
    db.exec("ALTER TABLE pieces ADD COLUMN migrated_from_id INTEGER");
  }

  return db;
}

// Default singleton for production
const db = createDb();
export default db;
export { DEFAULT_DB_PATH as DB_PATH };
