import type { Graph, Heuristic, SearchGenerator } from './graph';
import { bestFirstSearch, type SearchOptions } from './search';

export type AStarOptions = Omit<SearchOptions, 'h'>;

/**
 * A* search.
 * Settles the node with the smallest f(v) = g(v) + h(v) first.
 *  - If h never exceeds the true remaining cost (admissible), the shortest path is guaranteed.
 *  - If h overestimates, the search may finish sooner but the shortest path is not guaranteed.
 *  - With h = 0 it behaves exactly like Dijkstra.
 *  - tieBreakByH (default on): when f values are equal, pop the smaller h first. On 4-directional
 *    grids, where f ties are extremely common, this has a big effect on how many nodes are explored.
 */
export function astar(graph: Graph, start: number, goal: number, h: Heuristic, options: AStarOptions = {}): SearchGenerator {
  return bestFirstSearch(graph, start, goal, { ...options, h });
}
