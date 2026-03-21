export interface AnalysisScene {
  id: number;
  movement: string;
  scene_number: number;
  title: string;
  story_arc: string;
  status?: string | null;
  word_count?: number;
  hook?: string | null;
  motivation?: string | null;
  theme?: string | null;
  provenance: string | null;
  provenance_meta?: string | null;
}

export interface GraphLink {
  source: number;
  target: number;
  order: string;
}

export interface GoldSequence {
  story_arc: string;
  startSceneNumber: number;
  endSceneNumber: number;
  count: number;
  sceneIds: number[];
}

function storyArcLabel(storyArc: string): string {
  return `story-arc-${storyArc.toLowerCase()}`;
}

export function buildGoldSanity(scenes: AnalysisScene[]) {
  const gold = scenes
    .filter((s) => (s.provenance || 'GOLD') === 'GOLD')
    .sort((a, b) => {
      const t = a.story_arc.localeCompare(b.story_arc);
      if (t !== 0) return t;
      return a.scene_number - b.scene_number;
    });

  const byStoryArc = new Map<string, AnalysisScene[]>();
  for (const scene of gold) {
    const key = storyArcLabel(scene.story_arc);
    if (!byStoryArc.has(key)) byStoryArc.set(key, []);
    byStoryArc.get(key)!.push(scene);
  }

  const sequences: GoldSequence[] = [];
  const orphanSceneIds: number[] = [];

  for (const [story_arc, list] of byStoryArc.entries()) {
    if (list.length === 0) continue;
    let run: AnalysisScene[] = [list[0]];

    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      if (curr.scene_number === prev.scene_number + 1) {
        run.push(curr);
      } else {
        sequences.push({
          story_arc,
          startSceneNumber: run[0].scene_number,
          endSceneNumber: run[run.length - 1].scene_number,
          count: run.length,
          sceneIds: run.map((r) => r.id),
        });
        if (run.length === 1) orphanSceneIds.push(run[0].id);
        run = [curr];
      }
    }

    sequences.push({
      story_arc,
      startSceneNumber: run[0].scene_number,
      endSceneNumber: run[run.length - 1].scene_number,
      count: run.length,
      sceneIds: run.map((r) => r.id),
    });
    if (run.length === 1) orphanSceneIds.push(run[0].id);
  }

  const multiSceneSequences = sequences.filter((s) => s.count > 1);

  return {
    totalGoldScenes: gold.length,
    storyArcCount: byStoryArc.size,
    sequences,
    contiguousSequences: multiSceneSequences,
    orphanSceneIds,
  };
}

type HeroicCyclePoint = {
  sceneId: number;
  sceneNumber: number;
  title: string;
  story_arc: string;
  index: number;
  intensity: number;
  expected: number;
  delta: number;
  notes: string[];
};

function interpolateTemplate(size: number, template: number[]): number[] {
  if (size <= 0) return [];
  if (size === 1) return [template[0]];
  const out: number[] = [];
  const last = template.length - 1;
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * last;
    const low = Math.floor(t);
    const high = Math.min(last, Math.ceil(t));
    const alpha = t - low;
    out.push(template[low] * (1 - alpha) + template[high] * alpha);
  }
  return out;
}

function clamp(min: number, max: number, val: number) {
  return Math.max(min, Math.min(max, val));
}

function scoreSceneIntensity(scene: AnalysisScene, degree: number): { score: number; notes: string[] } {
  const notes: string[] = [];
  const statusScore: Record<string, number> = {
    BLANK: 14,
    OUTLINED: 28,
    DRAFTED: 46,
    POLISHED: 64,
    FINAL: 76,
  };
  let score = statusScore[String(scene.status || 'BLANK')] ?? 20;
  notes.push(`status:${String(scene.status || 'BLANK').toLowerCase()}`);

  const prov = scene.provenance || 'GOLD';
  if (prov === 'EXTRAPOLATED') {
    score += 10;
    notes.push('bridge-provenance:+10');
  } else if (prov === 'EDITED') {
    score += 6;
    notes.push('edited-provenance:+6');
  } else {
    score += 2;
    notes.push('gold-provenance:+2');
  }

  if (scene.hook) {
    score += 7;
    notes.push('hook:+7');
  }
  if (scene.motivation) {
    score += 4;
    notes.push('motivation:+4');
  }
  if (scene.theme) {
    score += 3;
    notes.push('theme:+3');
  }

  const wc = Number(scene.word_count || 0);
  const wcBoost = Math.round(clamp(0, 1, wc / 1200) * 8);
  score += wcBoost;
  if (wcBoost > 0) notes.push(`wordcount:+${wcBoost}`);

  const degreeBoost = Math.round(clamp(0, 1, degree / 4) * 12);
  score += degreeBoost;
  if (degreeBoost > 0) notes.push(`connectivity:+${degreeBoost}`);

  return { score: clamp(10, 95, score), notes };
}

