export function validateQuickPage(p){if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['markdown','purpose','title','focus','explanation','example','question','options','correctIndex','feedback'].includes(k)))throw Error('invalid_quick_page');if(p.purpose!==undefined&&!['knowledge','assessment'].includes(p.purpose))throw Error('invalid_page_purpose');if(p.purpose==='knowledge'&&(p.question||p.options))throw Error('use_separate_assessment_page');if(p.purpose==='assessment'&&!p.question)throw Error('assessment_question_required');for(const [key,max]of [['markdown',420],['title',60],['focus',100],['explanation',150],['example',120],['question',120],['feedback',180]])if((['title','focus'].includes(key)||p[key]!==undefined)&&(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max))throw Error('invalid_'+key);if(p.options!==undefined){if(!Array.isArray(p.options)||p.options.length<2||p.options.length>3||p.options.some(x=>typeof x!=='string'||!x.trim()||x.length>60)||!p.question||!Number.isInteger(p.correctIndex)||p.correctIndex<0||p.correctIndex>=p.options.length||!p.feedback)throw Error('invalid_quick_question')}else if(p.correctIndex!==undefined)throw Error('options_required');return p}
export function renderQuickPage(doc,old,p){validateQuickPage(p);const section=doc.createElement('section');section.dataset.lessonPage=old.dataset.lessonPage;section.dataset.pageTitle=p.title;section.hidden=old.hidden;section.style.cssText='display:flex;flex-direction:column;gap:12px;color:#2a2a29;background:#fffdf7;font:16px/1.45 system-ui';const add=(tag,text,size,id)=>{if(!text)return;const e=doc.createElement(tag);appendBoardInline(doc,e,text);e.style.cssText='margin:0;overflow-wrap:anywhere;font-size:'+size+'px';if(id)e.dataset.elementId=id;section.append(e);return e};add('h1',p.title,22,'quick-title');if(p.markdown){patchTextBlock(doc,section,{id:'body',markdown:p.markdown})}else if(p.purpose!=='assessment'){add('div',p.focus,28,'quick-focus');add('p',p.explanation,16,'quick-explanation');add('p',p.example,16,'quick-example')}if(p.question)add('p',p.question,16,'quick-question');if(p.options){section.dataset.questionId='quick-'+old.dataset.lessonPage;section.dataset.question=p.question;section.dataset.result='unanswered';section.dataset.correctAnswer=p.options[p.correctIndex];section.dataset.explanation='';const feedback=doc.createElement('p');feedback.dataset.feedback='true';feedback.style.cssText='margin:0;font-size:16px';const buttons=p.options.map((text,i)=>{const b=doc.createElement('button');b.textContent=text;b.dataset.elementId='quick-option-'+i;b.dataset.optionId='quick-'+i;b.dataset.correct=String(i===p.correctIndex);b.setAttribute('aria-pressed','false');b.style.cssText='padding:10px;text-align:left;border:1px solid #d4d0c8;border-radius:12px;background:#f4f2ed;color:#2a2a29;font-size:16px';b.onclick=()=>{buttons.forEach((x,k)=>x.setAttribute('aria-pressed',String(i===k)));section.dataset.result=i===p.correctIndex?'correct':'incorrect';section.dataset.explanation=p.feedback;feedback.textContent=p.feedback};section.append(b);return b});section.append(feedback)}old.replaceWith(section);return section}

export function validateTextBlock(block) {
  if (!block || typeof block.id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(block.id)
      || typeof block.markdown !== 'string' || !block.markdown.trim() || block.markdown.length > 420)
    throw Error('invalid_text_block');
  return {id:block.id, markdown:block.markdown};
}

function appendBoardInline(doc, parent, text) {
  for (const part of text.split(/(\*\*[^*\n]+\*\*|==[^=\n]+==)/)) {
    if (!/^(?:\*\*|==).+(?:\*\*|==)$/.test(part)) {
      parent.append(doc.createTextNode(part));
      continue;
    }
    const mark = doc.createElement('mark');
    if(parent.dataset.elementId) mark.dataset.elementId=parent.dataset.elementId+'-key'+parent.querySelectorAll('mark').length;
    mark.textContent = part.slice(2,-2);
    mark.style.cssText='background:#ffedaa;color:inherit;border-radius:3px;padding:0 2px;font-weight:600';
    parent.append(mark);
  }
}

function cellsOf(line) {
  if (!line || !line.includes('|')) return null;
  const parts=line.trim().split(/(?<!\\)\|/);
  if (parts.length<2) return null;
  if (parts[0]==='') parts.shift();
  if (parts.at(-1)==='') parts.pop();
  return parts.map(s=>s.trim().replace(/\\\|/g,'|'));
}

function boardTable(doc, lines, start, id) {
  const header=cellsOf(lines[start]), separators=cellsOf(lines[start+1]);
  if (!header?.length || header.length!==separators?.length || !separators.every(s=>/^:?-{3,}:?$/.test(s))) return null;
  const table=doc.createElement('table');
  table.style.cssText='width:100%;border-collapse:collapse;table-layout:fixed;text-align:left;font:inherit;margin:4px 0';
  const body=doc.createElement('tbody');
  function row(values, index, parent) {
    const tr=doc.createElement('tr');
    for(let col=0;col<header.length;col++){
      const cell=doc.createElement(index?'td':'th'), sep=separators[col];
      cell.dataset.elementId='md-'+id+'-t'+start+'-r'+index+'-c'+col;
      cell.style.cssText='padding:1px 7px;border-bottom:1px solid #e6e2da;line-height:1.3;overflow-wrap:anywhere';
      cell.style.textAlign=sep.startsWith(':')&&sep.endsWith(':')?'center':sep.endsWith(':')?'right':'left';
      if(!index){cell.scope='col';cell.style.background='#f2efe8'}
      appendBoardInline(doc,cell,values[col]||'');tr.append(cell);
    }
    parent.append(tr);
  }
  row(header,0,table.createTHead());table.append(body);
  let end=start+2, values;
  while((values=cellsOf(lines[end]))){row(values,end-start-1,body);end++}
  return {table,end};
}

export function patchTextBlock(doc, page, input) {
  const {id, markdown} = validateTextBlock(input);
  const previous = Array.from(page.children).find(el => el.dataset.textBlock === id);
  const block = doc.createElement('div');
  block.dataset.textBlock = id;
  block.dataset.elementId = 'md-' + id;
  block.style.cssText = 'font:16px/1.4 system-ui;overflow-wrap:anywhere;margin:4px 0;color:#282723';
  const lines=markdown.trim().split(/\r?\n/);
  for(let i=0;i<lines.length;){
    const parsed=boardTable(doc,lines,i,id);
    if(parsed){block.append(parsed.table);i=parsed.end;continue}
    const line=lines[i++],row=doc.createElement('div');
    row.dataset.elementId=block.dataset.elementId+'-line'+i;
    if (/^#{1,3} /.test(line)) row.style.fontWeight='650';
    appendBoardInline(doc,row,line.replace(/^#{1,3} /,'').replace(/^[-*] /,'• '));
    block.append(row);
  }
  if (previous) previous.replaceWith(block); else page.append(block);
  if (page.clientHeight && page.scrollHeight > page.clientHeight + 2) {
    if (previous) block.replaceWith(previous); else block.remove();
    throw Error('page_full_use_next_page');
  }
}
