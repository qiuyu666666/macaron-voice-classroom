(()=>{
 const channel=location.hash.slice(1),view=new URLSearchParams(location.search).get('view')==='outline'?'outline':'generated-course';let revision=1,currentPage=1,timer;const recentActions=[];
 const root=document.getElementById('root'),marks=document.getElementById('marks');
 const send=payload=>parent.postMessage({source:'generated-course',channel,payload},'*');
 const frameStyle=document.createElement('style');frameStyle.textContent='html,body{width:100%;height:100%;margin:0!important;padding:0!important;overflow:hidden!important}#root{position:absolute;inset:0 0 48px;overflow:hidden}#root [data-lesson-page]{position:absolute!important;left:50%!important;top:50%!important;width:340px!important;height:440px!important;box-sizing:border-box!important;padding:16px!important;margin:0!important;overflow:hidden!important;transform:translate(-50%,-50%) scale(var(--lesson-scale,1));transform-origin:center}#teaching-focus{position:absolute;inset:0;z-index:4;box-sizing:border-box;overflow:hidden}button[data-teacher-action="navigate"]{display:none!important}#lesson-pager button{display:block!important}[hidden]{display:none!important}';document.head.append(frameStyle);
 frameStyle.textContent+='#root{width:100%!important;max-width:none!important;margin:0!important}#root [data-lesson-page]{inset:0!important;transform:none!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}#marks{position:fixed;inset:0;pointer-events:none;z-index:24}';
 // Older outline renderers also load this bridge. Give their ordinary text rows the same layout.
 if(view==='outline')frameStyle.textContent+='.grid:not(.alphabet-grid){display:flex;flex-direction:column;gap:12px}.grid:not(.alphabet-grid)>.tile{background:none;padding:0;text-align:start;font-size:22px;line-height:1.4}';
 function fitFrame(){root.style.setProperty('--lesson-scale',Math.min(1,innerWidth/340,Math.max(1,innerHeight-(document.querySelectorAll('[data-lesson-page]').length>1?48:0))/440));}
 fitFrame();addEventListener('resize',fitFrame);
 const sections=()=>[...document.querySelectorAll('[data-lesson-page]')];
 const visible=e=>!e.closest?.('[hidden]')&&(!e.getClientRects||e.getClientRects().length>0);
 const pageId=()=>view+':'+location.pathname.split('/').pop()+'-'+currentPage;
 const navButtons=()=>[...document.querySelectorAll('button[data-teacher-action="navigate"][data-page-target]')];
 function pages(){const nodes=sections();return nodes.length?nodes.map((e,i)=>({page:i+1,title:e.dataset.pageTitle||'第'+(i+1)+'页'})):navButtons().map(e=>({page:Number(e.dataset.pageTarget),title:e.getAttribute('aria-label')||e.textContent.trim()}))}
 function layout(){return{emptyBoard:sections()[currentPage-1]?.dataset.boardEmpty==='true',navigationOwner:'shared',pageId:pageId(),revision,page:currentPage,pages:pages(),viewport:{width:innerWidth,height:innerHeight},elements:[...document.querySelectorAll('[data-element-id]')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return{id:e.dataset.elementId,text:e.textContent.slice(0,1200),control:e.dataset.teacherAction||null,x:r.x/innerWidth,y:r.y/innerHeight,width:r.width/innerWidth,height:r.height/innerHeight}})}}
 let markTarget=null;
 let spoken='',lastFragment=0,turn='';
 function clearTeacherMark(){spoken='';lastFragment=0;markTarget=null;marks.replaceChildren()}
 function paintTeacherMark(){
   if(!markTarget)return false;
   const target=markTarget.page===pageId()&&Array.from(root.querySelectorAll('[data-element-id]')).find(el=>el.dataset.elementId===markTarget.id&&visible(el));
   if(!target){clearTeacherMark();return false}
   const r=target.getBoundingClientRect();
   const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
   for(const [key,value] of Object.entries({x:Math.max(0,r.x-4),y:Math.max(0,r.y-4),width:r.width+8,height:r.height+8,rx:10,fill:'#ffe481','fill-opacity':'.36',stroke:'#e56b87','stroke-width':3}))rect.setAttribute(key,value);
   rect.setAttribute('data-target',markTarget.id);marks.replaceChildren(rect);return true;
 }
 const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 // Preserve word boundaries in alphabetic scripts while allowing Chinese around a term.
 const wordChar=c=>!!c && /[\p{L}\p{N}\p{M}]/u.test(c) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c);
 function termIndex(text,term){
   let at=text.length;
   while(term && (at=text.lastIndexOf(term,at))>=0){
     if(!(wordChar(term[0])&&wordChar(text[at-1]))&&!(wordChar(term.at(-1))&&wordChar(text[at+term.length])))return at;
     if(at===0)break;
     at--;
   }
   return -1;
 }
 function targets(){
   return [...root.querySelectorAll('[data-element-id]')].filter(el=>visible(el)&&!el.dataset.teacherAction&&!el.dataset.textBlock);
 }
 function highlight(el){
   markTarget={page:pageId(),id:el.dataset.elementId};
   return paintTeacherMark();
 }
 addEventListener('message',e=>{
   const data=e.data;
   if(e.source!==parent||data?.channel!==channel||data.source!=='lesson-spoken-text'||data.pageId!==pageId()||typeof data.delta!=='string')return;
   const now=performance.now();
   if(data.turn!==turn||now-lastFragment>2200)spoken='';
   turn=data.turn;lastFragment=now;
   const joined=spoken+data.delta;
   const offset=Math.max(0,joined.length-480);
   const oldLength=normalize(spoken.slice(offset)).length;
   spoken=joined.slice(offset);
   const phrase=normalize(spoken);
   let best,end=-1,length=0;
   for(const el of targets()){
     const term=normalize(el.textContent).replace(/^[•]\s*/,'');
     if(!term||term.length>100)continue;
     const start=termIndex(phrase,term);
     if(start<0)continue;
     const stop=start+term.length;
     if(stop<=oldLength)continue;
     if(stop>end||(stop===end&&term.length>length)){best=el;end=stop;length=term.length}
   }
   if(best&&best.dataset.elementId!==markTarget?.id)highlight(best);
 });
 function changed(){const active=document.querySelector?.('[data-current-page]');if(active&&!sections().length)currentPage=Number(active.dataset.currentPage)||currentPage;clearTimeout(timer);timer=setTimeout(()=>{revision++;paintTeacherMark();send({event:'page_ready',layout:layout(),pageId:pageId(),revision})},100)}
 let neighbors={back:false,forward:false};
 function refreshPager(){
   const nav=document.getElementById('lesson-pager');if(!nav)return;
   const total=pages().length;
   nav.hidden=total<2&&!neighbors.back&&!neighbors.forward;
   root.style.bottom=nav.hidden?'34px':'78px';
   document.getElementById('page-prev').disabled=currentPage<=1&&!neighbors.back;
   document.getElementById('page-next').disabled=currentPage>=total&&!neighbors.forward;
 }
 addEventListener('message',e=>{
   if(e.source!==parent||e.data?.channel!==channel||e.data.source!=='lesson-neighbors')return;
   neighbors={back:!!e.data.back,forward:!!e.data.forward};refreshPager();
 });
 function goPage(page){const nodes=sections(),known=pages();if(!Number.isInteger(page)||!known.some(p=>p.page===page))return false;document.getElementById('teaching-focus')?.remove();if(nodes.length){nodes.forEach((e,i)=>e.hidden=i!==page-1);currentPage=page;document.getElementById('page-prev').disabled=page===1;document.getElementById('page-next').disabled=page===nodes.length;window.scrollTo?.(0,0)}else{navButtons().find(e=>Number(e.dataset.pageTarget)===page)?.click();currentPage=page}refreshPager();revision++;clearTeacherMark();changed();return true}
 let hydrated=false;function initPages(){if(!hydrated&&sections().length){hydrated=true;try{const saved=JSON.parse(document.getElementById('lesson-quick-pages')?.textContent||'{}');for(const [page,p]of Object.entries(saved)){let old=sections().find(e=>e.dataset.lessonPage===page);if(!old&&p.title&&Number(page)===sections().length+1){old=document.createElement('section');old.dataset.lessonPage=page;root.append(old)}if(old){const page=p.title?renderQuickPage(document,old,Object.fromEntries(Object.entries(p).filter(([k])=>k!=='blocks'))):old;for(const block of p.blocks||[])patchTextBlock(document,page,block)}}}catch{}}const nodes=sections();if(!nodes.length||document.getElementById('lesson-pager'))return;nodes.forEach((e,i)=>e.hidden=i!==currentPage-1);const nav=document.createElement('nav');nav.id='lesson-pager';nav.hidden=nodes.length<2;root.style.bottom=nodes.length<2?'34px':'78px';fitFrame();nav.style='position:fixed;bottom:34px;left:0;right:0;background:#fffdf7;display:flex;align-items:center;justify-content:space-between;height:48px;box-sizing:border-box;padding:6px 18px;z-index:5';const prev=document.createElement('button'),next=document.createElement('button');prev.id='page-prev';next.id='page-next';prev.textContent='上一个知识点';next.textContent='下一个知识点';for(const [b,id]of[[prev,'previous-page'],[next,'next-page']]){b.dataset.elementId=id;b.dataset.teacherAction='navigate';b.style='border:0;border-radius:18px;background:#f4f2ed;padding:10px 14px;color:#2a2a29'}function userTurn(delta){const before=layout();if((delta<0&&currentPage===1&&neighbors.back)||(delta>0&&currentPage===pages().length&&neighbors.forward)){send({event:"knowledge_boundary",delta});return}if(goPage(currentPage+delta))send({event:'user_navigation',actor:'user',from:before.page,to:currentPage,previousPage:before.pages.find(p=>p.page===before.page),currentPage:pages().find(p=>p.page===currentPage),before,layout:layout()})}prev.onclick=()=>userTurn(-1);next.onclick=()=>userTurn(1);nav.append(prev,next);document.body.append(nav);goPage(currentPage)}
 addEventListener('message',async e=>{if(e.source!==parent||e.data?.channel!==channel||e.data?.source!=='lesson-tool-request')return;const c=e.data.command;let result={ok:false,error:'unsupported_action'};
 if(c.action==='measure')result={ok:true,layout:layout()};
 else if(c.pageId!==pageId()||c.revision!==revision)result={ok:false,error:'stale_page_version'};
 else if(c.action==='patch_text'){try{patchTextBlock(document,sections()[currentPage-1],c.block);revision++;result={ok:true,page:currentPage,layout:layout()}}catch(e){result={ok:false,error:e.message}}}
 else if(c.action==='append_point'){
   try{
     validateQuickPage(c.content);const number=sections().length+1;
     if(number>40)throw Error('page_limit');
     const stub=document.createElement('section');stub.dataset.lessonPage=String(number);root.append(stub);
     renderQuickPage(document,stub,c.content);
     document.getElementById('lesson-pager').hidden=false;root.style.bottom='78px';goPage(number);
     result={ok:true,page:number,layout:layout()};
   }catch(e){result={ok:false,error:e.message}}
 }
 else if(c.action==='quick_update'){try{const section=sections()[currentPage-1];if(!section)throw Error('no_page');renderQuickPage(document,section,c.content);revision++;clearTeacherMark();result={ok:true,page:currentPage,layout:layout()}}catch{result={ok:false,error:'invalid_quick_page'}}}
 else if(c.action==='go_page'){if(goPage(c.page)){await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));result={ok:true,layout:layout()}}else result={ok:false,error:'unknown_page'}}
 else if(c.action==='focus'){
   try{
     const term=normalize(c.text||'');
     if(!term||c.text.length>200)throw Error('invalid_focus');
     const matches=targets().filter(el=>termIndex(normalize(el.textContent),term)>=0);
     let target=matches.sort((a,b)=>a.textContent.length-b.textContent.length)[0],block;
     if(!target){
       const page=sections()[currentPage-1];
       if(!page)throw Error('no_page');
       const id='focus-'+Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(36)).join('');
       const label=c.text.trim();
       block={id,markdown:[label,(c.note||'').slice(0,419-label.length)].filter(Boolean).join('\n')};
       patchTextBlock(document,page,block);revision++;
       target=page.querySelector('[data-element-id="md-'+id+'-line1"]');
     }
     spoken='';
     result={ok:highlight(target),page:currentPage,layout:layout(),elementId:target.dataset.elementId,block};
   }catch(err){result={ok:false,error:err.message}}
 }
 else if(c.action==='activate'){const el=[...document.querySelectorAll('button[data-element-id][data-teacher-action]')].find(e=>e.dataset.elementId===c.elementId&&visible(e));if(el&&!el.disabled&&['navigate','play','pause'].includes(el.dataset.teacherAction)){if(el.id==='page-prev'||el.id==='page-next')goPage(currentPage+(el.id==='page-next'?1:-1));else el.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));result={ok:true,action:el.dataset.teacherAction,elementId:c.elementId,layout:layout()}}else result={ok:false,error:'control_not_allowed'}}
 else if(c.action==='clear_teacher'){clearTeacherMark();result={ok:true}}
 else if(c.action==='highlight'){
   markTarget={page:pageId(),id:c.elementId};
   result=paintTeacherMark()?{ok:true,elementId:c.elementId}:{ok:false,error:'element_not_on_current_page'};
 }
 parent.postMessage({source:'lesson-tool-result',channel,requestId:e.data.requestId,result},'*')});
 new ResizeObserver(changed).observe(root);new MutationObserver(()=>{initPages();changed()}).observe(root,{childList:true,subtree:true,characterData:true});addEventListener('resize',changed);addEventListener('scroll',paintTeacherMark);
 function learningState(scope){const page=scope||sections()[currentPage-1]||root;const quiz=page.matches?.('[data-question-id]')?page:page.querySelector('[data-question-id]')||page;const text=e=>(e?.innerText||e?.textContent||'').trim().slice(0,4000);return{pageTitle:page.dataset.pageTitle||'',pageText:text(page),questionId:quiz.dataset.questionId||null,question:quiz.dataset.question||text(quiz.querySelector('[data-question],[data-element-id*="question"]'))||null,options:[...quiz.querySelectorAll('[data-option-id],button,input[type="radio"],option')].filter(visible).slice(0,20).map(e=>({id:e.dataset.optionId||e.dataset.elementId||e.id||null,text:text(e)||e.getAttribute('aria-label')||e.value||'',selected:e.checked||e.selected||e.getAttribute('aria-pressed')==='true'||e.dataset.selected==='true',correct:e.dataset.correct===undefined?null:e.dataset.correct==='true'})),result:quiz.dataset.result||null,correctAnswer:quiz.dataset.correctAnswer||null,explanation:quiz.dataset.explanation||null,feedback:[...quiz.querySelectorAll('[data-feedback],[role="status"],[data-element-id*="feedback"]')].filter(visible).map(text).join('\n')||null}}
 function interaction(e,event){if(e.target.closest('#lesson-pager,[data-ink-toolbar]'))return;const el=e.target.closest('button,input,select,[data-element-id]');if(!el)return;const scope=el.closest('[data-question-id]')||el.closest('[data-lesson-page]')||sections()[currentPage-1]||root;const before=learningState(scope),action={elementId:el.dataset.elementId||null,text:(el.innerText||el.textContent||'').slice(0,300),value:'value'in el?String(el.value).slice(0,500):null};recentActions.push({...action,pageId:pageId()});if(recentActions.length>4)recentActions.shift();if(el.dataset.pageTarget)currentPage=Number(el.dataset.pageTarget);setTimeout(()=>send({event,eventId:crypto.randomUUID(),actor:e.isTrusted?'user':'tool',pageId:pageId(),revision,action,recentActions:[...recentActions],before,after:learningState(scope),layout:layout()}),100)}
 document.addEventListener('click',e=>interaction(e,'interaction'));
 document.addEventListener('change',e=>interaction(e,'value_changed'));
 addEventListener('error',()=>send({event:'course_error',message:'课件运行错误'}));let announced=false;const announce=()=>{if(announced||!root.children.length)return;announced=true;initPages();if(typeof installLessonInk==='function')installLessonInk({root,marks,channel,currentPage:()=>currentPage,send});send({event:'course_ready',pageId:pageId(),revision,layout:layout()})};announce();const readyTimer=setInterval(()=>{announce();if(announced)clearInterval(readyTimer)},100);setTimeout(()=>{clearInterval(readyTimer);if(!announced)send({event:'course_error',message:'课件未渲染内容'})},8000);
})();
