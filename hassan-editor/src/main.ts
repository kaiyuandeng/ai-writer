import { Sidebar } from './sidebar/Sidebar';
import { EditorPane } from './editor/EditorPane';
import { FocusMode } from './focus/FocusMode';
import { Kanban } from './kanban/Kanban';
import { Gulper } from './gulper/Gulper';
import { HeapPanel } from './heap/HeapPanel';
import { GraphPanel } from './visual/GraphPanel';
import { SievePanel } from './visual/SievePanel';
import './styles/base.css';
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

const mainLayout = document.createElement('div');
mainLayout.style.display = 'flex';
mainLayout.style.height = `calc(100vh - var(--statusbar-height))`;

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
    <button class="statusbar-focus-btn" id="sb-graph" title="Graph Panel">⌗ graph</button>
    <button class="statusbar-focus-btn" id="sb-sieve" title="Sieve Panel">⌬ sieve</button>
    <button class="statusbar-focus-btn" id="sb-inspirations" title="Inspiration Gallery">✦ inspirations</button>
    <button class="statusbar-focus-btn" id="sb-gulper" title="The Gulper (⌘⇧I)">⌾ gulper</button>
    <button class="statusbar-focus-btn" id="sb-heap" title="Heap Panel (⌘⇧H)">◇ heap</button>
    <button class="statusbar-focus-btn" id="sb-board" title="Board View (⌘⇧B)">◫ board</button>
    <button class="statusbar-focus-btn" id="sb-focus" title="Focus Mode (⌘⇧F)">◉ focus</button>
  </div>
`;

app.appendChild(mainLayout);
app.appendChild(statusbar);

const sbFile = document.getElementById('sb-file')!;
const sbWords = document.getElementById('sb-words')!;
const sbSave = document.getElementById('sb-save')!;
const sbGraph = document.getElementById('sb-graph')!;
const sbInspirations = document.getElementById('sb-inspirations')!;
const sbGulper = document.getElementById('sb-gulper')!;
const sbHeap = document.getElementById('sb-heap')!;
const sbSieve = document.getElementById('sb-sieve')!;
const sbBoard = document.getElementById('sb-board')!;
const sbFocus = document.getElementById('sb-focus')!;

let sessionStart = 0;
let sessionActive = false;

// --- Editor ---
const editor = new EditorPane(mainLayout, (wordCount) => {
  if (!sessionActive) {
    sessionStart = wordCount;
    sessionActive = true;
  }
  const delta = Math.max(0, wordCount - sessionStart);
  sbWords.textContent = `${wordCount.toLocaleString()} words (+${delta} session)`;
});

// --- Sidebar ---
const sidebar = new Sidebar(mainLayout, (id, type) => {
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

// --- The Gulper ---
const gulper = new Gulper(mainLayout);
const heapPanel = new HeapPanel(mainLayout);
const graphPanel = new GraphPanel(mainLayout);
const sievePanel = new SievePanel(mainLayout);
let kanban: Kanban | null = null;

function closePanels() {
  if (gulper.isActive) {
    gulper.hide();
    document.body.classList.remove('gulper-mode');
    sbGulper.textContent = '⌾ gulper';
  }
  if (heapPanel.active) {
    heapPanel.hide();
    sbHeap.textContent = '◇ heap';
  }
  if (kanban?.isActive) {
    kanban.hide();
    sbBoard.textContent = '◫ board';
  }
  graphPanel.hide();
  sbGraph.textContent = '⌗ graph';
  sievePanel.hide();
  sbSieve.textContent = '⌬ sieve';
}

// --- Visualization Panels ---
sbGraph.addEventListener('click', () => {
  if (sbGraph.textContent?.includes('binder')) {
    graphPanel.hide();
    sbGraph.textContent = '⌗ graph';
    history.replaceState(null, '', '/');
    return;
  }
  closePanels();
  graphPanel.show();
  sbGraph.textContent = '⌗ binder';
  history.replaceState(null, '', '/graph');
});

sbSieve.addEventListener('click', () => {
  if (sbSieve.textContent?.includes('binder')) {
    sievePanel.hide();
    sbSieve.textContent = '⌬ sieve';
    history.replaceState(null, '', '/');
    return;
  }
  closePanels();
  sievePanel.show();
  sbSieve.textContent = '⌬ binder';
  history.replaceState(null, '', '/sieve');
});

sbInspirations.addEventListener('click', () => {
  window.open('/art/gallery.html', '_blank', 'noopener,noreferrer');
});

sbGulper.addEventListener('click', () => {
  if (gulper.isActive) {
    gulper.hide();
    document.body.classList.remove('gulper-mode');
    sbGulper.textContent = '⌾ gulper';
    history.replaceState(null, '', '/');
  } else {
    closePanels();
    gulper.show();
    document.body.classList.add('gulper-mode');
    sbGulper.textContent = '⌾ binder';
    history.replaceState(null, '', '/gulper');
  }
});

// Keyboard shortcut: ⌘⇧I
window.addEventListener('keydown', (e) => {
  if (e.metaKey && e.shiftKey && e.key === 'i') {
    e.preventDefault();
    sbGulper.click();
  }
});

sbHeap.addEventListener('click', () => {
  if (heapPanel.active) {
    heapPanel.hide();
    sbHeap.textContent = '◇ heap';
    history.replaceState(null, '', '/');
  } else {
    closePanels();
    heapPanel.show();
    sbHeap.textContent = '◇ binder';
    history.replaceState(null, '', '/heap');
  }
});

// Keyboard shortcut: ⌘⇧H
window.addEventListener('keydown', (e) => {
  if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    sbHeap.click();
  }
});

// --- Kanban Board ---
kanban = new Kanban(mainLayout, (sceneId) => {
  // Click card → switch to editor view and open that scene
  kanban?.hide();
  sbBoard.textContent = '◫ board';
  editor.loadScene(sceneId);
  sbFile.textContent = `Scene #${sceneId}`;
  history.replaceState(null, '', `#scene/${sceneId}`);
  sidebar.setActiveSelection(sceneId, 'scene');
  sessionActive = false;
});

