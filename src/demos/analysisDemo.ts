import type { Graph, Heuristic } from '../algo/graph';
import { SearchRun } from '../algo/run';
import { bestFirstSearch, type SearchOptions } from '../algo/search';
import { geoHeuristic, makeGeoGraph, mulberry32, type GeoGraph } from '../graphs/generate';
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

const geoH = (g: GeoGraph): Heuristic => geoHeuristic(g);

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
      <p>${t('시각화와 같은 코드를 화면 없이 실행해 측정 · 기준은 <b>키 비교 수</b> (ms는 참고용)', 'Same code as the visualizations, run without drawing · measured in <b>key comparisons</b> (ms is indicative)')}</p>
    </div>

    <section class="an">
      <h2>${t('① 그래프가 커지면', '① As the graph grows')}</h2>
      <p class="an-sub">${t('큰 그래프와 같은 밀도로 노드 수만 늘림 (왼쪽 끝 → 오른쪽 끝)', 'Same density as the large graph, more nodes (left edge → right edge)')}</p>
      <div class="pq-kinds">
        <div><b>${t('배열', 'Array')}</b><span>${t('정렬 안 된 배열 · 꺼낼 때마다 전체를 훑어 최솟값을 찾음', 'unsorted · every pop scans all entries for the minimum')}</span><code>O(V²)</code></div>
        <div><b>${t('힙', 'Heap')}</b><span>${t('이진 힙 · 최솟값이 항상 맨 위, 넣고 꺼낼 때 한 경로만 정리', 'binary heap · minimum always on top, each push/pop fixes one path')}</span><code>O(E log V)</code></div>
      </div>
      <div class="an-grid">
        <div class="tbl scale-tbl">${t('측정 중…', 'Measuring…')}</div>
        <div class="chart-box"><svg class="chart scale-chart" viewBox="0 0 560 300"></svg><div class="chart-legend"></div></div>
      </div>
      <p class="an-note scale-note"></p>
    </section>


    <section class="an">
      <h2>${t('② A*가 유리할 때와 불리할 때', '② When A* wins and when it does not')}</h2>
      <p class="an-sub">${t('25×49 격자, h = 맨해튼 거리 · 막대 = A* 확정 칸 ÷ Dijkstra 확정 칸 · ▶ = 격자 탭에서 보기', '25×49 grid, h = Manhattan · bar = A* settled ÷ Dijkstra settled · ▶ = watch in the grid tab')}</p>
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
    const lo = Math.min(...rows.map((r) => Math.round((r.a.settled / r.d.settled) * 100)));
    const hi = Math.max(...rows.map((r) => Math.round((r.a.settled / r.d.settled) * 100)));
    const cross = rows.find((r) => r.arr.comps > r.d.comps);
    $('.scale-note').innerHTML = t(
      `노드 <b>${k.toFixed(0)}배</b> → 비교 수 힙 <b>×${(l.d.comps / f.d.comps).toFixed(0)}</b>, 배열 <b>×${(l.arr.comps / f.arr.comps).toFixed(0)}</b>${cross ? ` · 노드 ${num(cross.n)}개부터 힙이 유리` : ''} · A*는 크기와 상관없이 Dijkstra의 <b>${lo}~${hi}%</b>만 확정`,
      `<b>${k.toFixed(0)}×</b> the nodes → comparisons heap <b>×${(l.d.comps / f.d.comps).toFixed(0)}</b>, array <b>×${(l.arr.comps / f.arr.comps).toFixed(0)}</b>${cross ? ` · heap wins from ${num(cross.n)} nodes` : ''} · A* settles <b>${lo}–${hi}%</b> of Dijkstra at every size`,
    );
  };

  // ---------- ② Worst cases ----------
  interface Case {
    name: string;
    cause: string;
    build: () => GridSpec;
    heur: GridHeurKey;
    tie: boolean;
    base?: boolean;
    mark?: 'good' | 'bad'; // the two rows highlighted for the talk: same map, A* at its best vs tie-break off
  }
  const hOf = (sp: GridSpec, k: GridHeurKey): Heuristic => {
    const m = manhattan(sp);
    if (k === 'zero') return () => 0;
    if (k === 'over') return (v) => 3 * m(v);
    if (k === 'weak') return (v) => 0.3 * m(v);
    return m;
  };
  const cases: Case[] = [
    { name: t('기준: 빈 격자', 'Baseline: empty grid'), cause: t('h = 실제 거리 → 경로 위의 칸만 확정', 'h = true distance → only cells on the path'), build: diagonalGrid, heur: 'manhattan', tie: true, base: true, mark: 'good' },
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
    { name: t('W4 f 동점 · tie-break 끔', 'W4 f ties · tie-break off'), cause: t('f가 같은 칸이 매우 많아 아무 순서로나 확정', 'huge number of equal-f cells, settled in arbitrary order'), build: diagonalGrid, heur: 'manhattan', tie: false, mark: 'bad' },
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
          return `<tr class="${r.c.mark ? `mark ${r.c.mark}` : r.c.base ? 'base' : ''}"><td><button class="mini" data-i="${i}" title="${t('③ 격자 탭에서 보기', 'Watch in the ③ grid tab')}">▶</button></td>
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
    $('.worst-concl').innerHTML = t(
      `<p><b>h가 실제 거리에 가까울수록</b> A*는 경로 근처만 확정합니다 (기준 ${num(base.a.settled)}칸). 벽·우회·미로·약한 h·도달 불가처럼 h가 실제보다 훨씬 작으면 <b>Dijkstra와 비슷해집니다</b>. 같은 맵에서도 tie-break를 끄면 ${num(w4.a.settled)}칸 (W4).</p>`,
      `<p><b>The closer h is to the true distance</b>, the more A* stays near the path (baseline ${num(base.a.settled)} cells). When h is far below the truth (walls, detours, mazes, weak h, unreachable goal) it <b>approaches Dijkstra</b>. Even on the same map, tie-break off settles ${num(w4.a.settled)} cells (W4).</p>`,
    );
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    // Spread the work over a few frames so the page stays responsive
    setTimeout(() => {
      runWorst();
      setTimeout(runScaling, 30);
    }, 30);
  };
  root.addEventListener('tab:shown', start);
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
