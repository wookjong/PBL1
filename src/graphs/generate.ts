import type { Edge, Graph } from '../algo/graph';

export interface Point {
  x: number;
  y: number;
}

/** A graph whose nodes have coordinates. Coordinates are what make a straight-line heuristic possible. */
export interface GeoGraph extends Graph {
  pos: Point[];
  edges: { u: number; v: number; w: number; slow: boolean }[];
  width: number;
  height: number;
  /** Cost 1 per `unit` of coordinate distance. Every edge costs at least (straight-line length / unit). */
  unit: number;
  start: number;
  goal: number;
  labels: string[];
}

export interface GeoGraphOptions {
  n: number; // desired number of nodes (may end up smaller if space runs out)
  width: number;
  height: number;
  margin: number;
  minDist: number; // minimum distance between nodes
  k: number; // try to connect each node to its k nearest neighbors
  unit: number;
  clearance: number; // skip an edge if it passes closer than this to another node
  slowProb: number; // probability that an edge is "congested" (more expensive)
  slowMin: number; // cost multiplier range for congested edges
  slowMax: number;
  seed: number; // same seed → always the same graph
}

/** Seeded random number generator (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

function pointSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Scatters nodes on a plane and connects them into a map-like graph.
 * 1) A minimum spanning tree (MST) guarantees connectivity
 * 2) Edges to the k nearest neighbors are added (skipped if they cross an existing edge → planar graph)
 */
export function makeGeoGraph(o: GeoGraphOptions): GeoGraph {
  const rand = mulberry32(o.seed);

  // 1. Place nodes (random sampling that respects the minimum distance)
  const pos: Point[] = [];
  for (let attempts = 0; pos.length < o.n && attempts < o.n * 300; attempts++) {
    const p = {
      x: o.margin + rand() * (o.width - 2 * o.margin),
      y: o.margin + rand() * (o.height - 2 * o.margin),
    };
    if (pos.every((q) => dist(p, q) >= o.minDist)) pos.push(p);
  }
  const n = pos.length;

  const pairs: [number, number][] = [];
  const has = new Set<string>();
  const key = (u: number, v: number) => (u < v ? `${u}-${v}` : `${v}-${u}`);
  const add = (u: number, v: number) => {
    has.add(key(u, v));
    pairs.push([u, v]);
  };

  // 2. MST (Prim, O(n^2)) — a Euclidean MST has no crossing edges
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  best[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let v = 0; v < n; v++) if (!inTree[v] && (u === -1 || best[v] < best[u])) u = v;
    inTree[u] = 1;
    if (parent[u] !== -1) add(parent[u], u);
    for (let v = 0; v < n; v++) {
      const d = dist(pos[u], pos[v]);
      if (!inTree[v] && d < best[v]) {
        best[v] = d;
        parent[v] = u;
      }
    }
  }

  // 3. k-nearest-neighbor edges (shortest first; skipped if they cross an edge or pass through a node)
  const cands: [number, number, number][] = [];
  for (let u = 0; u < n; u++) {
    const near = [...Array(n).keys()]
      .filter((v) => v !== u)
      .sort((a, b) => dist(pos[u], pos[a]) - dist(pos[u], pos[b]))
      .slice(0, o.k);
    for (const v of near) cands.push([u, v, dist(pos[u], pos[v])]);
  }
  cands.sort((a, b) => a[2] - b[2]);
  for (const [u, v] of cands) {
    if (has.has(key(u, v))) continue;
    const a = pos[u];
    const b = pos[v];
    const crosses = pairs.some(([x, y]) => x !== u && x !== v && y !== u && y !== v && segmentsCross(a, b, pos[x], pos[y]));
    if (crosses) continue;
    let tooClose = false;
    for (let w = 0; w < n && !tooClose; w++) {
      if (w !== u && w !== v && pointSegmentDist(pos[w], a, b) < o.clearance) tooClose = true;
    }
    if (tooClose) continue;
    add(u, v);
  }

  // 4. Weights: ceil(straight-line length / unit × multiplier). The multiplier is ≥ 1, so the straight-line heuristic is always admissible.
  const adj: Edge[][] = Array.from({ length: n }, () => []);
  const edges = pairs.map(([u, v]) => {
    const slow = rand() < o.slowProb;
    const factor = slow ? o.slowMin + rand() * (o.slowMax - o.slowMin) : 1;
    const w = Math.max(1, Math.ceil((dist(pos[u], pos[v]) / o.unit) * factor));
    adj[u].push({ to: v, w });
    adj[v].push({ to: u, w });
    return { u, v, w, slow };
  });

  // 5. Start = leftmost node, goal = rightmost node (preferring ones near the vertical middle)
  const score = (p: Point) => Math.abs(p.y - o.height / 2) * 0.5;
  let start = 0;
  let goal = 0;
  for (let v = 0; v < n; v++) {
    if (pos[v].x + score(pos[v]) < pos[start].x + score(pos[start])) start = v;
    if (pos[v].x - score(pos[v]) > pos[goal].x - score(pos[goal])) goal = v;
  }

  const labels = pos.map((_, i) => (n <= 26 ? String.fromCharCode(65 + i) : String(i)));

  return { n, adj, pos, edges, width: o.width, height: o.height, unit: o.unit, start, goal, labels };
}

/**
 * A hand-made 5-node graph for following the algorithm by hand.
 * Dijkstra on it uses every queue operation once: insert, decreaseKey (C: 25 → 22), a relax that changes nothing (C → D),
 * and — with the lazy heap — one stale entry (the old C:25) popped and discarded.
 * Coordinates are chosen so the straight-line heuristic (distance / 20) never exceeds the true cost.
 */
export function tinyGraph(): GeoGraph {
  const pos: Point[] = [
    { x: 60, y: 200 }, // A
    { x: 220, y: 90 }, // B
    { x: 220, y: 310 }, // C
    { x: 400, y: 200 }, // D
    { x: 560, y: 200 }, // E
  ];
  const list: [number, number, number, boolean][] = [
    [0, 1, 10, false],
    [0, 2, 25, true], // much more expensive than its length → "congested"
    [1, 2, 12, false],
    [1, 3, 13, false],
    [2, 3, 11, false],
    [3, 4, 8, false],
  ];
  const adj: Edge[][] = pos.map(() => []);
  const edges = list.map(([u, v, w, slow]) => {
    adj[u].push({ to: v, w });
    adj[v].push({ to: u, w });
    return { u, v, w, slow };
  });
  return { n: 5, adj, pos, edges, width: 620, height: 380, unit: 20, start: 0, goal: 4, labels: ['A', 'B', 'C', 'D', 'E'] };
}
