import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db.js';
import { createApp, countWords } from '../app.js';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

let db: Database.Database;
let app: Express;
let tmpDir: string;

beforeEach(() => {
  db = createDb(':memory:');
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hassan-test-'));
  app = createApp(db, tmpDir);
});

// ==========================================
// UTILITY
// ==========================================

describe('countWords', () => {
  it('counts words in normal text', () => {
    expect(countWords('Hello world foo bar')).toBe(4);
  });

  it('handles empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('handles whitespace-only string', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });

  it('handles null/undefined', () => {
    expect(countWords(null as any)).toBe(0);
    expect(countWords(undefined as any)).toBe(0);
  });

  it('counts words with mixed whitespace', () => {
    expect(countWords('one\ntwo\tthree    four')).toBe(4);
  });

  it('handles prose paragraph', () => {
    const prose = 'Valentine stood at the door. The old man looked up from his violin.';
    expect(countWords(prose)).toBe(13);
  });
});

// ==========================================
// SCENES API
// ==========================================

describe('POST /api/scenes', () => {
  it('creates a scene with required fields', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .send({ movement: '01-the-well', scene_number: 1, title: 'The Arrival' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });

  it('creates a scene with all fields', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .send({
        movement: '01-the-well',
        scene_number: 1,
        title: 'The Arrival',
        timeline: 'B',
        pov: 'Valentine',
        characters: ['Valentine', 'The Maestro'],
        setting: 'The island house. Late afternoon.',
        motivation: 'Valentine wants to assert dominance.',
        theme: 'Can perfection substitute for soul?',
        hook: 'He hears violin music from upstairs.',
        audience_interest: 'Instant conflict.',
        writerly_interest: 'Acid voice.',
        story_interest: 'High. Stranger at the door.',
        status: 'DRAFTED',
        golden: 1,
        content: 'Yes, I am your Replacematon.',
      });

    expect(res.status).toBe(201);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.pov).toBe('Valentine');
    expect(scene.timeline).toBe('B');
    expect(JSON.parse(scene.characters)).toEqual(['Valentine', 'The Maestro']);
    expect(scene.word_count).toBe(5);
    expect(scene.status).toBe('DRAFTED');
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/api/scenes').send({ movement: '01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('rejects invalid timeline', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .send({ movement: '01', scene_number: 1, title: 'Test', timeline: 'Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/story_arc/);
  });

  it('rejects invalid status', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .send({ movement: '01', scene_number: 1, title: 'Test', status: 'GARBAGE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });

  it('rejects negative scene_number', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .send({ movement: '01', scene_number: -1, title: 'Test' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate movement/scene_number', async () => {
    await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'First' });
    const res = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Dupe' });
    expect(res.status).toBe(409);
  });

  it('applies defaults for timeline, status, golden', async () => {
    await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Test' });
    const scene = db.prepare('SELECT * FROM scenes WHERE id = 1').get() as any;
    expect(scene.timeline).toBe('B');
    expect(scene.status).toBe('BLANK');
    expect(scene.golden).toBe(1);
  });

  it('defaults provenance to GOLD when not specified', async () => {
    const res = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Human written' });
    expect(res.status).toBe(201);
    const scene = db.prepare('SELECT provenance FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.provenance).toBe('GOLD');
  });

  it('accepts explicit provenance on creation', async () => {
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'AI-assisted scene',
      content: 'Generated bridge text.',
      provenance: 'EXTRAPOLATED',
      provenance_meta: JSON.stringify({ method: 'ai-assisted', note: 'co-written with agent' }),
    });
    expect(res.status).toBe(201);
    expect(res.body.provenance).toBe('EXTRAPOLATED');

    const scene = db.prepare('SELECT provenance, provenance_meta FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.provenance).toBe('EXTRAPOLATED');
    const meta = JSON.parse(scene.provenance_meta);
    expect(meta.method).toBe('ai-assisted');
  });

  it('rejects invalid provenance on creation', async () => {
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Bad provenance', provenance: 'FAKE',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provenance/);
  });
});

describe('GET /api/scenes', () => {
  beforeEach(async () => {
    await request(app).post('/api/scenes').send({ movement: '01-the-well', scene_number: 1, title: 'Well 1', timeline: 'B' });
    await request(app).post('/api/scenes').send({ movement: '01-the-well', scene_number: 2, title: 'Well 2', timeline: 'B' });
    await request(app).post('/api/scenes').send({ movement: '02-the-city', scene_number: 1, title: 'City 1', timeline: 'A' });
  });

  it('lists all scenes', async () => {
    const res = await request(app).get('/api/scenes');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('filters by movement', async () => {
    const res = await request(app).get('/api/scenes?movement=01-the-well');
    expect(res.body.length).toBe(2);
  });

  it('filters by timeline', async () => {
    const res = await request(app).get('/api/scenes?timeline=A');
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('City 1');
  });

  it('filters by story_arc alias', async () => {
    const res = await request(app).get('/api/scenes?story_arc=B');
    expect(res.body.length).toBe(2);
    expect(res.body.every((scene: any) => scene.story_arc === 'B')).toBe(true);
  });

  it('filters by both movement and timeline', async () => {
    const res = await request(app).get('/api/scenes?movement=01-the-well&timeline=B');
    expect(res.body.length).toBe(2);
  });

  it('returns empty array for non-matching filter', async () => {
    const res = await request(app).get('/api/scenes?movement=nonexistent');
    expect(res.body).toEqual([]);
  });

  it('returns scenes ordered by movement then scene_number', async () => {
    const res = await request(app).get('/api/scenes');
    expect(res.body[0].title).toBe('Well 1');
    expect(res.body[1].title).toBe('Well 2');
    expect(res.body[2].title).toBe('City 1');
  });
});

describe('GET /api/scenes/:id', () => {
  it('returns a scene by id', async () => {
    const create = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Test' });
    const res = await request(app).get(`/api/scenes/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Test');
  });

  it('returns 404 for non-existent scene', async () => {
    const res = await request(app).get('/api/scenes/999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/scenes/:id', () => {
  let sceneId: number;

  beforeEach(async () => {
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Original',
      content: 'Original content here.',
    });
    sceneId = res.body.id;
    // Promote to EDITED so content writes are allowed in these update tests.
    await request(app).put(`/api/scenes/${sceneId}`).send({ provenance: 'EDITED' });
  });

  it('updates content and recalculates word count', async () => {
    const res = await request(app).put(`/api/scenes/${sceneId}`).send({
      content: 'New content with more words than before in this scene.',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as any;
    expect(scene.content).toBe('New content with more words than before in this scene.');
    expect(scene.word_count).toBe(10);
  });

  it('updates metadata fields', async () => {
    await request(app).put(`/api/scenes/${sceneId}`).send({
      title: 'Updated Title',
      pov: 'Vera',
      status: 'POLISHED',
    });

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as any;
    expect(scene.title).toBe('Updated Title');
    expect(scene.pov).toBe('Vera');
    expect(scene.status).toBe('POLISHED');
  });

  it('updates content and metadata simultaneously', async () => {
    await request(app).put(`/api/scenes/${sceneId}`).send({
      content: 'Brand new prose.',
      title: 'New Title',
      timeline: 'A',
    });

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as any;
    expect(scene.content).toBe('Brand new prose.');
    expect(scene.title).toBe('New Title');
    expect(scene.timeline).toBe('A');
    expect(scene.word_count).toBe(3);
  });

  it('returns ok for empty update', async () => {
    const res = await request(app).put(`/api/scenes/${sceneId}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects invalid timeline on update', async () => {
    const res = await request(app).put(`/api/scenes/${sceneId}`).send({ timeline: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid status on update', async () => {
    const res = await request(app).put(`/api/scenes/${sceneId}`).send({ status: 'WRONG' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent scene', async () => {
    const res = await request(app).put('/api/scenes/999').send({ content: 'nope' });
    expect(res.status).toBe(404);
  });

  it('updates updated_at timestamp', async () => {
    const before = (db.prepare('SELECT updated_at FROM scenes WHERE id = ?').get(sceneId) as any).updated_at;

    // Small delay to ensure timestamp changes
    await new Promise(r => setTimeout(r, 1100));

    await request(app).put(`/api/scenes/${sceneId}`).send({ content: 'changed' });
    const after = (db.prepare('SELECT updated_at FROM scenes WHERE id = ?').get(sceneId) as any).updated_at;

    expect(after).not.toBe(before);
  });

  it('handles empty content correctly', async () => {
    await request(app).put(`/api/scenes/${sceneId}`).send({ content: '' });
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as any;
    expect(scene.content).toBe('');
    expect(scene.word_count).toBe(0);
  });
});

describe('DELETE /api/scenes/:id', () => {
  it('deletes an existing EDITED scene', async () => {
    const create = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Delete me' });
    await request(app).put(`/api/scenes/${create.body.id}`).send({ provenance: 'EDITED' });
    const res = await request(app).delete(`/api/scenes/${create.body.id}`);
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/scenes/${create.body.id}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 for non-existent scene', async () => {
    const res = await request(app).delete('/api/scenes/999');
    expect(res.status).toBe(404);
  });

  it('refuses to delete GOLD scenes', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01',
      scene_number: 2,
      title: 'Gold cannot die',
      content: 'Original text.',
    });

    const res = await request(app).delete(`/api/scenes/${create.body.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot be deleted/i);

    const stillThere = await request(app).get(`/api/scenes/${create.body.id}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.provenance).toBe('GOLD');
  });
});

// ==========================================
// TREE API
// ==========================================

describe('GET /api/tree', () => {
  it('returns empty tree when no data', async () => {
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    expect(res.body.movements).toEqual({});
    expect(res.body.rawFiles).toEqual([]);
  });

  it('groups scenes by movement', async () => {
    await request(app).post('/api/scenes').send({ movement: '01-the-well', scene_number: 1, title: 'Well 1' });
    await request(app).post('/api/scenes').send({ movement: '01-the-well', scene_number: 2, title: 'Well 2' });
    await request(app).post('/api/scenes').send({ movement: '02-the-city', scene_number: 1, title: 'City 1' });

    const res = await request(app).get('/api/tree');
    expect(Object.keys(res.body.movements)).toEqual(['01-the-well', '02-the-city']);
    expect(res.body.movements['01-the-well'].length).toBe(2);
    expect(res.body.movements['02-the-city'].length).toBe(1);
  });

  it('includes raw files', async () => {
    db.prepare('INSERT INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('test.txt', 'hello', 1);

    const res = await request(app).get('/api/tree');
    expect(res.body.rawFiles.length).toBe(1);
    expect(res.body.rawFiles[0].filename).toBe('test.txt');
  });
});

// ==========================================
// RAW FILES API
// ==========================================

describe('GET /api/raw', () => {
  it('lists imported raw files', async () => {
    db.prepare('INSERT INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('a.txt', 'one two', 2);
    db.prepare('INSERT INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('b.txt', 'three', 1);

    const res = await request(app).get('/api/raw');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    // Should not include content in list view
    expect(res.body[0].filename).toBe('a.txt');
  });
});

describe('GET /api/raw/:id', () => {
  it('returns a raw file with content', async () => {
    db.prepare('INSERT INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('test.txt', 'The prose here.', 3);

    const res = await request(app).get('/api/raw/1');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('The prose here.');
    expect(res.body.word_count).toBe(3);
  });

  it('returns 404 for non-existent file', async () => {
    const res = await request(app).get('/api/raw/999');
    expect(res.status).toBe(404);
  });
});

// ==========================================
// IMPORT API
// ==========================================

describe('POST /api/import', () => {
  it('imports .txt and .md files from raw directory', async () => {
    // Create test raw directory with files
    const rawDir = path.join(tmpDir, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'scene1.txt'), 'Hello world from scene one.');
    fs.writeFileSync(path.join(rawDir, 'notes.md'), 'Some markdown notes here.');
    fs.writeFileSync(path.join(rawDir, 'image.png'), 'not a text file');

    const res = await request(app).post('/api/import');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2); // only .txt and .md

    const files = db.prepare('SELECT * FROM raw_files ORDER BY filename').all() as any[];
    expect(files.length).toBe(2);
    expect(files[0].filename).toBe('notes.md');
    expect(files[1].filename).toBe('scene1.txt');
    expect(files[1].word_count).toBe(5);
  });

  it('returns 404 when raw directory missing', async () => {
    const res = await request(app).post('/api/import');
    expect(res.status).toBe(404);
  });

  it('handles re-import (INSERT OR REPLACE)', async () => {
    const rawDir = path.join(tmpDir, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'test.txt'), 'version one');

    await request(app).post('/api/import');
    let file = db.prepare('SELECT content FROM raw_files WHERE filename = ?').get('test.txt') as any;
    expect(file.content).toBe('version one');

    // Update file and re-import
    fs.writeFileSync(path.join(rawDir, 'test.txt'), 'version two updated');
    await request(app).post('/api/import');
    file = db.prepare('SELECT content FROM raw_files WHERE filename = ?').get('test.txt') as any;
    expect(file.content).toBe('version two updated');

    // Should still be 1 file, not 2
    const count = (db.prepare('SELECT COUNT(*) as c FROM raw_files').get() as any).c;
    expect(count).toBe(1);
  });
});

// ==========================================
// CHARACTERS API
// ==========================================

describe('POST /api/characters', () => {
  it('creates a character', async () => {
    const res = await request(app).post('/api/characters').send({
      name: 'Valentine',
      aliases: ['V9', 'The Replacematon'],
      timeline: 'B',
      description: 'The ninth automaton.',
      motivation: 'Complete the Ainos Enigram.',
      first_appearance: '01-the-well/1',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it('rejects character without name', async () => {
    const res = await request(app).post('/api/characters').send({ timeline: 'A' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/characters', () => {
  it('lists characters alphabetically', async () => {
    await request(app).post('/api/characters').send({ name: 'Vera' });
    await request(app).post('/api/characters').send({ name: 'Aharah' });
    await request(app).post('/api/characters').send({ name: 'Valentine' });

    const res = await request(app).get('/api/characters');
    expect(res.body.length).toBe(3);
    expect(res.body[0].name).toBe('Aharah');
    expect(res.body[1].name).toBe('Valentine');
    expect(res.body[2].name).toBe('Vera');
  });
});

// ==========================================
// STATS API
// ==========================================

describe('GET /api/stats', () => {
  it('returns zeros when empty', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.totalScenes).toBe(0);
    expect(res.body.totalWords).toBe(0);
    expect(res.body.totalRawFiles).toBe(0);
  });

  it('aggregates correctly', async () => {
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'S1', timeline: 'A', content: 'one two three',
    });
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 2, title: 'S2', timeline: 'B', content: 'four five',
    });
    db.prepare('INSERT INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)').run('r.txt', '', 0);

    const res = await request(app).get('/api/stats');
    expect(res.body.totalScenes).toBe(2);
    expect(res.body.totalWords).toBe(5);
    expect(res.body.totalRawFiles).toBe(1);
    expect(res.body.byStoryArc.length).toBe(2);
    expect(res.body.byMovement.length).toBe(1);
  });
});

describe('POST /api/promote', () => {
  it('promotes all GOLD scenes to EDITED and snapshots revisions', async () => {
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'S1', content: 'Gold one',
    });
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 2, title: 'S2', content: 'Gold two',
    });

    const res = await request(app).post('/api/promote');
    expect(res.status).toBe(200);
    expect(res.body.promoted).toBe(2);

    const counts = db.prepare("SELECT provenance, COUNT(*) as c FROM scenes GROUP BY provenance").all() as any[];
    expect(counts).toEqual([{ provenance: 'EDITED', c: 2 }]);

    const revisions = db.prepare('SELECT COUNT(*) as c FROM revisions').get() as any;
    expect(revisions.c).toBe(2);
  });

  it('is idempotent when no GOLD scenes remain', async () => {
    const res = await request(app).post('/api/promote');
    expect(res.status).toBe(200);
    expect(res.body.promoted).toBe(0);
  });
});

// ==========================================
// PROVENANCE
// ==========================================

describe('Provenance', () => {
  it('defaults to GOLD on scene creation', async () => {
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Gold Scene',
      content: 'Original prose.',
    });
    const scene = db.prepare('SELECT provenance FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.provenance).toBe('GOLD');
  });

  it('updates provenance to EDITED', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Test', content: 'Original.',
    });

    await request(app).put(`/api/scenes/${create.body.id}`).send({
      provenance: 'EDITED',
      provenance_meta: JSON.stringify({ edited_at: '2026-03-18', changes: 'tightened descriptors' }),
    });

    const scene = db.prepare('SELECT provenance, provenance_meta FROM scenes WHERE id = ?').get(create.body.id) as any;
    expect(scene.provenance).toBe('EDITED');
    const meta = JSON.parse(scene.provenance_meta);
    expect(meta.changes).toBe('tightened descriptors');
  });

  it('sets EXTRAPOLATED with bridge metadata', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 2, title: 'Bridge Scene',
      content: 'AI-generated bridge text.',
    });

    await request(app).put(`/api/scenes/${create.body.id}`).send({
      provenance: 'EXTRAPOLATED',
      provenance_meta: JSON.stringify({
        bridges: 'A6 → A8',
        rationale: 'Haz King needs to mobilize before Oracle scene',
        follows: 'The Sword Saint\'s Test',
        precedes: 'The Oracle Speaks',
      }),
    });

    const scene = db.prepare('SELECT provenance, provenance_meta FROM scenes WHERE id = ?').get(create.body.id) as any;
    expect(scene.provenance).toBe('EXTRAPOLATED');
    const meta = JSON.parse(scene.provenance_meta);
    expect(meta.bridges).toBe('A6 → A8');
    expect(meta.precedes).toBe('The Oracle Speaks');
  });

  it('rejects invalid provenance', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Test',
    });

    const res = await request(app).put(`/api/scenes/${create.body.id}`).send({
      provenance: 'FAKE',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provenance/);
  });

  it('returns provenance in scene GET', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Test',
    });

    const res = await request(app).get(`/api/scenes/${create.body.id}`);
    expect(res.body.provenance).toBe('GOLD');
  });

  it('rejects content edits while scene is GOLD', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01',
      scene_number: 3,
      title: 'Locked Gold',
      content: 'Original hand-written scene.',
    });

    const res = await request(app).put(`/api/scenes/${create.body.id}`).send({
      content: 'Attempted rewrite',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);

    const scene = db.prepare('SELECT content, provenance FROM scenes WHERE id = ?').get(create.body.id) as any;
    expect(scene.content).toBe('Original hand-written scene.');
    expect(scene.provenance).toBe('GOLD');
  });

  it('allows content edits after promotion to EDITED', async () => {
    const create = await request(app).post('/api/scenes').send({
      movement: '01',
      scene_number: 4,
      title: 'Now editable',
      content: 'Original draft.',
    });

    await request(app).put(`/api/scenes/${create.body.id}`).send({ provenance: 'EDITED' });
    const edit = await request(app).put(`/api/scenes/${create.body.id}`).send({
      content: 'Edited draft with changes.',
    });
    expect(edit.status).toBe(200);

    const scene = db.prepare('SELECT content, provenance FROM scenes WHERE id = ?').get(create.body.id) as any;
    expect(scene.provenance).toBe('EDITED');
    expect(scene.content).toBe('Edited draft with changes.');
  });
});