export function buildHeroicCycle(scenes: AnalysisScene[], links: GraphLink[]) {
  const byStoryArc = new Map<string, AnalysisScene[]>();
  for (const s of scenes) {
    const key = storyArcLabel(s.story_arc);
    if (!byStoryArc.has(key)) byStoryArc.set(key, []);
    byStoryArc.get(key)!.push(s);
  }

  const degree = new Map<number, number>();
  for (const s of scenes) degree.set(s.id, 0);
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) || 0) + 1);
    degree.set(l.target, (degree.get(l.target) || 0) + 1);
  }

  const heroicTemplate = [20, 30, 48, 62, 78, 88, 70, 54, 68, 82, 64];
  const curves: Record<string, HeroicCyclePoint[]> = {};
  const missingByArc: Record<string, string[]> = {};

  for (const [arc, list] of byStoryArc.entries()) {
    const ordered = [...list].sort((a, b) => a.scene_number - b.scene_number);
    const expected = interpolateTemplate(ordered.length, heroicTemplate);
    const points: HeroicCyclePoint[] = ordered.map((scene, idx) => {
      const scored = scoreSceneIntensity(scene, degree.get(scene.id) || 0);
      const delta = Math.round(scored.score - expected[idx]);
      return {
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        title: scene.title,
        story_arc: arc,
        index: idx,
        intensity: scored.score,
        expected: Math.round(expected[idx]),
        delta,
        notes: scored.notes,
      };
    });

    const missing: string[] = [];
    const firstThird = points.slice(0, Math.max(1, Math.floor(points.length / 3)));
    const midThird = points.slice(Math.floor(points.length / 3), Math.floor((2 * points.length) / 3));
    const endThird = points.slice(Math.floor((2 * points.length) / 3));

    if (firstThird.every((p) => p.delta < -12)) missing.push('weak-setup-call-to-adventure');
    if (midThird.length > 0 && midThird.every((p) => p.delta < -14)) missing.push('weak-ordeal-climax-build');
    if (endThird.length > 0 && endThird.every((p) => p.delta < -10)) missing.push('weak-return-integration');

    curves[arc] = points;
    missingByArc[arc] = missing;
  }

  return {
    model: 'heroic-cycle-v1',
    explanation: 'Intensity is estimated from status maturity, provenance role, scene connectivity, and authored signal fields (hook/motivation/theme), then compared against a normalized Heroic Cycle expectation curve.',
    axes: {
      x: 'Scene order inside selected story arc',
      y: 'Estimated dramatic intensity (0-100)',
    },
    curves,
    missingByArc,
  };
}

export function buildStoryHealth(scenes: AnalysisScene[], links: GraphLink[]) {
  const nodeIds = new Set(scenes.map((s) => s.id));
  const inbound = new Map<number, number>();
  const outbound = new Map<number, number>();
  for (const id of nodeIds) {
    inbound.set(id, 0);
    outbound.set(id, 0);
  }

  for (const link of links) {
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) continue;
    outbound.set(link.source, (outbound.get(link.source) || 0) + 1);
    inbound.set(link.target, (inbound.get(link.target) || 0) + 1);
  }

  const orphans = scenes
    .filter((s) => (inbound.get(s.id) || 0) === 0 && (outbound.get(s.id) || 0) === 0)
    .map((s) => ({ id: s.id, title: s.title, story_arc: storyArcLabel(s.story_arc) }));

  const weaklyConnected = scenes
    .filter((s) => (inbound.get(s.id) || 0) + (outbound.get(s.id) || 0) <= 1)
    .map((s) => ({ id: s.id, title: s.title, story_arc: storyArcLabel(s.story_arc) }));

  const extrapolatedWithoutBridge = scenes
    .filter((s) => (s.provenance || 'GOLD') === 'EXTRAPOLATED')
    .filter((s) => {
      if (!s.provenance_meta) return true;
      try {
        const meta = JSON.parse(s.provenance_meta);
        return !(Number.isFinite(Number(meta.follows_scene_id)) && Number.isFinite(Number(meta.precedes_scene_id)));
      } catch {
        return true;
      }
    })
    .map((s) => ({ id: s.id, title: s.title, story_arc: storyArcLabel(s.story_arc) }));

  const heroicCycle = buildHeroicCycle(scenes, links);

  return {
    totalScenes: scenes.length,
    totalLinks: links.length,
    strongSignals: {
      connectedScenes: scenes.length - orphans.length,
      contiguousGoldSequences: buildGoldSanity(scenes).contiguousSequences.length,
    },
    weakSignals: {
      orphanScenes: orphans.length,
      weaklyConnectedScenes: weaklyConnected.length,
      extrapolatedWithoutBridge: extrapolatedWithoutBridge.length,
    },
    details: {
      orphans,
      weaklyConnected,
      extrapolatedWithoutBridge,
    },
    heroicCycle,
  };
}
