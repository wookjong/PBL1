import { astar } from '../algo/astar';
import { dijkstra } from '../algo/dijkstra';
import type { Graph, Heuristic, SearchGenerator } from '../algo/graph';
import { NodeState, SearchRun } from '../algo/run';
import { COLS, EMPTY, enclosedGoal, gridToGraph, maze, MUD, MUD_COST, ROWS, uTrap, WALL, type GridSpec } from '../graphs/grids';
import { num, t } from '../i18n';
import { Player } from '../ui/player';
import type { GridHeurKey } from './analysisDemo';

const CELL = 20; // cell size in canvas pixels (CSS scales the canvas to fit the screen)

const COLORS = {
  bg: '#ffffff',
  gridLine: '#e5e7eb',
  wall: '#334155',
  mud: '#e9dcc4',
  mudDot: '#a16207',
  frontier: '#bbf7d0',
  closed: '#bfdbfe',
  current: '#2563eb',
  path: '#f59e0b',
  start: '#16a34a',
  goal: '#dc2626',
};

const idx = (r: number, c: number) => r * COLS + c;
const rowOf = (i: number) => Math.floor(i / COLS);
const colOf = (i: number) => i % COLS;

interface Side {
  title: string;
  make: (graph: Graph) => SearchGenerator;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stats: HTMLElement;
  run?: SearchRun;
}

export interface GridDemoApi {
  /** Loads a grid (e.g. a worst-case scenario from the analysis tab) and runs it from the start */
  load(spec: GridSpec, heur: GridHeurKey, tieBreak: boolean): void;
}

