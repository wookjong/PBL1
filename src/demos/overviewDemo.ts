import { t } from '../i18n';

/** Small sketch of the explored area: Dijkstra spreads in a circle, A* in a band toward the goal */
function sketch(kind: 'd' | 'a'): string {
  const area =
    kind === 'd'
      ? '<circle class="ov-area" cx="110" cy="80" r="74" />'
      : '<ellipse class="ov-area" cx="147" cy="80" rx="52" ry="18" />';
  return `<svg class="ov-sketch" viewBox="0 0 300 160" aria-hidden="true">
    ${area}
    <line class="ov-path" x1="110" y1="80" x2="184" y2="80" />
    <circle class="node start" cx="110" cy="80" r="9" />
    <circle class="node goal" cx="184" cy="80" r="9" />
  </svg>`;
}

export function mountOverview(root: HTMLElement): void {
  root.innerHTML = `
    <div class="ov">
      <section class="ov-sec">
        <h2>${t('무엇을 했나', 'What we did')}</h2>
        <p class="an-sub">${t(
          'Dijkstra와 A*를 <b>같은 코드</b>로 구현하고, 동작 과정을 단계별로 시각화하고, 성능을 측정했습니다.',
          'We implemented Dijkstra and A* with <b>the same code</b>, visualized how they run step by step, and measured their performance.',
        )}</p>
        <div class="ov-cards">
          <div class="ocard"><h4>${t('구현', 'Implementation')}</h4><p>${t(
            '탐색 루프 하나로 두 알고리즘을 실행합니다. 우선순위 큐는 배열, 힙, lazy 힙 3종입니다.',
            'One search loop runs both algorithms, with three priority queues: array, heap and lazy heap.',
          )}</p></div>
          <div class="ocard"><h4>${t('시각화', 'Visualization')}</h4><p>${t(
            '노드 5개부터 450개까지의 그래프와 직접 편집하는 격자에서 연산 하나씩 따라갑니다.',
            'Follow each operation on graphs from 5 to 450 nodes and on an editable grid.',
          )}</p></div>
          <div class="ocard"><h4>${t('성능 분석', 'Performance analysis')}</h4><p>${t(
            '노드 1,000개까지 늘리며 비교 횟수를 재고, A*가 느려지는 최악 사례를 찾았습니다.',
            'Counted comparisons up to 1,000 nodes and found the worst cases where A* slows down.',
          )}</p></div>
        </div>
      </section>

      <section class="ov-sec">
        <h2>${t('공통 동작', 'How both work')}</h2>
        <ol class="ov-steps">
          <li><b>1</b><span>${t('큐에서 <b>키가 가장 작은</b> 노드를 꺼내 확정합니다.', 'Pop the node with the <b>smallest key</b> from the queue and settle it.')}</span></li>
          <li><b>2</b><span>${t('이웃의 비용 <i>g</i>를 더 작게 만들 수 있으면 갱신하고 큐에 넣습니다.', 'If a neighbour’s cost <i>g</i> can be lowered, update it and push it onto the queue.')}</span></li>
          <li><b>3</b><span>${t('도착점이 확정되면 끝납니다.', 'Stop when the goal is settled.')}</span></li>
        </ol>
      </section>

      <section class="ov-sec">
        <h2>${t('차이는 키 하나', 'The only difference: the key')}</h2>
        <div class="ov-vs">
          <div class="panel">
            <h3>Dijkstra</h3>
            <div class="ov-key">${t('키', 'key')} = <i>g</i></div>
            <p class="sub">${t('지금까지 온 비용만 봅니다 → 시작점 둘레로 원처럼 퍼집니다.', 'Only the cost so far → spreads in a circle around the start.')}</p>
            ${sketch('d')}
          </div>
          <div class="panel">
            <h3>A*</h3>
            <div class="ov-key">${t('키', 'key')} = <i>g</i> + <i>h</i></div>
            <p class="sub">${t('남은 거리 추정 <i>h</i>를 더합니다 → 도착점 쪽으로만 좁게 탐색합니다.', 'Adds <i>h</i>, an estimate of the remaining distance → searches a narrow band toward the goal.')}</p>
            ${sketch('a')}
          </div>
        </div>
        <p class="an-note">${t(
          '<b>h가 실제 남은 비용을 넘지 않으면</b> A*도 최단 경로를 보장합니다. <b>h = 0</b>이면 A*는 Dijkstra와 똑같이 동작합니다.',
          'As long as <b>h never exceeds the true remaining cost</b>, A* still finds the shortest path. With <b>h = 0</b>, A* behaves exactly like Dijkstra.',
        )}</p>
      </section>
    </div>`;
}
