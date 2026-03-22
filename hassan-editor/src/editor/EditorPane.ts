import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { SceneNav } from './SceneNav';
import { DiffOverlay } from './DiffOverlay';

export type OnContentChange = (wordCount: number) => void;

export class EditorPane {
  private containerEl: HTMLElement;
  private wrapperEl: HTMLElement;
  private emptyEl: HTMLElement;
  private badgeEl: HTMLElement;
  private editorEl: HTMLElement;
  private editor: Editor | null = null;
  private currentId: number | null = null;
  private currentType: 'scene' | 'raw' | 'piece' = 'scene';
  private currentProvenance: string = 'GOLD';
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private onContentChange: OnContentChange;
  private saving = false;
  private sceneNav: SceneNav;
  private diffOverlay: DiffOverlay;

  constructor(container: HTMLElement, onContentChange: OnContentChange) {
    this.onContentChange = onContentChange;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'editor-container';
    this.containerEl.style.position = 'relative';

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'editor-empty';
    this.emptyEl.textContent = 'Select a scene from the binder';
    this.containerEl.appendChild(this.emptyEl);

    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'editor-wrapper';
    this.wrapperEl.style.display = 'none';

    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'provenance-badge';
    this.wrapperEl.appendChild(this.badgeEl);

    // Scene navigation (between badge and editor)
    this.sceneNav = new SceneNav(this.wrapperEl, (sceneId) => {
      this.loadScene(sceneId);
      window.dispatchEvent(new CustomEvent('editor:navigate', { detail: { id: sceneId } }));
    });

    this.editorEl = document.createElement('div');
    this.wrapperEl.appendChild(this.editorEl);
    this.containerEl.appendChild(this.wrapperEl);

    // Diff overlay (covers editor when active)
    this.diffOverlay = new DiffOverlay(this.containerEl);

    container.appendChild(this.containerEl);
  }

  async loadScene(id: number) {
    try {
      const res = await fetch(`/api/scenes/${id}`);
      const scene = await res.json();
      this.currentId = id;
      this.currentType = 'scene';
      this.currentProvenance = scene.provenance || 'GOLD';
      this.showEditor(scene.content || '');
      this.sceneNavElement().style.display = '';
      this.updateBadge(scene.provenance || 'GOLD', scene.provenance_meta);
      this.onContentChange(scene.word_count || 0);
      this.sceneNav.setCurrentScene(id);
      this.diffOverlay.setScene(id);
      this.diffOverlay.setCurrentContent(scene.content || '');
    } catch (err) {
      console.error('Failed to load scene:', err);
    }
  }

  async loadRaw(id: number) {
    try {
      const res = await fetch(`/api/raw/${id}`);
      const file = await res.json();
      this.currentId = id;
      this.currentType = 'raw';
      this.currentProvenance = 'GOLD';
      this.showEditor(file.content || '');
      this.sceneNavElement().style.display = 'none';
      this.updateBadge('GOLD', null);
      this.onContentChange(file.word_count || 0);
    } catch (err) {
      console.error('Failed to load raw file:', err);
    }
  }

  async loadPiece(id: number) {
    try {
      const res = await fetch(`/api/heap/pieces/${id}`);
      const piece = await res.json();
      this.currentId = id;
      this.currentType = 'piece';
      this.currentProvenance = piece.provenance || 'GOLD';
      this.showEditor(piece.content || '');
      this.sceneNavElement().style.display = 'none';
      this.updateBadge(piece.provenance || 'GOLD', null);
      this.onContentChange(piece.word_count || 0);
      this.diffOverlay.setScene(-1);
      this.diffOverlay.setCurrentContent(piece.content || '');
    } catch (err) {
      console.error('Failed to load piece:', err);
    }
  }

