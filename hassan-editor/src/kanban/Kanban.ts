import { SceneRef, STATUSES } from '../entities';

export type OnCardClick = (sceneId: number) => void;

const COLUMNS = STATUSES;

export class Kanban {
  private el: HTMLElement;
  private onCardClick: OnCardClick;
  private scenes: SceneRef[] = [];

  constructor(container: HTMLElement, onCardClick: OnCardClick) {
    this.onCardClick = onCardClick;

    this.el = document.createElement('div');
    this.el.className = 'kanban';
    container.appendChild(this.el);
  }

  show() {
    document.body.classList.add('kanban-mode');
    this.el.classList.add('active');
    this.load();
  }

  hide() {
    document.body.classList.remove('kanban-mode');
    this.el.classList.remove('active');
  }

  get isActive(): boolean {
    return this.el.classList.contains('active');
  }

  async load() {
    try {
      const res = await fetch('/api/scenes');
      this.scenes = await res.json();
      this.render();
    } catch {
      this.el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">Failed to load scenes.</div>';
    }
  }

  private render() {
    this.el.innerHTML = '';

    for (const status of COLUMNS) {
      const col = this.createColumn(status);
      this.el.appendChild(col);
    }
  }

  private createColumn(status: string): HTMLElement {
    const col = document.createElement('div');
    col.className = 'kanban-column';

    const cards = this.scenes.filter(s => s.status === status);

    // Header
    const header = document.createElement('div');
    header.className = 'kanban-column-header';
    header.innerHTML = `
      <span>${status.toLowerCase()}</span>
      <span class="kanban-column-count">${cards.length}</span>
    `;
    col.appendChild(header);

    // Body (drop target)
    const body = document.createElement('div');
    body.className = 'kanban-column-body';
    body.dataset.status = status;

    // Drop events
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      body.classList.add('drag-over');
    });

    body.addEventListener('dragleave', () => {
      body.classList.remove('drag-over');
    });

    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const sceneId = e.dataTransfer?.getData('text/plain');
      if (sceneId) {
        this.moveScene(Number(sceneId), status);
      }
    });

    // Cards
    for (const scene of cards) {
      body.appendChild(this.createCard(scene));
    }

    col.appendChild(body);
    return col;
  }

  private createCard(scene: SceneRef): HTMLElement {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.dataset.storyArc = scene.story_arc;
    card.draggable = true;

    const wc = scene.word_count >= 1000
      ? `${(scene.word_count / 1000).toFixed(1)}k`
      : `${scene.word_count}`;

    const prov = scene.provenance || 'GOLD';
    const provIcon = prov === 'GOLD' ? '●' : prov === 'EDITED' ? '◐' : '○';
    card.dataset.provenance = prov.toLowerCase();

    card.innerHTML = `
      <span class="kanban-card-title">${scene.scene_number}. ${scene.title}</span>
      <span class="kanban-card-meta">${scene.story_arc}${scene.scene_number} · ${scene.pov || '—'} · ${wc}w · <span class="kanban-prov kanban-prov-${prov.toLowerCase()}">${provIcon} ${prov.toLowerCase()}</span></span>
    `;

    // Drag
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', String(scene.id));
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    // Click to open in editor
    card.addEventListener('click', () => {
      this.onCardClick(scene.id);
    });

    return card;
  }

  private async moveScene(sceneId: number, newStatus: string) {
    try {
      await fetch(`/api/scenes/${sceneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      // Update local state and re-render
      const scene = this.scenes.find(s => s.id === sceneId);
      if (scene) {
        scene.status = newStatus;
        this.render();
      }
    } catch {
      // Reload from server on failure
      this.load();
    }
  }
}
