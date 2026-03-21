/**
 * Scene navigation bar with ordering modes and right-side linked flow.
 * Shows explicit "why" notes for extrapolated transitions.
 */
import { SceneRef, SceneOrder } from '../entities';

export type OnNavigate = (sceneId: number) => void;

type OrderConfig = {
  name: string;
  description: string;
  color: string;
  sort: (a: SceneRef, b: SceneRef) => number;
  filter?: (s: SceneRef) => boolean;
};

const BUILTIN_ORDERS: OrderConfig[] = [
  {
    name: 'publishing',
    description: 'Braid order (A-B-A-B). This is the reader-facing sequence.',
    color: '#3fa7ff',
    sort: (a, b) => {
      if (a.scene_number !== b.scene_number) return a.scene_number - b.scene_number;
      return a.story_arc.localeCompare(b.story_arc);
    },
  },
  {
    name: 'chronological',
    description: 'Universe-time order (earth before hassan arcs).',
    color: '#6d7dff',
    sort: (a, b) => {
      const tOrder: Record<string, number> = { C: 0, A: 1, B: 2 };
      const tDiff = (tOrder[a.story_arc] ?? 9) - (tOrder[b.story_arc] ?? 9);
      if (tDiff !== 0) return tDiff;
      return a.scene_number - b.scene_number;
    },
  },
  {
    name: 'story-arc-a',
    description: 'story arc A only.',
    color: '#895cdb',
    sort: (a, b) => a.scene_number - b.scene_number,
    filter: (s) => s.story_arc === 'A',
  },
  {
    name: 'story-arc-b',
    description: 'story arc B only.',
    color: '#2f9bfa',
    sort: (a, b) => a.scene_number - b.scene_number,
    filter: (s) => s.story_arc === 'B',
  },
  {
    name: 'story-arc-c',
    description: 'story arc C only.',
    color: '#181cf5',
    sort: (a, b) => a.scene_number - b.scene_number,
    filter: (s) => s.story_arc === 'C',
  },
  {
    name: 'orphans',
    description: 'Scenes not linked to any story arc, or with arc defaulting to B without explicit assignment.',
    color: '#dc6a21',
    sort: (a, b) => a.scene_number - b.scene_number,
    filter: (s) => !s.story_arc || !['A', 'B', 'C'].includes(s.story_arc),
  },
];

export class SceneNav {
  private el: HTMLElement;
  private onNavigate: OnNavigate;
  private scenes: SceneRef[] = [];
  private orderedIds: number[] = [];
  private currentIndex = -1;
  private currentOrder = 'publishing';
  private customOrders: SceneOrder[] = [];

  constructor(container: HTMLElement, onNavigate: OnNavigate) {
    this.onNavigate = onNavigate;

    this.el = document.createElement('div');
    this.el.className = 'scene-nav';
    container.appendChild(this.el);

    this.loadScenes();
  }

  async loadScenes() {
    try {
      const [scenesRes, ordersRes] = await Promise.all([
        fetch('/api/scenes'),
        fetch('/api/orders'),
      ]);
      this.scenes = await scenesRes.json();
      this.customOrders = await ordersRes.json();
      this.applyOrder(this.currentOrder);
    } catch {
      // Silent fallback keeps editor usable even if nav metadata fails.
    }
  }

  setCurrentScene(sceneId: number) {
    this.currentIndex = this.orderedIds.indexOf(sceneId);
    this.render();
  }

  private emitOrderChange() {
    window.dispatchEvent(new CustomEvent('scene:order-change', {
      detail: {
        orderName: this.currentOrder,
        orderedIds: [...this.orderedIds],
      },
    }));
  }

  private applyOrder(orderName: string) {
    this.currentOrder = orderName;

    const custom = this.customOrders.find((o) => o.name === orderName);
    if (custom) {
      try {
        const ids = JSON.parse(custom.scene_ids || '[]') as number[];
        const existingIds = new Set(this.scenes.map((s) => s.id));
        this.orderedIds = ids.filter((id) => existingIds.has(id));
      } catch {
        this.orderedIds = [];
      }
      this.emitOrderChange();
      this.render();
      return;
    }

    const builtin = BUILTIN_ORDERS.find((o) => o.name === orderName);
    if (!builtin) return;

    let filtered = [...this.scenes];
    if (builtin.filter) filtered = filtered.filter(builtin.filter);

    filtered.sort(builtin.sort);
    this.orderedIds = filtered.map((s) => s.id);
    this.emitOrderChange();
    this.render();
  }

  private getScene(sceneId: number): SceneRef | undefined {
    return this.scenes.find((s) => s.id === sceneId);
  }

  private storyArcLabel(storyArc: string): string {
    return `story-arc-${storyArc.toLowerCase()}`;
  }

