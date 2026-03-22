import db from './db.js';

type LegacyPiece = {
  id: number;
  title?: string | null;
  content?: string | null;
  word_count?: number | null;
  provenance?: string | null;
};

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function insertPieceIfMissing(
  table: 'scenes' | 'raw_files' | 'gulped',
  row: LegacyPiece & Record<string, any>,
  kind: string,
  title: string,
  tags: string[],
  meta: Record<string, unknown>,
) {
  const existing = db.prepare(
    'SELECT id FROM pieces WHERE migrated_from_table = ? AND migrated_from_id = ?'
  ).get(table, row.id) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db.prepare(`
    INSERT INTO pieces (
      kind, title, content, word_count, conviction, provenance, tags, meta,
      migrated_from_table, migrated_from_id, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    kind,
    title,
    row.content || '',
    Number(row.word_count || 0),
    row.provenance === 'GOLD' ? 100 : 60,
    row.provenance || 'GOLD',
    JSON.stringify(tags),
    JSON.stringify(meta),
    table,
    row.id,
  );
  return Number(result.lastInsertRowid);
}

function mapSceneIdToPieceId(sceneId: number): number | null {
  const row = db.prepare(
    "SELECT id FROM pieces WHERE migrated_from_table = 'scenes' AND migrated_from_id = ?"
  ).get(sceneId) as { id: number } | undefined;
  return row ? row.id : null;
}

function createAssociationIfMissing(
  sourceId: number,
  targetId: number,
  kind: string,
  label = '',
  weight = 1.0,
  meta: Record<string, unknown> = {},
) {
  if (sourceId === targetId) return;
  const existing = db.prepare(
    'SELECT id FROM associations WHERE source_id = ? AND target_id = ? AND kind = ?'
  ).get(sourceId, targetId, kind);
  if (existing) return;
  db.prepare(`
    INSERT INTO associations (source_id, target_id, kind, label, weight, meta)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sourceId, targetId, kind, label, weight, JSON.stringify(meta));
}

function migratePieces() {
  const scenes = db.prepare('SELECT * FROM scenes ORDER BY movement, scene_number').all() as any[];
  for (const scene of scenes) {
    const sceneTags = [
      `movement:${scene.movement}`,
      `story_arc:${scene.story_arc || scene.timeline || 'B'}`,
      `status:${scene.status || 'BLANK'}`,
    ];
    insertPieceIfMissing(
      'scenes',
      scene,
      'scene',
      scene.title || `Scene ${scene.scene_number}`,
      sceneTags,
      {
        movement: scene.movement,
        scene_number: scene.scene_number,
        story_arc: scene.story_arc || scene.timeline || 'B',
        pov: scene.pov || null,
        characters: safeJsonParse<string[]>(scene.characters, []),
        setting: scene.setting || null,
        motivation: scene.motivation || null,
        theme: scene.theme || null,
        hook: scene.hook || null,
        status: scene.status || 'BLANK',
      },
    );
  }

  const rawFiles = db.prepare('SELECT * FROM raw_files ORDER BY id').all() as any[];
  for (const raw of rawFiles) {
    insertPieceIfMissing(
      'raw_files',
      raw,
      'raw',
      raw.filename || `Raw ${raw.id}`,
      ['raw'],
      { filename: raw.filename, imported_at: raw.imported_at },
    );
  }

  const gulped = db.prepare('SELECT * FROM gulped ORDER BY id').all() as any[];
  for (const item of gulped) {
    insertPieceIfMissing(
      'gulped',
      item,
      'gulped',
      item.filename || `Gulped ${item.id}`,
      [`classification:${item.classification || 'misc'}`],
      {
        filename: item.filename,
        file_type: item.file_type || 'text',
        file_size: item.file_size || 0,
        classification: item.classification || 'misc',
      },
    );
  }
}

function migrateAssociations() {
  const orders = db.prepare('SELECT * FROM scene_orders ORDER BY id').all() as any[];
  for (const order of orders) {
    const ids = safeJsonParse<number[]>(order.scene_ids, []);
    for (let i = 0; i < ids.length - 1; i++) {
      const sourcePiece = mapSceneIdToPieceId(ids[i]);
      const targetPiece = mapSceneIdToPieceId(ids[i + 1]);
      if (!sourcePiece || !targetPiece) continue;
      createAssociationIfMissing(sourcePiece, targetPiece, 'follows', `order:${order.name}`, 1.0, {
        order_name: order.name,
        order_description: order.description || '',
      });
    }
  }

  const extrapolated = db.prepare(`
    SELECT id, provenance_meta
    FROM scenes
    WHERE provenance = 'EXTRAPOLATED' AND provenance_meta IS NOT NULL
  `).all() as { id: number; provenance_meta: string }[];

  for (const scene of extrapolated) {
    const meta = safeJsonParse<Record<string, any>>(scene.provenance_meta, {});
    const currentPiece = mapSceneIdToPieceId(scene.id);
    if (!currentPiece) continue;
    const followsSceneId = Number(meta.follows_scene_id);
    const precedesSceneId = Number(meta.precedes_scene_id);
    const rationale = String(meta.rationale || meta.bridges || '').trim();

    if (Number.isFinite(followsSceneId)) {
      const sourcePiece = mapSceneIdToPieceId(followsSceneId);
      if (sourcePiece) {
        createAssociationIfMissing(sourcePiece, currentPiece, 'follows', 'extrapolated-bridge', 1.0, {
          rationale,
          source: 'provenance_meta',
        });
      }
    }
    if (Number.isFinite(precedesSceneId)) {
      const targetPiece = mapSceneIdToPieceId(precedesSceneId);
      if (targetPiece) {
        createAssociationIfMissing(currentPiece, targetPiece, 'follows', 'extrapolated-bridge', 1.0, {
          rationale,
          source: 'provenance_meta',
        });
      }
    }
  }
}

function main() {
  const tx = db.transaction(() => {
    migratePieces();
    migrateAssociations();
  });
  tx();

  const pieceCount = (db.prepare('SELECT COUNT(*) AS c FROM pieces').get() as any).c;
  const assocCount = (db.prepare('SELECT COUNT(*) AS c FROM associations').get() as any).c;
  console.log(`Heap migration complete. pieces=${pieceCount} associations=${assocCount}`);
}

main();
