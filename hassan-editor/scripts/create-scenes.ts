/**
 * SCENE CREATION SCRIPT v2
 * ========================
 * Paragraph-based splitting with content-aware break detection.
 *
 * Usage: npx tsx scripts/create-scenes.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'hassan.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ==========================================
// TYPES
// ==========================================

interface SceneDef {
  title: string;
  timeline: 'A' | 'B' | 'C';
  movement: string;
  pov?: string;
  setting?: string;
  content: string;
}

interface ManuscriptPlan {
  rawId: number;
  filename: string;
  defaultTimeline: 'A' | 'B' | 'C';
  defaultMovement: string;
  defaultPov: string;
  /**
   * Scenes defined by searching for a unique text snippet near the break point.
   * The snippet must be long enough to be unique in the manuscript.
   */
  scenes: {
    /** Unique text that appears near the start of this scene */
    startSnippet: string;
    title: string;
    timeline?: 'A' | 'B' | 'C';
    movement?: string;
    pov?: string;
    setting?: string;
  }[];
}

// ==========================================
// MANUSCRIPT PLANS
// ==========================================

const MANUSCRIPTS: ManuscriptPlan[] = [
  // ----- THE DEPARTURE — THE ISLAND (25k, Timeline B) -----
  {
    rawId: 167,
    filename: 'The Departure - The Island.txt',
    defaultTimeline: 'B',
    defaultMovement: '1-the-arrival',
    defaultPov: 'Valentine',
    scenes: [
      { startSnippet: 'The house sat on the edge of', title: 'The Replacematon Arrives', setting: 'The island house — front door' },
      { startSnippet: 'Play me something', title: 'Valentine Plays the Violin', setting: 'The island house — parlor', movement: '1-the-arrival' },
      { startSnippet: 'switched hands', title: 'Left-Handed Discovery', setting: 'Valentine\'s bedroom', movement: '2-the-deepening' },
      { startSnippet: 'young woman', title: 'The Woman Upstairs', setting: 'The island house — upper floors', movement: '2-the-deepening' },
      { startSnippet: 'the ninth', title: 'The Contract', setting: 'The Maestro\'s study', movement: '2-the-deepening' },
      { startSnippet: 'birthday', title: 'Valentine\'s First Birthday', setting: 'The island house', movement: '2-the-deepening' },
      { startSnippet: 'Yin and Yang', title: 'The Professor and the Moon', setting: 'The island house — night', movement: '2-the-deepening' },
      { startSnippet: 'five in the morning', title: 'Training Begins', setting: 'The island house — dawn', movement: '2-the-deepening' },
      { startSnippet: 'skiff', title: 'The Hidden Boat', setting: 'The beach', movement: '2-the-deepening' },
      { startSnippet: 'air-yacht', title: 'The Maestro Departs', setting: 'The island — dock', movement: '2-the-deepening' },
      { startSnippet: 'Mr. Frog', title: 'Mr. Frog in His Well', setting: 'The stairwell theater', movement: '2-the-deepening' },
      { startSnippet: 'golden palace', title: 'The Golden Palace Rises', setting: 'The sea around the island', movement: '2-the-deepening' },
      { startSnippet: 'forty-six', title: 'The Maestro\'s Fever', setting: 'The flooded house', movement: '3-the-revelation' },
      { startSnippet: 'mold', title: 'The House Decays', setting: 'The rotting island', movement: '3-the-revelation' },
      { startSnippet: 'enucleated', title: 'The Maestro\'s Blindness', setting: 'The basement mausoleum', movement: '3-the-revelation' },
      { startSnippet: 'I am not', title: 'The Truth: V0', setting: 'The Maestro\'s room', movement: '3-the-revelation' },
    ],
  },

  // ----- THE INITIATION — THE CITY (43k, Timeline B) -----
  {
    rawId: 168,
    filename: 'The Initiation - The City.txt',
    defaultTimeline: 'B',
    defaultMovement: '4-the-city',
    defaultPov: 'Valentine',
    scenes: [
      { startSnippet: 'never held a dead body', title: 'The Burning of the Island', pov: 'Vera', movement: '3-the-revelation', setting: 'The island rooftop at sunrise' },
      { startSnippet: 'trolley', title: 'Departure by Trolley', movement: '4-the-city', setting: 'The trolley to the City' },
      { startSnippet: 'pastel', title: 'Neo San Francisco', setting: 'Neo San Francisco — suburbs' },
      { startSnippet: 'Engram Corp', title: 'Welcome, Mr. Valentine', setting: 'Engram Corp lobby' },
      { startSnippet: 'couldn\'t sleep', title: 'Two Lost Years', setting: 'Valentine\'s apartment' },
      { startSnippet: 'waterfront at night', title: 'The Waterfront', setting: 'The waterfront at night' },
      { startSnippet: 'Trans Am', title: 'Pace and the Trans Am', pov: 'Valentine', setting: 'City streets' },
      { startSnippet: 'clifftop', title: 'Brotherhood on the Cliff', setting: 'A clifftop overlooking the City' },
      { startSnippet: 'Vera reappeared', title: 'Vera Returns', setting: 'Underground workshop' },
      { startSnippet: 'Spirit Cyborg', title: 'The Spirit Cyborg', setting: 'The racing workshop' },
      { startSnippet: 'V-e-r-a', title: 'The Name Cipher', setting: 'The Hole — underground restaurant' },
      { startSnippet: 'Conservancy', title: 'The Human Conservancy Rally', setting: 'Underground rally cavern' },
      { startSnippet: 'assassination', title: 'Red Hala', setting: 'The rally — aftermath' },
      { startSnippet: 'window ledge', title: 'The Ledge', setting: 'Valentine\'s apartment — window' },
      { startSnippet: 'door of light', title: 'The Professor\'s Revelation', setting: 'Valentine\'s apartment — the threshold' },
      { startSnippet: 'Pace kicked', title: 'The Rescue', setting: 'Valentine\'s apartment — dawn' },
    ],
  },

  // ----- KIDS (31k, Mixed timelines) -----
  {
    rawId: 190,
    filename: 'Kids.txt',
    defaultTimeline: 'A',
    defaultMovement: '2-the-deepening',
    defaultPov: 'Aharah',
    scenes: [
      { startSnippet: 'Chapter: Kids', title: 'Kids — The Children of Maya', pov: 'Aharah', setting: 'The city of Maya' },
      { startSnippet: 'Anais meeting Nala', title: 'Anais Meets Nahlah', pov: 'Anais', setting: 'Maya — the sisters\' quarters' },
      { startSnippet: 'Nala\'s return in chains', title: 'Nahlah\'s Return in Chains', pov: 'Aharah', setting: 'Maya — the gates' },
      { startSnippet: 'Earth 2069', title: 'Earth 2069 — Marcos', pov: 'Marcos', timeline: 'C', setting: 'Earth — 2069' },
    ],
  },

  // ----- THE WOMAN ON THE DUNE (19k, Timeline A) -----
  {
    rawId: 158,
    filename: 'The woman on the dune.txt',
    defaultTimeline: 'A',
    defaultMovement: '5-the-turn',
    defaultPov: 'Aharah',
    scenes: [
      { startSnippet: 'forty-four days', title: 'Forty-Four Days in the Desert', setting: 'The Vyvyan desert' },
      { startSnippet: 'Dzuvag', title: 'Dzuvag the Hermit', setting: 'A yurt in the desert' },
      { startSnippet: 'chain-sickle', title: 'Desert Hunting', setting: 'The dunes' },
      { startSnippet: 'monak', title: 'Big Game and Desert Lore', setting: 'The open desert' },
      { startSnippet: 'Commodore', title: 'The Commodore of Complaint', setting: 'Near the Tagata\'s rock' },
      { startSnippet: 'bloody-knuckle', title: 'Striking the Stone', setting: 'The Tagata\'s boulder' },
      { startSnippet: 'beat the sunrise', title: 'Solo Training on the Rock', setting: 'The desert — alone' },
      { startSnippet: 'dream', title: 'The Prophetic Dream', setting: 'The dune at dawn' },
    ],
  },

  // ----- THE TURN — THE OUKEMENE (12k, Timeline B) -----
  {
    rawId: 169,
    filename: 'The Turn - The Oukemene.txt',
    defaultTimeline: 'B',
    defaultMovement: '5-the-turn',
    defaultPov: 'Valentine',
    scenes: [
      { startSnippet: 'woke up', title: 'Road Trip with Pace', setting: 'Electric prairies — Pace\'s car' },
      { startSnippet: 'gate', title: 'The Monastery', setting: 'Mountain monastery — iron gates' },
      { startSnippet: 'locked', title: 'The Unlocked Door', setting: 'The monastery — chapel' },
      { startSnippet: 'oatmeal', title: 'Insomnia and the Cafeteria', setting: 'The monastery — kitchen' },
      { startSnippet: 'kick', title: 'Fever and Withdrawal', setting: 'Valentine\'s cell' },
      { startSnippet: 'Uriah', title: 'Recovery and Uriah', setting: 'The monastery grounds' },
      { startSnippet: 'Marcos Di Assisi', title: 'Marcos on Earth (2069)', pov: 'Marcos', timeline: 'C', setting: 'San Francisco — corporate tower' },
    ],
  },

  // ----- THE REAL LYONESSA (7.5k, Timeline A) -----
  {
    rawId: 160,
    filename: 'The Real Lyonessa.txt',
    defaultTimeline: 'A',
    defaultMovement: '1-the-arrival',
    defaultPov: 'Anais',
    scenes: [
      { startSnippet: 'waterfront', title: 'The Lyonessa Returns', setting: 'The waterfront at dawn' },
      { startSnippet: 'weep', title: 'Sisters Reunited', setting: 'The road to Maya' },
      { startSnippet: 'ruins', title: 'Through the Maya Barrier', pov: 'Anais', setting: 'The threshold of the city' },
      { startSnippet: 'rickshaw', title: 'The Riot in the Market', pov: 'Aharah', setting: 'The morning market of Maya' },
      { startSnippet: 'healing', title: 'Healing and Imprisonment', pov: 'Aharah', setting: 'The healing baths', movement: '2-the-deepening' },
      { startSnippet: 'astromancer', title: 'Anais\'s Revelation', pov: 'Anais', setting: 'Aharah\'s chamber', movement: '2-the-deepening' },
      { startSnippet: 'Sword Saint', title: 'The Sword Saint\'s Test', pov: 'Aharah', setting: 'Mountain path to Oracle\'s palace', movement: '3-the-revelation' },
    ],
  },
];

