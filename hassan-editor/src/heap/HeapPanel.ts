type Piece = {
  id: number;
  kind: string;
  title: string;
  content: string;
  conviction: number;
  tags: string;
  word_count: number;
  provenance: string;
};

type Association = {
  id: number;
  source_id: number;
  target_id: number;
  kind: string;
  label: string;
  weight: number;
};

export class HeapPanel {
  private host: HTMLElement;
  private el: HTMLElement;
  private listEl: HTMLElement;
  private detailEl: HTMLElement;
  private filterInput: HTMLInputElement;
  private kindSelect: HTMLSelectElement;
  private createKindInput: HTMLInputElement;
  private createTitleInput: HTMLInputElement;
  private createTagsInput: HTMLInputElement;
  private createConvictionInput: HTMLInputElement;
  private createContentInput: HTMLTextAreaElement;
  private isVisible = false;
  private pieces: Piece[] = [];
  private activePieceId: number | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'heap-panel hidden';

    const header = document.createElement('div');
    header.className = 'heap-header';
    header.innerHTML = `
      <div class="heap-title-wrap">
        <div class="heap-title">Heap</div>
        <div class="heap-subtitle">Piece + Association model</div>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'heap-body';

    const left = document.createElement('div');
    left.className = 'heap-left';
    left.innerHTML = `
      <div class="heap-controls">
        <input class="heap-input" data-role="q" placeholder="Search title/content..." />
        <select class="heap-select" data-role="kind">
          <option value="">All kinds</option>
          <option value="scene">scene</option>
          <option value="raw">raw</option>
          <option value="gulped">gulped</option>
          <option value="fragment">fragment</option>
          <option value="note">note</option>
        </select>
        <button class="heap-btn" data-role="refresh">Refresh</button>
      </div>
      <div class="heap-list" data-role="list"></div>
    `;

    const right = document.createElement('div');
    right.className = 'heap-right';
    right.innerHTML = `
      <div class="heap-detail" data-role="detail">
        <div class="heap-placeholder">Select a piece from the heap.</div>
      </div>
      <div class="heap-create">
        <div class="heap-section-title">New Piece</div>
        <input class="heap-input" data-role="create-kind" placeholder="kind (e.g. scene)" />
        <input class="heap-input" data-role="create-title" placeholder="title" />
        <input class="heap-input" data-role="create-tags" placeholder="tags comma-separated" />
        <input class="heap-input" data-role="create-conviction" type="number" min="0" max="100" value="0" />
        <textarea class="heap-textarea" data-role="create-content" placeholder="content"></textarea>
        <button class="heap-btn heap-btn-primary" data-role="create-submit">Create Piece</button>
      </div>
    `;

    body.appendChild(left);
    body.appendChild(right);
    this.el.appendChild(header);
    this.el.appendChild(body);
    this.host.appendChild(this.el);

    this.listEl = left.querySelector('[data-role="list"]') as HTMLElement;
    this.detailEl = right.querySelector('[data-role="detail"]') as HTMLElement;
    this.filterInput = left.querySelector('[data-role="q"]') as HTMLInputElement;
    this.kindSelect = left.querySelector('[data-role="kind"]') as HTMLSelectElement;

    this.createKindInput = right.querySelector('[data-role="create-kind"]') as HTMLInputElement;
    this.createTitleInput = right.querySelector('[data-role="create-title"]') as HTMLInputElement;
    this.createTagsInput = right.querySelector('[data-role="create-tags"]') as HTMLInputElement;
    this.createConvictionInput = right.querySelector('[data-role="create-conviction"]') as HTMLInputElement;
    this.createContentInput = right.querySelector('[data-role="create-content"]') as HTMLTextAreaElement;

    const refreshBtn = left.querySelector('[data-role="refresh"]') as HTMLButtonElement;
    refreshBtn.addEventListener('click', () => this.loadPieces());
    this.filterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.loadPieces();
    });
    this.kindSelect.addEventListener('change', () => this.loadPieces());

    const createBtn = right.querySelector('[data-role="create-submit"]') as HTMLButtonElement;
    createBtn.addEventListener('click', () => this.createPiece());
  }

  get active() {
    return this.isVisible;
  }

  show() {
    this.isVisible = true;
    this.el.classList.remove('hidden');
    this.loadPieces();
  }

  hide() {
    this.isVisible = false;
    this.el.classList.add('hidden');
  }

  private async loadPieces() {
    const q = this.filterInput.value.trim();
    const kind = this.kindSelect.value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);

    try {
      const res = await fetch(`/api/heap/pieces?${params.toString()}`);
      this.pieces = await res.json();
      this.renderList();
      if (this.activePieceId != null) {
        const stillExists = this.pieces.some((p) => p.id === this.activePieceId);
        if (stillExists) {
          await this.loadPieceDetail(this.activePieceId);
        } else {
          this.activePieceId = null;
          this.detailEl.innerHTML = '<div class="heap-placeholder">Select a piece from the heap.</div>';
        }
      }
    } catch (error) {
      this.listEl.innerHTML = `<div class="heap-error">Failed to load heap pieces.</div>`;
    }
  }

  private renderList() {
    this.listEl.innerHTML = '';
    if (!this.pieces.length) {
      this.listEl.innerHTML = '<div class="heap-placeholder">No pieces match the current filter.</div>';
      return;
    }
    for (const piece of this.pieces) {
      const row = document.createElement('button');
      row.className = `heap-piece-row ${piece.id === this.activePieceId ? 'active' : ''}`;
      row.innerHTML = `
        <span class="heap-piece-kind">${piece.kind}</span>
        <span class="heap-piece-title">${piece.title || '(untitled)'}</span>
        <span class="heap-piece-meta">c${piece.conviction} - ${piece.word_count}w</span>
      `;
      row.addEventListener('click', () => this.loadPieceDetail(piece.id));
      this.listEl.appendChild(row);
    }
  }

  private async loadPieceDetail(id: number) {
    try {
      const res = await fetch(`/api/heap/pieces/${id}`);
      const piece = await res.json();
      this.activePieceId = id;
      this.renderList();
      this.renderDetail(piece);
    } catch {
      this.detailEl.innerHTML = '<div class="heap-error">Failed to load piece detail.</div>';
    }
  }

  private renderDetail(piece: Piece & { outgoing: Association[]; incoming: Association[] }) {
    const outgoing = piece.outgoing || [];
    const incoming = piece.incoming || [];
    const all = [...outgoing, ...incoming];
    const tags = this.parseTags(piece.tags).join(', ');
    this.detailEl.innerHTML = `
      <div class="heap-section-title">Piece #${piece.id}</div>
      <div class="heap-grid">
        <label>Kind</label><input class="heap-input" data-role="edit-kind" value="${this.escape(piece.kind)}" />
        <label>Title</label><input class="heap-input" data-role="edit-title" value="${this.escape(piece.title || '')}" />
        <label>Conviction</label><input class="heap-input" data-role="edit-conviction" type="number" min="0" max="100" value="${piece.conviction}" />
        <label>Tags</label><input class="heap-input" data-role="edit-tags" value="${this.escape(tags)}" />
      </div>
      <textarea class="heap-textarea heap-textarea-lg" data-role="edit-content">${this.escape(piece.content || '')}</textarea>
      <div class="heap-actions">
        <button class="heap-btn heap-btn-primary" data-role="save-piece">Save Piece</button>
      </div>
      <div class="heap-section-title">Associations (${all.length})</div>
      <div class="heap-associations">${all.map((a) => `
        <div class="heap-assoc-row">
          <span class="heap-assoc-kind">${a.kind}</span>
          <span class="heap-assoc-text">${a.source_id} -> ${a.target_id}${a.label ? ` (${this.escape(a.label)})` : ''}</span>
        </div>
      `).join('')}</div>
      <div class="heap-section-title">Add Association</div>
      <div class="heap-grid">
        <label>Target Piece ID</label><input class="heap-input" data-role="assoc-target" type="number" min="1" />
        <label>Kind</label><input class="heap-input" data-role="assoc-kind" placeholder="e.g. follows" />
        <label>Label</label><input class="heap-input" data-role="assoc-label" placeholder="optional note" />
      </div>
      <div class="heap-actions">
        <button class="heap-btn" data-role="assoc-submit">Create Association</button>
      </div>
    `;

    const saveBtn = this.detailEl.querySelector('[data-role="save-piece"]') as HTMLButtonElement;
    saveBtn.addEventListener('click', async () => {
      const nextKind = (this.detailEl.querySelector('[data-role="edit-kind"]') as HTMLInputElement).value.trim();
      const nextTitle = (this.detailEl.querySelector('[data-role="edit-title"]') as HTMLInputElement).value;
      const nextConviction = Number((this.detailEl.querySelector('[data-role="edit-conviction"]') as HTMLInputElement).value);
      const nextTags = (this.detailEl.querySelector('[data-role="edit-tags"]') as HTMLInputElement).value;
      const nextContent = (this.detailEl.querySelector('[data-role="edit-content"]') as HTMLTextAreaElement).value;

      try {
        const res = await fetch(`/api/heap/pieces/${piece.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: nextKind,
            title: nextTitle,
            conviction: nextConviction,
            tags: nextTags.split(',').map((tag) => tag.trim()).filter(Boolean),
            content: nextContent,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Failed to save piece');
          return;
        }
        await this.loadPieces();
      } catch {
        alert('Failed to save piece');
      }
    });

    const assocBtn = this.detailEl.querySelector('[data-role="assoc-submit"]') as HTMLButtonElement;
    assocBtn.addEventListener('click', async () => {
      const target = Number((this.detailEl.querySelector('[data-role="assoc-target"]') as HTMLInputElement).value);
      const kind = (this.detailEl.querySelector('[data-role="assoc-kind"]') as HTMLInputElement).value.trim();
      const label = (this.detailEl.querySelector('[data-role="assoc-label"]') as HTMLInputElement).value;
      if (!target || !kind) {
        alert('Target piece id and kind are required.');
        return;
      }
      try {
        const res = await fetch('/api/heap/associations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_id: piece.id,
            target_id: target,
            kind,
            label,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Failed to create association');
          return;
        }
        await this.loadPieceDetail(piece.id);
      } catch {
        alert('Failed to create association');
      }
    });
  }

  private async createPiece() {
    const kind = this.createKindInput.value.trim();
    const title = this.createTitleInput.value.trim();
    const tags = this.createTagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean);
    const conviction = Number(this.createConvictionInput.value || '0');
    const content = this.createContentInput.value;
    if (!kind) {
      alert('kind is required');
      return;
    }
    try {
      const res = await fetch('/api/heap/pieces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, tags, conviction, content }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to create piece');
        return;
      }
      const created = await res.json();
      this.createTitleInput.value = '';
      this.createTagsInput.value = '';
      this.createContentInput.value = '';
      this.createConvictionInput.value = '0';
      await this.loadPieces();
      await this.loadPieceDetail(created.id);
    } catch {
      alert('Failed to create piece');
    }
  }

  private parseTags(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }

  private escape(value: string) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
