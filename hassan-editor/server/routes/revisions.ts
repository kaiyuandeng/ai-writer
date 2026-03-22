import express, { Request, Response } from 'express';
import type Database from 'better-sqlite3';

export function createRevisionsRouter(db: Database.Database) {
  const router = express.Router();

  // ==========================================
  // REVISIONS API
  // ==========================================

  router.get('/scenes/:id/revisions', (req: Request, res: Response) => {
    const revisions = db.prepare(
      'SELECT id, provenance, word_count, note, created_at FROM revisions WHERE scene_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);
    res.json(revisions);
  });

  router.get('/revisions/:id', (req: Request, res: Response) => {
    const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(req.params.id);
    if (!rev) { res.status(404).json({ error: 'Revision not found' }); return; }
    res.json(rev);
  });

  router.post('/scenes/:id/revisions', (req: Request, res: Response) => {
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

  router.get('/orders', (_req: Request, res: Response) => {
    const orders = db.prepare('SELECT * FROM scene_orders ORDER BY name').all();
    res.json(orders);
  });

  router.get('/orders/:name', (req: Request, res: Response) => {
    const order = db.prepare('SELECT * FROM scene_orders WHERE name = ?').get(req.params.name);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(order);
  });

  router.post('/orders', (req: Request, res: Response) => {
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

  return router;
}
