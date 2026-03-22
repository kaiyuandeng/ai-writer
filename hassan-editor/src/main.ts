import { ToolDirectory, ToolName } from './nav/ToolDirectory';
import { Sidebar } from './sidebar/Sidebar';
import { EditorPane } from './editor/EditorPane';
import { FocusMode } from './focus/FocusMode';
import { Kanban } from './kanban/Kanban';
import { Gulper } from './gulper/Gulper';
import { HeapPanel } from './heap/HeapPanel';
import { GraphPanel } from './visual/GraphPanel';
import { SievePanel } from './visual/SievePanel';
import './styles/base.css';
import './styles/tool-directory.css';
import './styles/sidebar.css';
import './styles/editor.css';
import './styles/focus.css';
import './styles/statusbar.css';
import './styles/kanban.css';
import './styles/scenenav.css';
import './styles/gulper.css';
import './styles/heap.css';
import './styles/visual-panels.css';

// --- App Shell ---
const app = document.getElementById('app')!;
app.style.display = 'flex';
app.style.flexDirection = 'column';
app.style.height = '100vh';

const appBody = document.createElement('div');
appBody.style.display = 'flex';
appBody.style.flex = '1';
appBody.style.overflow = 'hidden';

const contentArea = document.createElement('div');
contentArea.style.flex = '1';
contentArea.style.display = 'flex';
contentArea.style.overflow = 'hidden';
contentArea.style.position = 'relative';

const statusbar = document.createElement('div');
statusbar.className = 'statusbar';
statusbar.innerHTML = `
  <div class="statusbar-left">
    <span class="statusbar-item" id="sb-file">No scene open</span>
  </div>
  <div class="statusbar-center">
    <span class="statusbar-item" id="sb-words">0 words</span>
  </div>
  <div class="statusbar-right">
    <span class="statusbar-item statusbar-saved" id="sb-save">saved</span>
  </div>
`;

// --- Tool Directory ---
const toolDir = new ToolDirectory(appBody);

appBody.appendChild(contentArea);
app.appendChild(appBody);
app.appendChild(statusbar);

const sbFile = document.getElementById('sb-file')!;
const sbWords = document.getElementById('sb-words')!;
const sbSave = document.getElementById('sb-save')!;

let sessionStart = 0;
let sessionActive = false;

// --- Editor layout (sidebar + editor pane) ---
const editorLayout = document.createElement('div');
editorLayout.className = 'editor-layout';
editorLayout.style.display = 'flex';
editorLayout.style.flex = '1';
editorLayout.style.height = '100%';
contentArea.appendChild(editorLayout);

const editor = new EditorPane(editorLayout, (wordCount) => {
  if (!sessionActive) {
    sessionStart = wordCount;
    sessionActive = true;
  }
  const delta = Math.max(0, wordCount - sessionStart);
  sbWords.textContent = `${wordCount.toLocaleString()} words (+${delta} session)`;
});

const sidebar = new Sidebar(editorLayout, (id, type) => {
  if (type === 'scene') {
    editor.loadScene(id);
    sbFile.textContent = `Scene #${id}`;
    history.replaceState(null, '', `#scene/${id}`);
    sidebar.setActiveSelection(id, 'scene');
  } else if (type === 'raw') {
    editor.loadRaw(id);
    sbFile.textContent = `Raw #${id}`;
    history.replaceState(null, '', `#raw/${id}`);
    sidebar.setActiveSelection(id, 'raw');
  } else {
    editor.loadPiece(id);
    sbFile.textContent = `Piece #${id}`;
    history.replaceState(null, '', `#piece/${id}`);
    sidebar.setActiveSelection(id, 'piece');
  }
  sessionActive = false;
});

window.addEventListener('scene:order-change', ((e: CustomEvent) => {
  const { orderName, orderedIds } = e.detail || {};
  if (!orderName || !Array.isArray(orderedIds)) return;
  sidebar.setSceneOrder(orderName, orderedIds);
}) as EventListener);

// --- Panels (all mounted in contentArea) ---
const gulper = new Gulper(contentArea);
const heapPanel = new HeapPanel(contentArea);
const graphPanel = new GraphPanel(contentArea);
const sievePanel = new SievePanel(contentArea);
const kanban = new Kanban(contentArea, (sceneId) => {
  switchTool('editor');
  editor.loadScene(sceneId);
  sbFile.textContent = `Scene #${sceneId}`;
  history.replaceState(null, '', `#scene/${sceneId}`);
  sidebar.setActiveSelection(sceneId, 'scene');
  sessionActive = false;
});

// --- Focus Mode ---
const focusMode = new FocusMode();

// --- Tool Switching ---
const ROUTE_MAP: Partial<Record<ToolName, string>> = {
  graph: '/graph',
  sieve: '/sieve',
  gulper: '/gulper',
  heap: '/heap',
};

