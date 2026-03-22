/**
 * THE GULPER
 * Drop anything. It gets sorted, parsed, stored, and related.
 * A large woodchipper for files.
 */
import { GulpResult } from '../entities';

type ThoughtKeyEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>;

export function shouldSubmitThoughtOnKeydown(event: ThoughtKeyEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey && (event.metaKey || event.ctrlKey);
}

export function buildGulperErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim().length > 0) return error;
  }
  return `request failed (${status})`;
}

export class Gulper {
  private el: HTMLElement;
  private dropZone: HTMLElement;
  private logEl: HTMLElement;
  private thoughtArea: HTMLTextAreaElement;
  private results: GulpResult[] = [];

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'gulper';

    // Header
    const header = document.createElement('div');
    header.className = 'gulper-header';
    header.innerHTML = `
      <div class="gulper-title">THE GULPER</div>
      <div class="gulper-subtitle">drop anything. it gets sorted.</div>
    `;
    this.el.appendChild(header);

    // Drop zone
    this.dropZone = document.createElement('div');
    this.dropZone.className = 'gulper-drop';
    this.dropZone.innerHTML = `
      <div class="gulper-drop-icon">⌾</div>
      <div class="gulper-drop-text">drop files here</div>
      <div class="gulper-drop-hint">.txt .md .rtf .pdf .doc .docx .json .csv — anything with words</div>
    `;
    this.el.appendChild(this.dropZone);

