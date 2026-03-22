import express, { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { countWords } from '../utils';

export function createGulperRouter(db: Database.Database) {
  const router = express.Router();

  router.post('/gulp', (req: Request, res: Response) => {
    const { filename, content, file_type, file_size, word_count, provenance } = req.body;

    if (!filename) { res.status(400).json({ error: 'filename is required' }); return; }

    const prov = provenance || 'GOLD';

    try {
      const result = db.prepare(
        'INSERT INTO gulped (filename, content, file_type, file_size, word_count, provenance) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        filename,
        content || '',
        file_type || 'text',
        file_size || 0,
        word_count || countWords(content || ''),
        prov,
      );

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

  router.get('/gulped', (_req: Request, res: Response) => {
    const files = db.prepare(
      'SELECT id, filename, file_type, file_size, word_count, gulped_at FROM gulped ORDER BY gulped_at DESC'
    ).all();
    res.json(files);
  });

  // ==========================================
  // GOLD INDEX — all GOLD content, always queryable
  // ==========================================

  router.get('/gold', (_req: Request, res: Response) => {
    const scenes = db.prepare(
      `SELECT id, 'scene' AS source, title AS name, movement, word_count, created_at
       FROM scenes WHERE provenance = 'GOLD' ORDER BY created_at`
    ).all();
    const gulped = db.prepare(
      `SELECT id, 'gulped' AS source, filename AS name, word_count, gulped_at AS created_at
       FROM gulped WHERE provenance = 'GOLD' ORDER BY gulped_at`
    ).all();
    res.json({ count: scenes.length + gulped.length, scenes, gulped });
  });

  // ==========================================
  // DELETE GULPED (with GOLD guard)
  // ==========================================

  router.delete('/gulped/:id', (req: Request, res: Response) => {
    const item = db.prepare('SELECT id, provenance FROM gulped WHERE id = ?').get(req.params.id) as any;
    if (!item) { res.status(404).json({ error: 'Gulped item not found' }); return; }

    if (item.provenance === 'GOLD') {
      res.status(403).json({ error: 'GOLD content is immutable and cannot be deleted.' });
      return;
    }

    db.prepare('DELETE FROM gulped WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
