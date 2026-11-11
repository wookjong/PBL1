/**
 * Priority queues used by the search (three implementations, so they can be compared).
 *  - 'array'   : unsorted array. insert O(1), deletemin O(n) scan, decreaseKey O(1)   → Dijkstra O(V²)
 *  - 'indexed' : binary min-heap + position table. decreaseKey moves the entry up in place (O(log n))
 *  - 'lazy'    : binary min-heap without a position table. Instead of decreaseKey, a new copy is inserted
 *                and the old (stale) copy is thrown away when it is popped later (lazy deletion)
 *
 * Ordering: key → tie → insertion order (seq; earlier first).
 *  - key : g for Dijkstra, f = g + h for A*
 *  - tie : secondary key for breaking ties (A* passes h so nodes closer to the goal come out first)
 *  - seq : final criterion so results are always the same (deterministic)
 *
 * Every queue counts its work (comparisons, swaps, ...) and records what the last operation touched
 * (trace), so the visualization can show the heap's inner workings.
 */
export type PQKind = 'array' | 'indexed' | 'lazy';

export interface PQEntry<T> {
  item: T;
  key: number;
  tie: number;
  seq: number;
}

export interface PQStats {
  push: number;
  pop: number;
  decrease: number;
  comps: number; // key comparisons
  swaps: number;
  maxSize: number;
}

/** What one queue operation did: the array indices it walked through, plus its comparison/swap count */
export interface PQTrace {
  op: 'push' | 'pop' | 'decrease' | 'append' | 'scan' | 'update';
  path: number[];
  comps: number;
  swaps: number;
  scanned?: number; // 'scan': how many entries were looked at
}

export interface PriorityQueue<T> {
  readonly kind: PQKind;
  readonly size: number;
  readonly stats: PQStats;
  push(item: T, key: number, tie?: number): void;
  pop(): { item: T; key: number } | undefined;
  /** Smallest entry without removing it (not counted in stats) */
  peek(): { item: T; key: number } | undefined;
  /** Only queues that can find an entry by item ('array', 'indexed') have this */
  decreaseKey?(item: T, key: number, tie?: number): void;
  /** Entries in array order (for drawing) */
  entries(): readonly PQEntry<T>[];
  /** Returns the trace of the operations since the last call and clears it */
  takeTrace(): PQTrace | null;
}

const newStats = (): PQStats => ({ push: 0, pop: 0, decrease: 0, comps: 0, swaps: 0, maxSize: 0 });

function before<T>(a: PQEntry<T>, b: PQEntry<T>): boolean {
  if (a.key !== b.key) return a.key < b.key;
  if (a.tie !== b.tie) return a.tie < b.tie;
  return a.seq < b.seq;
}

/** Binary min-heap. indexed = true keeps a position table (item → index) so decreaseKey works in place. */
export class MinHeap<T> implements PriorityQueue<T> {
  readonly kind: PQKind;
  readonly stats = newStats();
  private data: PQEntry<T>[] = [];
  private pos: Map<T, number> | null;
  private seqCounter = 0;
  private trace: PQTrace | null = null;
  decreaseKey?: (item: T, key: number, tie?: number) => void;

  constructor(indexed = false) {
    this.kind = indexed ? 'indexed' : 'lazy';
    this.pos = indexed ? new Map() : null;
    if (indexed) this.decreaseKey = (item, key, tie = 0) => this.decrease(item, key, tie);
  }

  get size(): number {
    return this.data.length;
  }

  push(item: T, key: number, tie = 0): void {
    this.begin('push');
    this.data.push({ item, key, tie, seq: this.seqCounter++ }); // #push
    this.place(this.data.length - 1);
    this.siftUp(this.data.length - 1); // #push
    this.stats.push++;
    this.stats.maxSize = Math.max(this.stats.maxSize, this.data.length);
  }

  pop(): { item: T; key: number } | undefined {
    const data = this.data;
    if (data.length === 0) return undefined;
    this.begin('pop');
    const top = data[0]; // #pop
    const last = data.pop()!; // #pop
    this.pos?.delete(top.item);
    if (data.length > 0) { // #pop
      data[0] = last; // #pop
      this.place(0);
      this.siftDown(0); // #pop
    }
    this.stats.pop++;
    return { item: top.item, key: top.key }; // #pop
  }

  /** decreaseKey (indexed only): find the entry through the position table, lower its key, sift it up */
  private decrease(item: T, key: number, tie: number): void {
    this.begin('decrease');
    const i = this.pos!.get(item)!; // #decrease
    this.data[i].key = key; // #decrease
    this.data[i].tie = tie; // #decrease
    this.siftUp(i); // #decrease
    this.stats.decrease++;
  }

