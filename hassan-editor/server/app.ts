import express from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import { createScenesRouter } from './routes/scenes';
import { createGulperRouter } from './routes/gulper';
import { createRevisionsRouter } from './routes/revisions';
import { createAnalysisRouter } from './routes/analysis';
import { createContentRouter } from './routes/content';
import { createHeapRouter } from './routes/heap';

export { countWords } from './utils';

export function createApp(db: Database.Database, contentRoot: string) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', createScenesRouter(db, contentRoot));
  app.use('/api', createGulperRouter(db));
  app.use('/api', createRevisionsRouter(db));
  app.use('/api', createAnalysisRouter(db));
  app.use('/api/heap', createHeapRouter(db));
  app.use('/', createContentRouter(db, contentRoot));

  return app;
}
