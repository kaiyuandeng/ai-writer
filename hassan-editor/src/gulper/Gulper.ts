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

    const gulpBtn = document.createElement('button');
    gulpBtn.className = 'gulper-thought-btn';
    gulpBtn.textContent = '⌾ gulp it';
    gulpBtn.addEventListener('click', () => {
      const text = this.thoughtArea.value.trim();
      if (!text) return;
      this.gulpThought(text);
    });

    // Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) to submit
    this.thoughtArea.addEventListener('keydown', (e) => {
      if (shouldSubmitThoughtOnKeydown(e)) {
        e.preventDefault();
        gulpBtn.click();
      }
    });

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

  private async gulpThought(text: string) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `thought-${timestamp}.md`;

    this.log('gulping', `${words}w`);

    try {
      const res = await fetch('/api/gulp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          content: text,
          file_type: 'md',
          file_size: new Blob([text]).size,
          word_count: words,
          provenance: 'GOLD',
        }),
      });
      const data = await this.readJsonSafe(res);
      if (!res.ok) throw new Error(buildGulperErrorMessage(res.status, data));

      const result: GulpResult = {
        filename,
        words,
        stored_as: data.stored_as || 'gulped',
        related_to: [],
      };
      this.results.push(result);
      this.log('stored', `${words}w · GOLD · ${data.stored_as || 'gulped'}`);
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
          word_count: words,
        }),
      });
      const data = await this.readJsonSafe(res);
      if (!res.ok) throw new Error(buildGulperErrorMessage(res.status, data));

      const result: GulpResult = {
        filename: file.name,
        words,
        stored_as: data.stored_as || 'raw',
        related_to: [],
      };
      this.results.push(result);
      this.log('stored', `${file.name} · ${words.toLocaleString()}w`);
    } catch (err) {
      this.logError(`failed to store ${file.name}`, this.formatError(err));
    }
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

    const totalWords = this.results.reduce((s, r) => s + r.words, 0);
    const summary = document.createElement('div');
    summary.className = 'gulper-summary';
    summary.innerHTML =
      `<div class="gulper-summary-title">gulped</div>` +
      `<div class="gulper-summary-row"><span class="gulper-summary-count">${this.results.length} items · ${totalWords.toLocaleString()}w</span></div>`;

    this.logEl.appendChild(summary);
    this.logEl.scrollTop = this.logEl.scrollHeight;
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