// ==========================================
// REVISIONS API
// ==========================================

describe('Revisions', () => {
  let sceneId: number;

  beforeEach(async () => {
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Revisable',
      content: 'The original gold text written by hand.',
    });
    sceneId = res.body.id;
  });

  it('snapshots current scene as a revision', async () => {
    const res = await request(app).post(`/api/scenes/${sceneId}/revisions`).send({
      note: 'Before first edit pass',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it('lists revisions for a scene', async () => {
    await request(app).post(`/api/scenes/${sceneId}/revisions`).send({ note: 'Snapshot 1' });

    // Edit the scene
    await request(app).put(`/api/scenes/${sceneId}`).send({
      content: 'Revised text after first pass.',
      provenance: 'EDITED',
    });

    await request(app).post(`/api/scenes/${sceneId}/revisions`).send({ note: 'Snapshot 2' });

    const res = await request(app).get(`/api/scenes/${sceneId}/revisions`);
    expect(res.body.length).toBe(2);
    // Both exist with correct notes
    const notes = res.body.map((r: any) => r.note).sort();
    expect(notes).toEqual(['Snapshot 1', 'Snapshot 2']);
  });

  it('preserves gold content in revision after scene is edited', async () => {
    // Snapshot the gold
    await request(app).post(`/api/scenes/${sceneId}/revisions`).send({ note: 'Gold snapshot' });

    // Edit the scene
    await request(app).put(`/api/scenes/${sceneId}`).send({
      content: 'Completely rewritten.',
      provenance: 'EDITED',
    });

    // The revision still has the original
    const revisions = await request(app).get(`/api/scenes/${sceneId}/revisions`);
    const goldRev = revisions.body[0];

    const rev = await request(app).get(`/api/revisions/${goldRev.id}`);
    expect(rev.body.content).toBe('The original gold text written by hand.');
    expect(rev.body.provenance).toBe('GOLD');
  });

  it('returns 404 for revisions of non-existent scene', async () => {
    const res = await request(app).post('/api/scenes/999/revisions').send({});
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request(app).get('/api/revisions/999');
    expect(res.status).toBe(404);
  });
});

// ==========================================
// SCENE ORDERS API
// ==========================================

describe('Scene Orders', () => {
  it('creates a custom order', async () => {
    const res = await request(app).post('/api/orders').send({
      name: 'publishing',
      description: 'Braid order as reader sees it',
      scene_ids: [1, 3, 2, 4],
    });
    expect(res.status).toBe(201);
  });

  it('lists all orders', async () => {
    await request(app).post('/api/orders').send({ name: 'publishing', scene_ids: [1, 2] });
    await request(app).post('/api/orders').send({ name: 'chronological', scene_ids: [2, 1] });

    const res = await request(app).get('/api/orders');
    expect(res.body.length).toBe(2);
    expect(res.body[0].name).toBe('chronological');
    expect(res.body[1].name).toBe('publishing');
  });

  it('gets an order by name', async () => {
    await request(app).post('/api/orders').send({
      name: 'timeline-a',
      description: 'Hassan only',
      scene_ids: [1, 3, 5],
    });

    const res = await request(app).get('/api/orders/timeline-a');
    expect(res.body.name).toBe('timeline-a');
    expect(JSON.parse(res.body.scene_ids)).toEqual([1, 3, 5]);
  });

  it('returns 404 for non-existent order', async () => {
    const res = await request(app).get('/api/orders/nonexistent');
    expect(res.status).toBe(404);
  });

  it('upserts an order (INSERT OR REPLACE)', async () => {
    await request(app).post('/api/orders').send({ name: 'draft', scene_ids: [1, 2] });
    await request(app).post('/api/orders').send({ name: 'draft', scene_ids: [1, 2, 3, 4] });

    const res = await request(app).get('/api/orders/draft');
    expect(JSON.parse(res.body.scene_ids)).toEqual([1, 2, 3, 4]);
  });

  it('rejects order without name', async () => {
    const res = await request(app).post('/api/orders').send({ scene_ids: [1] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/graph', () => {
  it('returns nodes and order links', async () => {
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'A1', timeline: 'A',
    });
    await request(app).post('/api/scenes').send({
      movement: '02', scene_number: 1, title: 'B1', timeline: 'B',
    });
    await request(app).post('/api/scenes').send({
      movement: '03', scene_number: 2, title: 'A2', timeline: 'A',
    });

    const res = await request(app).get('/api/graph');
    expect(res.status).toBe(200);
    expect(res.body.nodes.length).toBe(3);
    expect(res.body.links.length).toBeGreaterThan(0);
    expect(res.body.legends.some((l: any) => l.name === 'publishing')).toBe(true);
    expect(res.body.legends.some((l: any) => l.name === 'chronological')).toBe(true);
  });

  it('emits extrapolated links with rationale when metadata has scene ids', async () => {
    const a = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'A', timeline: 'A' });
    const bridge = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 2, title: 'Bridge', timeline: 'A' });
    const b = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 3, title: 'B', timeline: 'A' });

    await request(app).put(`/api/scenes/${bridge.body.id}`).send({
      provenance: 'EXTRAPOLATED',
      provenance_meta: JSON.stringify({
        follows_scene_id: a.body.id,
        precedes_scene_id: b.body.id,
        rationale: 'Bridge scene needed for continuity',
      }),
    });

    const res = await request(app).get('/api/graph');
    const extrapolated = res.body.links.filter((l: any) => l.kind === 'extrapolated');
    expect(extrapolated.length).toBe(2);
    expect(extrapolated[0].why).toMatch(/continuity/);
  });
});

