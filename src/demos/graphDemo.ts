import { astar } from '../algo/astar';
import { dijkstra } from '../algo/dijkstra';
import type { Heuristic, SearchGenerator } from '../algo/graph';
import { SearchRun } from '../algo/run';
import { geoHeuristic, type GeoGraph } from '../graphs/generate';
import { fmt, GraphView, type GraphViewOptions } from '../ui/graphView';
import { Player } from '../ui/player';
import { num, t } from '../i18n';

export interface GraphDemoConfig {
  description: string; // HTML
  graph: GeoGraph;
  view: GraphViewOptions;
  speed: number; // default playback speed (steps per second)
}

interface Panel {
  title: string;
  subtitle: () => string;
  make: () => SearchGenerator;
  view: GraphView;
  stats: HTMLElement;
  run?: SearchRun;
  order?: number[]; // settle order so far
}

/**
 * Runs three algorithms side by side on a fixed graph for comparison.
 *  ① Dijkstra  ② A* (bad heuristic)  ③ A* (good heuristic = straight-line distance)
 * One step = each algorithm settles one node → you can compare how close each one got to the goal at the same step.
 */
export function mountGraphDemo(root: HTMLElement, cfg: GraphDemoConfig): void {
  const g = cfg.graph;
  const s = g.start;
  const goal = g.goal;

  // Straight-line heuristic, scaled by hScale so that every edge costs ≥ hScale × length / unit → never exceeds the true cost (admissible).
  // With distance-based costs hScale = 1; with random costs it is the smallest cost/length ratio over all edges.
  const random = g.weights === 'random';
  const c = g.hScale.toFixed(3);
  const hGood: Heuristic = geoHeuristic(g);
  const badHeuristics: Record<string, { label: string; desc: string; h: Heuristic }> = {
    zero: {
      label: t('h = 0 (Dijkstra와 같아야 함)', 'h = 0 (should equal Dijkstra)'),
      desc: t('h = 0 — f = g + 0 = g라서 키가 Dijkstra와 똑같음 → 확정 순서·개수까지 같음', 'h = 0 — f = g + 0 = g, so the keys are exactly Dijkstra’s → same settle order and count'),
      h: () => 0,
    },
    weak: {
      label: t('약한 휴리스틱 (0.3 × 직선거리)', 'Weak heuristic (0.3 × straight-line)'),
      desc: t('h = 0.3 × 직선거리 — 실제 비용보다 훨씬 작음 → 여전히 최적이지만 Dijkstra만큼 넓게 탐색', 'h = 0.3 × straight-line distance — far below the true cost → still optimal, but explores almost as widely as Dijkstra'),
      h: (v) => 0.3 * hGood(v),
    },
    ...(random
      ? {
          raw: {
            label: t('직선거리 그대로 (축소 없이)', 'Plain straight-line (not scaled)'),
            desc: t(
              `h = 직선거리 — 비용이 거리와 무관하면 실제 비용을 넘을 수 있음(admissible 아님) → 최단 경로 보장 없음`,
              `h = straight-line distance — with costs unrelated to length it can exceed the true cost (not admissible) → no shortest-path guarantee`,
            ),
            h: geoHeuristic(g, 1),
          },
        }
      : {}),
    over: {
      label: t('과대평가 휴리스틱 (3 × 직선거리)', 'Overestimating heuristic (3 × straight-line)'),
      desc: t('h = 3 × 직선거리 — 실제 비용을 넘음(admissible 아님) → 빠르지만 최단 경로 보장 없음', 'h = 3 × straight-line distance — exceeds the true cost (not admissible) → fast, but the path is not guaranteed to be shortest'),
      h: (v) => 3 * hGood(v),
    },
  };
  let badKey = 'weak';

  // Optimal cost (reference for checking each result)
  const ref = new SearchRun(g.n, dijkstra(g, s, goal));
  ref.runToEnd();
  const optimal = ref.cost;

  root.innerHTML = `
    <div class="intro">${cfg.description}</div>
    <div class="toolbar">
      <div class="player-slot"></div>
      <label class="select">${t('나쁜 휴리스틱', 'Bad heuristic')}
        <select>${Object.entries(badHeuristics)
          .map(([k, b]) => `<option value="${k}"${k === badKey ? ' selected' : ''}>${b.label}</option>`)
          .join('')}</select>
      </label>
    </div>
    <div class="legend">
      <span><i class="dot start"></i>${t('시작', 'Start')}</span>
      <span><i class="dot goal"></i>${t('도착', 'Goal')}</span>
      <span><i class="dot frontier"></i>${t('큐 안 (프론티어)', 'In queue (frontier)')}</span>
      <span><i class="dot closed"></i>${t('확정 (방문)', 'Settled (visited)')}</span>
      <span><i class="dot current"></i>${t('방금 확정', 'Just settled')}</span>
      <span><i class="bar path"></i>${t('찾은 경로', 'Path found')}</span>
      <span><i class="bar slow"></i>${t('정체 (비싼 간선)', 'Congested (costly edge)')}</span>
    </div>
    <div class="panels"></div>`;

  const panelsEl = root.querySelector<HTMLElement>('.panels')!;
  const panels: Panel[] = [
    { title: 'Dijkstra', subtitle: () => t('h = 0 — 시작점에서 가까운 순서로 확정', 'h = 0 — settles nodes in order of distance from the start'), make: () => dijkstra(g, s, goal) },
    { title: t('A* · 나쁜 휴리스틱', 'A* · Bad heuristic'), subtitle: () => badHeuristics[badKey].desc, make: () => astar(g, s, goal, badHeuristics[badKey].h) },
    { title: t('A* · 좋은 휴리스틱', 'A* · Good heuristic'), subtitle: () =>
        random
          ? t(
              `h = ${c} × 직선거리 — 비용이 거리와 무관하므로, 모든 간선에서 '비용 ÷ 길이'의 최솟값 ${c}를 곱해야 실제 비용을 넘지 않음`,
              `h = ${c} × straight-line — costs are unrelated to length, so h is multiplied by the smallest cost/length ratio over all edges (${c}) to never exceed the true cost`,
            )
          : t('h = 직선거리 — 좌표만으로 만들 수 있는, 실제 비용을 넘지 않는 추정', 'h = straight-line distance — an estimate from coordinates alone that never exceeds the true cost'), make: () => astar(g, s, goal, hGood) },
  ].map((p) => {
    const box = document.createElement('div');
    box.className = 'panel';
    box.innerHTML = `<h3>${p.title}</h3><p class="sub"></p><div class="svg-wrap"></div><div class="stats"></div>`;
    const view = new GraphView(g, cfg.view);
    box.querySelector('.svg-wrap')!.appendChild(view.el);
    panelsEl.appendChild(box);
    return { ...p, view, stats: box.querySelector<HTMLElement>('.stats')! };
  });

  const renderSubtitles = () => {
    panelsEl.querySelectorAll<HTMLElement>('.panel .sub').forEach((el, i) => (el.textContent = panels[i].subtitle()));
  };

  /** For A* with h = 0: is its settle order identical to Dijkstra's so far? */
  const sameAsDijkstra = (p: Panel): string => {
    const a = p.order!;
    const d = panels[0].order!;
    const k = Math.min(a.length, d.length);
    let i = 0;
    while (i < k && a[i] === d[i]) i++;
    const ok = i === k && (!p.run!.finished || a.length === d.length);
    return `<div class="full"><span>${t('Dijkstra와 확정 순서', "Settle order vs Dijkstra")}</span>${
      ok ? `<b class="ok">✓ ${t(`${k}개 모두 같음`, `all ${k} identical`)}</b>` : `<b class="bad">✗ ${t(`${i + 1}번째부터 다름`, `differs from #${i + 1}`)}</b>`
    }</div>`;
  };

  const renderStats = (p: Panel) => {
    const r = p.run!;
    let status = t('탐색 중…', 'Searching…');
    let cost = '—';
    if (r.finished && r.found) {
      status = t('완료', 'Done');
      const diff = r.cost - optimal;
      cost =
        diff < 1e-9
          ? `${fmt(r.cost)} <b class="ok">✓ ${t('최적', 'optimal')}</b>`
          : `${fmt(r.cost)} <b class="bad">✗ ${t(`최적(${fmt(optimal)})보다 ${fmt(diff)} 김`, `${fmt(diff)} longer than optimal (${fmt(optimal)})`)}</b>`;
    } else if (r.finished) status = t('경로 없음', 'No path');
    const st = r.pqStats;
    p.stats.innerHTML = `
      <div><span>${t('확정 노드', 'Nodes settled')}</span><b>${r.visitedCount}</b> / ${g.n} (${Math.round((r.visitedCount / g.n) * 100)}%)</div>
      <div><span>${t('큐 삽입', 'Queue pushes')}</span><b>${r.pushCount}</b></div>
      <div><span>${t('키 비교', 'Key comparisons')}</span><b>${num(st.comps)}</b></div>
      <div><span>stale</span><b>${r.staleCount}</b></div>
      <div><span>${t('경로 비용', 'Path cost')}</span>${cost}</div>
      <div><span>${t('상태', 'Status')}</span>${status}</div>${p === panels[1] && badKey === 'zero' ? sameAsDijkstra(p) : ''}`;
  };

  const player = new Player(
    {
      reset: () => {
        for (const p of panels) {
          p.run = new SearchRun(g.n, p.make());
          p.order = [];
        }
        renderSubtitles();
      },
      step: () => {
        for (const p of panels) {
          if (p.run!.finished) continue;
          const before = p.run!.visitedCount;
          p.run!.expand();
          if (p.run!.visitedCount > before) p.order!.push(p.run!.current);
        }
        return panels.some((p) => !p.run!.finished);
      },
      render: () => {
        for (const p of panels) {
          p.view.render(p.run!);
          renderStats(p);
        }
      },
    },
    { speed: cfg.speed },
  );
  root.querySelector('.player-slot')!.appendChild(player.el);

  root.querySelector<HTMLSelectElement>('.toolbar select')!.onchange = (e) => {
    badKey = (e.target as HTMLSelectElement).value;
    player.reset();
  };

  player.reset();
}
