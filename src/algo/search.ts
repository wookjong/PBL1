import { makePQ, type PQKind } from './heap';
import { reconstructPath, type Graph, type Heuristic, type SearchGenerator } from './graph';

export interface SearchOptions {
  h?: Heuristic; // remaining-cost estimate. Omitted → h = 0, which is exactly Dijkstra
  pq?: PQKind; // 'lazy' (default) | 'indexed' | 'array'
  earlyExit?: boolean; // stop as soon as the goal is settled (default true)
  tieBreakByH?: boolean; // on equal f, pop the smaller h first (default true; no effect when h = 0)
}

/**
 * Dijkstra and A* share this one loop; they differ only in the key used by the priority queue.
 *   Dijkstra : key = g(v)            A* : key = f(v) = g(v) + h(v)
 * Every `yield` is one visible operation for the visualization; the algorithm itself is the rest.
 */
export function* bestFirstSearch(graph: Graph, start: number, goal: number, opts: SearchOptions = {}): SearchGenerator {
  const { h = () => 0, pq: kind = 'lazy', earlyExit = true, tieBreakByH = true } = opts;
  const n = graph.n;
  const g = new Float64Array(n).fill(Infinity); // #init
  const prev = new Int32Array(n).fill(-1); // #init
  const closed = new Uint8Array(n); // #init
  const pq = makePQ<number>(kind); // #init
  const tie = (v: number) => (tieBreakByH ? h(v) : 0);

  g[start] = 0; // #init
  pq.push(start, h(start), tie(start)); // #init
  yield { type: 'init', node: start, g: 0, f: h(start), pq, heap: pq.takeTrace() }; // #viz

  while (pq.size > 0) { // #visit #stale
    const { item: u, key } = pq.pop()!; // deletemin #visit #stale
    if (closed[u]) { // #stale
      // lazy deletion: an older copy of u with a larger key; u was already settled → throw it away
      yield { type: 'stale', node: u, key, heap: pq.takeTrace() }; // #viz
      continue; // #stale
    }
    closed[u] = 1; // g[u] is final from here on #visit
    const next = pq.peek();
    const tieBroken = tieBreakByH && next !== undefined && next.key === key && h(next.item) > h(u);
    yield { type: 'visit', node: u, g: g[u], key, tieBroken, heap: pq.takeTrace() }; // #viz

    if (u === goal && earlyExit) { // #done
      yield { type: 'done', path: reconstructPath(prev, goal), cost: g[goal], early: true, left: pq.size }; // #viz
      return; // early exit: nothing left in the queue can give a shorter path #done
    }

    for (const { to: v, w } of graph.adj[u]) { // #relax
      if (closed[v]) { // #closed
        yield { type: 'relax', from: u, node: v, w, result: 'closed', ng: g[u] + w, old: g[v] }; // #viz
        continue; // #closed
      }
      const ng = g[u] + w; // #relax
      if (ng >= g[v]) { // #noimprove
        yield { type: 'relax', from: u, node: v, w, result: 'noImprove', ng, old: g[v] }; // #viz
        continue; // #noimprove
      }
      const old = g[v]; // #improve
      g[v] = ng; // #improve
      prev[v] = u; // #improve
      const f = ng + h(v); // #improve
      let mode: 'insert' | 'decrease' | 'reinsert' = 'insert';
      if (old === Infinity) pq.push(v, f, tie(v)); // first time v is seen #insert
      else if (pq.decreaseKey) { pq.decreaseKey(v, f, tie(v)); mode = 'decrease'; } // #decrease
      else { pq.push(v, f, tie(v)); mode = 'reinsert'; } // lazy: old copy stays in the heap #reinsert
      yield { type: 'push', from: u, node: v, w, g: ng, f, old, mode, heap: pq.takeTrace() }; // #viz
    }
  }

  if (!closed[goal]) { // queue empty and the goal never settled #fail
    yield { type: 'fail' }; // #viz
    return; // #fail
  }
  yield { type: 'done', path: reconstructPath(prev, goal), cost: g[goal], early: false, left: 0 }; // #viz
  return; // early exit off: every reachable node now has its final g #finish
}
