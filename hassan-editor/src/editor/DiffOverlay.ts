/**
 * Overlay that flips between GOLD (original) and latest edit.
 * Shows inline diff when toggled — no side-by-side, just a clean fade between versions.
 */

export class DiffOverlay {
  private el: HTMLElement;
  private contentEl: HTMLElement;
  private toggleEl: HTMLElement;
  private showing = false;
  private goldContent: string | null = null;
  private currentContent: string | null = null;
  private sceneId: number | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'diff-overlay';

    this.toggleEl = document.createElement('button');
    this.toggleEl.className = 'diff-toggle';
    this.toggleEl.textContent = '◇ gold';
    this.toggleEl.title = 'Toggle original gold text (⌘⇧G)';
    this.toggleEl.addEventListener('click', () => this.toggle());
    container.appendChild(this.toggleEl);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'diff-content';
    this.el.appendChild(this.contentEl);

    container.appendChild(this.el);

    // Keyboard shortcut
    window.addEventListener('keydown', (e) => {
      if (e.metaKey && e.shiftKey && e.key === 'g') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  async setScene(sceneId: number) {
    this.sceneId = sceneId;
    this.goldContent = null;
    this.showing = false;
    this.el.classList.remove('active');
    this.toggleEl.textContent = '◇ gold';

    // Fetch revisions — the oldest one with provenance GOLD is the original
    try {
      const res = await fetch(`/api/scenes/${sceneId}/revisions`);
      const revisions = await res.json() as { id: number; provenance: string }[];
      const goldRev = [...revisions].reverse().find(r => r.provenance === 'GOLD');
      if (goldRev) {
        const revRes = await fetch(`/api/revisions/${goldRev.id}`);
        const rev = await revRes.json();
        this.goldContent = rev.content;
      }
    } catch { /* no revisions yet */ }

    // Show/hide toggle based on whether gold exists
    this.toggleEl.style.display = this.goldContent ? 'block' : 'none';
  }

  setCurrentContent(content: string) {
    this.currentContent = content;
  }

  private toggle() {
    if (!this.goldContent) return;

    this.showing = !this.showing;

    if (this.showing) {
      this.el.classList.add('active');
      this.toggleEl.textContent = '◆ current';
      this.toggleEl.classList.add('diff-showing-gold');
      this.renderDiff();
    } else {
      this.el.classList.remove('active');
      this.toggleEl.textContent = '◇ gold';
      this.toggleEl.classList.remove('diff-showing-gold');
    }
  }

  private renderDiff() {
    if (!this.goldContent || !this.currentContent) return;

    const goldLines = this.goldContent.split('\n');
    const currentLines = this.currentContent.split('\n');

    // Simple line-level diff visualization
    const html = this.buildDiffHtml(goldLines, currentLines);
    this.contentEl.innerHTML = html;
  }

  private buildDiffHtml(gold: string[], current: string[]): string {
    // LCS-based diff for line-level changes
    const lcs = this.lcs(gold, current);
    const result: string[] = [];
    let gi = 0, ci = 0, li = 0;

    result.push('<div class="diff-header">');
    result.push(`<span class="diff-stat diff-stat-gold">● gold · ${gold.length} lines</span>`);
    result.push(`<span class="diff-stat diff-stat-current">◆ current · ${current.length} lines</span>`);
    result.push('</div>');

    while (gi < gold.length || ci < current.length) {
      if (li < lcs.length && gi < gold.length && ci < current.length && gold[gi] === lcs[li] && current[ci] === lcs[li]) {
        // Unchanged line
        result.push(`<div class="diff-line diff-same">${this.esc(gold[gi])}</div>`);
        gi++; ci++; li++;
      } else if (gi < gold.length && (li >= lcs.length || gold[gi] !== lcs[li])) {
        // Removed from gold
        result.push(`<div class="diff-line diff-removed">${this.esc(gold[gi])}</div>`);
        gi++;
      } else if (ci < current.length && (li >= lcs.length || current[ci] !== lcs[li])) {
        // Added in current
        result.push(`<div class="diff-line diff-added">${this.esc(current[ci])}</div>`);
        ci++;
      } else {
        break; // safety
      }
    }

    return result.join('');
  }

  private lcs(a: string[], b: string[]): string[] {
    const m = a.length, n = b.length;
    // For large files, limit to avoid perf issues
    if (m > 500 || n > 500) return [];

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const result: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1]);
        i--; j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    return result;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '&nbsp;';
  }
}
