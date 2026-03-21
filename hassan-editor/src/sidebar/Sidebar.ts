import { SceneRef, SourceTextRef } from '../entities';

export type OnSceneSelect = (sceneId: number, type: 'scene' | 'raw') => void;

export class Sidebar {
  private el: HTMLElement;
  private treeEl: HTMLElement;
  private onSelect: OnSceneSelect;
  private expandedDirs: Set<string> = new Set(['scenes']);
  private pendingActive: { id: number; type: 'scene' | 'raw' } | null = null;
  private sceneOrderIds: number[] = [];
  private sceneOrderName = '';

  constructor(container: HTMLElement, onSelect: OnSceneSelect) {
    this.onSelect = onSelect;

    this.el = document.createElement('div');
    this.el.className = 'sidebar';

    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.innerHTML = `
      <div>
        <div class="sidebar-title">Binder</div>
        <div class="sidebar-project-name">Hassan</div>
      </div>
    `;
    this.el.appendChild(header);

    this.treeEl = document.createElement('div');
    this.treeEl.className = 'tree';
    this.el.appendChild(this.treeEl);

    container.appendChild(this.el);
    this.loadTree();
  }

  async loadTree() {
    try {
      const res = await fetch('/api/tree');
      const data = await res.json();
      this.renderTree(data.movements, data.rawFiles);
    } catch (err) {
      this.treeEl.innerHTML = `<div style="padding:16px;color:var(--text-dim)">Failed to load. Is the server running?</div>`;
    }
  }

  private renderTree(movements: Record<string, SceneRef[]>, rawFiles: SourceTextRef[]) {
    this.treeEl.innerHTML = '';

    // Scenes section
    const orderedLabel = this.sceneOrderName ? `Scenes (${this.sceneOrderName})` : 'Scenes';
    const scenesSection = this.createFolderNode(orderedLabel, 'scenes', 0);
    this.treeEl.appendChild(scenesSection.wrapper);

    const sceneById = new Map<number, SceneRef>();
    for (const list of Object.values(movements)) {
      for (const scene of list) {
        sceneById.set(scene.id, scene);
      }
    }

    if (this.sceneOrderIds.length > 0) {
      for (const sceneId of this.sceneOrderIds) {
        const scene = sceneById.get(sceneId);
        if (!scene) continue;
        const sceneRow = this.createSceneRow(scene, 1);
        scenesSection.children.appendChild(sceneRow);
      }
      this.expandedDirs.add('scenes');
      scenesSection.icon.textContent = '▾';
      scenesSection.children.classList.remove('collapsed');
    } else {
    const movementNames = Object.keys(movements).sort();
    for (const movement of movementNames) {
      const scenes = movements[movement];
      const movNode = this.createFolderNode(this.formatMovement(movement), movement, 1);
      scenesSection.children.appendChild(movNode.wrapper);

      for (const scene of scenes) {
        const sceneRow = this.createSceneRow(scene, 2);
        movNode.children.appendChild(sceneRow);
      }

      // Auto-expand movements with content
      if (scenes.length > 0) {
        this.expandedDirs.add(movement);
        movNode.icon.textContent = '▾';
        movNode.children.classList.remove('collapsed');
      }
    }
    }

    // Raw files section
    if (rawFiles.length > 0) {
      const rawSection = this.createFolderNode(`Source (${rawFiles.length})`, 'raw', 0);
      this.treeEl.appendChild(rawSection.wrapper);

      for (const file of rawFiles) {
        const row = this.createRawRow(file, 1);
        rawSection.children.appendChild(row);
      }
    }

    // Apply deferred selection after rows exist.
    if (this.pendingActive) {
      const { id, type } = this.pendingActive;
      this.setActiveSelection(id, type);
      this.pendingActive = null;
    }
  }

  private createFolderNode(label: string, key: string, depth: number) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const row = document.createElement('div');
    row.className = 'tree-node-row directory';

    for (let i = 0; i < depth; i++) {
      const indent = document.createElement('span');
      indent.className = 'tree-indent';
      row.appendChild(indent);
    }

    const icon = document.createElement('span');
    icon.className = 'tree-icon folder';
    icon.textContent = this.expandedDirs.has(key) ? '▾' : '▸';
    row.appendChild(icon);

    const labelEl = document.createElement('span');
    labelEl.className = 'tree-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const children = document.createElement('div');
    children.className = `tree-children ${this.expandedDirs.has(key) ? '' : 'collapsed'}`;

    row.addEventListener('click', () => {
      if (this.expandedDirs.has(key)) {
        this.expandedDirs.delete(key);
      } else {
        this.expandedDirs.add(key);
      }
      icon.textContent = this.expandedDirs.has(key) ? '▾' : '▸';
      children.classList.toggle('collapsed');
    });

    wrapper.appendChild(row);
    wrapper.appendChild(children);

    return { wrapper, children, icon };
  }

  private createSceneRow(scene: SceneRef, depth: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    row.dataset.sceneId = String(scene.id);

    for (let i = 0; i < depth; i++) {
      const indent = document.createElement('span');
      indent.className = 'tree-indent';
      row.appendChild(indent);
    }

    const icon = document.createElement('span');
    icon.className = `tree-icon file-${scene.story_arc.toLowerCase()}`;
    icon.textContent = scene.golden ? '●' : '○';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = `${scene.scene_number}. ${scene.title}`;
    row.appendChild(label);

    const wc = document.createElement('span');
    wc.className = 'tree-wordcount';
    wc.textContent = this.formatWordCount(scene.word_count);
    row.appendChild(wc);

    row.addEventListener('click', () => {
      this.setActive(row);
      this.onSelect(scene.id, 'scene');
    });

    return row;
  }

  private createRawRow(file: SourceTextRef, depth: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    row.dataset.rawId = String(file.id);

    for (let i = 0; i < depth; i++) {
      const indent = document.createElement('span');
      indent.className = 'tree-indent';
      row.appendChild(indent);
    }

    const icon = document.createElement('span');
    icon.className = 'tree-icon file-default';
    icon.textContent = '◦';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = file.filename.replace(/\.(txt|md)$/, '');
    row.appendChild(label);

    const wc = document.createElement('span');
    wc.className = 'tree-wordcount';
    wc.textContent = this.formatWordCount(file.word_count);
    row.appendChild(wc);

    row.addEventListener('click', () => {
      this.setActive(row);
      this.onSelect(file.id, 'raw');
    });

    return row;
  }

  private setActive(rowEl: HTMLElement) {
    this.el.querySelectorAll('.tree-node-row.active').forEach(el => el.classList.remove('active'));
    rowEl.classList.add('active');
  }

  setActiveSelection(id: number, type: 'scene' | 'raw') {
    const selector = type === 'scene'
      ? `.tree-node-row[data-scene-id="${id}"]`
      : `.tree-node-row[data-raw-id="${id}"]`;

    const row = this.el.querySelector(selector) as HTMLElement | null;
    if (!row) {
      // Tree may not be rendered yet; defer until next render.
      this.pendingActive = { id, type };
      return;
    }

    this.setActive(row);
    row.scrollIntoView({ block: 'nearest' });
  }

  setSceneOrder(orderName: string, orderedIds: number[]) {
    this.sceneOrderName = orderName;
    this.sceneOrderIds = [...orderedIds];
    this.loadTree();
  }

  private formatMovement(name: string): string {
    return name.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private formatWordCount(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return `${count}`;
  }
}
