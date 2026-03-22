import * as d3 from 'd3';

type GraphNode = {
  id: number;
  title: string;
  kind: string;
  conviction: number;
  provenance: string;
};

type GraphLink = {
  source_id?: number;
  target_id?: number;
  source: number | GraphNode;
  target: number | GraphNode;
  kind: string;
  label?: string;
};

type GraphPayload = {
  nodes: GraphNode[];
  links: GraphLink[];
  legend: { kind: string; count: number }[];
};

export class GraphPanel {
  private host: HTMLElement;
  private el: HTMLElement;
  private svgEl: SVGSVGElement;
  private listEl: HTMLElement;
  private thresholdEl: HTMLInputElement;
  private thresholdLabelEl: HTMLElement;
  private loaded = false;
  private active = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'graph-panel hidden';
    this.el.innerHTML = `
      <aside class="graph-side">
        <div class="graph-title">Heap Graph</div>
        <div class="graph-subtitle">Pieces + associations, colored by link kind.</div>
        <label class="graph-control">
          <span>min conviction</span>
          <input data-role="threshold" type="range" min="0" max="100" value="0" />
          <span data-role="threshold-label">0</span>
        </label>
        <div class="graph-legend" data-role="legend"></div>
        <div class="graph-tip">Click node to open in editor.</div>
      </aside>
      <section class="graph-canvas-wrap">
        <svg data-role="svg"></svg>
      </section>
    `;

    this.svgEl = this.el.querySelector('[data-role="svg"]') as SVGSVGElement;
    this.listEl = this.el.querySelector('[data-role="legend"]') as HTMLElement;
    this.thresholdEl = this.el.querySelector('[data-role="threshold"]') as HTMLInputElement;
    this.thresholdLabelEl = this.el.querySelector('[data-role="threshold-label"]') as HTMLElement;
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
    if (this.loaded) {
      d3.select(this.svgEl).selectAll('*').remove();
      this.loaded = false;
    }
  }

  private async render() {
    const min = Number(this.thresholdEl.value || '0');
    const payload = await this.fetchPayload(min);
    this.draw(payload);
  }

  private async fetchPayload(minConviction: number): Promise<GraphPayload> {
    const res = await fetch(`/api/heap/graph?min_conviction=${encodeURIComponent(String(minConviction))}`);
    return res.json();
  }

  private draw(payload: GraphPayload) {
    const svg = d3.select(this.svgEl);
    svg.selectAll('*').remove();
    this.loaded = true;

    const width = this.svgEl.clientWidth || 900;
    const height = this.svgEl.clientHeight || 700;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const colorByKind = new Map<string, string>();
    const palette = ['#3fa7ff', '#895cdb', '#dc6a21', '#bad39d', '#f4cc70', '#b38cff', '#9aa4ff'];
    payload.legend.forEach((item, idx) => colorByKind.set(item.kind, palette[idx % palette.length]));

    this.listEl.innerHTML = payload.legend
      .map((item) => `<div class="graph-legend-item"><span class="graph-dot" style="background:${colorByKind.get(item.kind) || '#666'}"></span>${item.kind} (${item.count})</div>`)
      .join('');

    const nodes = payload.nodes.map((n) => ({ ...n }));
    const links = payload.links.map((l) => ({
      ...l,
      source: Number((l as any).source_id ?? l.source),
      target: Number((l as any).target_id ?? l.target),
    }));

    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on('zoom', (event: any) => g.attr('transform', event.transform)));

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(60).strength(0.2))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => 4 + Math.max(0, d.conviction / 25)));

    const link = g.append('g')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links as any)
      .join('line')
      .attr('stroke', (d: any) => colorByKind.get(d.kind) || '#666')
      .attr('stroke-width', 1.3);

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes as any)
      .join('circle')
      .attr('r', (d: any) => 4 + Math.max(0, d.conviction / 20))
      .attr('fill', (d: any) => d.provenance === 'GOLD' ? '#f4cc70' : '#2f9bfa')
      .attr('stroke', '#111')
      .attr('stroke-width', 1.2)
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: any) => {
        window.dispatchEvent(new CustomEvent('heap:open-piece', { detail: { id: d.id } }));
      })
      .append('title')
      .text((d: any) => `${d.title || '(untitled)'}\nkind:${d.kind} conviction:${d.conviction}`);

    const drag = d3.drag<any, any>()
      .on('start', (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
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
    g.selectAll('circle').call(drag as any);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      g.selectAll('circle')
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);
    });
  }
}
