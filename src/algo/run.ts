import type { PQStats, PriorityQueue } from './heap';
import type { SearchGenerator, Step } from './graph';

export const NodeState = {
  None: 0,
  Frontier: 1, // currently in the queue
  Closed: 2, // settled (visited)
} as const;

const ZERO_STATS: PQStats = { push: 0, pop: 0, decrease: 0, comps: 0, swaps: 0, maxSize: 0 };

/**
 * Wraps an algorithm generator and accumulates what the screen needs (node states, stats, path).
 *  - expand(): advance until one node is settled, so several algorithms can be compared at the same pace
 *  - stepOp(): advance exactly one operation (used by the "inside the algorithm" view)
 */
export class SearchRun {
  readonly state: Uint8Array;
  readonly g: Float64Array; // best known cost from the start so far
  readonly f: Float64Array; // priority value when pushed onto the queue (equals g for Dijkstra)
  visitedCount = 0;
  pushCount = 0;
  staleCount = 0;
  opCount = 0;
  current = -1;
  path: number[] = [];
  cost = Infinity;
  finished = false;
  found = false;
  last: Step | null = null; // the most recent operation
  pq: PriorityQueue<number> | null = null;

  constructor(
    n: number,
    private gen: SearchGenerator,
  ) {
    this.state = new Uint8Array(n);
    this.g = new Float64Array(n).fill(Infinity);
    this.f = new Float64Array(n).fill(Infinity);
  }

  get pqStats(): PQStats {
    return this.pq?.stats ?? ZERO_STATS;
  }

  /** Advance one operation. Returns the step, or null once the search is over. */
  stepOp(): Step | null {
    if (this.finished) return null;
    const r = this.gen.next();
    if (r.done) {
      this.finished = true;
      return null;
    }
    const step = r.value;
    this.last = step;
    this.opCount++;
    switch (step.type) {
      case 'init':
        this.pq = step.pq;
        this.pushCount++;
        this.g[step.node] = step.g;
        this.f[step.node] = step.f;
        this.state[step.node] = NodeState.Frontier;
        break;
      case 'push':
        this.pushCount++;
        this.g[step.node] = step.g;
        this.f[step.node] = step.f;
        if (this.state[step.node] === NodeState.None) this.state[step.node] = NodeState.Frontier;
        break;
      case 'visit':
        this.state[step.node] = NodeState.Closed;
        this.visitedCount++;
        this.current = step.node;
        break;
      case 'stale':
        this.staleCount++;
        break;
      case 'relax':
        break;
      case 'done':
        this.path = step.path;
        this.cost = step.cost;
        this.found = true;
        this.finished = true;
        this.current = -1;
        break;
      case 'fail':
        this.finished = true;
        this.current = -1;
        break;
    }
    return step;
  }

  /** Advance until a node is settled or the search ends. Returns true while the search is still running. */
  expand(): boolean {
    for (;;) {
      const step = this.stepOp();
      if (!step) return false;
      if (step.type === 'visit') return true;
      if (this.finished) return false;
    }
  }

  runToEnd(): void {
    while (this.expand());
  }
}
