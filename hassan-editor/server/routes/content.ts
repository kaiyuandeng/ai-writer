import express, { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function createContentRouter(db: Database.Database, contentRoot: string) {
  const router = express.Router();

  // ==========================================
  // README (rendered as HTML)
  // ==========================================

  router.get('/api/readme', (_req: Request, res: Response) => {
    const readmePath = path.resolve(fileURLToPath(import.meta.url), '../../../README.md');
    if (!fs.existsSync(readmePath)) {
      res.status(404).json({ error: 'README.md not found' });
      return;
    }
    const md = fs.readFileSync(readmePath, 'utf-8');

    const escaped = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    const outputLines: string[] = [];

    for (const line of escaped.split('\n')) {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          outputLines.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
        }
        continue;
      }
      if (inCodeBlock) { codeBuffer.push(line); continue; }

      let out = line;
      out = out.replace(/^### (.+)$/, '<h3>$1</h3>');
      out = out.replace(/^## (.+)$/, '<h2>$1</h2>');
      out = out.replace(/^# (.+)$/, '<h1>$1</h1>');
      out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
      out = out.replace(/^\| (.+) \|$/g, (match) => {
        const cells = match.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`);
        return `<tr>${cells.join('')}</tr>`;
      });
      out = out.replace(/^- (.+)$/, '<li>$1</li>');
      out = out.replace(/^(\d+)\. (.+)$/, '<li><strong>$1.</strong> $2</li>');
      if (out === line && out.trim() === '') out = '<br>';
      outputLines.push(out);
    }

    const html = outputLines.join('\n')
      .replace(/(<tr>.*<\/tr>\n?)+/g, (block) => `<table>${block}</table>`)
      .replace(/<br>\n(<br>\n?)+/g, '<br>');

    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hassan Editor — README</title>
<style>
  :root {
    --cabal-purple: #895cdb;
    --cabal-sage:   #bad39d;
    --cabal-blue:   #2f9bfa;
    --cabal-orange: #dc6a21;
    --bg:           #0c0c0c;
    --text:         #d4d0c8;
    --text-muted:   #5a5750;
  }
  body {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    max-width: 640px; margin: 60px auto; padding: 0 24px;
    line-height: 1.7; color: var(--text); background: var(--bg);
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }
  h1 {
    font-size: 18px; font-weight: 400; letter-spacing: 0.02em;
    color: var(--text); margin-bottom: 6px;
    padding-bottom: 10px; border-bottom: 1px solid rgba(90,87,80,0.3);
  }
  h2 {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--cabal-purple);
    margin-top: 36px; margin-bottom: 12px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  h3 {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--text-muted);
    margin-top: 24px; margin-bottom: 8px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  p, li { margin: 4px 0; }
  li { padding-left: 4px; }
  li::marker { color: var(--text-muted); }
  strong { color: #f0ece4; font-weight: 500; }
  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.88em; color: var(--cabal-sage);
    background: rgba(137,92,219,0.08); padding: 1px 5px; border-radius: 2px;
  }
  pre {
    background: rgba(137,92,219,0.06); border-left: 2px solid var(--cabal-purple);
    padding: 12px 16px; margin: 12px 0; border-radius: 0;
    overflow-x: auto;
  }
  pre code {
    background: none; padding: 0; font-size: 12px; color: var(--text);
  }
  a { color: var(--cabal-blue); text-decoration: none; }
  a:hover { text-decoration: underline; }
  table {
    width: 100%; border-collapse: collapse; margin: 12px 0;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px;
  }
  td {
    padding: 5px 10px; border-bottom: 1px solid rgba(90,87,80,0.15);
    color: var(--text);
  }
  tr:first-child td { color: var(--text-muted); font-weight: 600; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.08em; }
  ::selection { background: rgba(137,92,219,0.2); }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 2px; }
</style>
</head><body>${html}</body></html>`);
  });

  // ==========================================
  // COMPILED STORIES — PDF reader + index
  // ==========================================

  const compiledDir = path.resolve(fileURLToPath(import.meta.url), '../../../compiled');

  router.get('/compiled', (_req: Request, res: Response) => {
    if (!fs.existsSync(compiledDir)) {
      res.status(404).json({ error: 'compiled/ directory not found' });
      return;
    }
    const files = fs.readdirSync(compiledDir).filter(f => f.endsWith('.pdf')).sort();
    const items = files.map(f => {
      const name = f.replace('.pdf', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const stats = fs.statSync(path.join(compiledDir, f));
      const kb = Math.round(stats.size / 1024);
      return `<a href="/compiled/${f}" class="card">
        <span class="title">${name}</span>
        <span class="meta">${kb} KB · PDF</span>
      </a>`;
    });
    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hassan — Compiled Stories</title>
<style>
  :root {
    --cabal-purple: #895cdb; --cabal-sage: #bad39d; --cabal-blue: #2f9bfa;
    --bg: #0c0c0c; --text: #d4d0c8; --text-muted: #5a5750;
  }
  body {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    max-width: 560px; margin: 80px auto; padding: 0 24px;
    color: var(--text); background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }
  h1 {
    font-size: 16px; font-weight: 400; letter-spacing: 0.02em;
    margin-bottom: 6px; padding-bottom: 10px;
    border-bottom: 1px solid rgba(90,87,80,0.3);
  }
  .sub { font-size: 10px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.1em; font-family: 'SF Mono', 'Fira Code', monospace;
    margin-bottom: 32px; }
  .card {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; margin: 8px 0; border-radius: 4px;
    background: rgba(137,92,219,0.06); border: 1px solid rgba(137,92,219,0.12);
    text-decoration: none; transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--cabal-purple); }
  .title { color: var(--text); font-size: 13px; }
  .meta { color: var(--text-muted); font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace; }
  .empty { color: var(--text-muted); font-size: 12px; font-style: italic; }
  ::selection { background: rgba(137,92,219,0.2); }
</style>
</head><body>
<h1>Compiled Stories</h1>
<div class="sub">PROVENANCE: EXTRAPOLATED · HASSAN UNIVERSE</div>
${files.length ? items.join('\n') : '<p class="empty">No compiled stories yet.</p>'}
</body></html>`);
  });

  router.get('/compiled/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith('.pdf')) {
      res.status(400).json({ error: 'Only PDF files are served' });
      return;
    }
    const filePath = path.join(compiledDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.type('application/pdf').sendFile(filePath);
  });

  // ==========================================
  // STATS
  // ==========================================

  router.get('/api/stats', (_req: Request, res: Response) => {
    const totalScenes = (db.prepare('SELECT COUNT(*) as c FROM scenes').get() as any).c;
    const totalWords = (db.prepare('SELECT COALESCE(SUM(word_count), 0) as c FROM scenes').get() as any).c;
    const totalRawFiles = (db.prepare('SELECT COUNT(*) as c FROM raw_files').get() as any).c;
    const byStoryArc = db.prepare("SELECT COALESCE(story_arc, timeline, 'B') as story_arc, COUNT(*) as scenes, SUM(word_count) as words FROM scenes GROUP BY COALESCE(story_arc, timeline, 'B')").all();
    const byMovement = db.prepare('SELECT movement, COUNT(*) as scenes, SUM(word_count) as words FROM scenes GROUP BY movement ORDER BY movement').all();
    const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM scenes GROUP BY status').all();
    res.json({ totalScenes, totalWords, totalRawFiles, byStoryArc, byMovement, byStatus });
  });

  return router;
}
