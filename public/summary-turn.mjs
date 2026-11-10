export function summaryRequest(instructions,token){return{type:'response.create',response:{conversation:'auto',max_output_tokens:4000,output_modalities:['text'],tools:[],tool_choice:'none',metadata:{purpose:'call_summary',summary_token:token},instructions:instructions||'总结本轮从开始到结束的全部学习过程，不把推断当确证。'}}}
export function isSummaryResponse(response,token){return !!token&&response?.metadata?.purpose==='call_summary'&&response.metadata.summary_token===token}
export function summaryTextFrom(response){return(response?.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text'||c.type==='text').map(c=>c.text||'').join('\n')}
export function validCallSummary(text){try{const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<start)return null;const x=JSON.parse(text.slice(start,end+1));if(x.kind==='call_summary'&&typeof x.overview==='string'&&typeof x.endedAt==='string'&&Array.isArray(x.outcomes)&&x.outcomes.every(o=>typeof o?.point==='string'&&['很熟练','一般','没搞懂','未评估'].includes(o.level)&&typeof o.evidence==='string')&&typeof x.userObservation==='string')return x;return x.kind==='call_summary'&&typeof x.overview==='string'&&Array.isArray(x.timeline)&&x.timeline.length>0&&Array.isArray(x.covered)&&Array.isArray(x.nextSteps)?x:null}catch{return null}}
export function formatCallSummary(x){
 if(Array.isArray(x.outcomes)){
   const cut=(text,n)=>Array.from(text.trim()).slice(0,n).join('');
   const points=x.outcomes.map(o=>'• '+o.point.trim()+'（'+o.level+'）：'+o.evidence.trim());
   return [cut(x.overview,100)+' · 结束在：'+cut(x.endedAt,70),'学习成果\n'+(points.join('\n')||'本轮暂无可评估的成果。')].join('\n\n');
 }
 return ['本轮整体回顾：'+x.overview,'按顺序回顾：',...x.timeline.map(v=>'• '+(typeof v==='string'?v:JSON.stringify(v))),'讲过的内容：'+x.covered.join('；'),'用户反馈与卡点：'+(x.difficulties||[]).join('；'),'未完成：'+(x.unfinished||[]).join('；'),'下一步：'+x.nextSteps.join('；'),...[['教学尝试和反应',x.teachingMethods],['用户偏好与依据',x.preferences],['下次可试',x.nextExperiments]].filter(([,items])=>Array.isArray(items)&&items.length).map(([label,items])=>label+'：'+items.join('；')),x.evidenceLimit?'记录范围：'+x.evidenceLimit:''].filter(Boolean).join('\n')}
