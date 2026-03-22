import express, { Request, Response } from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STORY_ARCS, STATUSES, PROVENANCES } from '../src/entities';
import { buildGoldSanity, buildStoryHealth } from './analysis/storyHealth';
import { createHeapRouter } from './heap';

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const VALID_STORY_ARCS = [...STORY_ARCS];
const VALID_STATUSES = [...STATUSES];
const VALID_PROVENANCES = [...PROVENANCES];

function getStoryArc(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  return payload.story_arc ?? payload.timeline;
}

export function createApp(db: Database.Database, contentRoot: string) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/heap', createHeapRouter(db));

  const buildGraphData = () => {
    const scenes = db.prepare(
      `SELECT id, movement, scene_number, title,
              COALESCE(story_arc, timeline, 'B') AS story_arc,
              status, provenance, provenance_meta, hook, motivation, theme, word_count
       FROM scenes ORDER BY movement, scene_number`
    ).all() as any[];
    const customOrders = db.prepare('SELECT name, description, scene_ids FROM scene_orders ORDER BY name').all() as any[];

    // Universe-time rank is intentionally separate from story arcs.
    // Earth (C) happens before Hassan-focused arcs.
    const universeTimeRank: Record<string, number> = { C: 0, A: 1, B: 2 };
    const byId = new Map<number, any>(scenes.map((s: any) => [s.id, s]));

    const publishing = [...scenes].sort((a: any, b: any) => {
      if (a.scene_number !== b.scene_number) return a.scene_number - b.scene_number;
      return a.story_arc.localeCompare(b.story_arc);
    }).map((s: any) => s.id);

    const chronological = [...scenes].sort((a: any, b: any) => {
      const tDiff = (universeTimeRank[a.story_arc] ?? 9) - (universeTimeRank[b.story_arc] ?? 9);
      if (tDiff !== 0) return tDiff;
      return a.scene_number - b.scene_number;
    }).map((s: any) => s.id);

    const storyArcA = [...scenes]
      .filter((s: any) => s.story_arc === 'A')
      .sort((a: any, b: any) => a.scene_number - b.scene_number)
      .map((s: any) => s.id);
    const storyArcB = [...scenes]
      .filter((s: any) => s.story_arc === 'B')
      .sort((a: any, b: any) => a.scene_number - b.scene_number)
      .map((s: any) => s.id);
    const storyArcC = [...scenes]
      .filter((s: any) => s.story_arc === 'C')
      .sort((a: any, b: any) => a.scene_number - b.scene_number)
      .map((s: any) => s.id);

    const links: any[] = [];
    const addChain = (ids: number[], kind: 'chronology' | 'publishing' | 'custom', order: string, color: string) => {
      for (let i = 0; i < ids.length - 1; i++) {
        if (!byId.has(ids[i]) || !byId.has(ids[i + 1])) continue;
        links.push({ source: ids[i], target: ids[i + 1], kind, order, color });
      }
    };

    addChain(chronological, 'chronology', 'chronological', '#6d7dff');
    addChain(publishing, 'publishing', 'publishing', '#3fa7ff');
    addChain(storyArcA, 'chronology', 'story-arc-a', '#895cdb');
    addChain(storyArcB, 'chronology', 'story-arc-b', '#2f9bfa');
    addChain(storyArcC, 'chronology', 'story-arc-c', '#181cf5');

    for (const order of customOrders) {
      let ids: number[] = [];
      try {
        ids = JSON.parse(order.scene_ids || '[]');
      } catch {
        ids = [];
      }
      addChain(ids, 'custom', order.name, '#b38cff');
    }

    for (const scene of scenes) {
      if (scene.provenance !== 'EXTRAPOLATED' || !scene.provenance_meta) continue;
      try {
        const meta = JSON.parse(scene.provenance_meta);
        const fromId = Number(meta.follows_scene_id);
        const toId = Number(meta.precedes_scene_id);
        const why = meta.rationale || meta.bridges || null;

        if (Number.isFinite(fromId) && byId.has(fromId)) {
          links.push({
            source: fromId,
            target: scene.id,
            kind: 'extrapolated',
            order: 'extrapolated',
            color: '#895cdb',
            why: why || undefined,
          });
        }
        if (Number.isFinite(toId) && byId.has(toId)) {
          links.push({
            source: scene.id,
            target: toId,
            kind: 'extrapolated',
            order: 'extrapolated',
            color: '#895cdb',
            why: why || undefined,
          });
        }
      } catch {
        // Ignore malformed provenance metadata.
      }
    }

    const legends = [
      { name: 'publishing', description: 'Braid order (A-B-A-B). Reader-facing sequence.', color: '#3fa7ff' },
      { name: 'chronological', description: 'Universe-time order (earth before hassan arcs).', color: '#6d7dff' },
      { name: 'story-arc-a', description: 'story arc A only.', color: '#895cdb' },
      { name: 'story-arc-b', description: 'story arc B only.', color: '#2f9bfa' },
      { name: 'story-arc-c', description: 'story arc C only.', color: '#181cf5' },
      { name: 'custom', description: 'Saved user reading orders.', color: '#b38cff' },
      { name: 'extrapolated', description: 'AI bridge links with rationale metadata.', color: '#895cdb' },
    ];

    const nodes = scenes.map((s: any) => ({
      id: s.id,
      title: s.title,
      scene_number: s.scene_number,
      story_arc: s.story_arc,
      movement: s.movement,
      status: s.status,
      provenance: s.provenance || 'GOLD',
    }));

    return { scenes, links, nodes, legends };
  };

  // ==========================================
  // SCENES API
  // ==========================================

  app.get('/api/scenes', (req: Request, res: Response) => {
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

  app.get('/api/scenes/:id', (req: Request, res: Response) => {
    const scene = db.prepare("SELECT *, COALESCE(story_arc, timeline, 'B') AS story_arc FROM scenes WHERE id = ?").get(req.params.id);
    if (!scene) { res.status(404).json({ error: 'Scene not found' }); return; }
    res.json(scene);
  });

  app.post('/api/scenes', (req: Request, res: Response) => {
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

  app.put('/api/scenes/:id', (req: Request, res: Response) => {
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
      // Keep legacy column synced while migration is in flight.
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

  app.delete('/api/scenes/:id', (req: Request, res: Response) => {
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

  app.get('/api/tree', (_req: Request, res: Response) => {
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

  app.get('/api/raw', (_req: Request, res: Response) => {
    const files = db.prepare('SELECT id, filename, word_count, imported_at FROM raw_files ORDER BY filename').all();
    res.json(files);
  });

  app.get('/api/raw/:id', (req: Request, res: Response) => {
    const file = db.prepare('SELECT * FROM raw_files WHERE id = ?').get(req.params.id);
    if (!file) { res.status(404).json({ error: 'File not found' }); return; }
    res.json(file);
  });

  // ==========================================
  // IMPORT
  // ==========================================

  app.post('/api/import', (_req: Request, res: Response) => {
    const rawDir = path.join(contentRoot, 'raw');
    if (!fs.existsSync(rawDir)) {
      res.status(404).json({ error: 'Raw directory not found' });
      return;
    }

    const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    const insert = db.prepare('INSERT OR REPLACE INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)');

    const importMany = db.transaction(() => {
      for (const file of files) {
        const content = fs.readFileSync(path.join(rawDir, file), 'utf-8');
        insert.run(file, content, countWords(content));
      }
    });

    importMany();
    res.json({ imported: files.length });
  });

  // ==========================================
  // CHARACTERS API
  // ==========================================

  app.get('/api/characters', (_req: Request, res: Response) => {
    const chars = db.prepare('SELECT * FROM characters ORDER BY name').all();
    res.json(chars);
  });

  app.post('/api/characters', (req: Request, res: Response) => {
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

  // ==========================================
  // GULPER API
  // ==========================================

  app.post('/api/gulp', (req: Request, res: Response) => {
    const { filename, content, file_type, file_size, classification, word_count, provenance } = req.body;

    if (!filename) { res.status(400).json({ error: 'filename is required' }); return; }

    const prov = provenance || 'GOLD';

    try {
      const result = db.prepare(
        'INSERT INTO gulped (filename, content, file_type, file_size, classification, word_count, provenance) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        filename,
        content || '',
        file_type || 'text',
        file_size || 0,
        classification || 'misc',
        word_count || countWords(content || ''),
        prov,
      );

      // Also store as raw file if it's text content worth keeping
      const textTypes = ['txt', 'md', 'markdown', 'text', 'rtf', 'json', 'csv'];
      let stored_as = 'gulped';
      if (textTypes.includes(file_type || '') && (word_count || 0) > 10) {
        db.prepare('INSERT OR REPLACE INTO raw_files (filename, content, word_count) VALUES (?, ?, ?)')
          .run(filename, content || '', word_count || 0);
        stored_as = 'raw + gulped';
      }

      res.status(201).json({ id: result.lastInsertRowid, stored_as });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/gulped', (_req: Request, res: Response) => {
    const files = db.prepare(
      'SELECT id, filename, file_type, file_size, classification, word_count, gulped_at FROM gulped ORDER BY gulped_at DESC'
    ).all();
    res.json(files);
  });

  // ==========================================
  // GOLD INDEX — all GOLD content, always queryable
  // ==========================================

  app.get('/api/gold', (_req: Request, res: Response) => {
    const scenes = db.prepare(
      `SELECT id, 'scene' AS source, title AS name, movement, word_count, created_at
       FROM scenes WHERE provenance = 'GOLD' ORDER BY created_at`
    ).all();
    const gulped = db.prepare(
      `SELECT id, 'gulped' AS source, filename AS name, classification AS movement, word_count, gulped_at AS created_at
       FROM gulped WHERE provenance = 'GOLD' ORDER BY gulped_at`
    ).all();
    res.json({ count: scenes.length + gulped.length, scenes, gulped });
  });

  // ==========================================
  // DELETE GULPED (with GOLD guard)
  // ==========================================

  app.delete('/api/gulped/:id', (req: Request, res: Response) => {
    const item = db.prepare('SELECT id, provenance FROM gulped WHERE id = ?').get(req.params.id) as any;
    if (!item) { res.status(404).json({ error: 'Gulped item not found' }); return; }

    if (item.provenance === 'GOLD') {
      res.status(403).json({ error: 'GOLD content is immutable and cannot be deleted.' });
      return;
    }

    db.prepare('DELETE FROM gulped WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ==========================================
  // REVISIONS API
  // ==========================================

  // Get all revisions for a scene (newest first)
  app.get('/api/scenes/:id/revisions', (req: Request, res: Response) => {
    const revisions = db.prepare(
      'SELECT id, provenance, word_count, note, created_at FROM revisions WHERE scene_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);
    res.json(revisions);
  });

  // Get a specific revision's content
  app.get('/api/revisions/:id', (req: Request, res: Response) => {
    const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(req.params.id);
    if (!rev) { res.status(404).json({ error: 'Revision not found' }); return; }
    res.json(rev);
  });

  // Snapshot current scene state as a revision (called before edits)
  app.post('/api/scenes/:id/revisions', (req: Request, res: Response) => {
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any;
    if (!scene) { res.status(404).json({ error: 'Scene not found' }); return; }

    const note = req.body.note || null;
    const result = db.prepare(
      'INSERT INTO revisions (scene_id, provenance, content, word_count, note) VALUES (?, ?, ?, ?, ?)'
    ).run(scene.id, scene.provenance || 'GOLD', scene.content, scene.word_count, note);

    res.status(201).json({ id: result.lastInsertRowid });
  });

  // ==========================================
  // SCENE ORDERS API (reading sequences)
  // ==========================================

  app.get('/api/orders', (_req: Request, res: Response) => {
    const orders = db.prepare('SELECT * FROM scene_orders ORDER BY name').all();
    res.json(orders);
  });

  app.get('/api/orders/:name', (req: Request, res: Response) => {
    const order = db.prepare('SELECT * FROM scene_orders WHERE name = ?').get(req.params.name);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(order);
  });

  app.post('/api/orders', (req: Request, res: Response) => {
    const { name, description, scene_ids } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    try {
      const result = db.prepare(
        'INSERT OR REPLACE INTO scene_orders (name, description, scene_ids, updated_at) VALUES (?, ?, ?, datetime(\'now\'))'
      ).run(name, description || null, JSON.stringify(scene_ids || []));
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // STORY ANALYSIS
  // ==========================================

  app.get('/api/analysis/gold-sanity', (_req: Request, res: Response) => {
    const { scenes } = buildGraphData();
    res.json(buildGoldSanity(scenes));
  });

  app.get('/api/analysis/story-health', (_req: Request, res: Response) => {
    const { scenes, links } = buildGraphData();
    const health = buildStoryHealth(scenes, links.map((l: any) => ({
      source: Number(l.source),
      target: Number(l.target),
      order: String(l.order || ''),
    })));
    const gold = buildGoldSanity(scenes);
    res.json({ ...health, goldSanity: gold });
  });

  app.get('/api/analysis/heroic-cycle', (req: Request, res: Response) => {
    const { scenes, links } = buildGraphData();
    const health = buildStoryHealth(scenes, links.map((l: any) => ({
      source: Number(l.source),
      target: Number(l.target),
      order: String(l.order || ''),
    })));
    const requestedArc = String(req.query.story_arc || '').trim().toUpperCase();
    const curves = health.heroicCycle.curves;
    if (!requestedArc) {
      res.json(health.heroicCycle);
      return;
    }
    const arcKey = `story-arc-${requestedArc.toLowerCase()}`;
    res.json({
      ...health.heroicCycle,
      curves: { [arcKey]: curves[arcKey] || [] },
      missingByArc: { [arcKey]: health.heroicCycle.missingByArc[arcKey] || [] },
    });
  });

  // ==========================================
  // SCENE GRAPH API
  // ==========================================

  app.get('/api/graph', (_req: Request, res: Response) => {
    const { nodes, links, legends } = buildGraphData();
    res.json({ nodes, links, legends });
  });

  // ==========================================
  // BATCH PROMOTE: GOLD → EDITED
  // Snapshots each GOLD scene as a revision, then flips provenance.
  // ==========================================

  app.post('/api/promote', (_req: Request, res: Response) => {
    const goldScenes = db.prepare(
      "SELECT * FROM scenes WHERE provenance = 'GOLD' OR provenance IS NULL"
    ).all() as any[];

    if (goldScenes.length === 0) {
      res.json({ promoted: 0, message: 'No GOLD scenes to promote.' });
      return;
    }

    const snapshotStmt = db.prepare(
      'INSERT INTO revisions (scene_id, provenance, content, word_count, note) VALUES (?, ?, ?, ?, ?)'
    );
    const promoteStmt = db.prepare(
      "UPDATE scenes SET provenance = 'EDITED', provenance_meta = ?, updated_at = datetime('now') WHERE id = ?"
    );

    const promoteAll = db.transaction(() => {
      for (const scene of goldScenes) {
        snapshotStmt.run(scene.id, 'GOLD', scene.content, scene.word_count, 'Auto-snapshot before promotion to EDITED');
        const meta = JSON.stringify({ promoted_at: new Date().toISOString(), from: 'GOLD' });
        promoteStmt.run(meta, scene.id);
      }
    });

    promoteAll();
    res.json({ promoted: goldScenes.length, ids: goldScenes.map((s: any) => s.id) });
  });

  // ==========================================
  // STATS
  // ==========================================

  // ==========================================
  // README (rendered as HTML)
  // ==========================================

  app.get('/api/readme', (_req: Request, res: Response) => {
    const readmePath = path.resolve(fileURLToPath(import.meta.url), '../../README.md');
    if (!fs.existsSync(readmePath)) {
      res.status(404).json({ error: 'README.md not found' });
      return;
    }
    const md = fs.readFileSync(readmePath, 'utf-8');

    const escaped = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    const outputLines: string[] = [];

    for (const line of escaped.split('\n')) {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          outputLines.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
        }
        continue;
      }
      if (inCodeBlock) { codeBuffer.push(line); continue; }

      let out = line;
      out = out.replace(/^### (.+)$/, '<h3>$1</h3>');
      out = out.replace(/^## (.+)$/, '<h2>$1</h2>');
      out = out.replace(/^# (.+)$/, '<h1>$1</h1>');
      out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
      out = out.replace(/^\| (.+) \|$/g, (match) => {
        const cells = match.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`);
        return `<tr>${cells.join('')}</tr>`;
      });
      out = out.replace(/^- (.+)$/, '<li>$1</li>');
      out = out.replace(/^(\d+)\. (.+)$/, '<li><strong>$1.</strong> $2</li>');
      if (out === line && out.trim() === '') out = '<br>';
      outputLines.push(out);
    }

    const html = outputLines.join('\n')
      .replace(/(<tr>.*<\/tr>\n?)+/g, (block) => `<table>${block}</table>`)
      .replace(/<br>\n(<br>\n?)+/g, '<br>');

    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hassan Editor — README</title>
<style>
  :root {
    --cabal-purple: #895cdb;
    --cabal-sage:   #bad39d;
    --cabal-blue:   #2f9bfa;
    --cabal-orange: #dc6a21;
    --bg:           #0c0c0c;
    --text:         #d4d0c8;
    --text-muted:   #5a5750;
  }
  body {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    max-width: 640px; margin: 60px auto; padding: 0 24px;
    line-height: 1.7; color: var(--text); background: var(--bg);
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }
  h1 {
    font-size: 18px; font-weight: 400; letter-spacing: 0.02em;
    color: var(--text); margin-bottom: 6px;
    padding-bottom: 10px; border-bottom: 1px solid rgba(90,87,80,0.3);
  }
  h2 {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--cabal-purple);
    margin-top: 36px; margin-bottom: 12px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  h3 {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--text-muted);
    margin-top: 24px; margin-bottom: 8px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  p, li { margin: 4px 0; }
  li { padding-left: 4px; }
  li::marker { color: var(--text-muted); }
  strong { color: #f0ece4; font-weight: 500; }
  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.88em; color: var(--cabal-sage);
    background: rgba(137,92,219,0.08); padding: 1px 5px; border-radius: 2px;
  }
  pre {
    background: rgba(137,92,219,0.06); border-left: 2px solid var(--cabal-purple);
    padding: 12px 16px; margin: 12px 0; border-radius: 0;
    overflow-x: auto;
  }
  pre code {
    background: none; padding: 0; font-size: 12px; color: var(--text);
  }
  a { color: var(--cabal-blue); text-decoration: none; }
  a:hover { text-decoration: underline; }
  table {
    width: 100%; border-collapse: collapse; margin: 12px 0;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px;
  }
  td {
    padding: 5px 10px; border-bottom: 1px solid rgba(90,87,80,0.15);
    color: var(--text);
  }
  tr:first-child td { color: var(--text-muted); font-weight: 600; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.08em; }
  ::selection { background: rgba(137,92,219,0.2); }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 2px; }
</style>
</head><body>${html}</body></html>`);
  });

  // ==========================================
  // COMPILED STORIES — PDF reader + index
  // ==========================================

  const compiledDir = path.resolve(fileURLToPath(import.meta.url), '../../compiled');

  app.get('/compiled', (_req: Request, res: Response) => {
    if (!fs.existsSync(compiledDir)) {
      res.status(404).json({ error: 'compiled/ directory not found' });
      return;
    }
    const files = fs.readdirSync(compiledDir).filter(f => f.endsWith('.pdf')).sort();
    const items = files.map(f => {
      const name = f.replace('.pdf', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const stats = fs.statSync(path.join(compiledDir, f));
      const kb = Math.round(stats.size / 1024);
      return `<a href="/compiled/${f}" class="card">
        <span class="title">${name}</span>
        <span class="meta">${kb} KB · PDF</span>
      </a>`;
    });
    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hassan — Compiled Stories</title>
<style>
  :root {
    --cabal-purple: #895cdb; --cabal-sage: #bad39d; --cabal-blue: #2f9bfa;
    --bg: #0c0c0c; --text: #d4d0c8; --text-muted: #5a5750;
  }
  body {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    max-width: 560px; margin: 80px auto; padding: 0 24px;
    color: var(--text); background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }
  h1 {
    font-size: 16px; font-weight: 400; letter-spacing: 0.02em;
    margin-bottom: 6px; padding-bottom: 10px;
    border-bottom: 1px solid rgba(90,87,80,0.3);
  }
  .sub { font-size: 10px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.1em; font-family: 'SF Mono', 'Fira Code', monospace;
    margin-bottom: 32px; }
  .card {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; margin: 8px 0; border-radius: 4px;
    background: rgba(137,92,219,0.06); border: 1px solid rgba(137,92,219,0.12);
    text-decoration: none; transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--cabal-purple); }
  .title { color: var(--text); font-size: 13px; }
  .meta { color: var(--text-muted); font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace; }
  .empty { color: var(--text-muted); font-size: 12px; font-style: italic; }
  ::selection { background: rgba(137,92,219,0.2); }
</style>
</head><body>
<h1>Compiled Stories</h1>
<div class="sub">PROVENANCE: EXTRAPOLATED · HASSAN UNIVERSE</div>
${files.length ? items.join('\n') : '<p class="empty">No compiled stories yet.</p>'}
</body></html>`);
  });

  app.get('/compiled/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith('.pdf')) {
      res.status(400).json({ error: 'Only PDF files are served' });
      return;
    }
    const filePath = path.join(compiledDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.type('application/pdf').sendFile(filePath);
  });

  // ==========================================
  // STATS
  // ==========================================

  app.get('/api/stats', (_req: Request, res: Response) => {
    const totalScenes = (db.prepare('SELECT COUNT(*) as c FROM scenes').get() as any).c;
    const totalWords = (db.prepare('SELECT COALESCE(SUM(word_count), 0) as c FROM scenes').get() as any).c;
    const totalRawFiles = (db.prepare('SELECT COUNT(*) as c FROM raw_files').get() as any).c;
    const byStoryArc = db.prepare("SELECT COALESCE(story_arc, timeline, 'B') as story_arc, COUNT(*) as scenes, SUM(word_count) as words FROM scenes GROUP BY COALESCE(story_arc, timeline, 'B')").all();
    const byMovement = db.prepare('SELECT movement, COUNT(*) as scenes, SUM(word_count) as words FROM scenes GROUP BY movement ORDER BY movement').all();
    const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM scenes GROUP BY status').all();
    res.json({ totalScenes, totalWords, totalRawFiles, byStoryArc, byMovement, byStatus });
  });

  return app;
}