describe('GET /api/analysis/*', () => {
  it('returns gold sanity summary with contiguous runs and orphans', async () => {
    // timeline-a: 1,2 contiguous; 4 orphan
    await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'A1', timeline: 'A' });
    await request(app).post('/api/scenes').send({ movement: '02', scene_number: 2, title: 'A2', timeline: 'A' });
    await request(app).post('/api/scenes').send({ movement: '03', scene_number: 4, title: 'A4', timeline: 'A' });
    // timeline-b: single orphan
    await request(app).post('/api/scenes').send({ movement: '04', scene_number: 8, title: 'B8', timeline: 'B' });

    const res = await request(app).get('/api/analysis/gold-sanity');
    expect(res.status).toBe(200);
    expect(res.body.totalGoldScenes).toBe(4);
    expect(res.body.contiguousSequences.length).toBe(1);
    expect(res.body.contiguousSequences[0].story_arc).toBe('story-arc-a');
    expect(res.body.contiguousSequences[0].count).toBe(2);
    expect(res.body.orphanSceneIds.length).toBe(2);
  });

  it('returns story health metrics and embeds gold sanity', async () => {
    const s1 = await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'S1', timeline: 'A' });
    const s2 = await request(app).post('/api/scenes').send({ movement: '02', scene_number: 2, title: 'S2', timeline: 'A' });
    const bridge = await request(app).post('/api/scenes').send({ movement: '03', scene_number: 3, title: 'Bridge', timeline: 'A' });

    await request(app).put(`/api/scenes/${bridge.body.id}`).send({
      provenance: 'EXTRAPOLATED',
      provenance_meta: JSON.stringify({
        follows_scene_id: s1.body.id,
        precedes_scene_id: s2.body.id,
        rationale: 'Narrative bridge',
      }),
    });

    const res = await request(app).get('/api/analysis/story-health');
    expect(res.status).toBe(200);
    expect(res.body.totalScenes).toBe(3);
    expect(res.body.totalLinks).toBeGreaterThan(0);
    expect(res.body.weakSignals.extrapolatedWithoutBridge).toBe(0);
    expect(res.body.goldSanity).toBeTruthy();
  });

  it('returns heroic cycle analysis for selected story arc', async () => {
    await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Arc C1', story_arc: 'C', status: 'DRAFTED' });
    await request(app).post('/api/scenes').send({ movement: '02', scene_number: 2, title: 'Arc C2', story_arc: 'C', status: 'FINAL' });
    await request(app).post('/api/scenes').send({ movement: '03', scene_number: 1, title: 'Arc A1', story_arc: 'A', status: 'OUTLINED' });

    const res = await request(app).get('/api/analysis/heroic-cycle?story_arc=C');
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('heroic-cycle-v1');
    expect(res.body.curves['story-arc-c'].length).toBe(2);
    expect(res.body.axes.x).toMatch(/story arc/i);
    expect(res.body.explanation).toMatch(/Intensity is estimated/);
  });

  it('returns full heroic cycle when no story_arc is provided', async () => {
    await request(app).post('/api/scenes').send({ movement: '01', scene_number: 1, title: 'Arc A1', story_arc: 'A', status: 'DRAFTED' });
    await request(app).post('/api/scenes').send({ movement: '02', scene_number: 1, title: 'Arc B1', story_arc: 'B', status: 'OUTLINED' });

    const res = await request(app).get('/api/analysis/heroic-cycle');
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('heroic-cycle-v1');
    expect(Object.keys(res.body.curves).length).toBeGreaterThan(1);
    expect(res.body.missingByArc).toBeTruthy();
  });
});

