import path from 'path';
import { DbService } from './services/db.service';
import { createApp } from './app';

const PORT = 7771;
const CONTENT_ROOT = path.resolve(import.meta.dirname, '../../opus');

const dbService = new DbService();
const app = createApp(dbService.db, CONTENT_ROOT);

app.post('/api/backup', async (_req, res) => {
  try {
    const dest = await dbService.backup();
    res.json({ ok: true, file: path.basename(dest) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups', (_req, res) => {
  res.json(dbService.listBackups());
});

app.listen(PORT, () => {
  console.log(`Hassan Editor server on http://localhost:${PORT}`);
  console.log(`Content root: ${CONTENT_ROOT}`);
});

function shutdown() {
  console.log('Shutting down — closing database...');
  dbService.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
