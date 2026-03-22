import express, { Request, Response } from 'express';
import type Database from 'better-sqlite3';

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function parseJsonObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseCsv(value: unknown): string[] {
  if (!value) return [];
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

export function createHeapRouter(db: Database.Database) {
  const router = express.Router();

  router.get('/pieces', (req: Request, res: Response) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const { kind, q, conviction_min, conviction_max } = req.query;
    const tags = parseCsv(req.query.tags);

    let sql = 'SELECT * FROM pieces';
    if (kind) {
      conditions.push('kind = ?');
      params.push(String(kind));
    }
    if (q) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      params.push(`%${String(q)}%`, `%${String(q)}%`);
    }
    if (conviction_min != null && conviction_min !== '') {
      conditions.push('conviction >= ?');
      params.push(Number(conviction_min));
    }
    if (conviction_max != null && conviction_max !== '') {
      conditions.push('conviction <= ?');
      params.push(Number(conviction_max));
    }
    for (const tag of tags) {
      conditions.push("EXISTS (SELECT 1 FROM json_each(pieces.tags) WHERE json_each.value = ?)");
      params.push(tag);
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY conviction DESC, updated_at DESC, id DESC';

    const pieces = db.prepare(sql).all(...params);
    res.json(pieces);
  });

  router.get('/pieces/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'id must be numeric' });
      return;
    }
    const piece = db.prepare('SELECT * FROM pieces WHERE id = ?').get(id);
    if (!piece) {
      res.status(404).json({ error: 'Piece not found' });
      return;
    }
    const outgoing = db.prepare('SELECT * FROM associations WHERE source_id = ? ORDER BY created_at ASC, id ASC').all(id);
    const incoming = db.prepare('SELECT * FROM associations WHERE target_id = ? ORDER BY created_at ASC, id ASC').all(id);
    res.json({ ...piece, outgoing, incoming });
  });

  router.post('/pieces', (req: Request, res: Response) => {
    const kind = req.body.kind ? String(req.body.kind).trim() : '';
    if (!kind) {
      res.status(400).json({ error: 'kind is required' });
      return;
    }
    const title = req.body.title ? String(req.body.title) : '';
    const content = req.body.content ? String(req.body.content) : '';
    const convictionRaw = req.body.conviction ?? 0;
    const conviction = Number(convictionRaw);
    if (!Number.isFinite(conviction) || conviction < 0 || conviction > 100) {
      res.status(400).json({ error: 'conviction must be between 0 and 100' });
      return;
    }

    const provenance = req.body.provenance ? String(req.body.provenance) : 'GOLD';
    const tags = parseStringArray(req.body.tags);
    const meta = parseJsonObject(req.body.meta);
    const wordCount = countWords(content);
    const insert = db.prepare(`
      INSERT INTO pieces (kind, title, content, word_count, conviction, provenance, tags, meta, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const result = insert.run(
      kind,
      title,
      content,
      wordCount,
      conviction,
      provenance,
      JSON.stringify(tags),
      JSON.stringify(meta),
    );
    const piece = db.prepare('SELECT * FROM pieces WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(piece);
  });

  router.put('/pieces/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'id must be numeric' });
      return;
    }
    const existing = db.prepare('SELECT * FROM pieces WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Piece not found' });
      return;
    }
    const nextKind = req.body.kind != null ? String(req.body.kind) : existing.kind;
    const nextTitle = req.body.title != null ? String(req.body.title) : existing.title;
    const nextContent = req.body.content != null ? String(req.body.content) : existing.content;
    const nextConviction = req.body.conviction != null ? Number(req.body.conviction) : Number(existing.conviction);
    if (!Number.isFinite(nextConviction) || nextConviction < 0 || nextConviction > 100) {
      res.status(400).json({ error: 'conviction must be between 0 and 100' });
      return;
    }
    const nextProvenance = req.body.provenance != null ? String(req.body.provenance) : existing.provenance;
    const nextTags = req.body.tags != null ? parseStringArray(req.body.tags) : parseStringArray(existing.tags);
    const nextMeta = req.body.meta != null ? parseJsonObject(req.body.meta) : parseJsonObject(existing.meta);
    const wordCount = countWords(nextContent);

    db.prepare(`
      UPDATE pieces
      SET kind = ?, title = ?, content = ?, word_count = ?, conviction = ?, provenance = ?,
          tags = ?, meta = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextKind,
      nextTitle,
      nextContent,
      wordCount,
      nextConviction,
      nextProvenance,
      JSON.stringify(nextTags),
      JSON.stringify(nextMeta),
      id,
    );
    res.json({ ok: true });
  });

  router.get('/pieces/:id/network', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const hops = Math.max(1, Math.min(3, Number(req.query.hops ?? 1)));
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'id must be numeric' });
      return;
    }

    const seen = new Set<number>([id]);
    let frontier = new Set<number>([id]);
    const links: any[] = [];
    for (let depth = 0; depth < hops; depth++) {
      const ids = Array.from(frontier);
      if (!ids.length) break;
      const placeholders = ids.map(() => '?').join(',');
      const edgeRows = db.prepare(`
        SELECT * FROM associations
        WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
      `).all(...ids, ...ids) as any[];
      const next = new Set<number>();
      for (const edge of edgeRows) {
        links.push(edge);
        if (!seen.has(edge.source_id)) {
          seen.add(edge.source_id);
          next.add(edge.source_id);
        }
        if (!seen.has(edge.target_id)) {
          seen.add(edge.target_id);
          next.add(edge.target_id);
        }
      }
      frontier = next;
    }
    const nodeIds = Array.from(seen);
    const placeholders = nodeIds.map(() => '?').join(',');
    const nodes = db.prepare(`SELECT * FROM pieces WHERE id IN (${placeholders}) ORDER BY conviction DESC, id DESC`).all(...nodeIds);
    res.json({ nodes, links });
  });

  router.get('/associations', (req: Request, res: Response) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let sql = 'SELECT * FROM associations';
    if (req.query.kind) {
      conditions.push('kind = ?');
      params.push(String(req.query.kind));
    }
    if (req.query.source_id) {
      conditions.push('source_id = ?');
      params.push(Number(req.query.source_id));
    }
    if (req.query.target_id) {
      conditions.push('target_id = ?');
      params.push(Number(req.query.target_id));
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY created_at DESC, id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  router.post('/associations', (req: Request, res: Response) => {
    const sourceId = Number(req.body.source_id);
    const targetId = Number(req.body.target_id);
    const kind = req.body.kind ? String(req.body.kind).trim() : '';
    if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) {
      res.status(400).json({ error: 'source_id and target_id must be numeric' });
      return;
    }
    if (!kind) {
      res.status(400).json({ error: 'kind is required' });
      return;
    }
    const source = db.prepare('SELECT id FROM pieces WHERE id = ?').get(sourceId);
    const target = db.prepare('SELECT id FROM pieces WHERE id = ?').get(targetId);
    if (!source || !target) {
      res.status(404).json({ error: 'source_id and target_id must exist in pieces' });
      return;
    }
    const label = req.body.label ? String(req.body.label) : '';
    const weight = req.body.weight != null ? Number(req.body.weight) : 1.0;
    if (!Number.isFinite(weight)) {
      res.status(400).json({ error: 'weight must be numeric' });
      return;
    }
    const meta = parseJsonObject(req.body.meta);
    try {
      const result = db.prepare(`
        INSERT INTO associations (source_id, target_id, kind, label, weight, meta)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sourceId, targetId, kind, label, weight, JSON.stringify(meta));
      const row = db.prepare('SELECT * FROM associations WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'association already exists for this source, target, and kind' });
        return;
      }
      throw error;
    }
  });

  router.put('/associations/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'id must be numeric' });
      return;
    }
    const existing = db.prepare('SELECT * FROM associations WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Association not found' });
      return;
    }
    const nextLabel = req.body.label != null ? String(req.body.label) : existing.label;
    const nextWeight = req.body.weight != null ? Number(req.body.weight) : Number(existing.weight);
    if (!Number.isFinite(nextWeight)) {
      res.status(400).json({ error: 'weight must be numeric' });
      return;
    }
    const nextMeta = req.body.meta != null ? parseJsonObject(req.body.meta) : parseJsonObject(existing.meta);
    db.prepare(`
      UPDATE associations
      SET label = ?, weight = ?, meta = ?
      WHERE id = ?
    `).run(nextLabel, nextWeight, JSON.stringify(nextMeta), id);
    res.json({ ok: true });
  });

  router.get('/kinds', (_req: Request, res: Response) => {
    const kinds = db.prepare(`
      SELECT kind, COUNT(*) AS count
      FROM associations
      GROUP BY kind
      ORDER BY count DESC, kind ASC
    `).all();
    res.json(kinds);
  });

  router.get('/stats', (_req: Request, res: Response) => {
    const totalPieces = (db.prepare('SELECT COUNT(*) AS c FROM pieces').get() as any).c;
    const totalAssociations = (db.prepare('SELECT COUNT(*) AS c FROM associations').get() as any).c;
    const byKind = db.prepare('SELECT kind, COUNT(*) AS count, SUM(word_count) AS words FROM pieces GROUP BY kind ORDER BY count DESC').all();
    const byAssociationKind = db.prepare('SELECT kind, COUNT(*) AS count FROM associations GROUP BY kind ORDER BY count DESC, kind ASC').all();
    const convictionBands = db.prepare(`
      SELECT
        CASE
          WHEN conviction < 25 THEN '0-24'
          WHEN conviction < 50 THEN '25-49'
          WHEN conviction < 75 THEN '50-74'
          ELSE '75-100'
        END AS band,
        COUNT(*) AS count
      FROM pieces
      GROUP BY band
      ORDER BY band
    `).all();
    res.json({ totalPieces, totalAssociations, byKind, byAssociationKind, convictionBands });
  });

  router.get('/graph', (req: Request, res: Response) => {
    const minConviction = Number(req.query.min_conviction ?? 0);
    const kinds = parseCsv(req.query.kinds);
    const nodeRows = db.prepare('SELECT * FROM pieces WHERE conviction >= ? ORDER BY conviction DESC, id DESC').all(minConviction) as any[];
    const idSet = new Set<number>(nodeRows.map((row) => row.id));
    let links = db.prepare('SELECT * FROM associations ORDER BY created_at DESC, id DESC').all() as any[];
    links = links.filter((edge) => idSet.has(edge.source_id) && idSet.has(edge.target_id));
    if (kinds.length) {
      const kindSet = new Set(kinds);
      links = links.filter((edge) => kindSet.has(String(edge.kind)));
    }
    const legend = db.prepare('SELECT kind, COUNT(*) AS count FROM associations GROUP BY kind ORDER BY kind').all();
    res.json({ nodes: nodeRows, links, legend });
  });

  router.get('/sieve', (req: Request, res: Response) => {
    const minConviction = Number(req.query.min_conviction ?? 70);
    const kinds = parseCsv(req.query.kinds);
    const nodes = db.prepare('SELECT * FROM pieces WHERE conviction >= ? ORDER BY conviction DESC, id DESC').all(minConviction) as any[];
    const idSet = new Set<number>(nodes.map((row) => row.id));
    let links = db.prepare('SELECT * FROM associations ORDER BY created_at DESC, id DESC').all() as any[];
    links = links.filter((edge) => idSet.has(edge.source_id) && idSet.has(edge.target_id));
    if (kinds.length) {
      const kindSet = new Set(kinds);
      links = links.filter((edge) => kindSet.has(String(edge.kind)));
    }
    const orphanCount = nodes.filter((node) => !links.some((edge) => edge.source_id === node.id || edge.target_id === node.id)).length;
    res.json({ threshold: minConviction, nodes, links, orphanCount });
  });

  return router;
}
