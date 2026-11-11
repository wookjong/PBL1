import type { PQEntry, PQKind, PQTrace } from '../algo/heap';
import { t } from '../i18n';
import { fmt } from './graphView';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface HeapViewOptions {
  width: number; // viewBox width
  treeLevels: number; // levels drawn as a tree (5 → 31 entries); the rest only appear in the array
  arrayCells: number; // array cells per row
  arrayRows: number; // at most this many rows of the array are drawn
}
const DEFAULTS: HeapViewOptions = { width: 560, treeLevels: 5, arrayCells: 14, arrayRows: 1 };

export interface HeapViewInput {
  kind: PQKind;
  entries: readonly PQEntry<number>[];
  trace: PQTrace | null;
  label: (v: number) => string;
  isStale: (e: PQEntry<number>) => boolean;
}

/**
 * Draws the priority queue.
 *  - heap kinds: binary tree (a[i]'s children are a[2i+1], a[2i+2]) + the same entries as an array
 *  - array kind: just the array (unsorted)
 * Indices touched by the last operation (sift path, scanned minimum) are drawn in orange.
 */
export class HeapView {
  readonly el: SVGSVGElement;

  private o: HeapViewOptions;

  constructor(opts: Partial<HeapViewOptions> = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.el = document.createElementNS(SVG_NS, 'svg');
    this.el.classList.add('heap-svg');
  }

  render({ kind, entries, trace, label, isStale }: HeapViewInput): void {
    const svg = this.el;
    svg.replaceChildren();
    const onPath = new Set(trace && trace.op !== 'scan' ? trace.path : []); // after a scan the hole is refilled, so no index to point at
    const isHeap = kind !== 'array';
    const { width: W, treeLevels: TREE_LEVELS, arrayCells: ARRAY_CELLS, arrayRows } = this.o;
    const levelGap = 56;
    const treeH = isHeap ? TREE_LEVELS * levelGap + 6 : 0;
    const arrY = treeH + 28;
    const cap = ARRAY_CELLS * arrayRows;
    const rowsUsed = Math.max(1, Math.min(arrayRows, Math.ceil(entries.length / ARRAY_CELLS)));
    const rowH = 50;
    const H = arrY + rowsUsed * rowH + 6;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text !== undefined) e.textContent = text;
      svg.appendChild(e);
      return e;
    };

    const staleAt = entries.map((e) => isStale(e));
    const cls = (i: number) => {
      let c = 'hn';
      if (staleAt[i]) c += ' stale';
      if (onPath.has(i)) c += ' path';
      else if (i === 0 && isHeap) c += ' top';
      return c;
    };

    if (entries.length === 0) {
      svg.setAttribute('viewBox', `0 0 ${W} 80`);
      add('text', { x: W / 2, y: 40, class: 'h-empty' }, t('큐가 비어 있음', 'queue is empty'));
      return;
    }

    if (isHeap) {
      const shown = Math.min(entries.length, 2 ** TREE_LEVELS - 1);
      const xy = (i: number) => {
        const level = Math.floor(Math.log2(i + 1));
        const first = 2 ** level - 1;
        const slots = 2 ** level;
        return { x: ((i - first + 0.5) / slots) * W, y: 24 + level * levelGap };
      };
      for (let i = 1; i < shown; i++) {
        const a = xy(i);
        const b = xy((i - 1) >> 1);
        const hot = onPath.has(i) && onPath.has((i - 1) >> 1);
        add('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: hot ? 'he hot' : 'he' });
      }
      for (let i = 0; i < shown; i++) {
        const { x, y } = xy(i);
        const e = entries[i];
        const roomy = W / 2 ** Math.floor(Math.log2(i + 1)) >= 34; // enough space for key text next to the node
        const r = roomy ? 15 : 11;
        const st = staleAt[i] ? ' stale' : '';
        add('circle', { cx: x, cy: y, r, class: cls(i) });
        add('text', { x, y, class: (roomy ? 'ht' : 'ht small') + st }, label(e.item));
        add('text', { x, y: y + r + 10, class: 'hk' + (roomy ? '' : ' small') }, fmt(e.key));
        add('text', { x: x + r + 1, y: y - r + 1, class: 'hi' }, String(i));
      }
    }

    // Array row
    add('text', { x: 4, y: arrY - 8, class: 'h-cap' }, isHeap ? t('배열 a[ ] (트리를 층별로 펼친 것)', 'array a[ ] (the tree, level by level)') : t('정렬 안 된 배열 a[ ]', 'unsorted array a[ ]'));
    const n = Math.min(entries.length, cap);
    const cw = W / ARRAY_CELLS;
    for (let i = 0; i < n; i++) {
      const e = entries[i];
      const x = (i % ARRAY_CELLS) * cw;
      const y = arrY + Math.floor(i / ARRAY_CELLS) * rowH;
      const st = staleAt[i] ? ' stale' : '';
      add('text', { x: x + cw / 2, y: y + 6, class: 'hi mid' }, String(i));
      add('rect', { x: x + 1, y: y + 11, width: cw - 2, height: 32, rx: 3, class: cls(i) });
      add('text', { x: x + cw / 2, y: y + 21, class: 'ht small' + st }, label(e.item));
      add('text', { x: x + cw / 2, y: y + 35, class: 'hk' }, fmt(e.key));
    }
    if (entries.length > cap) {
      add('text', { x: W - 4, y: arrY - 8, class: 'h-more' }, t(`앞 ${cap}칸만 표시 · 전체 ${entries.length}`, `first ${cap} of ${entries.length}`));
    } else if (isHeap && entries.length > 2 ** TREE_LEVELS - 1) {
      add('text', { x: W - 4, y: arrY - 8, class: 'h-more' }, t(`트리는 위 ${TREE_LEVELS}층만 · 배열은 전체 ${entries.length}칸`, `tree: top ${TREE_LEVELS} levels · array: all ${entries.length}`));
    }
  }
}