export function mountGridDemo(root: HTMLElement): GridDemoApi {
  const cells = new Uint8Array(ROWS * COLS);
  let start = idx(12, 8);
  let goal = idx(12, 40);
  let brush = WALL;
  let heurKey: GridHeurKey = 'manhattan';
  let tieBreak = true;

  const manhattan = (v: number) => Math.abs(rowOf(v) - rowOf(goal)) + Math.abs(colOf(v) - colOf(goal));
  const heuristics: Record<GridHeurKey, { label: string; h: Heuristic }> = {
    manhattan: { label: t('맨해튼 거리 (좋음)', 'Manhattan distance (good)'), h: manhattan },
    euclid: { label: t('유클리드 거리 (조금 느슨함)', 'Euclidean distance (looser)'), h: (v) => Math.hypot(rowOf(v) - rowOf(goal), colOf(v) - colOf(goal)) },
    weak: { label: t('0.3 × 맨해튼 (약함)', '0.3 × Manhattan (weak)'), h: (v) => 0.3 * manhattan(v) },
    zero: { label: t('h = 0 (Dijkstra와 같음)', 'h = 0 (same as Dijkstra)'), h: () => 0 },
    over: { label: t('3 × 맨해튼 (과대평가)', '3 × Manhattan (overestimates)'), h: (v) => 3 * manhattan(v) },
  };

  root.innerHTML = `
    <div class="intro">
      <p>${t(
        `상하좌우로만 움직이고 칸에 들어갈 때 비용 1(진흙은 ${MUD_COST})입니다. 비용이 모두 1이면 Dijkstra는 BFS처럼 마름모꼴로 퍼지고, A*는 휴리스틱을 따라 도착점 쪽으로 향합니다.`,
        `Moves are up/down/left/right only, and entering a cell costs 1 (mud costs ${MUD_COST}). When every cost is 1, Dijkstra spreads out in a diamond just like BFS, while A* uses its heuristic to head toward the goal.`,
      )}</p>
      <p class="hint">${t(
        '빈 칸 위로 드래그하면 브러시로 칠하고, 같은 종류 칸 위로 드래그하면 지웁니다. <b>S</b>와 <b>G</b>는 드래그로 옮깁니다. 탐색을 끝까지 실행한 뒤에는 격자를 고치면 바로 다시 실행됩니다. ④ 분석 탭의 최악 사례도 ▶ 버튼으로 여기서 불러올 수 있습니다.',
        'Drag over empty cells to paint with the brush; drag over cells of the same type to erase them. Drag <b>S</b> and <b>G</b> to move them. After a search has run to the end, any edit to the grid re-runs it instantly. The worst cases in the ④ analysis tab can be loaded here with their ▶ button.',
      )}</p>
    </div>
    <div class="toolbar">
      <div class="player-slot"></div>
    </div>
    <div class="toolbar">
      <div class="group">${t('브러시', 'Brush')}
        <label><input type="radio" name="brush" value="${WALL}" checked> ${t('벽', 'Wall')}</label>
        <label><input type="radio" name="brush" value="${MUD}"> ${t('진흙', 'Mud')} (${t('비용', 'cost')} ${MUD_COST})</label>
      </div>
      <label class="select">${t('A* 휴리스틱', 'A* heuristic')}
        <select class="heur">${Object.entries(heuristics)
          .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
          .join('')}</select>
      </label>
      <label class="check"><input type="checkbox" class="tie" checked> ${t('A* tie-break: f가 같으면 h 작은 쪽 먼저', 'A* tie-break: on equal f, prefer smaller h')}</label>
      <div class="group presets">
        <button data-preset="clear">${t('지우기', 'Clear')}</button>
        <button data-preset="random">${t('랜덤 벽', 'Random walls')}</button>
        <button data-preset="maze">${t('미로', 'Maze')}</button>
        <button data-preset="trap">${t('U자 함정', 'U-shaped trap')}</button>
        <button data-preset="enclosed">${t('도달 불가', 'Unreachable goal')}</button>
      </div>
    </div>
    <div class="legend">
      <span><i class="dot start"></i>${t('시작 S', 'Start S')}</span>
      <span><i class="dot goal"></i>${t('도착 G', 'Goal G')}</span>
      <span><i class="sq wall"></i>${t('벽', 'Wall')}</span>
      <span><i class="sq mud"></i>${t('진흙', 'Mud')}</span>
      <span><i class="sq frontier"></i>${t('큐 안 (프론티어)', 'In queue')}</span>
      <span><i class="sq closed"></i>${t('확정 (방문)', 'Settled (visited)')}</span>
      <span><i class="sq path"></i>${t('찾은 경로', 'Path found')}</span>
    </div>
    <div class="panels two"></div>`;

  const panelsEl = root.querySelector<HTMLElement>('.panels')!;
  const sides: Side[] = [
    { title: 'Dijkstra', make: (G: Graph) => dijkstra(G, start, goal) },
    { title: 'A*', make: (G: Graph) => astar(G, start, goal, heuristics[heurKey].h, { tieBreakByH: tieBreak }) },
  ].map((s) => {
    const box = document.createElement('div');
    box.className = 'panel';
    box.innerHTML = `<h3>${s.title}</h3><canvas width="${COLS * CELL}" height="${ROWS * CELL}"></canvas><div class="stats"></div>`;
    panelsEl.appendChild(box);
    const canvas = box.querySelector('canvas')!;
    return { ...s, canvas, ctx: canvas.getContext('2d')!, stats: box.querySelector<HTMLElement>('.stats')! };
  });

  const buildGraph = (): Graph => gridToGraph({ rows: ROWS, cols: COLS, cells, start, goal });

  // ---------- Drawing ----------
  const draw = (side: Side) => {
    const { ctx } = side;
    const run = side.run!;
    const onPath = new Set(run.path);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    for (let i = 0; i < ROWS * COLS; i++) {
      const x = colOf(i) * CELL;
      const y = rowOf(i) * CELL;
      const type = cells[i];
      let color: string | null = null;
      if (type === WALL) color = COLORS.wall;
      else if (onPath.has(i)) color = COLORS.path;
      else if (i === run.current) color = COLORS.current;
      else if (run.state[i] === NodeState.Closed) color = COLORS.closed;
      else if (run.state[i] === NodeState.Frontier) color = COLORS.frontier;
      else if (type === MUD) color = COLORS.mud;
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, CELL, CELL);
      }
      if (type === MUD) {
        ctx.fillStyle = COLORS.mudDot;
        for (const [dx, dy] of [[0.3, 0.3], [0.7, 0.45], [0.4, 0.75]]) {
          ctx.beginPath();
          ctx.arc(x + dx * CELL, y + dy * CELL, CELL * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r <= ROWS; r++) {
      ctx.moveTo(0, r * CELL + 0.5);
      ctx.lineTo(COLS * CELL, r * CELL + 0.5);
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, ROWS * CELL);
    }
    ctx.stroke();

    for (const [v, color, label] of [[start, COLORS.start, 'S'], [goal, COLORS.goal, 'G']] as const) {
      const x = colOf(v) * CELL;
      const y = rowOf(v) * CELL;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${CELL * 0.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + CELL / 2, y + CELL / 2 + 1);
    }
  };

  const renderStats = (side: Side) => {
    const r = side.run!;
    let status = t('탐색 중…', 'Searching…');
    if (r.finished) status = r.found ? t('완료', 'Done') : t('경로 없음', 'No path');
    const open = cells.reduce((acc, c) => acc + (c === WALL ? 0 : 1), 0);
    const st = r.pqStats;
    side.stats.innerHTML = `
      <div><span>${t('확정한 칸', 'Cells settled')}</span><b>${num(r.visitedCount)}</b> / ${num(open)}</div>
      <div><span>${t('큐 삽입', 'Queue pushes')}</span><b>${num(r.pushCount)}</b></div>
      <div><span>${t('키 비교', 'Key comparisons')}</span><b>${num(st.comps)}</b></div>
      <div><span>${t('stale / 최대 큐', 'stale / max queue')}</span><b>${num(r.staleCount)}</b> / ${num(st.maxSize)}</div>
      <div><span>${t('경로 비용', 'Path cost')}</span>${r.found ? `<b>${r.cost}</b> (${r.path.length - 1} ${t('칸 이동', 'moves')})` : '—'}</div>
      <div><span>${t('상태', 'Status')}</span>${status}</div>`;
  };

  // ---------- Playback ----------
  const player = new Player(
    {
      reset: () => {
        const G = buildGraph();
        for (const s of sides) s.run = new SearchRun(G.n, s.make(G));
      },
      step: () => {
        for (const s of sides) if (!s.run!.finished) s.run!.expand();
        return sides.some((s) => !s.run!.finished);
      },
      render: () => {
        for (const s of sides) {
          draw(s);
          renderStats(s);
        }
      },
    },
    { speed: 60 },
  );
  root.querySelector('.player-slot')!.appendChild(player.el);

  /** When the grid changes: re-run instantly if the search had finished, otherwise just reset */
  const onEdit = () => {
    const wasDone = player.isFinished;
    player.reset();
    if (wasDone) player.finishAll();
  };

  // ---------- Mouse editing ----------
  type Drag = { kind: 'start' | 'goal' } | { kind: 'paint'; value: number; last: number };
  let drag: Drag | null = null;

  const cellAt = (e: PointerEvent, canvas: HTMLCanvasElement): number => {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    return idx(r, c);
  };

  const paint = (i: number, value: number): boolean => {
    if (i === start || i === goal || cells[i] === value) return false;
    cells[i] = value;
    return true;
  };

  /** Fills the straight line between two cells so fast mouse moves don't leave gaps (Bresenham) */
  const paintLine = (from: number, to: number, value: number): boolean => {
    let r0 = rowOf(from);
    let c0 = colOf(from);
    const r1 = rowOf(to);
    const c1 = colOf(to);
    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dc - dr;
    let changed = false;
    for (;;) {
      changed = paint(idx(r0, c0), value) || changed;
      if (r0 === r1 && c0 === c1) break;
      const e2 = 2 * err;
      if (e2 > -dr) {
        err -= dr;
        c0 += sc;
      }
      if (e2 < dc) {
        err += dc;
        r0 += sr;
      }
    }
    return changed;
  };

  for (const side of sides) {
    const canvas = side.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      const i = cellAt(e, canvas);
      if (i < 0) return;
      canvas.setPointerCapture(e.pointerId);
      if (i === start) drag = { kind: 'start' };
      else if (i === goal) drag = { kind: 'goal' };
      else {
        const value = cells[i] === brush ? EMPTY : brush;
        drag = { kind: 'paint', value, last: i };
        if (paint(i, value)) onEdit();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const i = cellAt(e, canvas);
      if (i < 0) return;
      if (drag.kind === 'paint') {
        if (i !== drag.last && paintLine(drag.last, i, drag.value)) onEdit();
        drag.last = i;
      } else if (cells[i] !== WALL && i !== start && i !== goal) {
        if (drag.kind === 'start') start = i;
        else goal = i;
        onEdit();
      }
    });
    const end = () => (drag = null);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // ---------- Options ----------
  root.querySelectorAll<HTMLInputElement>('input[name="brush"]').forEach((el) => {
    el.onchange = () => (brush = Number(el.value));
  });
  const heurSel = root.querySelector<HTMLSelectElement>('select.heur')!;
  const tieBox = root.querySelector<HTMLInputElement>('input.tie')!;
  heurSel.onchange = (e) => {
    heurKey = (e.target as HTMLSelectElement).value as GridHeurKey;
    onEdit();
  };
  tieBox.onchange = (e) => {
    tieBreak = (e.target as HTMLInputElement).checked;
    onEdit();
  };

  // ---------- Presets ----------
  const presets: Record<string, () => void> = {
    clear: () => cells.fill(EMPTY),
    random: () => {
      for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < 0.3 ? WALL : EMPTY;
    },
    maze: () => {
      const spec = { rows: ROWS, cols: COLS, cells, start, goal };
      maze(spec, Math.random);
      start = spec.start;
      goal = spec.goal;
    },
    trap: () => {
      const spec = { rows: ROWS, cols: COLS, cells, start, goal };
      uTrap(spec);
      start = spec.start;
      goal = spec.goal;
    },
    enclosed: () => enclosedGoal({ rows: ROWS, cols: COLS, cells, start, goal }),
  };
  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
    btn.onclick = () => {
      presets[btn.dataset.preset!]();
      cells[start] = EMPTY;
      cells[goal] = EMPTY;
      onEdit();
    };
  });

  player.reset();

  return {
    load(spec, heur, tie) {
      cells.set(spec.cells);
      start = spec.start;
      goal = spec.goal;
      heurKey = heur;
      tieBreak = tie;
      heurSel.value = heur;
      tieBox.checked = tie;
      player.reset();
    },
  };
}
