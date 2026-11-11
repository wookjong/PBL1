import heapSrc from '../algo/heap.ts?raw';
import searchSrc from '../algo/search.ts?raw';
import type { PQEntry, PQKind } from '../algo/heap';
import type { Heuristic, Step } from '../algo/graph';
import { NodeState, SearchRun } from '../algo/run';
import { bestFirstSearch } from '../algo/search';
import { dist, type GeoGraph } from '../graphs/generate';
import { num, t } from '../i18n';
import { CodeView } from '../ui/codeView';
import { fmt, GraphView } from '../ui/graphView';
import { HeapView, traceText } from '../ui/heapView';
import { Player } from '../ui/player';

export interface InsideLevel {
  key: string;
  label: string;
  graph: GeoGraph;
  nodeR: number;
  big?: boolean; // hundreds of nodes: no labels on the graph, wide heap, faster default speed
}

export interface InsideConfig {
  levels: InsideLevel[];
  intro?: string; // HTML; replaces the default intro
}

type Algo = 'dijkstra' | 'astar0' | 'astar';

interface Described {
  title: string;
  text: string;
  opts: string[]; // optimizations that just did something
  code: string[]; // tags in search.ts; the last one is where the ▶ marker goes
  tone: 'info' | 'good' | 'warn' | 'muted' | 'done';
  card?: CardKey; // optimization card to flash
}

type CardKey = 'pq' | 'lazy' | 'closed' | 'early' | 'heur';

const PQ_LABEL: Record<PQKind, () => string> = {
  array: () => t('배열 O(V²)', 'Array O(V²)'),
  indexed: () => t('힙 + decreaseKey', 'Heap + decreaseKey'),
  lazy: () => t('힙 + lazy 삭제 ⚡', 'Heap + lazy deletion ⚡'),
};

const PQ_NOTE: Record<PQKind, () => string> = {
  array: () =>
    t(
      '정렬하지 않은 배열. insert·decreaseKey는 O(1)이지만 deletemin마다 전체를 훑어야 해서(O(V)) 전체가 O(V²)입니다.',
      'Unsorted array. insert and decreaseKey are O(1), but every deletemin scans everything (O(V)), so the total is O(V²).',
    ),
  indexed: () =>
    t(
      '이진 힙 + 위치표(item → 배열 인덱스). decreaseKey가 항목을 제자리에서 sift-up 하므로 힙에는 노드마다 항목이 하나뿐입니다. O((V+E) log V).',
      'Binary heap + position table (item → array index). decreaseKey sifts the entry up in place, so the heap holds at most one entry per node. O((V+E) log V).',
    ),
  lazy: () =>
    t(
      '이진 힙만 사용(위치표 없음). 더 짧은 경로가 나오면 새 항목을 하나 더 넣고, 옛 항목(stale)은 나중에 꺼낼 때 버립니다. 코드가 단순하고 실제로 가장 많이 쓰는 방식입니다. 시간 O(E log V), 힙 크기 O(E).',
      'Binary heap only (no position table). When a shorter path appears it inserts another copy; the old (stale) copy is discarded when popped later. Simplest code and the most common choice in practice. Time O(E log V), heap size O(E).',
    ),
};

/**
 * "Inside the algorithm": one operation per step, showing the graph, the actual source lines that ran,
 * the variables of the current operation, the priority queue (heap tree + array) and which optimization did something.
 * Works on the 5-node example as well as on the 450-node graph.
 */
