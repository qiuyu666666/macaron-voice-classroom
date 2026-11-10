// Older chats sometimes include an outline. The voice board uses only invitation fields.
export function voiceActions(text){
  const out=[], fence=/^```(?:courseware|voice-call)[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;
  for(const match of text.matchAll(fence)){
    let value;try{value=JSON.parse(match[1])}catch{continue}
    if(!value||typeof value!=='object'||Array.isArray(value))continue;
    if(Object.keys(value).some(key=>!['label','goal','course_brief','outline'].includes(key)))continue;
    if(![['label',40],['goal',1000],['course_brief',6000]].every(([key,max])=>typeof value[key]==='string'&&value[key].trim()&&value[key].length<=max))continue;
    const {label,goal,course_brief}=value;
    out.push({label,goal,course_brief,index:out.length,start:match.index,end:match.index+match[0].length});
  }
  return out;
}
export function chatChunks(text){let clean=text.replace(/^```(?:courseware|voice-call)[^\S\r\n]*\r?\n[\s\S]*?(?:^```[^\S\r\n]*$|$(?![\s\S]))/gm,'').trim();const lines=clean.split('\n');const tail=lines.at(-1)?.trim();if(lines.slice(0,-1).filter(line=>line.trim().startsWith('```')).length%2===0&&tail&&tail.startsWith('`')&&['```courseware','```voice-call'].some(prefix=>prefix.startsWith(tail)))lines.pop();const chunks=[];let block=[],fenced=false;for(const line of lines){if(line.trim().startsWith('```'))fenced=!fenced;if(!line.trim()&&!fenced){if(block.length){chunks.push(block.join('\n').trim());block=[]}}else block.push(line)}if(block.length)chunks.push(block.join('\n').trim());return chunks.filter(Boolean)}
