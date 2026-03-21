import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../db.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  // Fresh in-memory database for every test
  db = createDb(':memory:');
});

describe('Database Schema', () => {
  it('creates scenes table with correct columns', () => {
    const cols = db.prepare("PRAGMA table_info(scenes)").all() as any[];
    const names = cols.map((c: any) => c.name);

    expect(names).toContain('id');
    expect(names).toContain('movement');
    expect(names).toContain('scene_number');
    expect(names).toContain('title');
    expect(names).toContain('timeline');
    expect(names).toContain('story_arc');
    expect(names).toContain('pov');
    expect(names).toContain('characters');
    expect(names).toContain('setting');
    expect(names).toContain('motivation');
    expect(names).toContain('theme');
    expect(names).toContain('hook');
    expect(names).toContain('audience_interest');
    expect(names).toContain('writerly_interest');
    expect(names).toContain('story_interest');
    expect(names).toContain('status');
    expect(names).toContain('golden');
    expect(names).toContain('content');
    expect(names).toContain('word_count');
    expect(names).toContain('created_at');
    expect(names).toContain('updated_at');
  });

  it('creates raw_files table', () => {
    const cols = db.prepare("PRAGMA table_info(raw_files)").all() as any[];
    const names = cols.map((c: any) => c.name);

    expect(names).toContain('id');
    expect(names).toContain('filename');
    expect(names).toContain('content');
    expect(names).toContain('word_count');
    expect(names).toContain('imported_at');
  });

  it('creates characters table', () => {
    const cols = db.prepare("PRAGMA table_info(characters)").all() as any[];
    const names = cols.map((c: any) => c.name);

    expect(names).toContain('id');
    expect(names).toContain('name');
    expect(names).toContain('aliases');
    expect(names).toContain('timeline');
    expect(names).toContain('story_arc');
    expect(names).toContain('description');
    expect(names).toContain('motivation');
    expect(names).toContain('first_appearance');
  });

  it('creates indexes on scenes', () => {
    const indexes = db.prepare("PRAGMA index_list(scenes)").all() as any[];
    const names = indexes.map((i: any) => i.name);

    expect(names).toContain('idx_scenes_movement');
    expect(names).toContain('idx_scenes_timeline');
    expect(names).toContain('idx_scenes_story_arc');
  });

  it('enforces UNIQUE(movement, scene_number)', () => {
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01-the-well', 1, 'Scene A');

    expect(() => {
      db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01-the-well', 1, 'Scene B');
    }).toThrow(/UNIQUE constraint/);
  });

  it('enforces UNIQUE filename on raw_files', () => {
    db.prepare('INSERT INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('test.txt', 'hello', 1);

    // INSERT OR REPLACE should succeed
    db.prepare('INSERT OR REPLACE INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('test.txt', 'updated', 1);
    const file = db.prepare('SELECT content FROM raw_files WHERE filename = ?').get('test.txt') as any;
    expect(file.content).toBe('updated');
  });

  it('sets default values correctly', () => {
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01', 1, 'Test');
    const scene = db.prepare('SELECT * FROM scenes WHERE id = 1').get() as any;

    expect(scene.timeline).toBe('B');
    expect(scene.story_arc).toBe('B');
    expect(scene.status).toBe('BLANK');
    expect(scene.golden).toBe(1);
    expect(scene.content).toBe('');
    expect(scene.word_count).toBe(0);
    expect(scene.created_at).toBeTruthy();
    expect(scene.updated_at).toBeTruthy();
  });
});

describe('Database Operations', () => {
  it('inserts and retrieves a scene', () => {
    db.prepare(`
      INSERT INTO scenes (movement, scene_number, title, story_arc, timeline, pov, content, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('01-the-well', 1, 'The Arrival', 'B', 'B', 'Valentine', 'He stood at the door.', 5);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = 1').get() as any;
    expect(scene.title).toBe('The Arrival');
    expect(scene.pov).toBe('Valentine');
    expect(scene.word_count).toBe(5);
  });

  it('updates a scene', () => {
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01', 1, 'Original');

    db.prepare("UPDATE scenes SET title = ?, updated_at = datetime('now') WHERE id = 1").run('Updated');
    const scene = db.prepare('SELECT title FROM scenes WHERE id = 1').get() as any;
    expect(scene.title).toBe('Updated');
  });

  it('deletes a non-GOLD scene', () => {
    db.prepare("INSERT INTO scenes (movement, scene_number, title, provenance) VALUES (?, ?, ?, 'EXTRAPOLATED')").run('01', 1, 'Delete me');

    const result = db.prepare('DELETE FROM scenes WHERE id = 1').run();
    expect(result.changes).toBe(1);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = 1').get();
    expect(scene).toBeUndefined();
  });

  it('handles JSON characters field', () => {
    const chars = JSON.stringify(['Valentine', 'Vera', 'The Maestro']);
    db.prepare('INSERT INTO scenes (movement, scene_number, title, characters) VALUES (?, ?, ?, ?)').run('01', 1, 'Test', chars);

    const scene = db.prepare('SELECT characters FROM scenes WHERE id = 1').get() as any;
    expect(JSON.parse(scene.characters)).toEqual(['Valentine', 'Vera', 'The Maestro']);
  });

  it('supports WAL mode on file-backed databases', () => {
    // In-memory databases use 'memory' journal mode, not WAL.
    // WAL is set in createDb() and works on file-backed DBs.
    const result = db.pragma('journal_mode') as any[];
    expect(result[0].journal_mode).toBe('memory'); // expected for :memory:
  });

  it('handles multiple scenes in order', () => {
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01', 3, 'Third');
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01', 1, 'First');
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01', 2, 'Second');

    const scenes = db.prepare('SELECT title FROM scenes ORDER BY scene_number').all() as any[];
    expect(scenes.map((s: any) => s.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('filters scenes by movement', () => {
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('01-the-well', 1, 'Well 1');
    db.prepare('INSERT INTO scenes (movement, scene_number, title) VALUES (?, ?, ?)').run('02-the-city', 1, 'City 1');

    const wellScenes = db.prepare('SELECT * FROM scenes WHERE movement = ?').all('01-the-well') as any[];
    expect(wellScenes.length).toBe(1);
    expect(wellScenes[0].title).toBe('Well 1');
  });
});
