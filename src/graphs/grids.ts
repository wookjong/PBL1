import type { Edge, Graph, Heuristic } from '../algo/graph';
import { mulberry32 } from './generate';

/** 4-directional grid shared by the grid tab and the analysis tab. Rows/columns must be odd for the maze generator. */
export const ROWS = 25;
export const COLS = 49;

export const EMPTY = 0;
export const WALL = 1;
export const MUD = 2;
export const MUD_COST = 5;

export const idx = (r: number, c: number, cols = COLS) => r * cols + c;

export interface GridSpec {
  rows: number;
  cols: number;
  cells: Uint8Array;
  start: number;
  goal: number;
}

export function emptyGrid(rows = ROWS, cols = COLS): GridSpec {
  const r = rows >> 1;
  return { rows, cols, cells: new Uint8Array(rows * cols), start: idx(r, Math.round(cols / 6), cols), goal: idx(r, cols - 1 - Math.round(cols / 6), cols) };
}

/** Converts the grid into a general graph (adjacency list). The cost of entering a cell becomes the edge weight. */
export function gridToGraph({ rows, cols, cells }: GridSpec): Graph {
  const adj: Edge[][] = Array.from({ length: rows * cols }, () => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = r * cols + c;
      if (cells[u] === WALL) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const v = nr * cols + nc;
        if (cells[v] === WALL) continue;
        adj[u].push({ to: v, w: cells[v] === MUD ? MUD_COST : 1 });
      }
    }
  }
  return { n: rows * cols, adj };
}

export function manhattan({ cols, goal }: GridSpec): Heuristic {
  const gr = Math.floor(goal / cols);
  const gc = goal % cols;
  return (v) => Math.abs(Math.floor(v / cols) - gr) + Math.abs((v % cols) - gc);
}

export function euclid({ cols, goal }: GridSpec): Heuristic {
  const gr = Math.floor(goal / cols);
  const gc = goal % cols;
  return (v) => Math.hypot(Math.floor(v / cols) - gr, (v % cols) - gc);
}

/** Random walls (seeded, so the same picture every time) */
export function randomWalls(spec: GridSpec, density: number, seed: number): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < spec.cells.length; i++) spec.cells[i] = rand() < density ? WALL : EMPTY;
  spec.cells[spec.start] = spec.cells[spec.goal] = EMPTY;
}

/** Recursive-backtracker maze with some walls knocked out to create loops. rand = Math.random for a new maze each time. */
export function maze(spec: GridSpec, rand: () => number): void {
  const { rows, cols, cells } = spec;
  const at = (r: number, c: number) => r * cols + c;
  cells.fill(WALL);
  const stack: [number, number][] = [[1, 1]];
  cells[at(1, 1)] = EMPTY;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[-2, 0], [2, 0], [0, -2], [0, 2]]
      .map(([dr, dc]) => [r + dr, c + dc] as [number, number])
      .filter(([nr, nc]) => nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && cells[at(nr, nc)] === WALL);
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const [nr, nc] = next[Math.floor(rand() * next.length)];
    cells[at((r + nr) / 2, (c + nc) / 2)] = EMPTY;
    cells[at(nr, nc)] = EMPTY;
    stack.push([nr, nc]);
  }
  // Knock out some walls to create loops (multiple routes) → the choice of path actually matters
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = at(r, c);
      if (cells[i] !== WALL || rand() > 0.1) continue;
      const horiz = cells[at(r, c - 1)] !== WALL && cells[at(r, c + 1)] !== WALL;
      const vert = cells[at(r - 1, c)] !== WALL && cells[at(r + 1, c)] !== WALL;
      if (horiz || vert) cells[i] = EMPTY;
    }
  }
  // Snap start/goal to the nearest room cell
  const snap = (v: number) => at(Math.min(Math.floor(v / cols) | 1, rows - 2), Math.min((v % cols) | 1, cols - 2));
  spec.start = snap(spec.start);
  spec.goal = snap(spec.goal);
}

/** A U-shaped wall around the start, closed on the goal side: the heuristic lures A* into a dead end */
export function uTrap(spec: GridSpec): void {
  const { cells, cols } = spec;
  const r0 = spec.rows >> 1;
  cells.fill(EMPTY);
  spec.start = idx(r0, 12, cols);
  spec.goal = idx(r0, 40, cols);
  for (let r = r0 - 8; r <= r0 + 8; r++) cells[idx(r, 20, cols)] = WALL;
  for (let c = 8; c <= 20; c++) {
    cells[idx(r0 - 8, c, cols)] = WALL;
    cells[idx(r0 + 8, c, cols)] = WALL;
  }
}

/** A closed ring of walls around the goal: there is no path at all */
export function enclosedGoal(spec: GridSpec): void {
  const { cells, cols } = spec;
  const gr = Math.floor(spec.goal / cols);
  const gc = spec.goal % cols;
  for (let r = gr - 3; r <= gr + 3; r++) {
    for (let c = gc - 3; c <= gc + 3; c++) {
      if (Math.max(Math.abs(r - gr), Math.abs(c - gc)) === 3) cells[idx(r, c, cols)] = WALL;
    }
  }
}

/** A long wall between start and goal with a single gap at the far end: the true path is much longer than h says */
export function longWall(spec: GridSpec): void {
  const { cells, cols, rows } = spec;
  const c = cols >> 1;
  for (let r = 0; r < rows - 1; r++) cells[idx(r, c, cols)] = WALL;
}

export function cloneGrid(s: GridSpec): GridSpec {
  return { ...s, cells: s.cells.slice() };
}

/** Empty grid with start and goal in opposite corners: many cells share the same f, so tie-breaking matters */
export function diagonalGrid(rows = ROWS, cols = COLS): GridSpec {
  return { rows, cols, cells: new Uint8Array(rows * cols), start: idx(3, 4, cols), goal: idx(rows - 4, cols - 5, cols) };
}
