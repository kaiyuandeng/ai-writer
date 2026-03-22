import { describe, it, expect, afterEach } from 'vitest';
import { DbService } from '../services/db.service';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hassan-dbservice-'));
}

describe('DbService', () => {
  let service: DbService;
  let tmpDir: string;

  afterEach(() => {
    try { service?.close(); } catch { /* already closed */ }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates a working database', () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    service = new DbService(dbPath, { backupDir: path.join(tmpDir, 'backups'), autoBackup: false });

    service.db.prepare("INSERT INTO scenes (movement, scene_number, title) VALUES ('01', 1, 'Test')").run();
    const row = service.db.prepare('SELECT title FROM scenes WHERE id = 1').get() as any;
    expect(row.title).toBe('Test');
  });

  it('backup creates a valid .db file', async () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    const backupDir = path.join(tmpDir, 'backups');
    service = new DbService(dbPath, { backupDir, autoBackup: false });

    service.db.prepare("INSERT INTO scenes (movement, scene_number, title) VALUES ('01', 1, 'Before Backup')").run();

    const dest = await service.backup();
    expect(fs.existsSync(dest)).toBe(true);
    expect(dest).toMatch(/hassan-.*\.db$/);

    const stats = fs.statSync(dest);
    expect(stats.size).toBeGreaterThan(0);
  });

  it('listBackups returns sorted list newest first', async () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    const backupDir = path.join(tmpDir, 'backups');
    service = new DbService(dbPath, { backupDir, autoBackup: false });

    await service.backup();
    await new Promise(r => setTimeout(r, 50));
    await service.backup();

    const list = service.listBackups();
    expect(list.length).toBe(2);
    expect(list[0].filename > list[1].filename).toBe(true);
    expect(list[0].size).toBeGreaterThan(0);
    expect(list[0].created).toBeTruthy();
  });

  it('prune keeps only MAX_BACKUPS (20) files', async () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    const backupDir = path.join(tmpDir, 'backups');
    service = new DbService(dbPath, { backupDir, autoBackup: false });

    // Create 25 fake backup files to seed, then trigger a real backup + prune
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 0; i < 25; i++) {
      const name = `hassan-2026-01-${String(i + 1).padStart(2, '0')}T00-00-00-000Z.db`;
      fs.writeFileSync(path.join(backupDir, name), 'fake');
    }

    await service.backup(); // creates #26, then prunes

    const remaining = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
    expect(remaining.length).toBe(20);
  });

  it('listBackups returns empty for nonexistent backup dir', () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    service = new DbService(dbPath, { backupDir: path.join(tmpDir, 'no-such-dir'), autoBackup: false });

    const list = service.listBackups();
    expect(list).toEqual([]);
  });

  it('close stops the timer and closes the database', () => {
    tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    service = new DbService(dbPath, { backupDir: path.join(tmpDir, 'backups'), autoBackup: false });

    service.close();

    expect(() => {
      service.db.prepare('SELECT 1').get();
    }).toThrow();
  });
});
