export function transcriptText(fragments) {
  if (!Array.isArray(fragments)) throw Error('通话转写格式无效');
  const parts = [];
  let speaker;
  for (const item of fragments) {
    if (!['user','assistant'].includes(item?.speaker) || typeof item.text !== 'string' || !item.text) continue;
    if (item.speaker !== speaker) {
      speaker = item.speaker;
      parts.push('\n\n' + (speaker === 'user' ? '用户' : '老师') + '：');
    }
    parts.push(item.text);
  }
  if (!parts.length) throw Error('通话转写为空');
  return parts.join('').trimStart();
}

export async function summarizeLesson(text, instructions, generate, segmentInstructions) {
  const budget = 32000;
  while (Buffer.byteLength(text) > budget) {
    const chunks = [];
    let chunk = '', bytes = 0;
    for (const char of text) {
      const size = Buffer.byteLength(char);
      if (bytes + size > budget) { chunks.push(chunk); chunk = ''; bytes = 0; }
      chunk += char;
      bytes += size;
    }
    if (chunk) chunks.push(chunk);
    const notes = [];
    for (const part of chunks) notes.push(await generate(segmentInstructions, part, 1200));
    const reduced = notes.join('\n\n');
    if (Buffer.byteLength(reduced) >= Buffer.byteLength(text)) throw Error('分段总结未能压缩，可重试');
    text = reduced;
  }
  return generate(instructions, '以下是按顺序整理的通话资料，可能有转写误差。\n'+text, 4000);
}
