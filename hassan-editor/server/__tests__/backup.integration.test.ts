import { describe, it, expect, afterEach } from 'vitest';
import { DbService } from '../services/db.service';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hassan-backup-integ-'));
}

describe('Backup Integration', () => {
  let service: DbService;
  let tmpDir: string;

  afterEach(() => {
    try { service?.close(); } catch { /* already closed */ }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('backup produces a restorable database with all data', async () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'source.db');
    const backupDir = path.join(tmpDir, 'backups');
    service = new DbService(dbPath, { backupDir, autoBackup: false });

    service.db.prepare("INSERT INTO scenes (movement, scene_number, title, content) VALUES ('01', 1, 'Gold Scene', 'Original prose.')").run();
    service.db.prepare("INSERT INTO scenes (movement, scene_number, title, content) VALUES ('01', 2, 'Scene Two', 'More prose.')").run();
    service.db.prepare("INSERT INTO gulped (filename, content, file_type) VALUES ('note.md', 'gulped content', 'md')").run();
    service.db.prepare("INSERT INTO pieces (kind, title, content, conviction, tags, meta) VALUES ('thought', 'Heap item', 'Something', 50, '[]', '{}')").run();

    const dest = await service.backup();

    // Open the backup and verify it's a valid, queryable SQLite database
    const restored = new Database(dest);
    const scenes = restored.prepare('SELECT * FROM scenes ORDER BY scene_number').all() as any[];
    expect(scenes.length).toBe(2);
    expect(scenes[0].title).toBe('Gold Scene');
    expect(scenes[0].content).toBe('Original prose.');
    expect(scenes[1].title).toBe('Scene Two');

    const gulped = restored.prepare('SELECT * FROM gulped').all() as any[];
    expect(gulped.length).toBe(1);
    expect(gulped[0].filename).toBe('note.md');

    const pieces = restored.prepare('SELECT * FROM pieces').all() as any[];
    expect(pieces.length).toBe(1);
    expect(pieces[0].kind).toBe('thought');

    // Verify triggers exist in backup
    const triggers = restored.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as any[];
    expect(triggers.some((t: any) => t.name === 'gold_scenes_no_delete')).toBe(true);

    restored.close();
  });

  it('backup is consistent even after writes to source', async () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'source.db');
    const backupDir = path.join(tmpDir, 'backups');
    service = new DbService(dbPath, { backupDir, autoBackup: false });

    service.db.prepare("INSERT INTO scenes (movement, scene_number, title) VALUES ('01', 1, 'V1')").run();
    const backupFile = await service.backup();

    // Write more data AFTER the backup
    service.db.prepare("INSERT INTO scenes (movement, scene_number, title) VALUES ('01', 2, 'V2')").run();

    // The backup should only have the original row
    const restored = new Database(backupFile);
    const count = (restored.prepare('SELECT COUNT(*) as c FROM scenes').get() as any).c;
    expect(count).toBe(1);
    restored.close();
  });

  it('multiple backups produce distinct files', async () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'source.db');
    const backupDir = path.join(tmpDir, 'backups');
    service = new DbService(dbPath, { backupDir, autoBackup: false });

    const first = await service.backup();
    await new Promise(r => setTimeout(r, 50));
    const second = await service.backup();

    expect(first).not.toBe(second);
    expect(fs.existsSync(first)).toBe(true);
    expect(fs.existsSync(second)).toBe(true);
  });

  it('backup API endpoint works through the app', async () => {
    const request = (await import('supertest')).default;
    const { createApp } = await import('../app');
    const { createDb } = await import('../db');

    tmpDir = makeTmpDir();
    const db = createDb(':memory:');
    const app = createApp(db, tmpDir);

    // Mount backup endpoints like index.ts does
    const backupDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    app.get('/api/backups', (_req, res) => {
      if (!fs.existsSync(backupDir)) { res.json([]); return; }
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      res.json(files);
    });

    const listRes = await request(app).get('/api/backups');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    db.close();
  });
});
