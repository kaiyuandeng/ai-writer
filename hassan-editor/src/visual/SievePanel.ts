import * as d3 from 'd3';

type Node = {
  id: number;
  title: string;
  kind: string;
  conviction: number;
  provenance: string;
};

type Link = {
  source: number | Node;
  target: number | Node;
  source_id?: number;
  target_id?: number;
  kind: string;
};

type SievePayload = {
  threshold: number;
  nodes: Node[];
  links: Link[];
  orphanCount: number;
};

export class SievePanel {
  private host: HTMLElement;
  private el: HTMLElement;
  private svgEl: SVGSVGElement;
  private thresholdEl: HTMLInputElement;
  private thresholdLabelEl: HTMLElement;
  private statsEl: HTMLElement;
  private active = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'sieve-panel hidden';
    this.el.innerHTML = `
      <aside class="sieve-side">
        <div class="graph-title">Sieve</div>
        <div class="graph-subtitle">High-conviction writing rises. Low-conviction sinks.</div>
        <label class="graph-control">
          <span>threshold</span>
          <input data-role="threshold" type="range" min="0" max="100" value="70" />
          <span data-role="threshold-label">70</span>
        </label>
        <div class="sieve-stats" data-role="stats"></div>
        <div class="graph-tip">Click node to open in editor.</div>
      </aside>
      <section class="graph-canvas-wrap">
        <svg data-role="svg"></svg>
      </section>
    `;

    this.svgEl = this.el.querySelector('[data-role="svg"]') as SVGSVGElement;
    this.thresholdEl = this.el.querySelector('[data-role="threshold"]') as HTMLInputElement;
    this.thresholdLabelEl = this.el.querySelector('[data-role="threshold-label"]') as HTMLElement;
    this.statsEl = this.el.querySelector('[data-role="stats"]') as HTMLElement;
    this.thresholdEl.addEventListener('input', () => {
      this.thresholdLabelEl.textContent = this.thresholdEl.value;
      if (this.active) this.render();
    });
    this.host.appendChild(this.el);
  }

  show() {
    this.active = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.active = false;
    this.el.classList.add('hidden');
    d3.select(this.svgEl).selectAll('*').remove();
  }

  private async render() {
    const threshold = Number(this.thresholdEl.value || '70');
    const res = await fetch(`/api/heap/sieve?min_conviction=${encodeURIComponent(String(threshold))}`);
    const payload = await res.json() as SievePayload;
    this.draw(payload);
  }

  private draw(payload: SievePayload) {
    const svg = d3.select(this.svgEl);
    svg.selectAll('*').remove();

    this.statsEl.innerHTML = `
      <div>${payload.nodes.length} nodes</div>
      <div>${payload.links.length} links</div>
      <div>${payload.orphanCount} orphans</div>
    `;

    const width = this.svgEl.clientWidth || 900;
    const height = this.svgEl.clientHeight || 700;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const nodes = payload.nodes.map((n) => ({ ...n }));
    const links = payload.links.map((l) => ({
      ...l,
      source: Number((l as any).source_id ?? l.source),
      target: Number((l as any).target_id ?? l.target),
    }));

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance((d: any) => 40 + Math.max(0, (100 - (d.source.conviction || 0)) / 4)).strength(0.17))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('x', d3.forceX(width / 2).strength(0.02))
      .force('y', d3.forceY((d: any) => {
        const t = Math.max(0, Math.min(100, d.conviction || 0));
        return height - (t / 100) * (height - 80) - 40;
      }).strength(0.18))
      .force('collision', d3.forceCollide().radius((d: any) => 4 + Math.max(0, d.conviction / 22)));

    const link = svg.append('g')
      .attr('stroke-opacity', 0.45)
      .selectAll('line')
      .data(links as any)
      .join('line')
      .attr('stroke', '#8a877f')
      .attr('stroke-width', 1);

    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes as any)
      .join('circle')
      .attr('r', (d: any) => 4 + Math.max(0, d.conviction / 20))
      .attr('fill', (d: any) => d.provenance === 'GOLD' ? '#f4cc70' : '#2f9bfa')
      .attr('fill-opacity', (d: any) => 0.4 + Math.min(0.6, (d.conviction || 0) / 100))
      .attr('stroke', '#111')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: any) => {
        window.dispatchEvent(new CustomEvent('heap:open-piece', { detail: { id: d.id } }));
      })
      .append('title')
      .text((d: any) => `${d.title || '(untitled)'}\nconviction:${d.conviction}`);

    const drag = d3.drag<any, any>()
      .on('start', (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    svg.selectAll('circle').call(drag as any);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      svg.selectAll('circle')
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);
    });
  }
}