// --- Single-scene files ---
interface SingleScene {
  rawId: number;
  title: string;
  timeline: 'A' | 'B' | 'C';
  movement: string;
  pov?: string;
  setting?: string;
}

const SINGLE_SCENES: SingleScene[] = [
  { rawId: 170, title: 'The Cosmic Detective', timeline: 'B', movement: '6-the-convergence', pov: 'Valentine' },
  { rawId: 162, title: 'The Clone 19', timeline: 'A', movement: '2-the-deepening', pov: 'Hyfe' },
  { rawId: 161, title: 'The Iris of the Storm', timeline: 'A', movement: '2-the-deepening', pov: 'Anais' },
  { rawId: 159, title: 'The Elephant Wrestler', timeline: 'A', movement: '2-the-deepening', pov: 'Haz King' },
  { rawId: 166, title: 'The Vulture (Prologue)', timeline: 'A', movement: '0-prologue', pov: 'The Son' },
  { rawId: 164, title: 'The Human Conservancy (Fragment)', timeline: 'B', movement: '4-the-city', pov: 'Valentine' },
  { rawId: 165, title: 'The Man in the Well', timeline: 'B', movement: '2-the-deepening', pov: 'Valentine' },
  { rawId: 174, title: 'The Maestro Taken by New Ethics', timeline: 'B', movement: '2-the-deepening', pov: 'Valentine' },
  { rawId: 182, title: 'Pace in the Desert', timeline: 'B', movement: '5-the-turn', pov: 'Pace' },
  { rawId: 179, title: 'A Consultation', timeline: 'B', movement: '4-the-city', pov: 'Valentine' },
  { rawId: 302, title: 'Introducing Bruce and Marco', timeline: 'B', movement: '6-the-convergence', pov: 'Valentine' },
  { rawId: 188, title: 'A.1 — Opening Fragment', timeline: 'A', movement: '1-the-arrival', pov: 'Aharah' },
  { rawId: 183, title: 'A Shit Day', timeline: 'B', movement: '4-the-city', pov: 'Valentine' },
  { rawId: 184, title: 'A Shit Day (with Setting)', timeline: 'B', movement: '4-the-city', pov: 'Valentine' },
  { rawId: 89, title: 'Mars, Mother', timeline: 'C', movement: '2-the-deepening', pov: 'Marcos' },
  { rawId: 317, title: 'Untitled Manuscript', timeline: 'B', movement: '4-the-city', pov: 'Valentine' },
];