sbBoard.addEventListener('click', () => {
  if (kanban?.isActive) {
    kanban.hide();
    sbBoard.textContent = '◫ board';
  } else {
    closePanels();
    kanban?.show();
    sbBoard.textContent = '◫ binder';
  }
});

// Keyboard shortcut: ⌘⇧B
window.addEventListener('keydown', (e) => {
  if (e.metaKey && e.shiftKey && e.key === 'b') {
    e.preventDefault();
    sbBoard.click();
  }
});

// --- Focus Mode ---
const focusMode = new FocusMode();
sbFocus.addEventListener('click', () => focusMode.toggle());

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
  sbFocus.textContent = e.detail.active ? '◉ writing' : '◉ focus';
}) as EventListener);

// --- URL deep-linking: #scene/117 or #raw/42 ---
function loadFromRoute() {
  if (location.pathname === '/graph') {
    if (!sbGraph.textContent?.includes('binder')) sbGraph.click();
    return true;
  }
  if (location.pathname === '/sieve') {
    if (!sbSieve.textContent?.includes('binder')) sbSieve.click();
    return true;
  }
  if (location.pathname === '/gulper') {
    if (!gulper.isActive) sbGulper.click();
    return true;
  }
  if (location.pathname === '/heap') {
    if (!heapPanel.active) sbHeap.click();
    return true;
  }
  closePanels();

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

// Keep hash + statusbar in sync when navigating via prev/next buttons
window.addEventListener('editor:navigate', ((e: CustomEvent) => {
  sbFile.textContent = `Scene #${e.detail.id}`;
  history.replaceState(null, '', `#scene/${e.detail.id}`);
  sidebar.setActiveSelection(e.detail.id, 'scene');
  sessionActive = false;
}) as EventListener);

window.addEventListener('heap:open-piece', ((e: CustomEvent) => {
  const id = Number(e.detail?.id);
  if (!Number.isFinite(id)) return;
  closePanels();
  editor.loadPiece(id);
  sbFile.textContent = `Piece #${id}`;
  history.replaceState(null, '', `#piece/${id}`);
  sidebar.setActiveSelection(id, 'piece');
  sessionActive = false;
}) as EventListener);

// --- Bootstrap: import raw files if none exist yet, then deep-link ---
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
