import type { PQKind } from '../algo/heap';
import type { Graph, Heuristic } from '../algo/graph';
import { SearchRun } from '../algo/run';
import { bestFirstSearch, type SearchOptions } from '../algo/search';
import { dist, makeGeoGraph, mulberry32, type GeoGraph } from '../graphs/generate';
import {
  cloneGrid,
  diagonalGrid,
  emptyGrid,
  enclosedGoal,
  gridToGraph,
  longWall,
  manhattan,
  maze,
  randomWalls,
  uTrap,
  type GridSpec,
} from '../graphs/grids';
import { num, t } from '../i18n';
import { fmt } from '../ui/graphView';

export type GridHeurKey = 'manhattan' | 'euclid' | 'zero' | 'over' | 'weak';

export interface AnalysisConfig {
  largeGraph: GeoGraph;
  /** Opens a worst-case scenario in the grid tab so it can be watched step by step */
  openInGrid: (spec: GridSpec, heur: GridHeurKey, tieBreak: boolean) => void;
}

interface Measure {
  settled: number;
  push: number;
  pop: number;
  dec: number;
  stale: number;
  comps: number;
  maxQ: number;
  found: boolean;
  cost: number;
  pathLen: number;
  ms: number;
}

/** Runs a search to the end without drawing and collects its numbers. Time = best of `reps` runs. */
function measure(G: Graph, s: number, goal: number, opts: SearchOptions, reps = 1): Measure {
  let best = Infinity;
  let run!: SearchRun;
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    run = new SearchRun(G.n, bestFirstSearch(G, s, goal, opts));
    run.runToEnd();
    best = Math.min(best, performance.now() - t0);
  }
  const st = run.pqStats;
  return {
    settled: run.visitedCount,
    push: st.push,
    pop: st.pop,
    dec: st.decrease,
    stale: run.staleCount,
    comps: st.comps,
    maxQ: st.maxSize,
    found: run.found,
    cost: run.cost,
    pathLen: run.path.length,
    ms: best,
  };
}

const geoH = (g: GeoGraph): Heuristic => (v) => dist(g.pos[v], g.pos[g.goal]) / g.unit;

/** Same density as the large graph (≈1333 px² per node), only the area changes */
function geoOfSize(n: number): GeoGraph {
  const w = Math.round(Math.sqrt(n * 1333 * (5 / 3)));
  return makeGeoGraph({ n, width: w, height: Math.round(w * 0.6), margin: 15, minDist: 26, k: 6, unit: 1, clearance: 6, slowProb: 0.05, slowMin: 2, slowMax: 4, seed: 42 });
}

const edgesOf = (g: Graph) => g.adj.reduce((a, l) => a + l.length, 0) / 2;

const bar = (ratio: number, cls = '') =>
  `<span class="bar-cell"><i><b class="${cls}" style="width:${Math.max(0, Math.min(1, ratio)) * 100}%"></b></i><em>${Math.round(ratio * 100)}%</em></span>`;

