import './style.css';
import './views.css';
import { mountAnalysisDemo } from './demos/analysisDemo';
import { mountGraphDemo } from './demos/graphDemo';
import { mountGridDemo } from './demos/gridDemo';
import { mountInsideDemo } from './demos/insideDemo';
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
        ? t(
            `간선 비용이 길이와 상관없이 <b>1~${graph.maxW}</b> 사이 정수로 무작위입니다(노드와 간선 연결은 같고 비용만 다름). 그래서 직선거리 h를 그대로 쓰면 실제 비용보다 클 수 있어, 모든 간선의 <b>비용 ÷ 길이</b> 중 최솟값 <b>c = ${graph.hScale.toFixed(3)}</b>을 곱한 <b>h = c × 직선거리</b>를 씁니다. 이 h는 실제 비용을 넘지 않아 최단 경로가 보장되지만, 작아진 만큼 A*의 이득도 줄어듭니다. (작은 그래프의 Lv1 5개 노드 예제는 손으로 정한 비용이라 바뀌지 않습니다. ④ 탭은 항상 거리 비례 그래프로 측정합니다.)`,
            `Edge costs are random integers from <b>1 to ${graph.maxW}</b>, unrelated to length (same nodes and edges, only the costs differ). Plain straight-line h could then exceed the true cost, so A* uses <b>h = c × straight-line</b> with <b>c = ${graph.hScale.toFixed(3)}</b>, the smallest <b>cost ÷ length</b> over all edges. This h never overestimates, so the path is still shortest, but the smaller h also shrinks A*'s advantage. (The hand-made 5-node example (Lv1) keeps its costs. Tab ④ always measures the length-based graph.)`,
          )
        : t(
            '간선 비용 = ⌈길이 ÷ unit⌉ (정체 간선은 2~4배). 비용이 길이 이상이라 직선거리 h를 그대로 써도 실제 비용을 넘지 않습니다.',
            'Edge cost = ⌈length ÷ unit⌉ (congested edges 2–4×). Every cost is at least the length, so plain straight-line h never exceeds the true cost.',
          )
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
      levels: [
        { key: 'tiny', label: t('Lv1 · 노드 5개 (손으로 따라가기)', 'Lv1 · 5 nodes (follow by hand)'), graph: tinyGraph(), nodeR: 18 },
        { key: 'small', label: t(`Lv2 · 노드 ${smallGraph.n}개`, `Lv2 · ${smallGraph.n} nodes`), graph: smallGraph, nodeR: 14 },
      ],
    }),
  compare: (box) =>
    mountGraphDemo(box, {
      description: t(
        `<p>노드 ${smallGraph.n}개짜리 작은 그래프입니다(단계 실행의 Lv2와 같은 그래프). 간선의 숫자는 비용이고, 점선 간선은 <i>정체</i>(직선 길이보다 비쌈)입니다.
        각 노드 아래 값은 우선순위 큐의 키 <b>f = g + h</b>입니다 (Dijkstra는 h = 0이라 f = g).
        <b>한 단계 = 각 알고리즘이 노드 하나를 확정</b>하므로 누가 먼저 도착점에 닿는지 비교할 수 있습니다. 연산 하나하나는 “코드·힙 단계 실행”에서 볼 수 있습니다.</p>`,
        `<p>A small graph with ${smallGraph.n} nodes (the same graph as Lv2 of the step-through). Numbers on edges are costs; dashed edges are <i>congested</i> (more expensive than their straight-line length).
        The value under each node is its priority-queue key <b>f = g + h</b> (for Dijkstra h = 0, so f = g).
        <b>One step = each algorithm settles one node</b>, so you can compare which one reaches the goal first. Individual operations are shown under “Step through code &amp; heap”.</p>`,
      ),
      graph: smallGraph,
      view: { nodeR: 14, showLabels: true, showWeights: true, showValues: true },
      speed: 2,
    }),
});

mountModes(panel('large'), largeGraph, 'compare', {
  inside: (box) =>
    mountInsideDemo(box, {
      levels: [{ key: 'large', label: t(`노드 ${largeGraph.n}개`, `${largeGraph.n} nodes`), graph: largeGraph, nodeR: 4.5, big: true }],
      intro: t(
        `<p>① 탭과 같은 단계 실행을 노드 ${largeGraph.n}개짜리 그래프에서 합니다. 노드 이름은 번호입니다. 큐가 커지므로 힙은 위 5층(31개)만 트리로 그리고, <b>배열은 전부</b> 아래에 펼칩니다. 빨리 넘기려면 <b>다음 확정 노드까지</b>를 누르거나 속도를 올리세요. <b>A* · h = 0</b>을 고르면 Dijkstra와 확정 순서가 끝까지 같은지 실시간으로 확인합니다.</p>`,
        `<p>The same step-through as tab ①, on the ${largeGraph.n}-node graph. Node names are their index numbers. The queue gets big, so only the top 5 levels (31 entries) of the heap are drawn as a tree, and <b>the full array</b> is listed below it. Use <b>Next settled node</b> or raise the speed to move faster. Pick <b>A* · h = 0</b> to check live that it settles nodes in exactly Dijkstra's order.</p>`,
      ),
    }),
  compare: (box) =>
    mountGraphDemo(box, {
      description: t(
        `<p>노드 ${largeGraph.n}개짜리 큰 그래프입니다. Dijkstra는 시작점을 중심으로 원 모양으로 퍼지고, 좋은 휴리스틱을 쓴 A*는 도착점 쪽 좁은 띠만 탐색합니다. 그래프가 클수록 차이가 커집니다(④ 탭에서 측정).</p>`,
        `<p>A large graph with ${largeGraph.n} nodes. Dijkstra spreads out in a circle around the start,
        while A* with a good heuristic searches a narrow band toward the goal. The bigger the graph, the bigger the gap (measured in tab ④).</p>`,
      ),
      graph: largeGraph,
      view: { nodeR: 4.5, showLabels: false, showWeights: false, showValues: false },
      speed: 60,
    }),
});

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