// ==========================================
// SPLITTING LOGIC
// ==========================================

function splitManuscript(content: string, snippets: string[]): string[] {
  if (snippets.length === 0) return [content];

  // Find the character position of each snippet (case-insensitive)
  const lower = content.toLowerCase();
  const positions: { idx: number; snippet: string }[] = [];

  for (const snippet of snippets) {
    const idx = lower.indexOf(snippet.toLowerCase());
    if (idx >= 0) {
      positions.push({ idx, snippet });
    } else {
      console.log(`    WARN: snippet not found: "${snippet.slice(0, 40)}..."`);
    }
  }

  // Sort by position
  positions.sort((a, b) => a.idx - b.idx);

  if (positions.length === 0) return [content];

  // Split at each position, backing up to the nearest paragraph boundary
  const segments: string[] = [];

  for (let i = 0; i < positions.length; i++) {
    const start = i === 0 ? 0 : positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : content.length;

    // Back up to paragraph boundary (find the last \n\n before this position)
    let adjustedStart = start;
    if (i > 0) {
      const lookback = content.lastIndexOf('\n\n', start);
      if (lookback > (i > 1 ? positions[i - 1].idx : 0)) {
        adjustedStart = lookback + 2;
      }
    }

    segments.push(content.slice(adjustedStart, end).trim());
  }

  // If the first snippet isn't at position 0, include the preamble in the first segment
  if (positions[0].idx > 100) {
    // There's significant content before the first break — prepend it to segment 0
    const preamble = content.slice(0, positions[0].idx).trim();
    if (preamble.length > 50) {
      segments[0] = preamble + '\n\n' + segments[0];
    }
  }

  return segments.filter(s => s.length > 0);
}

