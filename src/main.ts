import './style.css';
import './views.css';
import { mountAnalysisDemo } from './demos/analysisDemo';
import { mountGraphDemo } from './demos/graphDemo';
import { mountGridDemo } from './demos/gridDemo';
import { mountInsideDemo } from './demos/insideDemo';
import { mountOverview } from './demos/overviewDemo';
import { makeGeoGraph, tinyGraph, type GeoGraph, type WeightMode } from './graphs/generate';
import { lang, setLang, t } from './i18n';

// Edge-cost option for tabs ① and ②: proportional to length (default) or random. Remembered like the language.
const WEIGHTS_KEY = 'pbl1-weights';
let weightMode: WeightMode = 'distance';
try {
  if (localStorage.getItem(WEIGHTS_KEY) === 'random') weightMode = 'random';
} catch {
  /* storage blocked: keep the default */
}

// ① Small graph: for explanation — shows node names, edge weights and f values
const smallGraph = makeGeoGraph({
  weights: weightMode,
  n: 16,
  width: 640,
  height: 400,
  margin: 40,
  minDist: 95,
  k: 3,
  unit: 20,
  clearance: 22,
  slowProb: 0.25,
  slowMin: 2,
  slowMax: 3,
  seed: 7, // change the seed to get a different graph
});

// ② Large graph: makes the difference in search area visible at a glance
const largeOpts = {
  n: 450,
  width: 1000,
  height: 600,
  margin: 15,
  minDist: 26,
  k: 6,
  unit: 1, // smaller unit → less rounding error, so the straight-line heuristic is more accurate
  clearance: 6,
  slowProb: 0.05, // more congested edges make straight-line distance less accurate, shrinking A*'s advantage
  slowMin: 2,
  slowMax: 4,
  seed: 42,
};
const largeGraph = makeGeoGraph({ ...largeOpts, weights: weightMode });
// ④ always measures the distance-based version, so its numbers do not depend on the option
const largeGraphForAnalysis = weightMode === 'distance' ? largeGraph : makeGeoGraph(largeOpts);

// ---------- Header: title, tabs, language ----------
const TABS = [
  { key: 'overview', label: t('⓪ 개요', '⓪ Overview') },
  { key: 'small', label: t('① 작은 그래프', '① Small graph') },
  { key: 'large', label: t('② 큰 그래프', '② Large graph') },
  { key: 'grid', label: t('③ 격자 (직접 편집)', '③ Grid (interactive)') },
  { key: 'analysis', label: t('④ 성능 분석', '④ Performance analysis') },
];
document.documentElement.lang = lang;
document.title = t('Dijkstra vs A* 최단 경로 시각화', 'Dijkstra vs A* — Shortest Path Visualizer');
document.getElementById('title')!.textContent = t('Dijkstra vs A* — 최단 경로 시각화', 'Dijkstra vs A* — Shortest Path Visualizer');
const tabs = document.getElementById('tabs')!;
tabs.innerHTML = TABS.map((tb) => `<button data-tab="${tb.key}">${tb.label}</button>`).join('');
const langBox = document.getElementById('lang')!;
langBox.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  b.classList.toggle('on', b.dataset.lang === lang);
  b.onclick = () => setLang(b.dataset.lang as 'ko' | 'en');
});

const panel = (key: string) => document.getElementById(`tab-${key}`)!;

// ---------- Tabs ----------
/**
 * ① and ② each have two modes on the same graph: the operation-level view (code + heap) and the three-way comparison.
 * A mode is mounted the first time it is opened.
 */