  private getSortDescription(): { text: string; color: string } {
    const builtin = BUILTIN_ORDERS.find((o) => o.name === this.currentOrder);
    if (builtin) return { text: builtin.description, color: builtin.color };
    const custom = this.customOrders.find((o) => o.name === this.currentOrder);
    const fallbackByName: Record<string, string> = {
      'future-earth': 'Future Earth sequence. A custom lane focused on Earth-era scenes.',
    };
    return {
      text: custom?.description || fallbackByName[this.currentOrder] || 'Custom saved sequence.',
      color: '#b38cff',
    };
  }

  private getTransitionWhy(nextScene: SceneRef | undefined): string | null {
    if (!nextScene || nextScene.provenance !== 'EXTRAPOLATED' || !nextScene.provenance_meta) return null;

    try {
      const meta = JSON.parse(nextScene.provenance_meta);
      if (meta.rationale) return String(meta.rationale);
      if (meta.bridges) return `Bridge: ${meta.bridges}`;
    } catch {
      // Ignore malformed metadata
    }
    return null;
  }

  private render() {
    const prev = this.currentIndex > 0 ? this.getScene(this.orderedIds[this.currentIndex - 1]) : null;
    const next = this.currentIndex < this.orderedIds.length - 1 ? this.getScene(this.orderedIds[this.currentIndex + 1]) : null;
    const pos = this.currentIndex >= 0 ? `${this.currentIndex + 1}/${this.orderedIds.length}` : '—';
    const sort = this.getSortDescription();

    const flowHtml = this.orderedIds.map((id, idx) => {
      const scene = this.getScene(id);
      if (!scene) return '';
      const active = idx === this.currentIndex ? 'active' : '';
      const nextScene = this.getScene(this.orderedIds[idx + 1]);
      const why = this.getTransitionWhy(nextScene);
      return `
        <li class="scene-flow-item ${active}" data-scene-id="${scene.id}">
          <div class="scene-flow-line">${idx + 1}. ${scene.scene_number}. ${this.escape(scene.title)}</div>
          <div class="scene-flow-meta">
            ${this.storyArcLabel(scene.story_arc)} · <span class="scene-flow-prov scene-flow-prov-${(scene.provenance || 'GOLD').toLowerCase()}">${scene.provenance || 'GOLD'}</span>
          </div>
          ${why ? `<div class="scene-flow-why">→ ${this.escape(why)}</div>` : ''}
        </li>
      `;
    }).join('');

    this.el.innerHTML = `
      <div class="scene-nav-grid">
        <div class="scene-nav-main">
          <div class="scene-nav-top">
            <button class="scene-nav-btn scene-nav-prev" ${prev ? '' : 'disabled'}>
              ← ${prev ? this.truncate(prev.title, 20) : ''}
            </button>
            <div class="scene-nav-center">
              <select class="scene-nav-order">
                ${BUILTIN_ORDERS.map((o) =>
                  `<option value="${o.name}" ${o.name === this.currentOrder ? 'selected' : ''}>${o.name}</option>`
                ).join('')}
                ${this.customOrders.map((o) =>
                  `<option value="${o.name}" ${o.name === this.currentOrder ? 'selected' : ''}>${o.name}</option>`
                ).join('')}
              </select>
              <span class="scene-nav-pos">${pos}</span>
            </div>
            <button class="scene-nav-btn scene-nav-next" ${next ? '' : 'disabled'}>
              ${next ? this.truncate(next.title, 20) : ''} →
            </button>
          </div>
          <div class="scene-nav-sort-help">
            <span class="scene-nav-sort-dot" style="background:${sort.color}"></span>
            <span>${this.escape(sort.text)}</span>
          </div>
        </div>
        <aside class="scene-nav-flow">
          <div class="scene-nav-flow-title">linked flow</div>
          <ol class="scene-nav-flow-list">${flowHtml}</ol>
        </aside>
      </div>
    `;

    const prevBtn = this.el.querySelector('.scene-nav-prev') as HTMLButtonElement | null;
    const nextBtn = this.el.querySelector('.scene-nav-next') as HTMLButtonElement | null;
    const orderSelect = this.el.querySelector('.scene-nav-order') as HTMLSelectElement | null;

    prevBtn?.addEventListener('click', () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.onNavigate(this.orderedIds[this.currentIndex]);
        this.render();
      }
    });

    nextBtn?.addEventListener('click', () => {
      if (this.currentIndex < this.orderedIds.length - 1) {
        this.currentIndex++;
        this.onNavigate(this.orderedIds[this.currentIndex]);
        this.render();
      }
    });

    orderSelect?.addEventListener('change', () => {
      const currentSceneId = this.orderedIds[this.currentIndex];
      this.applyOrder(orderSelect.value);
      if (currentSceneId != null) {
        this.currentIndex = this.orderedIds.indexOf(currentSceneId);
      }
      this.render();
    });

    this.el.querySelectorAll('.scene-flow-item').forEach((row) => {
      row.addEventListener('click', () => {
        const sceneId = Number((row as HTMLElement).dataset.sceneId);
        if (!Number.isFinite(sceneId)) return;
        this.currentIndex = this.orderedIds.indexOf(sceneId);
        this.onNavigate(sceneId);
        this.render();
      });
    });
  }

  private truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
