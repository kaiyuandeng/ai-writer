import type Database from 'better-sqlite3';
import { createDb } from '../db';
import fs from 'fs';
import path from 'path';

const MAX_BACKUPS = 20;
const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export class DbService {
  readonly db: Database.Database;
  private timer: ReturnType<typeof setInterval> | null = null;
  private backupDir: string;

  constructor(dbPath?: string, opts?: { backupDir?: string; autoBackup?: boolean }) {
    this.db = createDb(dbPath);
    this.backupDir = opts?.backupDir ?? path.resolve(path.dirname(dbPath || path.resolve(import.meta.dirname, '../../hassan.db')), 'backups');

    if (opts?.autoBackup !== false && dbPath !== ':memory:') {
      fs.mkdirSync(this.backupDir, { recursive: true });
      this.scheduleBackups();
    }
  }

  async backup(): Promise<string> {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const dest = path.join(this.backupDir, `hassan-${timestamp()}.db`);
    await this.db.backup(dest);
    this.prune();
    return dest;
  }

  listBackups(): { filename: string; size: number; created: string }[] {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.db'))
      .sort()
      .reverse()
      .map(f => {
        const stats = fs.statSync(path.join(this.backupDir, f));
        return { filename: f, size: stats.size, created: stats.mtime.toISOString() };
      });
  }

  private prune() {
    if (!fs.existsSync(this.backupDir)) return;
    const files = fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.db'))
      .sort()
      .reverse();

    for (const file of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(this.backupDir, file));
    }
  }

  private scheduleBackups() {
    this.timer = setInterval(() => {
      this.backup().catch(err => {
        console.error('Scheduled backup failed:', err);
      });
    }, BACKUP_INTERVAL_MS);

    // Initial backup on boot
    this.backup().catch(err => {
      console.error('Initial backup failed:', err);
    });
  }

  close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.db.close();
  }
}
