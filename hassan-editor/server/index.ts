import path from 'path';
import db, { DB_PATH } from './db.js';
import { createApp } from './app.js';

const PORT = 7771;
const CONTENT_ROOT = path.resolve(import.meta.dirname, '../../opus');

const app = createApp(db, CONTENT_ROOT);

app.listen(PORT, () => {
  console.log(`Hassan Editor server on http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Content root: ${CONTENT_ROOT}`);
});