// ==========================================
// GULPER API
// ==========================================

describe('POST /api/gulp', () => {
  it('gulps a text file and stores it', async () => {
    const res = await request(app).post('/api/gulp').send({
      filename: 'freewrite-march.txt',
      content: 'The desert stretched out before Pace like a red wound on the earth.',
      file_type: 'txt',
      file_size: 66,
      word_count: 13,
    });

    expect(res.status).toBe(201);
    expect(res.body.stored_as).toBe('raw + gulped');
  });

  it('stores text files in both gulped and raw_files', async () => {
    await request(app).post('/api/gulp').send({
      filename: 'notes.md',
      content: 'Valentine is the ninth automaton in the line. He arrives at the island.',
      file_type: 'md',
      file_size: 72,
      word_count: 13,
    });

    const gulped = db.prepare('SELECT * FROM gulped WHERE filename = ?').get('notes.md') as any;
    expect(gulped).toBeTruthy();

    const raw = db.prepare('SELECT * FROM raw_files WHERE filename = ?').get('notes.md') as any;
    expect(raw).toBeTruthy();
    expect(raw.word_count).toBe(13);
  });

  it('stores non-text files only in gulped', async () => {
    await request(app).post('/api/gulp').send({
      filename: 'diagram.pdf',
      content: '[PDF: diagram.pdf, 2.1MB]',
      file_type: 'pdf',
      file_size: 2200000,
      word_count: 4,
    });

    const gulped = db.prepare('SELECT * FROM gulped WHERE filename = ?').get('diagram.pdf') as any;
    expect(gulped).toBeTruthy();

    const raw = db.prepare('SELECT * FROM raw_files WHERE filename = ?').get('diagram.pdf');
    expect(raw).toBeUndefined();
  });

  it('rejects gulp without filename', async () => {
    const res = await request(app).post('/api/gulp').send({ content: 'no name' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/gulped', () => {
  it('lists all gulped files newest first', async () => {
    await request(app).post('/api/gulp').send({ filename: 'a.txt', file_type: 'txt', content: 'one two three four five six seven eight nine ten eleven', word_count: 11 });
    await request(app).post('/api/gulp').send({ filename: 'b.pdf', file_type: 'pdf', content: '[PDF]', word_count: 1 });

    const res = await request(app).get('/api/gulped');
    expect(res.body.length).toBe(2);
    expect(res.body[0].filename).toBeTruthy();
  });

  it('does not return classification field', async () => {
    await request(app).post('/api/gulp').send({
      filename: 'no-class.md', content: 'just material', file_type: 'md',
      file_size: 13, word_count: 2,
    });
    const res = await request(app).get('/api/gulped');
    const item = res.body.find((g: any) => g.filename === 'no-class.md');
    expect(item).toBeTruthy();
    expect(item).not.toHaveProperty('classification');
  });
});

describe('POST /api/gulp (no classification)', () => {
  it('stores material without classification', async () => {
    const res = await request(app).post('/api/gulp').send({
      filename: 'raw-material.md',
      content: 'Some words that are just material in the pile.',
      file_type: 'md',
      file_size: 46,
      word_count: 9,
    });
    expect(res.status).toBe(201);
    expect(res.body.stored_as).toBe('gulped');
  });

  it('defaults provenance to GOLD', async () => {
    const res = await request(app).post('/api/gulp').send({
      filename: 'thought-bare.md',
      content: 'a bare thought',
      file_type: 'md',
      file_size: 14,
      word_count: 3,
    });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT provenance FROM gulped WHERE id = ?').get(res.body.id) as any;
    expect(row.provenance).toBe('GOLD');
  });

  it('computes word count from content when not provided', async () => {
    const res = await request(app).post('/api/gulp').send({
      filename: 'auto-count.md',
      content: 'one two three four five six seven eight nine ten eleven twelve',
      file_type: 'md',
      file_size: 62,
    });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT word_count FROM gulped WHERE id = ?').get(res.body.id) as any;
    expect(row.word_count).toBe(12);
  });
});

// ==========================================
// GOLD INVARIANT — can never be deleted, always indexed
// ==========================================

describe('GOLD invariant', () => {
  it('DB trigger prevents raw SQL deletion of GOLD scenes', () => {
    db.prepare("INSERT INTO scenes (movement, scene_number, title, provenance) VALUES ('01', 1, 'Sacred', 'GOLD')").run();
    expect(() => {
      db.prepare("DELETE FROM scenes WHERE title = 'Sacred'").run();
    }).toThrow(/INVARIANT VIOLATION/);
    const row = db.prepare("SELECT * FROM scenes WHERE title = 'Sacred'").get();
    expect(row).toBeTruthy();
  });

  it('DB trigger prevents raw SQL content overwrite on GOLD scenes', () => {
    db.prepare("INSERT INTO scenes (movement, scene_number, title, content, provenance) VALUES ('01', 2, 'Locked', 'original words', 'GOLD')").run();
    expect(() => {
      db.prepare("UPDATE scenes SET content = 'hacked' WHERE title = 'Locked'").run();
    }).toThrow(/INVARIANT VIOLATION/);
    const row = db.prepare("SELECT content FROM scenes WHERE title = 'Locked'").get() as any;
    expect(row.content).toBe('original words');
  });

  it('DB trigger allows deletion of non-GOLD scenes', () => {
    db.prepare("INSERT INTO scenes (movement, scene_number, title, provenance) VALUES ('01', 3, 'Expendable', 'EXTRAPOLATED')").run();
    db.prepare("DELETE FROM scenes WHERE title = 'Expendable'").run();
    const row = db.prepare("SELECT * FROM scenes WHERE title = 'Expendable'").get();
    expect(row).toBeUndefined();
  });

  it('DB trigger prevents raw SQL deletion of GOLD gulped content', async () => {
    await request(app).post('/api/gulp').send({
      filename: 'sacred-thought.md', content: 'my original thought', file_type: 'md',
      file_size: 19, word_count: 3, provenance: 'GOLD',
    });
    expect(() => {
      db.prepare("DELETE FROM gulped WHERE filename = 'sacred-thought.md'").run();
    }).toThrow(/INVARIANT VIOLATION/);
  });

  it('DB trigger prevents raw SQL content overwrite on GOLD gulped', async () => {
    await request(app).post('/api/gulp').send({
      filename: 'locked-thought.md', content: 'untouchable prose', file_type: 'md',
      file_size: 17, word_count: 2, provenance: 'GOLD',
    });
    expect(() => {
      db.prepare("UPDATE gulped SET content = 'replaced' WHERE filename = 'locked-thought.md'").run();
    }).toThrow(/INVARIANT VIOLATION/);
  });

  it('API refuses to delete GOLD gulped content', async () => {
    const gulp = await request(app).post('/api/gulp').send({
      filename: 'gold-fragment.md', content: 'Author wrote this', file_type: 'md',
      file_size: 17, word_count: 3, provenance: 'GOLD',
    });
    const res = await request(app).delete(`/api/gulped/${gulp.body.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot be deleted/i);
  });

  it('API allows deletion of non-GOLD gulped content', async () => {
    const gulp = await request(app).post('/api/gulp').send({
      filename: 'ai-draft.md', content: 'machine wrote this', file_type: 'md',
      file_size: 18, word_count: 3, provenance: 'EXTRAPOLATED',
    });
    const res = await request(app).delete(`/api/gulped/${gulp.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('/api/gold indexes all GOLD content across tables', async () => {
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Gold Scene', content: 'Hand written prose.',
    });
    await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 2, title: 'AI Scene', content: 'Generated.',
      provenance: 'EXTRAPOLATED',
    });
    await request(app).post('/api/gulp').send({
      filename: 'gold-note.md', content: 'Author note', file_type: 'md',
      file_size: 11, word_count: 2, provenance: 'GOLD',
    });
    await request(app).post('/api/gulp').send({
      filename: 'ai-note.md', content: 'AI summary', file_type: 'md',
      file_size: 10, word_count: 2, provenance: 'EXTRAPOLATED',
    });

    const res = await request(app).get('/api/gold');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.scenes.length).toBe(1);
    expect(res.body.scenes[0].name).toBe('Gold Scene');
    expect(res.body.gulped.length).toBe(1);
    expect(res.body.gulped[0].name).toBe('gold-note.md');
  });

  it('GOLD gulped thought preserves provenance through the pipeline', async () => {
    const res = await request(app).post('/api/gulp').send({
      filename: 'thought-2026-03-20.md',
      content: 'What if the automaton remembers being human?',
      file_type: 'md',
      file_size: 44,
      word_count: 8,
      provenance: 'GOLD',
    });
    expect(res.status).toBe(201);

    const row = db.prepare('SELECT provenance FROM gulped WHERE id = ?').get(res.body.id) as any;
    expect(row.provenance).toBe('GOLD');

    const gold = await request(app).get('/api/gold');
    expect(gold.body.gulped.some((g: any) => g.name === 'thought-2026-03-20.md')).toBe(true);
  });
});

// ==========================================
// EDGE CASES
// ==========================================

describe('Edge Cases', () => {
  it('handles very large content', async () => {
    const bigContent = 'word '.repeat(50000).trim();
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Big Scene', content: bigContent,
    });
    expect(res.status).toBe(201);

    const scene = db.prepare('SELECT word_count FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.word_count).toBe(50000);
  });

  it('handles unicode content', async () => {
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Adhiṭṭhāna',
      content: 'The Lyonessa rode through the Vermillion Desert — 砂漠を渡る戦士',
    });
    expect(res.status).toBe(201);

    const scene = db.prepare('SELECT title, content FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.title).toBe('Adhiṭṭhāna');
    expect(scene.content).toContain('砂漠');
  });

  it('handles special characters in content', async () => {
    const content = `She said, "Don't touch the violin!" — and he didn't. The Maestro's face...`;
    const res = await request(app).post('/api/scenes').send({
      movement: '01', scene_number: 1, title: 'Quotes', content,
    });
    expect(res.status).toBe(201);

    const scene = db.prepare('SELECT content FROM scenes WHERE id = ?').get(res.body.id) as any;
    expect(scene.content).toBe(content);
  });

  it('handles concurrent-ish reads and writes', async () => {
    // Create 20 scenes rapidly
    const promises = Array.from({ length: 20 }, (_, i) =>
      request(app).post('/api/scenes').send({
        movement: '01', scene_number: i + 1, title: `Scene ${i + 1}`,
      })
    );

    const results = await Promise.all(promises);
    results.forEach(r => expect(r.status).toBe(201));

    const list = await request(app).get('/api/scenes');
    expect(list.body.length).toBe(20);
  });
});

// ==========================================
// HEAP API
// ==========================================

describe('Heap API', () => {
  it('creates, reads, and updates a piece', async () => {
    const create = await request(app).post('/api/heap/pieces').send({
      kind: 'scene',
      title: 'Valentine Arrives',
      content: 'He asked what to do. The factory shrugged.',
      conviction: 75,
      tags: ['valentine', 'origin'],
      meta: { story_arc: 'B' },
    });
    expect(create.status).toBe(201);
    expect(create.body.word_count).toBe(8);

    const get = await request(app).get(`/api/heap/pieces/${create.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.title).toBe('Valentine Arrives');
    expect(Array.isArray(get.body.outgoing)).toBe(true);
    expect(Array.isArray(get.body.incoming)).toBe(true);

    const update = await request(app).put(`/api/heap/pieces/${create.body.id}`).send({
      conviction: 90,
      content: 'He asked what to do. The factory shrugged. Then he walked.',
    });
    expect(update.status).toBe(200);
    expect(update.body.ok).toBe(true);

    const piece = db.prepare('SELECT conviction, word_count FROM pieces WHERE id = ?').get(create.body.id) as any;
    expect(piece.conviction).toBe(90);
    expect(piece.word_count).toBe(11);
  });

  it('creates associations and rejects duplicates', async () => {
    const a = await request(app).post('/api/heap/pieces').send({
      kind: 'scene', title: 'A', content: 'A text', conviction: 80,
    });
    const b = await request(app).post('/api/heap/pieces').send({
      kind: 'scene', title: 'B', content: 'B text', conviction: 82,
    });

    const first = await request(app).post('/api/heap/associations').send({
      source_id: a.body.id,
      target_id: b.body.id,
      kind: 'follows',
      label: 'A comes before B',
    });
    expect(first.status).toBe(201);

    const dupe = await request(app).post('/api/heap/associations').send({
      source_id: a.body.id,
      target_id: b.body.id,
      kind: 'follows',
      label: 'duplicate should fail',
    });
    expect(dupe.status).toBe(409);
  });

  it('returns sieve and graph payloads', async () => {
    const p1 = await request(app).post('/api/heap/pieces').send({
      kind: 'scene', title: 'High Conviction', content: 'gold node', conviction: 95,
    });
    const p2 = await request(app).post('/api/heap/pieces').send({
      kind: 'scene', title: 'Also High', content: 'also gold', conviction: 88,
    });
    await request(app).post('/api/heap/associations').send({
      source_id: p1.body.id,
      target_id: p2.body.id,
      kind: 'echoes',
    });

    const sieve = await request(app).get('/api/heap/sieve?min_conviction=80');
    expect(sieve.status).toBe(200);
    expect(Array.isArray(sieve.body.nodes)).toBe(true);
    expect(Array.isArray(sieve.body.links)).toBe(true);

    const graph = await request(app).get('/api/heap/graph?min_conviction=80');
    expect(graph.status).toBe(200);
    expect(Array.isArray(graph.body.nodes)).toBe(true);
    expect(Array.isArray(graph.body.links)).toBe(true);
    expect(Array.isArray(graph.body.legend)).toBe(true);
  });
});
