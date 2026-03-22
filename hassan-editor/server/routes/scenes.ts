import express, { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { STORY_ARCS, STATUSES, PROVENANCES } from '../../src/entities';
import { countWords } from '../utils';

const VALID_STORY_ARCS = [...STORY_ARCS];
const VALID_STATUSES = [...STATUSES];
const VALID_PROVENANCES = [...PROVENANCES];

function getStoryArc(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  return payload.story_arc ?? payload.timeline;
}

export function createScenesRouter(db: Database.Database, contentRoot: string) {
  const router = express.Router();

  // ==========================================
  // SCENES CRUD
  // ==========================================

  router.get('/scenes', (req: Request, res: Response) => {
    const { movement } = req.query;
    const storyArc = req.query.story_arc ?? req.query.timeline;
    let sql = "SELECT *, COALESCE(story_arc, timeline, 'B') AS story_arc FROM scenes";
    const conditions: string[] = [];
    const params: string[] = [];

    if (movement) { conditions.push('movement = ?'); params.push(String(movement)); }
    if (storyArc) { conditions.push("COALESCE(story_arc, timeline, 'B') = ?"); params.push(String(storyArc)); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY movement, scene_number';

    const scenes = db.prepare(sql).all(...params);
    res.json(scenes);
  });

  router.get('/scenes/:id', (req: Request, res: Response) => {
    const scene = db.prepare("SELECT *, COALESCE(story_arc, timeline, 'B') AS story_arc FROM scenes WHERE id = ?").get(req.params.id);
    if (!scene) { res.status(404).json({ error: 'Scene not found' }); return; }
    res.json(scene);
  });

  router.post('/scenes', (req: Request, res: Response) => {
    const { movement, scene_number, title, pov, characters, setting,
      motivation, theme, hook, audience_interest, writerly_interest,
      story_interest, status, golden, content, provenance, provenance_meta } = req.body;

    if (!movement || scene_number == null || !title) {
      res.status(400).json({ error: 'movement, scene_number, and title are required' });
      return;
    }

    if (typeof scene_number !== 'number' || scene_number < 0) {
      res.status(400).json({ error: 'scene_number must be a non-negative integer' });
      return;
    }

    const storyArc = getStoryArc(req.body) || 'B';
    if (!VALID_STORY_ARCS.includes(storyArc as any)) {
      res.status(400).json({ error: `story_arc must be one of: ${VALID_STORY_ARCS.join(', ')}` });
      return;
    }

    const st = status || 'BLANK';
    if (!VALID_STATUSES.includes(st)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    const prov = provenance || 'GOLD';
    if (!VALID_PROVENANCES.includes(prov)) {
      res.status(400).json({ error: `provenance must be one of: ${VALID_PROVENANCES.join(', ')}` });
      return;
    }

    const wordCount = countWords(content || '');

    try {
      const result = db.prepare(`
        INSERT INTO scenes (movement, scene_number, title, story_arc, timeline, pov, characters,
          setting, motivation, theme, hook, audience_interest, writerly_interest,
          story_interest, status, golden, content, word_count, provenance, provenance_meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(movement, scene_number, title, storyArc, storyArc, pov || null,
        JSON.stringify(characters || []), setting || null, motivation || null,
        theme || null, hook || null, audience_interest || null,
        writerly_interest || null, story_interest || null,
        st, golden ?? 1, content || '', wordCount, prov, provenance_meta || null);

      res.status(201).json({ id: result.lastInsertRowid, provenance: prov });
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: `Scene ${movement}/${scene_number} already exists` });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  router.put('/scenes/:id', (req: Request, res: Response) => {
    const existing = db.prepare('SELECT id, provenance FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!existing) { res.status(404).json({ error: 'Scene not found' }); return; }

    // INVARIANT: GOLD scenes are immutable originals. Only metadata & provenance promotion allowed.
    if (existing.provenance === 'GOLD' && req.body.content !== undefined) {
      res.status(403).json({ error: 'GOLD scenes are read-only. Promote to EDITED first.' });
      return;
    }

    const { content, ...metadata } = req.body;
    const requestedStoryArc = getStoryArc(req.body);
    const updates: string[] = [];
    const params: any[] = [];

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
      updates.push('word_count = ?');
      params.push(countWords(content));
    }

    const metaFields = ['title', 'pov', 'characters', 'setting',
      'motivation', 'theme', 'hook', 'audience_interest', 'writerly_interest',
      'story_interest', 'status', 'golden', 'movement', 'scene_number',
      'provenance', 'provenance_meta', 'source_raw_id'] as const;

    if (requestedStoryArc !== undefined) {
      if (!VALID_STORY_ARCS.includes(requestedStoryArc as any)) {
        res.status(400).json({ error: `story_arc must be one of: ${VALID_STORY_ARCS.join(', ')}` });
        return;
      }
      updates.push('story_arc = ?');
      params.push(requestedStoryArc);
      updates.push('timeline = ?');
      params.push(requestedStoryArc);
    }

    for (const field of metaFields) {
      if (metadata[field] !== undefined) {
        if (field === 'status' && !VALID_STATUSES.includes(metadata[field])) {
          res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
          return;
        }
        if (field === 'provenance' && !VALID_PROVENANCES.includes(metadata[field])) {
          res.status(400).json({ error: `provenance must be one of: ${VALID_PROVENANCES.join(', ')}` });
          return;
        }
        updates.push(`${field} = ?`);
        params.push(field === 'characters' ? JSON.stringify(metadata[field]) : metadata[field]);
      }
    }

    if (updates.length === 0) { res.json({ ok: true }); return; }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/scenes/:id', (req: Request, res: Response) => {
    const scene = db.prepare('SELECT id, provenance FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) { res.status(404).json({ error: 'Scene not found' }); return; }

    // INVARIANT: GOLD scenes are immutable originals and can never be deleted.
    if (scene.provenance === 'GOLD') {
      res.status(403).json({ error: 'GOLD scenes are immutable and cannot be deleted.' });
      return;
    }

    const result = db.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Scene not found' }); return; }
    res.json({ ok: true });
  });

  // ==========================================
  // TREE API
  // ==========================================

  router.get('/tree', (_req: Request, res: Response) => {
    const scenes = db.prepare(
      `SELECT id, movement, scene_number, title,
              COALESCE(story_arc, timeline, 'B') AS story_arc,
              pov, status, golden, provenance, word_count
       FROM scenes ORDER BY movement, scene_number`
    ).all() as any[];

    const movements: Record<string, any[]> = {};
    for (const s of scenes) {
      if (!movements[s.movement]) movements[s.movement] = [];
      movements[s.movement].push(s);
    }

    const rawFiles = db.prepare('SELECT id, filename, word_count FROM raw_files ORDER BY filename').all();
    res.json({ movements, rawFiles });
  });

  // ==========================================
  // RAW FILES API
  // ==========================================

  router.get('/raw', (_req: Request, res: Response) => {
    const files = db.prepare('SELECT id, filename, word_count, imported_at FROM raw_files ORDER BY filename').all();
    res.json(files);
  });

  router.get('/raw/:id', (req: Request, res: Response) => {
    const file = db.prepare('SELECT * FROM raw_files WHERE id = ?').get(req.params.id);
    if (!file) { res.status(404).json({ error: 'File not found' }); return; }
    res.json(file);
  });

  // ==========================================
  // IMPORT
  // ==========================================

  router.post('/import', (_req: Request, res: Response) => {
    const rawDir = path.join(contentRoot, 'raw');
    if (!fs.existsSync(rawDir)) {
      res.status(404).json({ error: 'Raw directory not found' });
      return;
    }

    const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    const insert = db.prepare('INSERT OR REPLACE INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)');

    const importMany = db.transaction(() => {
      for (const file of files) {
        const fileContent = fs.readFileSync(path.join(rawDir, file), 'utf-8');
        insert.run(file, fileContent, countWords(fileContent));
      }
    });

    importMany();
    res.json({ imported: files.length });
  });

  // ==========================================
  // CHARACTERS API
  // ==========================================

  router.get('/characters', (_req: Request, res: Response) => {
    const chars = db.prepare('SELECT * FROM characters ORDER BY name').all();
    res.json(chars);
  });

  router.post('/characters', (req: Request, res: Response) => {
    const { name, aliases, description, motivation, first_appearance } = req.body;
    const storyArc = req.body.story_arc ?? req.body.timeline ?? null;

    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    try {
      const result = db.prepare(
        'INSERT OR REPLACE INTO characters (name, aliases, story_arc, timeline, description, motivation, first_appearance) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(name, JSON.stringify(aliases || []), storyArc, storyArc, description || null, motivation || null, first_appearance || null);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