export function mountAnalysisDemo(root: HTMLElement, cfg: AnalysisConfig): void {
  root.innerHTML = `
    <div class="intro">
      <p>${t(
        '화면에 그리지 않고 같은 코드(<code>algo/search.ts</code>, <code>algo/heap.ts</code>)를 끝까지 실행해 측정합니다. 키 비교 수는 컴퓨터와 상관없이 항상 같고, 시간(ms)은 참고용입니다.',
        'The same code (<code>algo/search.ts</code>, <code>algo/heap.ts</code>) is run to the end without drawing. Key-comparison counts are the same on every computer; times (ms) are only indicative.',
      )}</p>
    </div>

    <section class="an">
      <h2>${t('① 단순 → 복잡: 그래프가 커지면 성능은 어떻게 변하나', '① Simple → complex: how performance changes as the graph grows')}</h2>
      <p class="an-sub">${t(
        '② 큰 그래프와 같은 밀도로 노드 수만 늘립니다 (도로망 형태, 시작점 = 왼쪽 끝, 도착점 = 오른쪽 끝).',
        'Same density as tab ②, only the number of nodes grows (road-map shape, start = left edge, goal = right edge).',
      )}</p>
      <div class="an-grid">
        <div class="tbl scale-tbl">${t('측정 중…', 'Measuring…')}</div>
        <div class="chart-box"><svg class="chart scale-chart" viewBox="0 0 560 300"></svg><div class="chart-legend"></div></div>
      </div>
      <p class="an-note scale-note"></p>
    </section>

    <section class="an">
      <h2>${t('③ 최적화 단계별 비교', '③ Optimizations, one step at a time')}</h2>
      <p class="an-sub">${t('같은 맵에서 한 가지씩 바꿔 가며 쌓습니다. 각 줄은 바로 윗줄에서 하나만 다릅니다.', 'Built up on the same map, changing one thing per row. Each row differs from the one above in exactly one setting.')}</p>
      <div class="toolbar"><label class="select">${t('맵', 'Map')}
        <select class="opt-map">
          <option value="geo">${t('② 큰 그래프', '② Large graph')} (${cfg.largeGraph.n})</option>
          <option value="grid">${t('빈 격자 25×49, 대각선 방향 (f 동점이 많음)', 'Empty 25×49 grid, corner to corner (many f ties)')}</option>
          <option value="mud">${t('랜덤 진흙 격자 (비용 1/5 섞임)', 'Random mud grid (costs 1 and 5)')}</option>
        </select></label></div>
      <div class="tbl opt-tbl">${t('측정 중…', 'Measuring…')}</div>
      <p class="an-note opt-note"></p>
    </section>

    <section class="an">
      <h2>${t('④ A* 최악 사례: 언제 Dijkstra만큼 느려지나', '④ A* worst cases: when does it get as slow as Dijkstra?')}</h2>
      <p class="an-sub">${t(
        '25×49 격자, 휴리스틱 = 맨해튼 거리. 막대 = A*가 확정한 칸 ÷ Dijkstra가 확정한 칸. ▶를 누르면 ③ 격자 탭에서 직접 볼 수 있습니다.',
        '25×49 grid, heuristic = Manhattan distance. Bar = cells A* settled ÷ cells Dijkstra settled. Press ▶ to watch it in the ③ grid tab.',
      )}</p>
      <div class="tbl worst-tbl">${t('측정 중…', 'Measuring…')}</div>
      <div class="concl worst-concl"></div>
    </section>`;

  const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;

  // ---------- ① Scaling ----------
  const runScaling = () => {
    const sizes = [16, 50, 150, 450, 1000];
    const rows = sizes.map((n) => {
      const g = geoOfSize(n);
      const h = geoH(g);
      return {
        n: g.n,
        e: edgesOf(g),
        d: measure(g, g.start, g.goal, { pq: 'lazy' }, 3),
        a: measure(g, g.start, g.goal, { pq: 'lazy', h }, 3),
        arr: measure(g, g.start, g.goal, { pq: 'array' }, 3),
      };
    });
    $('.scale-tbl').innerHTML = `<table>
      <thead><tr>
        <th class="r">|V|</th><th class="r">|E|</th>
        <th class="r">${t('Dijkstra 확정', 'Dijkstra settled')}</th><th class="r">${t('A* 확정', 'A* settled')}</th><th>A* / Dijkstra</th>
        <th class="r">${t('비교 · D 힙', 'comps · D heap')}</th><th class="r">${t('비교 · A* 힙', 'comps · A* heap')}</th><th class="r">${t('비교 · D 배열', 'comps · D array')}</th>
        <th class="r">${t('배열 ÷ 힙', 'array ÷ heap')}</th><th class="r">ms D / A*</th>
      </tr></thead><tbody>${rows
        .map(
          (r) => `<tr>
        <td class="r">${num(r.n)}</td><td class="r">${num(r.e)}</td>
        <td class="r">${num(r.d.settled)}</td><td class="r">${num(r.a.settled)}</td><td>${bar(r.a.settled / r.d.settled, 'astar')}</td>
        <td class="r">${num(r.d.comps)}</td><td class="r">${num(r.a.comps)}</td><td class="r">${num(r.arr.comps)}</td>
        <td class="r">×${(r.arr.comps / Math.max(1, r.d.comps)).toFixed(1)}</td><td class="r">${r.d.ms.toFixed(1)} / ${r.a.ms.toFixed(1)}</td></tr>`,
        )
        .join('')}</tbody></table>`;

    drawChart(
      $('.scale-chart') as unknown as SVGSVGElement,
      rows.map((r) => r.n),
      [
        { name: t('Dijkstra · 배열', 'Dijkstra · array'), cls: 's-arr', ys: rows.map((r) => r.arr.comps) },
        { name: t('Dijkstra · 힙', 'Dijkstra · heap'), cls: 's-d', ys: rows.map((r) => r.d.comps) },
        { name: t('A* · 힙', 'A* · heap'), cls: 's-a', ys: rows.map((r) => r.a.comps) },
      ],
      $('.chart-legend'),
    );

    const f = rows[0];
    const l = rows[rows.length - 1];
    const k = l.n / f.n;
    const rf = Math.round((f.a.settled / f.d.settled) * 100);
    const rl = Math.round((l.a.settled / l.d.settled) * 100);
    const lo = Math.min(...rows.map((r) => Math.round((r.a.settled / r.d.settled) * 100)));
    const hi = Math.max(...rows.map((r) => Math.round((r.a.settled / r.d.settled) * 100)));
    const cross = rows.find((r) => r.arr.comps > r.d.comps);
    $('.scale-note').innerHTML = t(
      `노드가 ${num(f.n)} → ${num(l.n)}로 <b>${k.toFixed(0)}배</b> 늘 때 키 비교는 힙 ×${(l.d.comps / f.d.comps).toFixed(0)}, 배열 ×${(l.arr.comps / f.arr.comps).toFixed(0)}입니다 (V log V라면 ×${((k * Math.log2(l.n)) / Math.log2(f.n)).toFixed(0)}, V²이라면 ×${(k * k).toFixed(0)}). ${cross ? `노드 ${num(cross.n)}개부터 힙이 배열보다 비교가 적고, 그 뒤로 차이가 계속 벌어집니다. 그보다 작으면 배열이 오히려 싸서, 작은 그래프에는 단순한 구현도 충분합니다.` : ''} A*가 확정하는 비율은 크기와 상관없이 ${lo}~${hi}%(${rf}% → ${rl}%)로, 절대 개수의 차이는 그래프가 클수록 커집니다. 배열의 비교 수는 큐에 실제로 들어 있는 프론티어 크기에 비례하므로 V²은 상한입니다.`,
      `As the graph grows <b>${k.toFixed(0)}×</b> (${num(f.n)} → ${num(l.n)} nodes), key comparisons grow ×${(l.d.comps / f.d.comps).toFixed(0)} with the heap and ×${(l.arr.comps / f.arr.comps).toFixed(0)} with the array (V log V would be ×${((k * Math.log2(l.n)) / Math.log2(f.n)).toFixed(0)}, V² would be ×${(k * k).toFixed(0)}). ${cross ? `From ${num(cross.n)} nodes on, the heap needs fewer comparisons than the array and the gap keeps widening; below that the array is actually cheaper, so a simple implementation is enough for small graphs.` : ''} The share A* settles stays between ${lo}% and ${hi}% (${rf}% → ${rl}%), so the absolute saving grows with the graph. The array's cost follows the frontier actually in the queue, so V² is an upper bound.`,
    );
  };

  // ---------- ③ Optimization ladder ----------
  const optMaps = {
    geo: () => {
      const g = cfg.largeGraph;
      return { G: g as Graph, s: g.start, goal: g.goal, h: geoH(g) };
    },
    grid: () => {
      const sp = diagonalGrid();
      return { G: gridToGraph(sp), s: sp.start, goal: sp.goal, h: manhattan(sp) };
    },
    mud: () => {
      const sp = emptyGrid();
      const rand = mulberry32(9);
      for (let i = 0; i < sp.cells.length; i++) if (rand() < 0.35) sp.cells[i] = 2;
      sp.cells[sp.start] = sp.cells[sp.goal] = 0;
      return { G: gridToGraph(sp), s: sp.start, goal: sp.goal, h: manhattan(sp) };
    },
  };

  const runLadder = (mapKey: keyof typeof optMaps) => {
    const { G, s, goal, h } = optMaps[mapKey]();
    const ladder: { name: string; what: string; opts: SearchOptions }[] = [
      { name: t('0. 배열 · 끝까지', '0. Array · run to the end'), what: t('교과서 O(V²) 구현', 'textbook O(V²)'), opts: { pq: 'array' as PQKind, earlyExit: false } },
      { name: t('1. 힙 + decreaseKey', '1. Heap + decreaseKey'), what: t('deletemin O(V) → O(log V)', 'deletemin O(V) → O(log V)'), opts: { pq: 'indexed', earlyExit: false } },
      { name: t('2. 힙 + lazy 삭제', '2. Heap + lazy deletion'), what: t('위치표 제거, 재삽입 + stale 버림', 'no position table; re-insert + drop stale'), opts: { pq: 'lazy', earlyExit: false } },
      { name: '3. + early exit', what: t('도착점 확정 즉시 종료', 'stop when the goal is settled'), opts: { pq: 'lazy', earlyExit: true } },
      { name: t('4. A* (h 추가)', '4. A* (add h)'), what: t('키 = g + h, tie-break 끔', 'key = g + h, tie-break off'), opts: { pq: 'lazy', earlyExit: true, h, tieBreakByH: false } },
      { name: '5. + tie-break', what: t('f 같으면 h 작은 쪽 먼저', 'equal f → smaller h first'), opts: { pq: 'lazy', earlyExit: true, h, tieBreakByH: true } },
    ];
    const ms = ladder.map((l) => measure(G, s, goal, l.opts, 3));
    const max = Math.max(...ms.map((m) => m.comps));
    $('.opt-tbl').innerHTML = `<table>
      <thead><tr><th>${t('단계', 'Step')}</th><th>${t('바뀐 점', 'What changed')}</th>
        <th class="r">${t('확정', 'settled')}</th><th class="r">insert</th><th class="r">deletemin</th><th class="r">decreaseKey</th><th class="r">stale</th>
        <th class="r">${t('최대 큐', 'max queue')}</th><th class="r">${t('키 비교', 'key comps')}</th><th>${t('비교 (0단계 대비)', 'comps (vs step 0)')}</th><th class="r">ms</th></tr></thead>
      <tbody>${ladder
        .map((l, i) => {
          const m = ms[i];
          return `<tr><td><b>${l.name}</b></td><td class="muted">${l.what}</td>
            <td class="r">${num(m.settled)}</td><td class="r">${num(m.push)}</td><td class="r">${num(m.pop)}</td><td class="r">${l.opts.pq === 'lazy' ? '—' : num(m.dec)}</td><td class="r">${num(m.stale)}</td>
            <td class="r">${num(m.maxQ)}</td><td class="r">${num(m.comps)}</td><td>${bar(m.comps / max, i >= 4 ? 'astar' : '')}</td><td class="r">${m.ms.toFixed(1)}</td></tr>`;
        })
        .join('')}</tbody></table>`;
    const [a0, a1, a2, a3, a4, a5] = ms;
    const lazyKo =
      a2.stale === 0
        ? '1→2: 이 맵은 비용이 모두 같아 더 짧은 경로가 나중에 발견되는 일이 없으므로(decreaseKey 0회) 두 구현이 똑같이 동작합니다.'
        : `1→2: lazy 삭제는 decreaseKey ${num(a1.dec)}번을 재삽입으로 바꿔, 버리는 stale 항목 ${num(a2.stale)}개만큼 큐가 커지고(최대 ${num(a1.maxQ)} → ${num(a2.maxQ)}) 키 비교가 ${num(a1.comps)} → ${num(a2.comps)}가 됩니다. 대신 위치표가 필요 없어 코드가 단순합니다.`;
    const lazyEn =
      a2.stale === 0
        ? '1→2: every cost on this map is the same, so a shorter path is never found later (0 decreaseKeys) and the two queues behave identically.'
        : `1→2: lazy deletion turns ${num(a1.dec)} decreaseKeys into re-inserts, so the queue grows by the ${num(a2.stale)} stale entries it later drops (max ${num(a1.maxQ)} → ${num(a2.maxQ)}) and key comparisons go from ${num(a1.comps)} to ${num(a2.comps)}. In exchange it needs no position table, so the code is simpler.`;
    $('.opt-note').innerHTML = t(
      `0→1: 힙으로 바꾸면 키 비교 ${num(a0.comps)} → ${num(a1.comps)} (×${(a0.comps / Math.max(1, a1.comps)).toFixed(1)}). ${lazyKo} 3: early exit으로 확정 노드 ${num(a2.settled)} → ${num(a3.settled)}. 4: A*는 ${num(a4.settled)}개. 5: tie-break까지 켜면 ${num(a5.settled)}개 (0단계 대비 비교 ${Math.round((a5.comps / Math.max(1, a0.comps)) * 1000) / 10}%).${a4.settled === a5.settled ? ' 이 맵은 간선 비용이 제각각이라 f 동점이 거의 없어 tie-break 효과가 없습니다. 빈 격자 맵에서 비교해 보세요.' : ''}`,
      `0→1: switching to a heap takes key comparisons from ${num(a0.comps)} to ${num(a1.comps)} (×${(a0.comps / Math.max(1, a1.comps)).toFixed(1)}). ${lazyEn} 3: early exit cuts settled nodes from ${num(a2.settled)} to ${num(a3.settled)}. 4: A* settles ${num(a4.settled)}. 5: with tie-break, ${num(a5.settled)} (comparisons at ${Math.round((a5.comps / Math.max(1, a0.comps)) * 1000) / 10}% of step 0).${a4.settled === a5.settled ? ' Edge costs on this map are all different, so f ties are rare and tie-break has no effect; compare on the empty-grid map.' : ''}`,
    );
  };

  // ---------- ④ Worst cases ----------
  interface Case {
    name: string;
    cause: string;
    build: () => GridSpec;
    heur: GridHeurKey;
    tie: boolean;
    base?: boolean;
  }
  const hOf = (sp: GridSpec, k: GridHeurKey): Heuristic => {
    const m = manhattan(sp);
    if (k === 'zero') return () => 0;
    if (k === 'over') return (v) => 3 * m(v);
    if (k === 'weak') return (v) => 0.3 * m(v);
    return m;
  };
  const cases: Case[] = [
    { name: t('기준: 빈 격자', 'Baseline: empty grid'), cause: t('h = 실제 거리 → 경로 위의 칸만 확정', 'h = true distance → only cells on the path'), build: diagonalGrid, heur: 'manhattan', tie: true, base: true },
    {
      name: t('보통: 랜덤 벽 25%', 'Typical: 25% random walls'),
      cause: t('벽 때문에 h가 조금 낙관적', 'walls make h somewhat optimistic'),
      build: () => {
        const s = emptyGrid();
        randomWalls(s, 0.25, 3);
        return s;
      },
      heur: 'manhattan',
      tie: true,
      base: true,
    },
    {
      name: t('W1 U자 함정', 'W1 U-shaped trap'),
      cause: t('h는 벽을 모름 → 막힌 주머니를 다 채운 뒤에야 돌아 나옴', 'h ignores walls → fills the dead-end pocket before backing out'),
      build: () => {
        const s = emptyGrid();
        uTrap(s);
        return s;
      },
      heur: 'manhattan',
      tie: true,
    },
    {
      name: t('W2 긴 벽 우회', 'W2 long wall detour'),
      cause: t('실제 거리 ≫ h: 벽 끝까지 돌아가야 함', 'true distance ≫ h: must go around the end of the wall'),
      build: () => {
        const s = emptyGrid();
        longWall(s);
        return s;
      },
      heur: 'manhattan',
      tie: true,
    },
    {
      name: t('W3 미로', 'W3 maze'),
      cause: t('통로가 구불구불해 h가 거의 정보를 주지 못함', 'winding corridors: h carries almost no information'),
      build: () => {
        const s = emptyGrid();
        maze(s, mulberry32(5));
        return s;
      },
      heur: 'manhattan',
      tie: true,
    },
    { name: t('W4 f 동점 · tie-break 끔', 'W4 f ties · tie-break off'), cause: t('f가 같은 칸이 매우 많아 아무 순서로나 확정', 'huge number of equal-f cells, settled in arbitrary order'), build: diagonalGrid, heur: 'manhattan', tie: false },
    { name: t('W5 약한 h (0.3 × 맨해튼)', 'W5 weak h (0.3 × Manhattan)'), cause: t('h가 0에 가까울수록 Dijkstra와 같아짐', 'the closer h is to 0, the closer A* is to Dijkstra'), build: diagonalGrid, heur: 'weak', tie: true },
    { name: t('참고: h = 0', 'Ref: h = 0'), cause: t('f = g → Dijkstra와 똑같이 동작 (W5의 극한)', 'f = g → behaves exactly like Dijkstra (the limit of W5)'), build: diagonalGrid, heur: 'zero', tie: true, base: true },
    {
      name: t('W6 도달 불가', 'W6 unreachable goal'),
      cause: t('경로가 없으면 도달 가능한 칸을 전부 확정해야 끝남', 'with no path, every reachable cell must be settled'),
      build: () => {
        const s = emptyGrid();
        enclosedGoal(s);
        return s;
      },
      heur: 'manhattan',
      tie: true,
    },
    {
      name: t('참고: 과대평가 3× (랜덤 벽 맵)', 'Ref: 3× overestimate (random-wall map)'),
      cause: t('확정 칸은 줄지만 최단 경로 보장이 깨짐', 'settles fewer cells, but the shortest path is no longer guaranteed'),
      build: () => {
        const s = emptyGrid();
        randomWalls(s, 0.25, 3);
        return s;
      },
      heur: 'over',
      tie: true,
      base: true,
    },
  ];

  const runWorst = () => {
    const rows = cases.map((c) => {
      const sp = c.build();
      const G = gridToGraph(sp);
      const d = measure(G, sp.start, sp.goal, { pq: 'lazy' });
      const a = measure(G, sp.start, sp.goal, { pq: 'lazy', h: hOf(sp, c.heur), tieBreakByH: c.tie });
      return { c, sp, d, a };
    });
    $('.worst-tbl').innerHTML = `<table>
      <thead><tr><th></th><th>${t('시나리오', 'Scenario')}</th><th class="r">Dijkstra</th><th class="r">A*</th><th>A* / Dijkstra</th>
        <th class="r" title="${t('A* 확정 칸 ÷ 경로 칸 수', 'A* settled ÷ path cells')}">${t('낭비 배수', 'waste ×')}</th><th class="r">${t('A* 비용', 'A* cost')}</th><th>${t('원인', 'Cause')}</th></tr></thead>
      <tbody>${rows
        .map((r, i) => {
          const ratio = r.a.settled / Math.max(1, r.d.settled);
          const waste = r.a.found ? `×${(r.a.settled / r.a.pathLen).toFixed(1)}` : '∞';
          const cost = !r.a.found
            ? t('경로 없음', 'no path')
            : r.a.cost - r.d.cost < 1e-9
              ? `${fmt(r.a.cost)} <b class="ok">✓</b>`
              : `${fmt(r.a.cost)} <b class="bad">+${fmt(r.a.cost - r.d.cost)}</b>`;
          return `<tr class="${r.c.base ? 'base' : ''}"><td><button class="mini" data-i="${i}" title="${t('③ 격자 탭에서 보기', 'Watch in the ③ grid tab')}">▶</button></td>
            <td><b>${r.c.name}</b></td><td class="r">${num(r.d.settled)}</td><td class="r">${num(r.a.settled)}</td><td>${bar(ratio, ratio > 0.6 ? 'bad' : 'astar')}</td>
            <td class="r">${waste}</td><td class="r">${cost}</td><td class="muted">${r.c.cause}</td></tr>`;
        })
        .join('')}</tbody></table>`;
    $('.worst-tbl')
      .querySelectorAll<HTMLButtonElement>('button[data-i]')
      .forEach((b) => {
        b.onclick = () => {
          const r = rows[Number(b.dataset.i)];
          cfg.openInGrid(cloneGrid(r.sp), r.c.heur, r.c.tie);
        };
      });

    const base = rows[0];
    const w4 = rows[5];
    const w6 = rows[8];
    const trap = rows[2];
    $('.worst-concl').innerHTML = t(
      `<p><b>왜 이렇게 되나.</b> h가 일관적(consistent)이면 A*는 <i>f(n) &lt; C*</i> (C* = 최단 거리)인 노드를 <b>모두</b> 확정해야 끝납니다. h가 실제 거리에 가까우면 이 집합이 경로 근처로 좁아지고(기준: 경로 칸의 ×${(base.a.settled / base.a.pathLen).toFixed(1)}), h가 실제 거리보다 훨씬 작으면(함정·우회·미로·약한 h) Dijkstra의 탐색 범위 <i>g(n) &lt; C*</i>에 가까워집니다.</p>
       <p><b>비효율이 생기는 조건.</b> ① 벽처럼 h가 모르는 장애물이 직선 방향을 막을 때 (W1 ${Math.round((trap.a.settled / trap.d.settled) * 100)}%) ② 실제 경로가 직선보다 훨씬 길 때 (W2·W3) ③ f가 같은 노드가 많은데 순서를 정하지 않을 때: W4는 ${num(w4.a.settled)}칸, tie-break만 켜면 ${num(base.a.settled)}칸 ④ h가 0에 가까울 때 (W5, h = 0이면 Dijkstra와 완전히 같음) ⑤ 도착점에 갈 수 없을 때: 도달 가능한 ${num(w6.a.settled)}칸을 전부 확정 (Dijkstra와 똑같음, W6).</p>
       <p><b>한계.</b> 최악의 경우 A*는 Dijkstra보다 적게 확정한다는 보장만 있고(같은 tie 순서 기준), 시간 복잡도는 Dijkstra와 같은 <code>O((V+E) log V)</code>, 메모리는 lazy 힙 기준 <code>O(E)</code>입니다. h를 키워(과대평가) 탐색을 줄이면 마지막 줄처럼 확정 칸은 줄지만 더 긴 경로를 돌려줄 수 있습니다.</p>`,
      `<p><b>Why.</b> With a consistent h, A* cannot stop until it has settled <b>every</b> node with <i>f(n) &lt; C*</i> (C* = shortest distance). When h is close to the true distance that set hugs the path (baseline: ×${(base.a.settled / base.a.pathLen).toFixed(1)} the path cells); when h is far below the true distance (trap, detour, maze, weak h) it approaches Dijkstra's set <i>g(n) &lt; C*</i>.</p>
       <p><b>Conditions that make A* inefficient.</b> ① obstacles h does not know about block the straight line (W1 ${Math.round((trap.a.settled / trap.d.settled) * 100)}%) ② the real route is much longer than the straight line (W2, W3) ③ many nodes share the same f and no order is imposed: W4 settles ${num(w4.a.settled)} cells, ${num(base.a.settled)} once tie-break is on ④ h is close to 0 (W5; with h = 0 it is exactly Dijkstra) ⑤ the goal is unreachable: all ${num(w6.a.settled)} reachable cells get settled, exactly like Dijkstra (W6).</p>
       <p><b>Limits.</b> In the worst case the only guarantee is that A* settles no more than Dijkstra (with the same tie order); the time complexity is the same <code>O((V+E) log V)</code>, and memory is <code>O(E)</code> with the lazy heap. Shrinking the search further by inflating h (overestimating) settles fewer cells but can return a longer path, as the last row shows.</p>`,
    );
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    // Spread the work over a few frames so the page stays responsive
    setTimeout(() => {
      runWorst();
      setTimeout(() => {
        runLadder('geo');
        setTimeout(runScaling, 30);
      }, 30);
    }, 30);
  };
  root.addEventListener('tab:shown', start);
  root.querySelector<HTMLSelectElement>('.opt-map')!.onchange = (e) => runLadder((e.target as HTMLSelectElement).value as keyof typeof optMaps);
}

