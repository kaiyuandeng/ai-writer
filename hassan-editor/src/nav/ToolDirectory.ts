export type ToolName =
  | 'editor'
  | 'focus'
  | 'graph'
  | 'sieve'
  | 'board'
  | 'gulper'
  | 'heap'
  | 'inspirations';

interface ToolDef {
  name: ToolName;
  label: string;
  glyph: string;
  shortcut?: string;
}

interface Category {
  label: string;
  tools: ToolDef[];
}

const CATEGORIES: Category[] = [
  {
    label: 'write',
    tools: [
      { name: 'editor', label: 'Editor', glyph: '◉' },
      { name: 'focus', label: 'Focus', glyph: '◎', shortcut: '⌘⇧F' },
    ],
  },
  {
    label: 'visualize',
    tools: [
      { name: 'graph', label: 'Graph', glyph: '⌗' },
      { name: 'sieve', label: 'Sieve', glyph: '⌬' },
      { name: 'board', label: 'Board', glyph: '◫', shortcut: '⌘⇧B' },
    ],
  },
  {
    label: 'intake',
    tools: [
      { name: 'gulper', label: 'Gulper', glyph: '⌾', shortcut: '⌘⇧I' },
    ],
  },
  {
    label: 'memory',
    tools: [
      { name: 'heap', label: 'Heap', glyph: '◇', shortcut: '⌘⇧H' },
    ],
  },
  {
    label: 'reference',
    tools: [
      { name: 'inspirations', label: 'Inspirations', glyph: '✦' },
    ],
  },
];

export class ToolDirectory {
  private el: HTMLElement;
  private activeTool: ToolName = 'editor';
  private itemEls = new Map<ToolName, HTMLElement>();

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tool-directory';

    const title = document.createElement('div');
    title.className = 'tool-dir-title';
    title.textContent = 'Hassan';
    this.el.appendChild(title);

    for (const category of CATEGORIES) {
      const section = document.createElement('div');
      section.className = 'tool-dir-category';

      const header = document.createElement('div');
      header.className = 'tool-dir-category-header';
      header.textContent = category.label;
      section.appendChild(header);

      for (const tool of category.tools) {
        const item = document.createElement('div');
        item.className = 'tool-dir-item';
        if (tool.name === this.activeTool) item.classList.add('active');
        item.dataset.tool = tool.name;

        const label = document.createElement('span');
        label.className = 'tool-dir-item-label';
        label.textContent = `${tool.glyph} ${tool.label}`;
        item.appendChild(label);

        if (tool.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.className = 'tool-dir-item-shortcut';
          shortcut.textContent = tool.shortcut;
          item.appendChild(shortcut);
        }

        item.addEventListener('click', () => {
          window.dispatchEvent(
            new CustomEvent('tool:select', { detail: { tool: tool.name } }),
          );
        });

        section.appendChild(item);
        this.itemEls.set(tool.name, item);
      }

      this.el.appendChild(section);
    }

    container.appendChild(this.el);
  }

  setActive(tool: ToolName) {
    this.activeTool = tool;
    for (const [name, el] of this.itemEls) {
      el.classList.toggle('active', name === tool);
    }
  }

  get active(): ToolName {
    return this.activeTool;
  }
}