// ==========================================
// INSERT LOGIC
// ==========================================

const insertScene = db.prepare(`
  INSERT INTO scenes (movement, scene_number, title, timeline, pov, characters, setting,
    status, golden, content, word_count, provenance, source_raw_id)
  VALUES (?, ?, ?, ?, ?, '[]', ?, 'DRAFTED', 1, ?, ?, 'GOLD', ?)
`);

let sceneNum = 0;

function insertOne(def: SceneDef, sourceRawId: number) {
  sceneNum++;
  const wc = countWords(def.content);
  insertScene.run(
    def.movement, sceneNum, def.title, def.timeline,
    def.pov || null, def.setting || null,
    def.content, wc, sourceRawId
  );
  console.log(`  + Scene ${sceneNum}: ${def.title} (${wc.toLocaleString()}w) [${def.timeline}]`);
}

// ==========================================
// EXECUTE
// ==========================================

console.log('=== HASSAN SCENE CREATION v2 ===\n');

const existingScenes = (db.prepare('SELECT COUNT(*) as c FROM scenes').get() as any).c;
if (existingScenes > 0) {
  console.log(`WARNING: ${existingScenes} scenes already exist. Aborting.`);
  console.log('To reset: sqlite3 hassan.db "DELETE FROM scenes"');
  process.exit(1);
}