    // Also allow click to select
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      if (fileInput.files) this.processFiles(fileInput.files);
    });
    this.el.appendChild(fileInput);
    this.dropZone.addEventListener('click', () => fileInput.click());

    // Thought input
    const thoughtSection = document.createElement('div');
    thoughtSection.className = 'gulper-thought';

    const thoughtLabel = document.createElement('div');
    thoughtLabel.className = 'gulper-thought-label';
    thoughtLabel.textContent = 'or write something';

    this.thoughtArea = document.createElement('textarea');
    this.thoughtArea.className = 'gulper-thought-input';
    this.thoughtArea.placeholder = 'a thought, a quote, a scene fragment...';
    this.thoughtArea.rows = 6;

    const thoughtActions = document.createElement('div');
    thoughtActions.className = 'gulper-thought-actions';

    const classSelect = document.createElement('select');
    classSelect.className = 'gulper-thought-classify';
    for (const c of ['thought', 'quote', 'scene', 'freewrite', 'character', 'world-building', 'plot', 'research']) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      classSelect.appendChild(opt);
    }

    const gulpBtn = document.createElement('button');
    gulpBtn.className = 'gulper-thought-btn';
    gulpBtn.textContent = '⌾ gulp it';
    gulpBtn.addEventListener('click', () => {
      const text = this.thoughtArea.value.trim();
      if (!text) return;
      this.gulpThought(text, classSelect.value);
    });

    // Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) to submit
    this.thoughtArea.addEventListener('keydown', (e) => {
      if (shouldSubmitThoughtOnKeydown(e)) {
        e.preventDefault();
        gulpBtn.click();
      }
    });

    thoughtActions.appendChild(classSelect);
    thoughtActions.appendChild(gulpBtn);
    thoughtSection.appendChild(thoughtLabel);
    thoughtSection.appendChild(this.thoughtArea);
    thoughtSection.appendChild(thoughtActions);
    this.el.appendChild(thoughtSection);

    // Log
    this.logEl = document.createElement('div');
    this.logEl.className = 'gulper-log';
    this.el.appendChild(this.logEl);

    // Wire up drag/drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('gulper-drop-active');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('gulper-drop-active');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('gulper-drop-active');
      if (e.dataTransfer?.files) this.processFiles(e.dataTransfer.files);
    });

    container.appendChild(this.el);
  }

  show() {
    this.el.classList.add('active');
  }

  hide() {
    this.el.classList.remove('active');
  }

  get isActive(): boolean {
    return this.el.classList.contains('active');
  }

  private async gulpThought(text: string, classification: string) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `thought-${timestamp}.md`;

    this.log('gulping', `${classification} · ${words}w`);

    try {
      const res = await fetch('/api/gulp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          content: text,
          file_type: 'md',
          file_size: new Blob([text]).size,
          classification,
          word_count: words,
          provenance: 'GOLD',
        }),
      });
      const data = await this.readJsonSafe(res);
      if (!res.ok) throw new Error(buildGulperErrorMessage(res.status, data));

      const result: GulpResult = {
        filename,
        type: classification,
        words,
        stored_as: data.stored_as || 'gulped',
        related_to: [],
      };
      this.results.push(result);
      this.log('stored', `${classification} → ${words}w · GOLD · ${data.stored_as || 'gulped'}`);
      this.thoughtArea.value = '';
      this.renderSummary();
    } catch (err) {
      this.logError('failed to store thought', this.formatError(err));
    }
  }

  private async processFiles(files: FileList) {
    this.log('gulping', `${files.length} file${files.length > 1 ? 's' : ''} entering the woodchipper...`);

    for (const file of Array.from(files)) {
      await this.gulp(file);
    }

    this.log('done', `${this.results.length} files processed. all stored.`);
    this.renderSummary();
  }

  private async gulp(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const textTypes = ['txt', 'md', 'markdown', 'rtf', 'json', 'csv', 'tsv', 'xml', 'html', 'htm'];

    this.log('chewing', file.name);

    // Read file content
    let content = '';
    let fileType = 'unknown';

    if (textTypes.includes(ext)) {
      content = await file.text();
      fileType = ext;
    } else if (ext === 'pdf') {
      // PDF — store as binary reference, extract what we can
      content = `[PDF: ${file.name}, ${this.formatSize(file.size)}]`;
      fileType = 'pdf';
    } else if (ext === 'doc' || ext === 'docx') {
      // Try to read as text; won't be perfect for binary .doc
      try {
        content = await file.text();
        // docx is a zip — the text() will be garbage, but we store the reference
        if (content.includes('PK')) {
          content = `[DOCX: ${file.name}, ${this.formatSize(file.size)} — needs server-side extraction]`;
        }
      } catch {
        content = `[DOC: ${file.name}, ${this.formatSize(file.size)}]`;
      }
      fileType = ext;
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      content = `[IMAGE: ${file.name}, ${this.formatSize(file.size)}]`;
      fileType = 'image';
    } else {
      // Try text anyway
      try {
        content = await file.text();
        fileType = 'text';
      } catch {
        content = `[BINARY: ${file.name}, ${this.formatSize(file.size)}]`;
        fileType = 'binary';
      }
    }

    // Clean up content for text types
    if (textTypes.includes(ext) || fileType === 'text') {
      // Strip common cruft
      content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // For JSON, try to extract readable text
      if (ext === 'json') {
        try {
          const parsed = JSON.parse(content);
          content = `[JSON structure: ${Object.keys(parsed).join(', ')}]\n\n${JSON.stringify(parsed, null, 2)}`;
        } catch { /* keep raw */ }
      }

      // For CSV, note the structure
      if (ext === 'csv' || ext === 'tsv') {
        const lines = content.split('\n');
        const header = lines[0] || '';
        content = `[${ext.toUpperCase()}: ${lines.length} rows, columns: ${header}]\n\n${content}`;
      }
    }

    // Count words
    const words = content.trim().split(/\s+/).filter(Boolean).length;

    // Classify and find relations
    const classification = this.classify(file.name, content);
    const relations = await this.findRelations(file.name, content);

    // Store via API
    try {
      const res = await fetch('/api/gulp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content,
          file_type: fileType,
          file_size: file.size,
          classification,
          word_count: words,
        }),
      });
      const data = await this.readJsonSafe(res);
      if (!res.ok) throw new Error(buildGulperErrorMessage(res.status, data));

      const result: GulpResult = {
        filename: file.name,
        type: classification,
        words,
        stored_as: data.stored_as || 'raw',
        related_to: relations,
      };
      this.results.push(result);
      this.log('stored', `${file.name} → ${classification} · ${words.toLocaleString()}w${relations.length ? ' · related to: ' + relations.join(', ') : ''}`);
    } catch (err) {
      this.logError(`failed to store ${file.name}`, this.formatError(err));
    }
  }

  private classify(filename: string, content: string): string {
    const lower = filename.toLowerCase();
    const lowerContent = content.toLowerCase().slice(0, 2000);

    // Feedback/annotations
    if (lower.includes('nora') || lower.includes('annotated') || lower.includes('feedback')) return 'feedback';

    // World-building
    if (lower.includes('world') || lower.includes('concept') || lower.includes('lore')) return 'world-building';
    if (lowerContent.includes('world-build') || lowerContent.includes('worldbuild')) return 'world-building';

    // Plot/structure
    if (lower.includes('plot') || lower.includes('structure') || lower.includes('outline') || lower.includes('brief')) return 'plot';
    if (lowerContent.includes('plotline') || lowerContent.includes('scene rubric')) return 'plot';

    // Character sheets
    if (lower.includes('character') || lower.includes('cast')) return 'character';
    if (lowerContent.includes('motivation:') && lowerContent.includes('description:')) return 'character';

    // Freewrite / journal
    if (lower.includes('freewrite') || lower.includes('journal') || lower.includes('diary')) return 'freewrite';

    // Research
    if (lower.includes('research') || lower.includes('reference') || lower.includes('notes')) return 'research';

    // Prose / manuscript
    if (lowerContent.includes('chapter') || lowerContent.includes('"') || lowerContent.includes('said')) return 'prose';

    return 'misc';
  }

  private async findRelations(filename: string, content: string): Promise<string[]> {
    // Quick keyword match against existing raw files
    const relations: string[] = [];

    try {
      const res = await fetch('/api/raw');
      const rawFiles = await res.json() as { filename: string }[];

      // Check if this file's content mentions any existing file subjects
      const keywords = this.extractKeywords(content);
      for (const raw of rawFiles) {
        const rawName = raw.filename.replace(/\.(txt|md)$/, '').toLowerCase();
        if (keywords.some(k => rawName.includes(k) || k.includes(rawName))) {
          relations.push(raw.filename);
          if (relations.length >= 5) break;
        }
      }
    } catch { /* no relations */ }

    return relations;
  }

  private extractKeywords(content: string): string[] {
    // Pull proper nouns and significant words
    const words = content.slice(0, 5000).match(/[A-Z][a-z]{3,}/g) || [];
    const unique = [...new Set(words.map(w => w.toLowerCase()))];
    // Filter common words
    const stopwords = new Set(['this', 'that', 'with', 'from', 'they', 'their', 'have', 'been', 'were', 'would', 'could', 'should', 'about', 'after', 'before', 'there', 'where', 'when', 'what', 'which', 'these', 'those']);
    return unique.filter(w => !stopwords.has(w)).slice(0, 20);
  }

  private log(type: string, message: string) {
    const line = document.createElement('div');
    line.className = `gulper-log-line gulper-log-${type}`;
    line.innerHTML = `<span class="gulper-log-type">${type}</span> ${message}`;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private logError(summary: string, reason: string) {
    const line = document.createElement('div');
    line.className = 'gulper-log-line gulper-log-error';
    line.innerHTML =
      `<span class="gulper-log-type">error</span> ${summary}` +
      `<span class="gulper-log-reason">${reason}</span>`;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private renderSummary() {
    if (this.results.length === 0) return;

    const summary = document.createElement('div');
    summary.className = 'gulper-summary';

    const byType: Record<string, GulpResult[]> = {};
    for (const r of this.results) {
      if (!byType[r.type]) byType[r.type] = [];
      byType[r.type].push(r);
    }

    let html = '<div class="gulper-summary-title">gulped</div>';
    for (const [type, items] of Object.entries(byType)) {
      const totalWords = items.reduce((s, i) => s + i.words, 0);
      html += `<div class="gulper-summary-row"><span class="gulper-summary-type">${type}</span> <span class="gulper-summary-count">${items.length} files · ${totalWords.toLocaleString()}w</span></div>`;
    }

    summary.innerHTML = html;
    this.logEl.appendChild(summary);
    this.logEl.scrollTop = this.logEl.scrollHeight;

    // Reset for next batch
    this.results = [];
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  private async readJsonSafe(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  private formatError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return 'unknown error';
  }
}