function hideAllPanels() {
  editorLayout.style.display = 'none';
  gulper.hide();
  document.body.classList.remove('gulper-mode');
  heapPanel.hide();
  kanban.hide();
  graphPanel.hide();
  sievePanel.hide();
}

function switchTool(tool: ToolName) {
  if (tool === 'inspirations') {
    window.open('/art/gallery.html', '_blank', 'noopener,noreferrer');
    return;
  }

  if (tool === 'focus') {
    focusMode.toggle();
    return;
  }

  hideAllPanels();
  toolDir.setActive(tool);

  switch (tool) {
    case 'editor':
      editorLayout.style.display = 'flex';
      history.replaceState(null, '', location.hash || '/');
      break;
    case 'graph':
      graphPanel.show();
      history.replaceState(null, '', '/graph');
      break;
    case 'sieve':
      sievePanel.show();
      history.replaceState(null, '', '/sieve');
      break;
    case 'gulper':
      gulper.show();
      document.body.classList.add('gulper-mode');
      history.replaceState(null, '', '/gulper');
      break;
    case 'heap':
      heapPanel.show();
      history.replaceState(null, '', '/heap');
      break;
    case 'board':
      kanban.show();
      history.replaceState(null, '', '/');
      break;
  }
}

// Default: editor visible
editorLayout.style.display = 'flex';

window.addEventListener('tool:select', ((e: CustomEvent) => {
  switchTool(e.detail.tool as ToolName);
}) as EventListener);

// --- Keyboard Shortcuts ---
window.addEventListener('keydown', (e) => {
  if (e.metaKey && e.shiftKey) {
    switch (e.key.toLowerCase()) {
      case 'i': e.preventDefault(); switchTool('gulper'); break;
      case 'h': e.preventDefault(); switchTool('heap'); break;
      case 'b': e.preventDefault(); switchTool('board'); break;
      case 'f': e.preventDefault(); switchTool('focus'); break;
    }
  }
});

// --- Events ---
window.addEventListener('editor:saved', () => {
  sbSave.textContent = 'saved';
  sbSave.className = 'statusbar-item statusbar-saved';
});

window.addEventListener('editor:unsaved', () => {
  sbSave.textContent = 'unsaved';
  sbSave.className = 'statusbar-item statusbar-unsaved';
});

window.addEventListener('focus:change', ((e: CustomEvent) => {
  toolDir.setActive(e.detail.active ? 'focus' : 'editor');
}) as EventListener);

// --- URL deep-linking ---
function loadFromRoute() {
  const path = location.pathname;

  for (const [tool, route] of Object.entries(ROUTE_MAP)) {
    if (path === route) {
      switchTool(tool as ToolName);
      return true;
    }
  }

  // Default to editor for hash-based navigation
  switchTool('editor');

  const match = location.hash.match(/^#(scene|raw|piece)\/(\d+)$/);
  if (!match) return false;
  const [, type, id] = match;
  const numId = Number(id);
  if (type === 'scene') {
    editor.loadScene(numId);
    sbFile.textContent = `Scene #${numId}`;
    sidebar.setActiveSelection(numId, 'scene');
  } else if (type === 'raw') {
    editor.loadRaw(numId);
    sbFile.textContent = `Raw #${numId}`;
    sidebar.setActiveSelection(numId, 'raw');
  } else {
    editor.loadPiece(numId);
    sbFile.textContent = `Piece #${numId}`;
  }
  return true;
}

window.addEventListener('hashchange', () => {
  loadFromRoute();
  sessionActive = false;
});

window.addEventListener('popstate', () => {
  loadFromRoute();
  sessionActive = false;
});

window.addEventListener('editor:navigate', ((e: CustomEvent) => {
  sbFile.textContent = `Scene #${e.detail.id}`;
  history.replaceState(null, '', `#scene/${e.detail.id}`);
  sidebar.setActiveSelection(e.detail.id, 'scene');
  sessionActive = false;
}) as EventListener);

window.addEventListener('heap:open-piece', ((e: CustomEvent) => {
  const id = Number(e.detail?.id);
  if (!Number.isFinite(id)) return;
  switchTool('editor');
  editor.loadPiece(id);
  sbFile.textContent = `Piece #${id}`;
  history.replaceState(null, '', `#piece/${id}`);
  sidebar.setActiveSelection(id, 'piece');
  sessionActive = false;
}) as EventListener);

// --- Bootstrap ---
fetch('/api/stats').then(r => r.json()).then(stats => {
  if (stats.totalRawFiles === 0) {
    fetch('/api/import', { method: 'POST' }).then(() => {
      sidebar.loadTree();
      loadFromRoute();
    });
  } else {
    loadFromRoute();
  }
});
