import express, { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { buildGoldSanity, buildStoryHealth } from '../analysis/storyHealth';

export function buildGraphData(db: Database.Database) {
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
}

export function createAnalysisRouter(db: Database.Database) {
  const router = express.Router();

  // ==========================================
  // STORY ANALYSIS
  // ==========================================

  router.get('/analysis/gold-sanity', (_req: Request, res: Response) => {
    const { scenes } = buildGraphData(db);
    res.json(buildGoldSanity(scenes));
  });

  router.get('/analysis/story-health', (_req: Request, res: Response) => {
    const { scenes, links } = buildGraphData(db);
    const health = buildStoryHealth(scenes, links.map((l: any) => ({
      source: Number(l.source),
      target: Number(l.target),
      order: String(l.order || ''),
    })));
    const gold = buildGoldSanity(scenes);
    res.json({ ...health, goldSanity: gold });
  });

  router.get('/analysis/heroic-cycle', (req: Request, res: Response) => {
    const { scenes, links } = buildGraphData(db);
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

  router.get('/graph', (_req: Request, res: Response) => {
    const { nodes, links, legends } = buildGraphData(db);
    res.json({ nodes, links, legends });
  });

  // ==========================================
  // BATCH PROMOTE: GOLD -> EDITED
  // ==========================================

  router.post('/promote', (_req: Request, res: Response) => {
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

  return router;
}
