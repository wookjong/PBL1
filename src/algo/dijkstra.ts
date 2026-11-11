import type { Graph, SearchGenerator } from './graph';
import { bestFirstSearch, type SearchOptions } from './search';

/**
 * Dijkstra's algorithm.
 * Settles the node with the smallest distance g from the start first.
 * It is the shared best-first loop in search.ts with h = 0.
 */
export function dijkstra(
  graph: Graph,
  start: number,
  goal: number,
  options: Omit<SearchOptions, 'h' | 'tieBreakByH'> = {},
): SearchGenerator {
  return bestFirstSearch(graph, start, goal, { ...options, tieBreakByH: false });
}
