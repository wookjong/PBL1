/** Shared graph types. Both general graphs and grids are converted to this form before running an algorithm. */
import type { PQTrace, PriorityQueue } from './heap';

export interface Edge {
  to: number;
  w: number; // edge weight (must be non-negative)
}

export interface Graph {
  n: number; // number of nodes (nodes are numbered 0 to n-1)
  adj: Edge[][]; // adjacency list
}

/** Heuristic: estimated remaining cost from node v to the goal */
export type Heuristic = (v: number) => number;

/**
 * Events an algorithm emits one at a time (one event = one operation).
 * The visualization only looks at these events to draw the screen (algorithm and rendering are decoupled).
 * `heap` is what the priority queue did during that operation.
 */
export type Step =
  | { type: 'init'; node: number; g: number; f: number; pq: PriorityQueue<number>; heap: PQTrace | null } // start pushed
  | { type: 'visit'; node: number; g: number; key: number; tieBroken: boolean; heap: PQTrace | null } // deletemin → settled
  | { type: 'stale'; node: number; key: number; heap: PQTrace | null } // deletemin returned an outdated copy → skipped
  | { type: 'relax'; from: number; node: number; w: number; result: 'closed' | 'noImprove'; ng: number; old: number } // edge checked, nothing changed
  | { type: 'push'; from: number; node: number; w: number; g: number; f: number; old: number; mode: 'insert' | 'decrease' | 'reinsert'; heap: PQTrace | null } // shorter path → queue updated
  | { type: 'done'; path: number[]; cost: number; early: boolean; left: number } // goal settled
  | { type: 'fail' }; // no path exists

export type SearchGenerator = Generator<Step, void, unknown>;

/** Follows the prev array backwards to build the start → goal path. */
export function reconstructPath(prev: Int32Array, goal: number): number[] {
  const path: number[] = [];
  for (let v = goal; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}
