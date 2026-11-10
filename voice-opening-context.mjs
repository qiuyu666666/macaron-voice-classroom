// Budget the serialized opening brief, including JSON escaping and the editable prefix.
export const openingBytes = 12000;
function excerpt(value, limit) {
  const text = String(value ?? '');
  if (Buffer.byteLength(text) <= limit) return text;
  let result = '', used = 3;
  for (const char of text) {
    used += Buffer.byteLength(char);
    if (used > limit) break;
    result += char;
  }
  return result + '…';
}

export function openingContext(prefix, data) {
  const {history, outline, course_brief, goal, ...meta} = data;
  const brief = {...meta, goal:excerpt(goal, 800), history:history.slice(-4).map(m=>({role:m.role,text:excerpt(m.text,350)}))};
  const render = () => excerpt(prefix, 1000) + '\n' + JSON.stringify(brief);
  const fits = () => Buffer.byteLength(render()) <= openingBytes;
  brief.course_brief = excerpt(typeof course_brief === 'string' ? course_brief : JSON.stringify(course_brief), 600);
  brief.outline = outline;
  if (!fits()) brief.outline = excerpt(JSON.stringify(outline), 1600);
  if (!fits()) delete brief.outline;
  if (!fits()) delete brief.course_brief;
  return render();
}
