import { NodeState, type SearchRun } from '../algo/run';
import type { GeoGraph } from '../graphs/generate';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface GraphViewOptions {
  nodeR: number; // node radius (in viewBox units)
  showLabels: boolean; // node names (A, B, ...)
  showWeights: boolean; // edge weights
  showValues: boolean; // show the f value under each node
}

export const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

/** Draws a coordinate graph as SVG and recolors it according to a SearchRun's state. */
export class GraphView {
  readonly el: SVGSVGElement;
  private nodeEls: SVGCircleElement[] = [];
  private valueEls: SVGTextElement[] = [];
  private edgeEls = new Map<string, SVGLineElement>();
  private nodeClass: string[] = [];
  private valueText: string[] = [];
  private pathEdgeKeys: string[] = [];
  private activeEdge: SVGLineElement | null = null;
  private focusRing: SVGCircleElement;

  constructor(
    private g: GeoGraph,
    private opts: GraphViewOptions,
  ) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    svg.classList.add('graph-svg');
    this.el = svg;

    const edgeLayer = el('g', {}, svg);
    const weightLayer = el('g', { class: 'weights' }, svg);
    const nodeLayer = el('g', {}, svg);
    const labelLayer = el('g', { class: 'labels' }, svg);
    this.focusRing = el('circle', { r: opts.nodeR + Math.max(3, opts.nodeR * 0.35), class: 'focus-ring', visibility: 'hidden' }, svg);

    for (const { u, v, w, slow } of g.edges) {
      const a = g.pos[u];
      const b = g.pos[v];
      const line = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: slow ? 'edge slow' : 'edge' }, edgeLayer);
      this.edgeEls.set(this.key(u, v), line);
      if (opts.showWeights) {
        const t = el('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, class: slow ? 'weight slow' : 'weight' }, weightLayer);
        t.textContent = String(w);
      }
    }

    for (let v = 0; v < g.n; v++) {
      const p = g.pos[v];
      this.nodeEls.push(el('circle', { cx: p.x, cy: p.y, r: opts.nodeR }, nodeLayer));
      this.nodeClass.push('');
      if (opts.showLabels) {
        const t = el('text', { x: p.x, y: p.y, class: 'node-label' }, labelLayer);
        t.textContent = g.labels[v];
      }
      if (opts.showValues) {
        const t = el('text', { x: p.x, y: p.y + opts.nodeR + 11, class: 'node-value' }, labelLayer);
        this.valueEls.push(t);
        this.valueText.push('');
      }
    }
  }

  private key(u: number, v: number) {
    return u < v ? `${u}-${v}` : `${v}-${u}`;
  }

  /** Highlights the edge (u, v) currently being relaxed; pass -1 to clear. `kind` is a CSS class (improve / noimprove / closed). */
  setActiveEdge(u: number, v: number, kind = ''): void {
    this.activeEdge?.classList.remove('active', 'improve', 'noimprove', 'closed');
    this.activeEdge = u < 0 ? null : (this.edgeEls.get(this.key(u, v)) ?? null);
    if (this.activeEdge) this.activeEdge.classList.add('active', ...(kind ? [kind] : []));
  }

  /** Draws a ring around the node the current operation is about; pass -1 to hide it */
  setFocus(v: number): void {
    if (v < 0) {
      this.focusRing.setAttribute('visibility', 'hidden');
      return;
    }
    const p = this.g.pos[v];
    this.focusRing.setAttribute('cx', String(p.x));
    this.focusRing.setAttribute('cy', String(p.y));
    this.focusRing.setAttribute('visibility', 'visible');
  }

  render(run: SearchRun): void {
    const onPath = new Set(run.path);
    for (let v = 0; v < this.g.n; v++) {
      let cls = 'node';
      const s = run.state[v];
      if (s === NodeState.Frontier) cls += ' frontier';
      else if (s === NodeState.Closed) cls += ' closed';
      if (onPath.has(v)) cls += ' on-path';
      if (v === run.current) cls += ' current';
      if (v === this.g.start) cls += ' start';
      if (v === this.g.goal) cls += ' goal';
      if (cls !== this.nodeClass[v]) {
        this.nodeClass[v] = cls;
        this.nodeEls[v].setAttribute('class', cls);
      }
      if (this.opts.showValues) {
        const text = s !== NodeState.None ? `f=${fmt(run.f[v])}` : '';
        if (text !== this.valueText[v]) {
          this.valueText[v] = text;
          this.valueEls[v].textContent = text;
        }
      }
    }

    const keys: string[] = [];
    for (let i = 0; i + 1 < run.path.length; i++) keys.push(this.key(run.path[i], run.path[i + 1]));
    if (keys.join() !== this.pathEdgeKeys.join()) {
      for (const k of this.pathEdgeKeys) this.edgeEls.get(k)?.classList.remove('on-path');
      for (const k of keys) this.edgeEls.get(k)?.classList.add('on-path');
      this.pathEdgeKeys = keys;
    }
  }
}