function mountModes(el: HTMLElement, graph: GeoGraph, first: 'inside' | 'compare', mount: { inside: (box: HTMLElement) => void; compare: (box: HTMLElement) => void }) {
  el.innerHTML = `
    <div class="seg mode">
      <button data-v="inside">${t('코드·힙 단계 실행', 'Step through code & heap')}</button><button data-v="compare">${t('세 알고리즘 비교', 'Compare all three')}</button>
    </div>
    <span class="weights-pick">${t('간선 비용', 'Edge costs')}
      <span class="seg weights">
        <button data-w="distance" class="${weightMode === 'distance' ? 'on' : ''}">${t('거리에 비례', 'Proportional to length')}</button><button data-w="random" class="${weightMode === 'random' ? 'on' : ''}">${t('거리와 무관 (무작위)', 'Unrelated to length (random)')}</button>
      </span>
    </span>
    <p class="weights-note">${
      graph.weights === 'random'
        ? t(`비용 1~${graph.maxW} 무작위 · h = ${graph.hScale.toFixed(3)} × 직선거리`, `costs random 1–${graph.maxW} · h = ${graph.hScale.toFixed(3)} × straight-line`)
        : t('비용 ∝ 길이 · h = 직선거리', 'cost ∝ length · h = straight-line')
    }</p>
    <div class="mode-inside" hidden></div>
    <div class="mode-compare" hidden></div>`;
  const boxes = { inside: el.querySelector<HTMLElement>('.mode-inside')!, compare: el.querySelector<HTMLElement>('.mode-compare')! };
  el.querySelector('.seg.weights')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-w]');
    if (!b || b.dataset.w === weightMode) return;
    try {
      localStorage.setItem(WEIGHTS_KEY, b.dataset.w!);
    } catch {
      return; // cannot remember the choice, so a reload would not change anything
    }
    location.reload(); // the graphs are built once at start-up, like the language
  });
  const mounted = new Set<string>();
  let cur = first;
  const set = (m: 'inside' | 'compare') => {
    cur = m;
    el.querySelectorAll<HTMLButtonElement>('.seg.mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
    for (const k of ['inside', 'compare'] as const) boxes[k].hidden = k !== m;
    if (!mounted.has(m)) {
      mounted.add(m);
      mount[m](boxes[m]);
    }
    boxes[m].dispatchEvent(new Event('tab:shown'));
  };
  el.querySelector('.seg.mode')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
    if (b) set(b.dataset.v as 'inside' | 'compare');
  });
  el.addEventListener('tab:shown', (e) => {
    if (e.target === el) boxes[cur].dispatchEvent(new Event('tab:shown'));
  });
  set(first);
}

mountModes(panel('small'), smallGraph, 'inside', {
  inside: (box) =>
    mountInsideDemo(box, {
      speed: 4,
      levels: [
        { key: 'tiny', label: t('Lv1 · 노드 5개 (손으로 따라가기)', 'Lv1 · 5 nodes (follow by hand)'), graph: tinyGraph(), nodeR: 18 },
        { key: 'small', label: t(`Lv2 · 노드 ${smallGraph.n}개`, `Lv2 · ${smallGraph.n} nodes`), graph: smallGraph, nodeR: 14 },
      ],
    }),
  compare: (box) =>
    mountGraphDemo(box, {
      description: t(
        `<p><b>한 단계 = 각 알고리즘이 노드 하나를 확정.</b> 노드 아래 값 = 큐의 키 f = g + h</p>`,
        `<p><b>One step = each algorithm settles one node.</b> Value under a node = queue key f = g + h</p>`,
      ),
      graph: smallGraph,
      view: { nodeR: 14, showLabels: true, showWeights: true, showValues: true },
      speed: 5,
      badHeuristic: 'over',
    }),
});

mountModes(panel('large'), largeGraph, 'compare', {
  inside: (box) =>
    mountInsideDemo(box, {
      levels: [{ key: 'large', label: t(`노드 ${largeGraph.n}개`, `${largeGraph.n} nodes`), graph: largeGraph, nodeR: 4.5, big: true }],
      intro: t(
        `<p><b>노드 ${largeGraph.n}개</b>에서 단계 실행 · 빨리 넘기려면 <b>다음 확정 노드까지</b></p>`,
        `<p>Step-through on <b>${largeGraph.n} nodes</b> · use <b>Next settled node</b> to move faster</p>`,
      ),
    }),
  compare: (box) =>
    mountGraphDemo(box, {
      description: t(
        `<p>Dijkstra는 <b>원 모양</b>으로 퍼지고, A*는 도착점 쪽 <b>좁은 띠</b>만 탐색합니다.</p>`,
        `<p>Dijkstra spreads in a <b>circle</b>; A* searches a <b>narrow band</b> toward the goal.</p>`,
      ),
      graph: largeGraph,
      view: { nodeR: 4.5, showLabels: false, showWeights: false, showValues: false },
      speed: 60,
    }),
});

mountOverview(panel('overview'));
const grid = mountGridDemo(panel('grid'));

const show = (key: string) => {
  if (key === 'inside') key = 'small'; // old link to the former ⓪ tab
  if (!TABS.some((tb) => tb.key === key)) key = TABS[0].key;
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${key}`));
  panel(key).dispatchEvent(new Event('tab:shown'));
  if (location.hash !== `#${key}`) history.replaceState(null, '', `#${key}`);
};

mountAnalysisDemo(panel('analysis'), {
  largeGraph: largeGraphForAnalysis,
  openInGrid: (spec, heur, tie) => {
    grid.load(spec, heur, tie);
    show('grid');
    window.scrollTo({ top: 0 });
  },
});

tabs.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
  if (btn) show(btn.dataset.tab!);
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
show(location.hash.slice(1));