/** Log–log line chart drawn to one scale (ticks at powers of ten) */
function drawChart(svg: SVGSVGElement, xs: number[], series: { name: string; cls: string; ys: number[] }[], legend: HTMLElement): void {
  const W = 560;
  const H = 300;
  const L = 58;
  const R = 16;
  const T = 14;
  const B = 40;
  const all = series.flatMap((s) => s.ys).filter((y) => y > 0);
  const y0 = Math.floor(Math.log10(Math.min(...all)));
  const y1 = Math.ceil(Math.log10(Math.max(...all)));
  const x0 = Math.log10(xs[0]);
  const x1 = Math.log10(xs[xs.length - 1]);
  const X = (x: number) => L + ((Math.log10(x) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (y: number) => T + (1 - (Math.log10(Math.max(1, y)) - y0) / (y1 - y0)) * (H - T - B);
  const parts: string[] = [];
  for (let e = y0; e <= y1; e++) {
    const y = Y(10 ** e);
    parts.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="tick" x="${L - 6}" y="${y + 4}" text-anchor="end">${e <= 3 ? num(10 ** e) : `10^${e}`}</text>`);
  }
  for (const x of xs) parts.push(`<text class="tick" x="${X(x)}" y="${H - B + 16}" text-anchor="middle">${num(x)}</text>`);
  parts.push(`<text class="tick" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${t('노드 수 |V| (로그 축)', 'nodes |V| (log scale)')}</text>`);
  parts.push(`<text class="tick" x="12" y="${T + (H - T - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${T + (H - T - B) / 2})">${t('키 비교 수 (로그 축)', 'key comparisons (log)')}</text>`);
  for (const s of series) {
    const pts = xs.map((x, i) => `${X(x)},${Y(s.ys[i])}`).join(' ');
    parts.push(`<polyline class="ln ${s.cls}" points="${pts}"/>`);
    xs.forEach((x, i) => parts.push(`<circle class="pt ${s.cls}" cx="${X(x)}" cy="${Y(s.ys[i])}" r="${i === xs.length - 1 ? 4.5 : 3}"><title>${s.name}: ${num(s.ys[i])}</title></circle>`));
  }
  svg.innerHTML = parts.join('');
  legend.innerHTML = series.map((s) => `<span><i class="${s.cls}"></i>${s.name}</span>`).join('');
}
