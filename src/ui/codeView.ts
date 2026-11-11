/**
 * Shows real source code (imported with Vite's `?raw`) and highlights the lines that belong to the current operation.
 * Lines are tagged in the source with trailing comments such as `// #visit #stale`; the tags are removed for display.
 *  - Line numbers are the real line numbers in the file.
 *  - `#viz` lines (yield statements that only feed the visualization) are hidden, so their numbers are skipped.
 *  - The highlighted block is pale yellow; the line the operation ends on gets a ▶ marker and a stronger yellow.
 */
interface Line {
  no: number; // line number in the file
  text: string;
  tags: Set<string>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parse(src: string, from?: RegExp): Line[] {
  const all = src.replace(/\r/g, '').split('\n');
  let start = 0;
  if (from) {
    const i = all.findIndex((l) => from.test(l));
    if (i > 0) start = i;
  }
  let end = all.length;
  while (end > start && all[end - 1].trim() === '') end--;
  const out: Line[] = [];
  for (let i = start; i < end; i++) {
    const raw = all[i];
    const tags = new Set<string>();
    const m = raw.match(/^(.*?)\s*\/\/(.*)$/);
    if (!m || !/#\w/.test(m[2])) {
      out.push({ no: i + 1, text: raw, tags });
      continue;
    }
    const rest = m[2]
      .replace(/#(\w+)/g, (_, tag: string) => {
        tags.add(tag);
        return '';
      })
      .trim();
    if (tags.has('viz')) continue; // visualizer hook: not part of the algorithm
    out.push({ no: i + 1, text: rest ? `${m[1]} // ${rest}` : m[1], tags });
  }
  return out;
}

/** Very small syntax colouring: comments, strings, keywords, numbers */
function colour(code: string): string {
  const out: string[] = [];
  const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|if|else|for|while|return|continue|break|yield|function\*?|export|import|from|type|interface|class|private|readonly|new|of|this|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;
  let last = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    out.push(esc(code.slice(last, m.index)));
    const cls = m[1] ? 'c-com' : m[2] ? 'c-str' : m[3] ? 'c-kw' : 'c-num';
    out.push(`<span class="${cls}">${esc(m[0])}</span>`);
    last = m.index + m[0].length;
  }
  out.push(esc(code.slice(last)));
  return out.join('');
}

export class CodeView {
  readonly el: HTMLElement;
  private box: HTMLElement;
  private lineEls: HTMLElement[] = [];
  private lines: Line[];

  /**
   * `file`: path shown in the header. `from`: start at the first line matching it (to skip imports and long headers).
   */
  constructor(src: string, file: string, from?: RegExp) {
    const lines = (this.lines = parse(src, from));
    this.el = document.createElement('div');
    this.el.className = 'code-view';
    this.el.innerHTML = `<div class="code-head"><b>${esc(file)}</b><span class="code-note"></span></div>`;
    this.box = document.createElement('div');
    this.box.className = 'code-box';
    const pre = document.createElement('pre');
    lines.forEach((l) => {
      const div = document.createElement('div');
      div.className = 'ln';
      div.innerHTML = `<span class="mk"></span><span class="no">${l.no}</span>${colour(l.text) || ' '}`;
      pre.appendChild(div);
      this.lineEls.push(div);
    });
    this.box.appendChild(pre);
    this.el.appendChild(this.box);
  }

  setNote(html: string): void {
    this.el.querySelector('.code-note')!.innerHTML = html;
  }

  /**
   * Highlights every line that has one of the tags. The ▶ marker goes on the last line carrying the last tag
   * (the line the operation finishes on). Lines carrying a `dim` tag (and no active tag) are faded.
   */
  highlight(tags: string[], dim: string[] = []): void {
    const curTag = tags[tags.length - 1];
    let cur = -1;
    this.lines.forEach((l, i) => {
      const on = tags.some((t) => l.tags.has(t));
      const off = !on && dim.some((t) => l.tags.has(t));
      const el = this.lineEls[i];
      el.classList.toggle('hl', on);
      el.classList.toggle('off', off);
      el.classList.remove('cur');
      if (curTag && l.tags.has(curTag)) cur = i;
    });
    if (cur < 0) return;
    const c = this.lineEls[cur];
    c.classList.add('cur');
    const box = this.box;
    if (box.clientHeight === 0) return; // hidden tab
    const top = c.offsetTop - box.clientHeight / 2;
    if (c.offsetTop < box.scrollTop + 20 || c.offsetTop > box.scrollTop + box.clientHeight - 40) {
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }
}