export function mountInsideDemo(root: HTMLElement, cfg: InsideConfig): void {
  let level = cfg.levels[0];
  let algo: Algo = 'dijkstra';
  let kind: PQKind = 'lazy';
  let earlyExit = true;
  let tieBreak = true;
  let run!: SearchRun;
  let view!: GraphView;
  let h: Heuristic = () => 0;
  const log: { title: string; tone: string }[] = [];
  // live tallies that the stats object does not keep
  let closedSkips = 0;
  let tieBreaks = 0;
  let scanEstimate = 0; // comparisons an unsorted array would need: (queue size − 1) per deletemin
  let order: number[] = []; // settle order of this run
  let ref: { order: number[]; settled: number; comps: number; cost: number; ops: number } | null = null; // Dijkstra, for A* with h = 0

  const big = () => !!level.big;
  const ALGO_LABEL: Record<Algo, () => string> = {
    dijkstra: () => 'Dijkstra',
    astar0: () => t('A* · h = 0', 'A* · h = 0'),
    astar: () => t('A* · h = 직선거리', 'A* · h = straight-line'),
  };

  root.innerHTML = `
    <div class="intro">${
      cfg.intro ??
      `<p>${t(
        '<b>한 단계 = 연산 하나</b>(deletemin, 간선 완화, insert, decreaseKey …)입니다. 왼쪽은 그래프, 오른쪽은 <b>지금 실행된 실제 코드 줄</b>과 그 순간의 변수 값, 아래는 우선순위 큐의 실제 모양입니다. 작은 예(5개 노드)로 시작해 16개 노드로 넓혀 보고, 450개 노드는 ② 큰 그래프 탭의 “코드·힙 단계 실행”에서 볼 수 있습니다. 세 알고리즘을 나란히 보려면 위의 “세 알고리즘 비교”를 누르세요.',
        '<b>One step = one operation</b> (deletemin, edge relaxation, insert, decreaseKey, …). The graph is on the left; on the right are <b>the actual source lines that just ran</b> and the variables at that moment; below is the priority queue as it really is. Start with the 5-node example, then 16 nodes; the 450-node version is under “Step through code & heap” in tab ②. To see the three algorithms side by side, switch to “Compare all three” above.',
      )}</p>`
    }</div>
    <div class="toolbar">
      <label class="select lvl-box">${t('예제', 'Example')}
        <select class="lvl">${cfg.levels.map((l) => `<option value="${l.key}">${l.label}</option>`).join('')}</select>
      </label>
      <div class="seg algo">
        ${(['dijkstra', 'astar0', 'astar'] as Algo[]).map((a) => `<button data-v="${a}" class="${a === algo ? 'on' : ''}">${ALGO_LABEL[a]()}</button>`).join('')}
      </div>
      <div class="seg pq">
        ${(['array', 'indexed', 'lazy'] as PQKind[]).map((k) => `<button data-v="${k}" class="${k === kind ? 'on' : ''}">${PQ_LABEL[k]()}</button>`).join('')}
      </div>
      <label class="check"><input type="checkbox" class="early" checked> ${t('early exit (도착점 확정 즉시 종료)', 'early exit (stop when the goal is settled)')}</label>
      <label class="check"><input type="checkbox" class="tie" checked> ${t('A* tie-break (f 같으면 h 작은 쪽)', 'A* tie-break (equal f → smaller h)')}</label>
    </div>
    <div class="toolbar"><div class="player-slot"></div><button class="next-visit">⏭ ${t('다음 확정 노드까지', 'Next settled node')}</button></div>
    <p class="pq-note"></p>
    <div class="eq-banner" hidden></div>
    <div class="legend">
      <span><i class="dot start"></i>${t('시작', 'Start')}</span>
      <span><i class="dot goal"></i>${t('도착', 'Goal')}</span>
      <span><i class="dot frontier"></i>${t('큐 안', 'In queue')}</span>
      <span><i class="dot closed"></i>${t('확정', 'Settled')}</span>
      <span><i class="dot current"></i>${t('지금 확장 중인 노드 (u)', 'Being expanded (u)')}</span>
      <span><i class="dot ring"></i>${t('이번 연산의 대상 노드', 'Node the step is about')}</span>
      <span><i class="bar active"></i>${t('지금 검사 중인 간선', 'Edge being examined')}</span>
      <span><i class="bar path"></i>${t('찾은 경로', 'Path found')}</span>
    </div>
    <div class="inside">
      <div class="panel">
        <h3>${t('그래프', 'Graph')} <span class="sub-inline algo-name"></span></h3>
        <div class="svg-wrap graph-slot"></div>
      </div>
      <div class="side">
        <div class="panel code-panel">
          <div class="code-tabs">
            <button data-v="search" class="on">search.ts</button><button data-v="heap">heap.ts</button>
          </div>
          <div class="code-slot"></div>
        </div>
        <div class="panel op">
          <h3>${t('현재 단계', 'Current step')}</h3>
          <div class="op-title"></div>
          <div class="op-text"></div>
          <div class="op-heap"></div>
          <div class="op-opts"></div>
          <table class="vars"></table>
        </div>
      </div>
    </div>
    <div class="panel heap-panel">
      <h3>${t('우선순위 큐', 'Priority queue')} <span class="sub-inline pq-name"></span></h3>
      <p class="sub heap-sub"></p>
      <div class="heap-slot"></div>
    </div>
    <h3 class="cards-title">${t('이 구현의 핵심 최적화 (실시간)', 'Key optimizations in this implementation (live)')}</h3>
    <div class="opt-cards"></div>
    <div class="inside lower">
      <div class="panel">
        <h3>${t('카운터', 'Counters')}</h3>
        <div class="stats wide counters"></div>
      </div>
      <div class="panel">
        <h3>${t('연산 기록', 'Operation log')}</h3>
        <ol class="oplog"></ol>
      </div>
    </div>`;

  const $ = <E extends Element = HTMLElement>(sel: string) => root.querySelector<E>(sel)!;
  if (cfg.levels.length < 2) $('.lvl-box').hidden = true;
  const note = t('실제 소스 · <code>yield</code> 줄(시각화 훅)은 숨김 · 줄 번호는 파일 그대로', 'actual source · <code>yield</code> lines (visualizer hooks) hidden · real line numbers');
  const searchCode = new CodeView(searchSrc, 'src/algo/search.ts', /^export function\* bestFirstSearch/);
  const heapCode = new CodeView(heapSrc, 'src/algo/heap.ts', /^function before/);
  searchCode.setNote(note);
  heapCode.setNote(note);
  $('.code-slot').append(searchCode.el, heapCode.el);
  heapCode.el.hidden = true;
  let heapView!: HeapView;

  const label = (v: number) => level.graph.labels[v] ?? '—';
  const keyName = () => (algo === 'dijkstra' ? 'g' : 'f');
  const pathText = (p: number[]) =>
    p.length > 12 ? `${p.slice(0, 5).map(label).join(' → ')} → … → ${p.slice(-4).map(label).join(' → ')} (${p.length})` : p.map(label).join(' → ');

  const describe = (s: Step): Described => {
    const L = label;
    const kn = keyName();
    switch (s.type) {
      case 'init':
        return {
          title: 'INIT',
          text: t(
            `g[${L(s.node)}] = 0, 나머지는 ∞. 시작점 ${L(s.node)}를 키 ${kn} = ${fmt(s.f)}로 큐에 넣습니다.`,
            `g[${L(s.node)}] = 0, every other g = ∞. Push the start ${L(s.node)} with key ${kn} = ${fmt(s.f)}.`,
          ),
          opts: [],
          code: ['init'],
          tone: 'info',
        };
      case 'visit': {
        const fx = algo !== 'dijkstra' ? ` (f = g + h = ${fmt(s.g)} + ${fmt(h(s.node))})` : '';
        let same = '';
        if (algo === 'astar0' && ref) {
          const i = order.lastIndexOf(s.node);
          same =
            ref.order[i] === s.node
              ? t(` Dijkstra도 ${i + 1}번째로 ${L(s.node)}를 확정합니다 ✓`, ` Dijkstra also settles ${L(s.node)} as node #${i + 1} ✓`)
              : t(` Dijkstra는 ${i + 1}번째로 ${L(ref.order[i])}를 확정 (순서 다름)`, ` Dijkstra settles ${L(ref.order[i])} as #${i + 1} (order differs)`);
        }
        return {
          title: `DELETEMIN → ${t('확정', 'SETTLE')} ${L(s.node)}`,
          text: t(
            `큐에서 키가 가장 작은 ${L(s.node)}:${fmt(s.key)}${fx}를 꺼냈습니다. 이제 g[${L(s.node)}] = ${fmt(s.g)}는 최종값이고, 이웃 간선을 하나씩 완화합니다.${same}`,
            `Popped ${L(s.node)}:${fmt(s.key)}${fx}, the smallest key in the queue. g[${L(s.node)}] = ${fmt(s.g)} is now final; next, relax its edges one by one.${same}`,
          ),
          opts: s.tieBroken
            ? [t('tie-break: f가 같은 항목 중 h가 작은(도착점에 가까운) 노드를 먼저 꺼냄', 'tie-break: among equal f, the node with smaller h (closer to the goal) came out first')]
            : [],
          code: ['visit'],
          tone: 'info',
          card: s.tieBroken ? 'heur' : 'pq',
        };
      }
      case 'stale':
        return {
          title: `STALE ${L(s.node)}:${fmt(s.key)}`,
          text: t(
            `${L(s.node)}:${fmt(s.key)}를 꺼냈지만 ${L(s.node)}는 이미 더 작은 값 ${fmt(run.g[s.node])}로 확정됐습니다. 예전에 넣은 낡은 항목이므로 버리고 다음으로 넘어갑니다.`,
            `Popped ${L(s.node)}:${fmt(s.key)}, but ${L(s.node)} was already settled with the smaller value ${fmt(run.g[s.node])}. This is an outdated copy, so it is discarded.`,
          ),
          opts: [t('lazy deletion: decreaseKey 없이 낡은 항목을 꺼낼 때 한 번 확인하고 버림', 'lazy deletion: no decreaseKey needed; outdated copies are checked once and dropped when popped')],
          code: ['stale'],
          tone: 'muted',
          card: 'lazy',
        };
      case 'relax':
        if (s.result === 'closed')
          return {
            title: `RELAX ${L(s.from)}→${L(s.node)} · ${t('이미 확정', 'already settled')}`,
            text: t(`${L(s.node)}는 이미 확정된 노드라 더 짧아질 수 없으므로 계산하지 않고 건너뜁니다.`, `${L(s.node)} is already settled and cannot get shorter, so it is skipped without any work.`),
            opts: [t('closed skip: 확정된 노드는 비교도, 큐 연산도 하지 않음', 'closed skip: no comparison and no queue operation for settled nodes')],
            code: ['relax', 'closed'],
            tone: 'muted',
            card: 'closed',
          };
        return {
          title: `RELAX ${L(s.from)}→${L(s.node)} · ${t('변화 없음', 'no change')}`,
          text: t(
            `ng = g[u] + w = ${fmt(run.g[s.from])} + ${s.w} = ${fmt(s.ng)} ≥ g[${L(s.node)}] = ${fmt(s.old)} 이므로 ${L(s.from)}를 거치는 길이 더 짧지 않습니다. 큐는 그대로입니다.`,
            `ng = g[u] + w = ${fmt(run.g[s.from])} + ${s.w} = ${fmt(s.ng)} ≥ g[${L(s.node)}] = ${fmt(s.old)}, so going through ${L(s.from)} is not shorter. The queue is unchanged.`,
          ),
          opts: [],
          code: ['relax', 'noimprove'],
          tone: 'muted',
        };
      case 'push': {
        const calc = `ng = g[u] + w = ${fmt(run.g[s.from])} + ${s.w} = ${fmt(s.g)}`;
        const via = t(` — ${L(s.from)}를 거쳐 ${L(s.node)}에 가는 비용`, ` — the cost of reaching ${L(s.node)} through ${L(s.from)}`);
        if (s.mode === 'insert')
          return {
            title: `INSERT ${L(s.node)}:${fmt(s.f)}`,
            text: t(`${calc}${via}. ${L(s.node)}는 처음 발견한 노드이므로 키 ${kn} = ${fmt(s.f)}로 큐에 넣습니다.`, `${calc}${via}. ${L(s.node)} is seen for the first time, so it is pushed with key ${kn} = ${fmt(s.f)}.`),
            opts: [],
            code: ['relax', 'improve', 'insert'],
            tone: 'good',
            card: 'pq',
          };
        if (s.mode === 'decrease')
          return {
            title: `DECREASEKEY ${L(s.node)}: ${fmt(s.old)} → ${fmt(s.g)}`,
            text: t(
              `${calc}${via} < ${fmt(s.old)}. 더 짧은 경로를 찾았으므로 큐 안의 ${L(s.node)} 항목의 키를 ${fmt(s.f)}로 낮춥니다.`,
              `${calc}${via} < ${fmt(s.old)}. A shorter path, so the key of ${L(s.node)}'s entry inside the queue is lowered to ${fmt(s.f)}.`,
            ),
            opts: [],
            code: ['relax', 'improve', 'decrease'],
            tone: 'good',
            card: 'lazy',
          };
        return {
          title: `DECREASEKEY ${L(s.node)} → ${t('새 항목 삽입', 'insert new copy')}`,
          text: t(
            `${calc}${via} < ${fmt(s.old)}. lazy 힙은 항목 위치를 모르므로 ${L(s.node)}:${fmt(s.f)}를 하나 더 넣습니다. 옛 항목은 힙에 남아 있다가 나중에 stale로 버려집니다(점선·취소선).`,
            `${calc}${via} < ${fmt(s.old)}. The lazy heap does not know where the entry is, so it pushes another ${L(s.node)}:${fmt(s.f)}. The old copy stays in the heap and is dropped as stale later (dashed, struck through).`,
          ),
          opts: [t('lazy deletion: 위치표 없이 insert 한 번으로 decreaseKey를 대신함', 'lazy deletion: one insert replaces decreaseKey, no position table needed')],
          code: ['relax', 'improve', 'reinsert'],
          tone: 'good',
          card: 'lazy',
        };
      }
      case 'done':
        if (s.early)
          return {
            title: t('도착점 확정 · 종료', 'GOAL SETTLED · STOP'),
            text: t(
              `도착점이 큐에서 나왔으므로 g = ${fmt(s.cost)}가 최단 거리입니다. 경로: ${pathText(s.path)}`,
              `The goal came out of the queue, so g = ${fmt(s.cost)} is the shortest distance. Path: ${pathText(s.path)}`,
            ),
            opts: s.left > 0 ? [t(`early exit: 큐에 남은 ${s.left}개 항목은 처리하지 않음`, `early exit: the ${s.left} entries left in the queue are never processed`)] : [],
            code: ['done'],
            tone: 'done',
            card: 'early',
          };
        return {
          title: t('큐가 빔 · 종료', 'QUEUE EMPTY · DONE'),
          text: t(
            `early exit을 끄면 도착점을 확정한 뒤에도 큐가 빌 때까지 모든 노드를 처리합니다(한 점 → 모든 점 최단 거리). 도착점 비용 ${fmt(s.cost)}, 경로: ${pathText(s.path)}`,
            `With early exit off, the search keeps going until the queue is empty (single-source shortest paths to every node). Goal cost ${fmt(s.cost)}, path: ${pathText(s.path)}`,
          ),
          opts: [],
          code: ['finish'],
          tone: 'done',
        };
      case 'fail':
        return { title: t('경로 없음', 'NO PATH'), text: t('큐가 비었는데 도착점을 확정하지 못했습니다.', 'The queue is empty and the goal was never settled.'), opts: [], code: ['fail'], tone: 'warn' };
    }
  };

  type Row = [string, string];
  /** Variables of the current operation, named as in search.ts */
  const vars = (s: Step): Row[] => {
    const L = label;
    const size: Row = ['pq.size', String(run.pq?.size ?? 0)];
    const hf = (v: number, g: number): Row[] => (algo === 'dijkstra' ? [] : [[`h(v)`, fmt(h(v))], ['f = ng + h(v)', fmt(g + h(v))]]);
    switch (s.type) {
      case 'init':
        return [['start', L(s.node)], ['g[start]', '0'], ...(algo === 'dijkstra' ? [] : ([['h(start)', fmt(h(s.node))]] as Row[])), size];
      case 'visit':
        return [['u', L(s.node)], ['key', fmt(s.key)], ['g[u]', fmt(s.g)], ...(algo === 'dijkstra' ? [] : ([['h(u)', fmt(h(s.node))]] as Row[])), ['closed[u]', '1'], size];
      case 'stale':
        return [['u', L(s.node)], ['key', fmt(s.key)], ['g[u]', `${fmt(run.g[s.node])} (${t('확정', 'final')})`], ['closed[u]', '1'], size];
      case 'relax':
        return [
          ['u', L(s.from)],
          ['v', L(s.node)],
          ['w', String(s.w)],
          ...(s.result === 'closed' ? ([['closed[v]', '1']] as Row[]) : ([['ng', fmt(s.ng)], ['g[v]', fmt(s.old)]] as Row[])),
          size,
        ];
      case 'push':
        return [
          ['u', L(s.from)],
          ['v', L(s.node)],
          ['w', String(s.w)],
          ['ng', fmt(s.g)],
          ['g[v]', `${s.old === Infinity ? '∞' : fmt(s.old)} → ${fmt(s.g)}`],
          ['prev[v]', L(s.from)],
          ...hf(s.node, s.g),
          size,
        ];
      case 'done':
        return [['g[goal]', fmt(s.cost)], [t('경로 노드 수', 'path nodes'), String(s.path.length)], [t('큐에 남은 항목', 'left in queue'), String(s.left)]];
      case 'fail':
        return [size];
    }
  };

  const heapTags = (op: string | undefined): string[] =>
    op === 'push' ? ['push', 'siftup'] : op === 'pop' ? ['pop', 'siftdown'] : op === 'decrease' ? ['decrease', 'siftup'] : op ? [op] : [];

  /** Lines that do not apply to the current settings are dimmed */
  const dimTags = () => (kind === 'lazy' ? ['decrease'] : ['reinsert', 'stale']);

  const isStale = (e: PQEntry<number>) => run.state[e.item] === NodeState.Closed || e.key > run.f[e.item] + 1e-9;

  const renderCounters = () => {
    const st = run.pqStats;
    const size = run.pq?.size ?? 0;
    const rows: Row[] = [
      [t('확정 노드', 'Settled'), `${run.visitedCount} / ${level.graph.n}`],
      [t('연산 수', 'Operations'), num(run.opCount)],
      ['insert', num(st.push)],
      ['deletemin', num(st.pop)],
      ['decreaseKey', kind === 'lazy' ? t(`없음 (재삽입으로 대체)`, 'none (re-insert)') : num(st.decrease)],
      [t('키 비교', 'Key comparisons'), num(st.comps)],
      [t('교환(swap)', 'Swaps'), num(st.swaps)],
      ['stale', num(run.staleCount)],
      [t('큐 크기 / 최대', 'Queue size / max'), `${size} / ${st.maxSize}`],
      [t('경로 비용', 'Path cost'), run.found ? fmt(run.cost) : '—'],
    ];
    $('.counters').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  };

  /** A* (h = 0) vs Dijkstra so far */
  const eqLine = (): string => {
    if (!ref) return '';
    const k = order.length;
    let same = 0;
    while (same < k && ref.order[same] === order[same]) same++;
    const ok = same === k;
    let s = ok
      ? t(`확정 순서 <b>${k}</b>개 모두 Dijkstra와 같음 <b class="ok">✓</b>`, `settle order: all <b>${k}</b> match Dijkstra <b class="ok">✓</b>`)
      : t(`${same + 1}번째에서 순서가 달라짐 <b class="bad">✗</b>`, `order differs at #${same + 1} <b class="bad">✗</b>`);
    if (run.finished) {
      const st = run.pqStats;
      const all = ok && k === ref.order.length && st.comps === ref.comps && run.opCount === ref.ops && Math.abs(run.cost - ref.cost) < 1e-9;
      s += t(
        ` · 끝: 확정 ${run.visitedCount} vs ${ref.settled}, 키 비교 ${num(st.comps)} vs ${num(ref.comps)}, 연산 ${num(run.opCount)} vs ${num(ref.ops)}, 비용 ${fmt(run.cost)} vs ${fmt(ref.cost)} ${all ? '<b class="ok">✓ 완전히 같음</b>' : '<b class="bad">✗</b>'}`,
        ` · end: settled ${run.visitedCount} vs ${ref.settled}, comparisons ${num(st.comps)} vs ${num(ref.comps)}, operations ${num(run.opCount)} vs ${num(ref.ops)}, cost ${fmt(run.cost)} vs ${fmt(ref.cost)} ${all ? '<b class="ok">✓ identical</b>' : '<b class="bad">✗</b>'}`,
      );
    }
    return s;
  };

  const renderCards = (hot: CardKey | undefined) => {
    const st = run.pqStats;
    const n = level.graph.n;
    const staleNow = (run.pq?.entries() ?? []).filter(isStale).length;
    const card = (key: CardKey, title: string, body: string, live: string) =>
      `<div class="ocard${hot === key ? ' hot' : ''}"><h4>${title}</h4><p>${body}</p><div class="live">${live}</div></div>`;
    const cards: string[] = [];
    if (kind === 'array')
      cards.push(
        card(
          'pq',
          t('정렬 안 된 배열 (최적화 전)', 'Unsorted array (before optimizing)'),
          t('insert는 O(1)이지만 deletemin마다 큐 전체를 훑어 최솟값을 찾습니다: O(V)씩, 전체 O(V²).', 'insert is O(1), but every deletemin scans the whole queue for the minimum: O(V) each, O(V²) in total.'),
          t(`키 비교 <b>${num(st.comps)}</b> · 최대 크기 <b>${st.maxSize}</b>`, `Key comparisons <b>${num(st.comps)}</b> · largest size <b>${st.maxSize}</b>`),
        ),
      );
    else
      cards.push(
        card(
          'pq',
          t('이진 힙 우선순위 큐', 'Binary heap priority queue'),
          t('insert와 deletemin이 각각 O(log n). 최솟값은 항상 a[0]에 있어 찾는 비용이 없습니다.', 'insert and deletemin cost O(log n) each. The minimum is always at a[0], so finding it is free.'),
          t(
            `힙 비교 <b>${num(st.comps)}</b> · 교환 <b>${num(st.swaps)}</b> · 최대 크기 <b>${st.maxSize}</b><br>같은 큐를 배열로 훑었다면 ≈ <b>${num(scanEstimate)}</b>번 비교`,
            `Heap comparisons <b>${num(st.comps)}</b> · swaps <b>${num(st.swaps)}</b> · largest size <b>${st.maxSize}</b><br>Scanning the same queue as an array ≈ <b>${num(scanEstimate)}</b> comparisons`,
          ),
        ),
      );
    if (kind === 'lazy')
      cards.push(
        card(
          'lazy',
          t('lazy 삭제 (decreaseKey 없음)', 'Lazy deletion (no decrease-key)'),
          t('더 짧은 경로가 나오면 힙 안의 항목을 고치지 않고 새 항목을 넣습니다. 낡은 항목은 꺼낼 때 건너뜁니다.', 'When a shorter path is found, a new entry is pushed instead of updating the old one inside the heap. Outdated entries are skipped when they are popped.'),
          t(`지금 힙 안의 stale <b>${staleNow}</b> · 지금까지 버린 것 <b>${run.staleCount}</b>`, `Stale entries in the heap now <b>${staleNow}</b> · skipped so far <b>${run.staleCount}</b>`),
        ),
      );
    else
      cards.push(
        card(
          'lazy',
          kind === 'indexed' ? t('decreaseKey (위치표)', 'decreaseKey (position table)') : t('키 갱신 (배열)', 'Key update (array)'),
          kind === 'indexed'
            ? t('위치표로 항목을 바로 찾아 키를 낮추고 sift-up 합니다. 힙에는 노드마다 항목이 하나뿐이라 stale이 없습니다.', 'The position table finds the entry, its key is lowered and it sifts up. The heap holds one entry per node, so nothing goes stale.')
            : t('배열 안의 키만 고칩니다(O(1)). 대신 deletemin이 비쌉니다.', 'Only the key inside the array is overwritten (O(1)); deletemin pays instead.'),
          t(`decreaseKey <b>${num(st.decrease)}</b>번 · stale <b>0</b>`, `decreaseKey <b>${num(st.decrease)}</b> times · stale <b>0</b>`),
        ),
      );
    cards.push(
      card(
        'closed',
        t('closed 집합', 'Closed set'),
        t('확정된 노드의 비용은 최종값이므로, 그 노드로 가는 간선은 계산도 큐 연산도 없이 건너뜁니다.', "A settled node's cost is final, so edges into it are skipped with no arithmetic and no heap work."),
        t(`건너뛴 간선 <b>${num(closedSkips)}</b>`, `Edges skipped <b>${num(closedSkips)}</b>`),
      ),
    );
    const left = run.last?.type === 'done' && run.last.early ? run.last.left : -1;
    cards.push(
      card(
        'early',
        t('early exit', 'Early exit'),
        earlyExit
          ? t('도착점이 큐에서 나오는 순간 멈춥니다. 모든 노드의 거리를 구하지 않습니다.', 'Stop as soon as the goal is popped instead of computing the distance to every node.')
          : t('꺼져 있음: 큐가 빌 때까지 모든 노드를 확정합니다.', 'Off: every node is settled until the queue is empty.'),
        t(`지금까지 확정 <b>${run.visitedCount}</b> / ${n}`, `Settled so far <b>${run.visitedCount}</b> / ${n}`) +
          (left >= 0 ? t(` · 처리 안 한 큐 항목 <b>${left}</b>`, ` · queue entries never processed <b>${left}</b>`) : ''),
      ),
    );
    if (algo === 'astar')
      cards.push(
        card(
          'heur',
          t('휴리스틱 h = 직선거리 (+ tie-break)', 'Heuristic h = straight-line (+ tie-break)'),
          t('키가 f = g + h라서 도착점 쪽 노드가 먼저 나옵니다. f가 같으면 h가 작은 쪽을 먼저 꺼냅니다.', 'The key is f = g + h, so nodes toward the goal come out first. On equal f, the smaller h goes first.'),
          t(`tie-break 작동 <b>${tieBreaks}</b>번`, `tie-break used <b>${tieBreaks}</b> times`),
        ),
      );
    else if (algo === 'astar0')
      cards.push(
        card(
          'heur',
          t('휴리스틱 h = 0', 'Heuristic h = 0'),
          t('f = g + 0 = g이므로 큐의 키가 Dijkstra와 똑같습니다. 확정 순서도, 연산 수도 같습니다.', 'f = g + 0 = g, so the queue keys are exactly Dijkstra’s. The settle order and the operation counts are the same.'),
          eqLine(),
        ),
      );
    $('.opt-cards').innerHTML = cards.join('');
  };

  const renderOp = (d: Described | null) => {
    const s = run.last;
    const opEl = $('.op');
    if (!s || !d) {
      opEl.dataset.tone = 'info';
      $('.op-title').textContent = t('준비', 'READY');
      $('.op-text').textContent = t('“한 단계”를 누르면 연산이 하나씩 진행됩니다.', 'Press Step to run one operation at a time.');
      $('.op-heap').textContent = '';
      $('.op-opts').innerHTML = '';
      $('.vars').innerHTML = '';
      searchCode.highlight([], dimTags());
      heapCode.highlight([]);
      return;
    }
    opEl.dataset.tone = d.tone;
    $('.op-title').textContent = d.title;
    $('.op-text').textContent = d.text;
    const tr = 'heap' in s ? s.heap : null;
    $('.op-heap').textContent = traceText(tr, kind);
    $('.op-opts').innerHTML = d.opts.map((o) => `<span class="opt">⚡ OPT · ${o}</span>`).join('');
    $('.vars').innerHTML = vars(s)
      .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
      .join('');
    searchCode.highlight(d.code, dimTags());
    heapCode.highlight(heapTags(tr?.op));
  };

  const focusOf = (s: Step | null): number => (!s || s.type === 'done' || s.type === 'fail' ? -1 : s.node);

  const render = () => {
    view.render(run);
    const s = run.last;
    if (s && (s.type === 'relax' || s.type === 'push')) {
      view.setActiveEdge(s.from, s.node, s.type === 'push' ? 'improve' : s.result === 'closed' ? 'closed' : 'noimprove');
    } else view.setActiveEdge(-1, -1);
    view.setFocus(focusOf(s));
    const tr = s && 'heap' in s ? s.heap : null;
    const entries = run.pq?.entries() ?? [];
    heapView.render({ kind, entries, trace: tr, label, isStale });
    $('.heap-sub').textContent =
      kind === 'array'
        ? t(`크기 ${entries.length}. 정렬되어 있지 않아 deletemin마다 전부 훑습니다.`, `Size ${entries.length}. Not sorted, so every deletemin scans all of it.`)
        : t(
            `크기 ${entries.length}. 루트(a[0])에 항상 가장 작은 키가 있습니다. a[i]의 자식은 a[2i+1], a[2i+2]. 점선·취소선 = stale 항목, 주황 = 방금 sift 경로.`,
            `Size ${entries.length}. The root (a[0]) always holds the smallest key. Children of a[i] are a[2i+1] and a[2i+2]. Dashed, struck through = stale entry; orange = the sift path just taken.`,
          );
    const d = s ? describe(s) : null;
    renderOp(d);
    renderCounters();
    renderCards(d?.card);
    const eq = $('.eq-banner');
    eq.hidden = algo !== 'astar0';
    if (algo === 'astar0')
      eq.innerHTML = `<b>${t('A* (h = 0)와 Dijkstra 비교', 'A* (h = 0) vs Dijkstra')}</b> — ${t(
        '같은 큐·같은 설정의 Dijkstra를 따로 끝까지 돌려 두고 한 단계씩 맞춰 봅니다.',
        'Dijkstra with the same queue and settings was run separately and is checked step by step.',
      )}<br>${eqLine()}`;
    $('.oplog').innerHTML = log
      .slice(-14)
      .map((l, i, arr) => `<li class="${l.tone}" value="${log.length - arr.length + i + 1}">${l.title}</li>`)
      .join('');
  };

  const buildView = () => {
    const b = big();
    view = new GraphView(level.graph, { nodeR: level.nodeR, showLabels: !b, showWeights: !b, showValues: !b });
    $('.graph-slot').replaceChildren(view.el);
    heapView = b ? new HeapView({ width: 1200, treeLevels: 5, arrayCells: 26, arrayRows: 16 }) : new HeapView({ width: 900, treeLevels: 4, arrayCells: 18, arrayRows: 2 });
    $('.heap-slot').replaceChildren(heapView.el);
    root.classList.toggle('big', b);
  };

  const makeSearch = (hh: Heuristic, tb: boolean) => {
    const g = level.graph;
    return bestFirstSearch(g, g.start, g.goal, { h: hh, pq: kind, earlyExit, tieBreakByH: tb });
  };

  const player = new Player(
    {
      reset: () => {
        const g = level.graph;
        const hGood: Heuristic = (v) => dist(g.pos[v], g.pos[g.goal]) / g.unit;
        h = algo === 'astar' ? hGood : () => 0;
        run = new SearchRun(g.n, makeSearch(h, tieBreak && algo !== 'dijkstra'));
        log.length = 0;
        closedSkips = tieBreaks = scanEstimate = 0;
        order = [];
        ref = null;
        if (algo === 'astar0') {
          // Dijkstra exactly as dijkstra.ts calls it (no tie-break), run to the end for comparison
          const d = new SearchRun(g.n, makeSearch(() => 0, false));
          const o: number[] = [];
          for (let st = d.stepOp(); st; st = d.stepOp()) if (st.type === 'visit') o.push(st.node);
          ref = { order: o, settled: d.visitedCount, comps: d.pqStats.comps, cost: d.cost, ops: d.opCount };
        }
        $('.algo-name').textContent =
          algo === 'astar' ? t('A* · h = 직선거리', 'A* · h = straight-line distance') : algo === 'astar0' ? t('A* · h = 0 (키 f = g)', 'A* · h = 0 (key f = g)') : t('Dijkstra · 키 = g', 'Dijkstra · key = g');
        $('.pq-name').textContent = PQ_LABEL[kind]();
        $('.pq-note').textContent = PQ_NOTE[kind]();
      },
      step: () => {
        const s = run.stepOp();
        if (s) {
          if (s.type === 'visit') {
            order.push(s.node);
            if (s.tieBroken) tieBreaks++;
          }
          if ((s.type === 'visit' || s.type === 'stale') && kind !== 'array') scanEstimate += run.pq?.size ?? 0;
          if (s.type === 'relax' && s.result === 'closed') closedSkips++;
          const d = describe(s);
          log.push({ title: d.title + (d.opts.length ? ' ⚡' : ''), tone: d.tone });
          if (log.length > 400) log.splice(0, log.length - 200);
        }
        return !run.finished;
      },
      render,
    },
    { speed: level.big ? 20 : 2 },
  );
  $('.player-slot').appendChild(player.el);
  $<HTMLButtonElement>('.next-visit').onclick = () => player.stepUntil(() => run.last?.type === 'visit' || run.finished);

  const seg = (sel: string, onPick: (v: string) => void) => {
    const box = $(sel);
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
      if (!b) return;
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      onPick(b.dataset.v!);
    });
  };
  seg('.seg.algo', (v) => {
    algo = v as Algo;
    player.reset();
  });
  seg('.seg.pq', (v) => {
    kind = v as PQKind;
    player.reset();
  });
  seg('.code-tabs', (v) => {
    searchCode.el.hidden = v !== 'search';
    heapCode.el.hidden = v !== 'heap';
    render();
  });
  $<HTMLSelectElement>('select.lvl').onchange = (e) => {
    level = cfg.levels.find((l) => l.key === (e.target as HTMLSelectElement).value)!;
    buildView();
    player.reset();
  };
  $<HTMLInputElement>('input.early').onchange = (e) => {
    earlyExit = (e.target as HTMLInputElement).checked;
    player.reset();
  };
  $<HTMLInputElement>('input.tie').onchange = (e) => {
    tieBreak = (e.target as HTMLInputElement).checked;
    player.reset();
  };
  // code boxes have no size while their tab is hidden; scroll the ▶ marker into view once shown
  root.addEventListener('tab:shown', () => render());

  buildView();
  player.reset();
}