// Process large manuscripts
for (const plan of MANUSCRIPTS) {
  console.log(`\n--- ${plan.filename} ---`);
  const raw = db.prepare('SELECT content FROM raw_files WHERE id = ?').get(plan.rawId) as { content: string } | undefined;
  if (!raw) { console.log(`  SKIP: not found`); continue; }

  const snippets = plan.scenes.map(s => s.startSnippet);
  const segments = splitManuscript(raw.content, snippets);

  console.log(`  Split into ${segments.length} segments (expected ${plan.scenes.length})`);

  // Map segments to scene definitions
  for (let i = 0; i < segments.length; i++) {
    const sceneDef = plan.scenes[i] || {
      startSnippet: '',
      title: `${plan.filename.replace('.txt', '')} — Part ${i + 1}`,
    };

    insertOne({
      title: sceneDef.title,
      timeline: sceneDef.timeline || plan.defaultTimeline,
      movement: sceneDef.movement || plan.defaultMovement,
      pov: sceneDef.pov || plan.defaultPov,
      setting: sceneDef.setting,
      content: segments[i],
    }, plan.rawId);
  }
}

// Process single-scene files
console.log('\n--- Single-scene files ---');
for (const plan of SINGLE_SCENES) {
  const raw = db.prepare('SELECT content FROM raw_files WHERE id = ?').get(plan.rawId) as { content: string } | undefined;
  if (!raw) { console.log(`  SKIP: ${plan.title} (id=${plan.rawId}) not found`); continue; }
  insertOne({
    title: plan.title,
    timeline: plan.timeline,
    movement: plan.movement,
    pov: plan.pov,
    setting: plan.setting,
    content: raw.content,
  }, plan.rawId);
}

// Summary
const totalScenes = (db.prepare('SELECT COUNT(*) as c FROM scenes').get() as any).c;
const totalWords = (db.prepare('SELECT COALESCE(SUM(word_count), 0) as c FROM scenes').get() as any).c;
const byTimeline = db.prepare('SELECT timeline, COUNT(*) as scenes, SUM(word_count) as words FROM scenes GROUP BY timeline').all();
const byMovement = db.prepare('SELECT movement, COUNT(*) as scenes, SUM(word_count) as words FROM scenes GROUP BY movement ORDER BY movement').all();

console.log('\n=== SUMMARY ===');
console.log(`Total scenes: ${totalScenes}`);
console.log(`Total words: ${totalWords.toLocaleString()}`);
console.log('\nBy timeline:');
for (const t of byTimeline as any[]) {
  console.log(`  ${t.timeline}: ${t.scenes} scenes, ${t.words.toLocaleString()}w`);
}
console.log('\nBy movement:');
for (const m of byMovement as any[]) {
  console.log(`  ${m.movement}: ${m.scenes} scenes, ${m.words.toLocaleString()}w`);
}

// Quality check: flag scenes that are too small or too large
console.log('\n=== QUALITY CHECK ===');
const tiny = db.prepare('SELECT id, title, word_count FROM scenes WHERE word_count < 200 ORDER BY word_count').all() as any[];
const huge = db.prepare('SELECT id, title, word_count FROM scenes WHERE word_count > 8000 ORDER BY word_count DESC').all() as any[];

if (tiny.length) {
  console.log(`\nWARNING: ${tiny.length} scenes under 200 words (may need merging):`);
  for (const s of tiny) console.log(`  #${s.id} "${s.title}" — ${s.word_count}w`);
}
if (huge.length) {
  console.log(`\nWARNING: ${huge.length} scenes over 8,000 words (may need further splitting):`);
  for (const s of huge) console.log(`  #${s.id} "${s.title}" — ${s.word_count.toLocaleString()}w`);
}

db.close();
console.log('\nDone.');