  peek(): { item: T; key: number } | undefined {
    const top = this.data[0];
    return top && { item: top.item, key: top.key };
  }

  entries(): readonly PQEntry<T>[] {
    return this.data;
  }

  takeTrace(): PQTrace | null {
    const t = this.trace;
    this.trace = null;
    return t;
  }

  private less(i: number, j: number): boolean {
    this.stats.comps++;
    this.trace!.comps++;
    return before(this.data[i], this.data[j]);
  }

  private swap(i: number, j: number): void {
    const data = this.data;
    [data[i], data[j]] = [data[j], data[i]];
    this.place(i);
    this.place(j);
    this.stats.swaps++;
    this.trace!.swaps++;
  }

  private place(i: number): void {
    this.pos?.set(this.data[i].item, i);
  }

  private begin(op: PQTrace['op']): void {
    this.trace = { op, path: [], comps: 0, swaps: 0 };
  }

  private siftUp(i: number): void {
    this.trace!.path.push(i);
    while (i > 0) { // #siftup
      const parent = (i - 1) >> 1; // #siftup
      if (!this.less(i, parent)) break; // #siftup
      this.swap(i, parent); // #siftup
      i = parent; // #siftup
      this.trace!.path.push(i);
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length;
    this.trace!.path.push(i);
    for (;;) { // #siftdown
      const l = 2 * i + 1; // #siftdown
      const r = l + 1; // #siftdown
      let smallest = i; // #siftdown
      if (l < n && this.less(l, smallest)) smallest = l; // #siftdown
      if (r < n && this.less(r, smallest)) smallest = r; // #siftdown
      if (smallest === i) break; // #siftdown
      this.swap(i, smallest); // #siftdown
      i = smallest; // #siftdown
      this.trace!.path.push(i);
    }
  }
}

/** Unsorted array: the textbook O(V²) Dijkstra queue. deletemin has to look at every entry. */
export class ArrayPQ<T> implements PriorityQueue<T> {
  readonly kind: PQKind = 'array';
  readonly stats = newStats();
  private data: PQEntry<T>[] = [];
  private index = new Map<T, number>();
  private seqCounter = 0;
  private trace: PQTrace | null = null;

  get size(): number {
    return this.data.length;
  }

  push(item: T, key: number, tie = 0): void {
    this.data.push({ item, key, tie, seq: this.seqCounter++ }); // #append
    this.index.set(item, this.data.length - 1); // #append
    this.trace = { op: 'append', path: [this.data.length - 1], comps: 0, swaps: 0 };
    this.stats.push++;
    this.stats.maxSize = Math.max(this.stats.maxSize, this.data.length);
  }

  pop(): { item: T; key: number } | undefined {
    const data = this.data;
    if (data.length === 0) return undefined;
    let best = 0; // #scan
    for (let i = 1; i < data.length; i++) { // #scan
      this.stats.comps++;
      if (before(data[i], data[best])) best = i; // #scan
    }
    const top = data[best]; // #scan
    const last = data.pop()!; // #scan
    if (best < data.length) { // #scan
      data[best] = last; // #scan  (fill the hole with the last entry: O(1) removal)
      this.index.set(last.item, best);
    }
    this.index.delete(top.item);
    this.trace = { op: 'scan', path: [best], comps: Math.max(0, data.length), swaps: 0, scanned: data.length + 1 };
    this.stats.pop++;
    return { item: top.item, key: top.key }; // #scan
  }

  decreaseKey = (item: T, key: number, tie = 0): void => {
    const i = this.index.get(item)!; // #update
    this.data[i].key = key; // #update
    this.data[i].tie = tie; // #update
    this.trace = { op: 'update', path: [i], comps: 0, swaps: 0 };
    this.stats.decrease++;
  };

  peek(): { item: T; key: number } | undefined {
    let best: PQEntry<T> | undefined;
    for (const e of this.data) if (!best || before(e, best)) best = e;
    return best && { item: best.item, key: best.key };
  }

  entries(): readonly PQEntry<T>[] {
    return this.data;
  }

  takeTrace(): PQTrace | null {
    const t = this.trace;
    this.trace = null;
    return t;
  }
}

export function makePQ<T>(kind: PQKind): PriorityQueue<T> {
  if (kind === 'array') return new ArrayPQ<T>();
  return new MinHeap<T>(kind === 'indexed');
}
