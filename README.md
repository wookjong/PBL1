# Dijkstra vs A* — Shortest Path Visualizer

**Live: https://wookjong.github.io/PBL1/** — rebuilt and redeployed automatically on every push to `main` (`.github/workflows/deploy.yml`).

## Running it

All you need is [Node.js](https://nodejs.org) (LTS). TypeScript and Vite are installed into the project by `npm install` below.

```bash
npm install      # once
npm run dev      # dev server → open http://localhost:5173 in a browser
npm run build    # type-check + write deployable files to dist/
```

Upload the `dist/` folder as-is to GitHub Pages or any static host. The UI is in Korean or English (switch at the top right; the choice is remembered).

## Tabs

| Tab | What it shows |
|---|---|
| ① Small graph | Two modes. *Step through code & heap* (default): one **operation** per step on a 5-node graph (then 16 nodes): the graph, the **actual source lines** of `search.ts` / `heap.ts` that just ran (real line numbers, ▶ on the current line, `yield` hooks hidden), a *Current step* box with the variables (`u`, `v`, `w`, `ng`, `g[v]`, `prev[v]`, `pq.size`, …), the priority queue as a heap tree + array with the sift-up/sift-down path, live optimization cards, counters and ⚡ markers. Algorithm: Dijkstra / A* with h = 0 / A* with straight-line h. The queue can be switched between array / heap + decreaseKey / heap + lazy deletion; early exit and tie-break can be turned off. *Compare all three*: Dijkstra vs A* (bad heuristic, incl. h = 0) vs A* (good heuristic), one settled node per step. |
| ② Large graph | The same on 450 nodes, in two modes: *Compare all three*, and *Step through code & heap* (the ① step-through on 450 nodes: top 5 heap levels as a tree, the full array below, a *Next settled node* button) |
| ③ Grid | Editable 4-directional grid (walls, mud, presets incl. U-trap and unreachable goal) |
| ④ Performance analysis | Measured by running the same code without drawing: scaling from 16 to 1,000 nodes, the optimization ladder, and A* worst cases (each row can be opened in tab ③) |

### Edge-cost option (tabs ① and ②)

Above both tabs you can pick how edge costs are made (remembered in the browser, like the language):

- **Proportional to length** (default): cost = ⌈length ÷ unit⌉, congested edges 2–4×. Every cost is at least the straight-line length, so plain straight-line h is admissible.
- **Unrelated to length (random)**: same nodes and edges, but each cost is a random integer in 1..maxW (maxW = 2 × average length ÷ unit). Plain straight-line h can now overestimate, so A* uses h = c × straight-line, where c is the smallest cost ÷ length over all edges (`hScale` in `generate.ts`). That h is admissible and consistent, but c is small (0.142 on the 16-node graph, 0.019 on the 450-node graph), so A* gains almost nothing over Dijkstra. The comparison view also offers *plain straight-line (not scaled)* as the middle heuristic: on the 450-node graph it settles only 32 nodes but returns a path of 573 instead of 434.

The 5-node example keeps its hand-made costs, and tab ④ always measures the length-based graph.

## How the meeting feedback is covered

| Feedback | Where |
|---|---|
| 1. Start simple, extend step by step, show how behaviour and performance change | ① step-through Lv1 (5 nodes) → Lv2 (16) → ① comparison → ② (450) → ③ grid; ④-① scaling table and log–log chart |
| 2. Use the heap and the real implementation code to explain the internals | ① / ② step-through: heap tree/array with sift path and per-operation comparisons/swaps; code panel shows `src/algo/search.ts` and `src/algo/heap.ts` (imported with `?raw`, lines tagged with `// #tag` comments) |
| 3. Visualize the optimized implementation step by step, highlight key optimizations | ① / ② step-through: queue selector + ⚡ OPT markers (lazy deletion, closed skip, early exit, tie-break); ④-③ ladder: array → heap + decreaseKey → lazy → early exit → A* → tie-break |
| 4. A* worst cases: limits and conditions that make it inefficient | ④-④ table (U-trap, long wall, maze, f ties without tie-break, weak h, unreachable goal, overestimating h) with a written conclusion |

### Measured results (key comparisons are deterministic; ms depend on the machine)

Scaling (road-map graphs of constant density, lazy heap):

| \|V\| | Dijkstra settled | A* settled | comps · D heap | comps · D array |
|---:|---:|---:|---:|---:|
| 16 | 16 | 6 | 65 | 38 |
| 150 | 143 | 38 | 1,129 | 1,434 |
| 1,000 | 971 | 308 | 11,317 | 26,604 |

The array is cheaper below ~150 nodes; above that the heap wins and the gap widens (×174 vs ×700 comparisons for 63× more nodes).

Optimization ladder on the 450-node graph: key comparisons 8,098 (array) → 3,513 (heap + decreaseKey) → 4,638 (lazy, 104 stale entries) → 4,496 (early exit) → 1,714 (A*).
On the empty grid (corner to corner) tie-break alone takes A* from 779 to 59 settled cells.

A* worst cases on the 25×49 grid (cells settled):

| Scenario | Dijkstra | A* | A* / D |
|---|---:|---:|---:|
| Baseline: empty grid | 1,193 | 59 | 5% |
| W1 U-shaped trap | 1,095 | 303 | 28% |
| W2 long wall detour | 983 | 511 | 52% |
| W3 maze | 467 | 315 | 67% |
| W4 f ties, tie-break off | 1,193 | 779 | 65% |
| W5 weak h (0.3 × Manhattan) | 1,193 | 1,181 | 99% |
| Ref: h = 0 | 1,193 | 1,193 | 100% |
| W6 unreachable goal | 1,176 | 1,176 | 100% |
| Ref: 3× overestimate | 748 | 100 | 13% (path 54 instead of 50) |

With h = 0, A* is Dijkstra: f = g, so the keys, the settle order and every count are identical. Choose *A* · h = 0* in the ① or ② step-through to check this step by step (on 450 nodes: 431 settled, 4,496 key comparisons and 2,905 operations for both), or *h = 0* as the middle heuristic in ① / ②.

A* must settle every node with f(n) < C*. When h is far below the true distance, when the goal is unreachable, or when ties are left unordered, that set approaches Dijkstra's; the worst-case time is the same O((V+E) log V), with O(E) memory for the lazy heap.

## Structure

```
src/
  algo/                 ← algorithms (no rendering code)
    heap.ts             priority queues: ArrayPQ, MinHeap (lazy), MinHeap with position table (decreaseKey); all instrumented
    search.ts           the shared best-first loop (Dijkstra = h 0, A* = g + h), one yield per operation
    graph.ts            shared types: Graph, Step events, path reconstruction
    dijkstra.ts         Dijkstra = search.ts with h = 0
    astar.ts            A* = search.ts with a heuristic
    run.ts              SearchRun: wraps a generator, accumulates state/stats; expand() = one node, stepOp() = one operation
  graphs/
    generate.ts         coordinate-graph generator (seeded) + the hand-made 5-node graph
    grids.ts            grid → graph conversion, heuristics, maze / trap / wall presets
  ui/
    player.ts           play / pause / step / run to end / speed controls
    graphView.ts        SVG renderer for coordinate graphs
    heapView.ts         SVG heap tree + array, sift path highlight
    codeView.ts         shows real source code and highlights the lines of the current operation
  demos/
    insideDemo.ts       operation-level view (step-through mode of ① and ②)
    graphDemo.ts        ①② three-way comparison on a fixed graph
    gridDemo.ts         ③ interactive grid (Canvas)
    analysisDemo.ts     ④ measurements
  i18n.ts               Korean / English strings
  main.ts               graph settings, tabs, language switch
```

Core idea: the search is a `function*` (generator) that `yield`s one event per operation (`init` / `visit` / `stale` / `relax` / `push` / `done` / `fail`),
and the rendering side draws purely from those events. `SearchRun.expand()` settles one node, so several algorithms can be compared at the same pace; `stepOp()` advances one operation for the step-through mode.

## Things you might want to change

- Graph shape: the `makeGeoGraph({...})` options in `src/main.ts` (`seed`, `n`, `k`, `slowProb`, `weights`, ...)
- Bad heuristic variants: `badHeuristics` in `src/demos/graphDemo.ts`
- Grid size and mud cost: constants at the top of `src/graphs/grids.ts` (`ROWS` and `COLS` must be odd)
- Worst-case scenarios: `cases` in `src/demos/analysisDemo.ts`
- Code lines highlighted in the step-through: the `// #tag` comments in `src/algo/search.ts` and `src/algo/heap.ts`