/** One-line description of what the queue did in the last operation */
export function traceText(tr: PQTrace | null, kind: PQKind): string {
  if (!tr) return '';
  const path = tr.path.join(' → ');
  const cs = t(`비교 ${tr.comps} · 교환 ${tr.swaps}`, `${tr.comps} comps · ${tr.swaps} swaps`);
  switch (tr.op) {
    case 'push':
      return t(`힙: 맨 끝 a[${tr.path[0]}]에 추가 → sift-up ${path} (${cs})`, `heap: append at a[${tr.path[0]}] → sift-up ${path} (${cs})`);
    case 'pop':
      if (tr.path.length === 0) return t('힙: 하나 남은 a[0]을 꺼냄 → 힙이 비어 sift-down 없음', 'heap: took the only entry a[0] → heap is empty, no sift-down');
      return t(`힙: a[0]을 꺼내고 마지막 원소를 a[0]으로 → sift-down ${path} (${cs})`, `heap: take a[0], move the last entry to a[0] → sift-down ${path} (${cs})`);
    case 'decrease':
      return t(`힙: 위치표로 a[${tr.path[0]}]을 바로 찾아 키를 낮춤 → sift-up ${path} (${cs})`, `heap: position table finds a[${tr.path[0]}], key lowered → sift-up ${path} (${cs})`);
    case 'append':
      return t(`배열: 끝 a[${tr.path[0]}]에 추가, O(1)`, `array: append at a[${tr.path[0]}], O(1)`);
    case 'scan':
      return t(`배열: ${tr.scanned}칸을 모두 훑어 최솟값 a[${tr.path[0]}]를 찾음 (비교 ${tr.comps}), O(n)`, `array: scanned all ${tr.scanned} entries to find the minimum a[${tr.path[0]}] (${tr.comps} comps), O(n)`);
    case 'update':
      return t(`배열: a[${tr.path[0]}]의 키만 고침, O(1)`, `array: overwrite the key of a[${tr.path[0]}], O(1)`);
  }
  return kind;
}