  private updateBadge(provenance: string, meta?: string | null) {
    const labels: Record<string, string> = {
      GOLD: '● gold',
      EDITED: '◐ edited',
      EXTRAPOLATED: '○ bridge',
    };
    const label = labels[provenance] || provenance;
    this.badgeEl.className = `provenance-badge provenance-${provenance.toLowerCase()}`;

    let html = `<span class="provenance-label">${label}</span>`;
    if (provenance === 'EXTRAPOLATED' && meta) {
      try {
        const m = JSON.parse(meta);
        if (m.bridges) html += `<span class="provenance-detail">${m.bridges}</span>`;
        if (m.rationale) html += `<span class="provenance-detail">${m.rationale}</span>`;
      } catch {
        html += `<span class="provenance-detail">${meta}</span>`;
      }
    } else if (provenance === 'EDITED' && meta) {
      try {
        const m = JSON.parse(meta);
        if (m.edited_at) html += `<span class="provenance-detail">${m.edited_at}</span>`;
        if (m.changes) html += `<span class="provenance-detail">${m.changes}</span>`;
      } catch {
        html += `<span class="provenance-detail">${meta}</span>`;
      }
    }

    this.badgeEl.innerHTML = html;
  }

  private showEditor(content: string) {
    this.emptyEl.style.display = 'none';
    this.wrapperEl.style.display = 'block';

    if (this.editor) {
      this.editor.commands.setContent(this.textToHtml(content));
    } else {
      this.createEditor(content);
    }
  }

  private createEditor(content: string) {
    this.editor = new Editor({
      element: this.editorEl,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Typography,
        Placeholder.configure({
          placeholder: 'Begin writing...',
        }),
      ],
      content: this.textToHtml(content),
      autofocus: 'end',
      onUpdate: ({ editor }) => {
        const text = this.htmlToText(editor.getHTML());
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        this.onContentChange(words);
        this.scheduleSave(text);
        this.diffOverlay.setCurrentContent(text);

        // Mark unsaved
        window.dispatchEvent(new CustomEvent('editor:unsaved'));
      },
      onSelectionUpdate: ({ editor }) => {
        const { $from } = editor.state.selection;
        const pos = $from.before(Math.max(1, $from.depth));
        editor.view.dom.querySelectorAll('.is-current-block').forEach(el =>
          el.classList.remove('is-current-block')
        );
        try {
          const domNode = editor.view.nodeDOM(pos);
          if (domNode instanceof HTMLElement) {
            domNode.classList.add('is-current-block');
          }
        } catch { /* ok */ }
      },
    });
  }

  private scheduleSave(text: string) {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.save(text), 1000);
  }

  private async save(text: string) {
    if (!this.currentId || this.saving) return;
    this.saving = true;

    try {
      if (this.currentType === 'scene') {
        await fetch(`/api/scenes/${this.currentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
      } else if (this.currentType === 'piece') {
        await fetch(`/api/heap/pieces/${this.currentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
      }
      // Raw files are read-only for now (source material)
      window.dispatchEvent(new CustomEvent('editor:saved'));
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      this.saving = false;
    }
  }

  private sceneNavElement(): HTMLElement {
    return this.containerEl.querySelector('.scene-nav') as HTMLElement;
  }

  private textToHtml(text: string): string {
    if (!text.trim()) return '<p></p>';
    return text
      .split('\n\n')
      .map(block => {
        block = block.trim();
        if (!block) return '';
        if (block.startsWith('### ')) return `<h3>${this.inline(block.slice(4))}</h3>`;
        if (block.startsWith('## ')) return `<h2>${this.inline(block.slice(3))}</h2>`;
        if (block.startsWith('# ')) return `<h1>${this.inline(block.slice(2))}</h1>`;
        if (block.startsWith('> ')) return `<blockquote><p>${this.inline(block.slice(2))}</p></blockquote>`;
        const lines = block.split('\n').map(l => this.inline(l)).join('<br>');
        return `<p>${lines}</p>`;
      })
      .filter(Boolean)
      .join('');
  }

  private inline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
      .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
      .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
      .replace(/<blockquote><p>(.*?)<\/p><\/blockquote>/g, '> $1\n\n')
      .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<em>(.*?)<\/em>/g, '*$1*')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
