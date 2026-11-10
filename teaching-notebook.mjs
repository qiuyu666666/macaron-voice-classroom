export function renderNotebook(calls) {
  return '# 教学通话记录\n\n' + calls.map(({callId, at, goal, summary}, i) => {
    const metadata = JSON.stringify({callId, at, goal, summarized: Boolean(summary)});
    return '<!-- teaching-call ' + metadata + ' -->\n## 第 ' + (i + 1) + ' 次拨号 · ' + String(goal || '课堂').replace(/\s+/g, ' ') +
      '\n\n' + (at || '') + '\n\n' + (summary || '尚无挂断总结') + '\n';
  }).join('\n');
}

export function readNotebook(markdown) {
  const calls = [];
  const pattern = /^<!-- teaching-call (.+) -->\n## [^\n]*\n\n[^\n]*\n\n/gm;
  const markers = [...markdown.matchAll(pattern)];
  for (const [i, marker] of markers.entries()) {
    const {summarized, ...call} = JSON.parse(marker[1]);
    if (summarized) call.summary = markdown.slice(marker.index + marker[0].length, markers[i+1]?.index).trim();
    calls.push(call);
  }
  return calls;
}
