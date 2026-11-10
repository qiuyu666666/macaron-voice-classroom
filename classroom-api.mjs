import {renderNotebook,readNotebook} from './teaching-notebook.mjs';
import {openingContext} from './voice-opening-context.mjs';
import {createReadStream} from 'node:fs';
import {unlink,stat} from 'node:fs/promises';
import{readLessonFile}from'./lesson-file-reader.mjs';
import{courseBridgeSource,injectQuickPages}from'./course-bridge-source.mjs';
import{validateTextBlock,validateQuickPage}from'./public/quick-lesson.mjs';
import{prepareMaterial,materialInfo}from'./dynamic-course.mjs';
import{repairCourseReply}from'./course-repair.mjs';
import{validOutline,outlineHTML}from'./lesson-outline.mjs';
import{courseReadyCard,canStartVoice,jobState}from'./course-flow.mjs';
import{runtimeMessages}from'./prompt-settings.mjs';
import{fileURLToPath}from'node:url';
import{mkdir,readFile,writeFile,rename,readdir}from'node:fs/promises';
import{randomUUID}from'node:crypto';
import{piPrompt,piSettings}from'./pi-runtime.mjs';
import{voiceActions}from'./public/voice-action.mjs';
import{buildCourse,workerArtifact}from'./course-build.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),dir=process.env.CLASSROOM_DATA_DIR||root+'private/pi-classroom';
const materialQueues=new Map();
const sessions=new Map(),jobs=new Map(),busy=new Set(),controllers=new Map();
const valid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
const writes=new Map();
const save=(path,data)=>{const pending=(writes.get(path)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true,mode:0o700});const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,typeof data==='string'?data:JSON.stringify(data,null,2),{mode:0o600});await rename(temporary,path)});writes.set(path,pending);return pending};
const sessionPath=id=>dir+'/chats/'+id+'/state.json';
async function getSession(id){if(!valid(id))return null;if(sessions.has(id))return sessions.get(id);try{const s=JSON.parse(await readFile(sessionPath(id),'utf8'));for(const [key,status] of Object.entries(s.requests||{}))if(['sending','sent','read'].includes(status))s.requests[key]='unknown';sessions.set(id,s);return s}catch{return null}}
async function getJob(id){if(!valid(id))return null;if(jobs.has(id))return jobs.get(id);try{const j=JSON.parse(await readFile(dir+'/jobs/'+id+'/manifest.json','utf8'));if(['generating','validating','repairing'].includes(j.status))j.status='unknown';if(j.status==='ready'&&j.source&&!j.validation?.types){try{const result=await buildCourse(dir+'/jobs/'+j.id,'```tsx\n'+j.source+'\n```');j.source=result.source;j.validation={types:true,build:true,at:new Date().toISOString()}}catch(e){j.status='failed';j.error=e.message}await save(dir+'/jobs/'+j.id+'/manifest.json',j)}jobs.set(id,j);return j}catch{return null}}
const persistJob=j=>save(dir+'/jobs/'+j.id+'/manifest.json',j);
export async function ownedJob(req,id){const sid=(req.headers.cookie||'').match(/(?:^|;\s*)pi_chat=([a-f0-9-]+)/)?.[1];const j=await getJob(id);return j&&j.chatId===sid?j:null}
// Build the account notebook from durable call records, including older completed lessons.
async function teachingNotebook(session) {
  const lessons = await Promise.all(session.jobs.map(getJob));
  const calls = [];
  for (const lesson of lessons) {
    if (!lesson || lesson.chatId !== session.id || lesson.parentJobId) continue;
    const runs = lesson.voiceRuns?.length ? lesson.voiceRuns : [lesson.voicePermit || (lesson.summary && {at:lesson.createdAt})].filter(Boolean);
    for (const run of runs) {
      const isLatest = run === runs.at(-1);
      calls.push({callId:run.callId || lesson.id, at:run.at, goal:lesson.goal,
        summary:isLatest && !lesson.summary?.knownInvalid ? [lesson.summary?.text,lesson.summary?.userObservation && '用户观察\n'+lesson.summary.userObservation].filter(Boolean).join('\n\n') || undefined : undefined});
    }
  }
  calls.sort((a,b) => String(a.at).localeCompare(String(b.at)));
  const path = dir+'/chats/'+session.id+'/teaching-history.md';
  await save(path, renderNotebook(calls));
  return calls;
}
export async function callContext(req,id,ticket){const j=await ownedJob(req,id);if(!canStartVoice(j))throw Error('教案尚未就绪');if(!ticket||j.voicePermit?.token!==ticket)throw Error('请先在聊天中的课件邀请卡上点击“开启语音对话”');if(j.summary)throw Error('本次课堂已结束，请回到聊天查看总结；新课堂请让 Pi 提供新按钮');const s=await getSession(j.chatId);const path=dir+'/chats/'+s.id+'/teaching-history.md';let calls;try{calls=readNotebook(await readFile(path,'utf8'))}catch{calls=await teachingNotebook(s)}return{job:j,text:openingContext((await runtimeMessages()).voiceContextPrefix,{source:'voice_course_context',callNumber:calls.findIndex(c=>c.callId===(j.voicePermit.callId||j.id))+1,historyFile:"teaching-history.md",hasPriorTeaching:calls.some(c=>c.summary&&c.callId!==j.voicePermit.callId),goal:j.goal,course_brief:j.course_brief,initialView:'board',courseStatus:j.status,material:{id:j.id,status:j.status,directory:dir+'/jobs/'+j.id,files:['teaching-history.md']},course:undefined,history:s.messages.filter(m=>['assistant','user'].includes(m.role)&&m.text&&!m.text.startsWith('【语音课堂总结')&&!m.courseReady).slice(-4).map(m=>({role:m.role,text:m.text})).filter(m=>m.text).map(m=>({...m,text:m.text.slice(0,3000)}))})}}
const welcomes=new Map();
function welcomeOnEntry(session){
 const active=welcomes.get(session.id);
 if(active)return active.promise;
 if(session.messages.length||session.welcome==='done'||busy.has(session.id))return Promise.resolve();
 const entry={skip:false};
 entry.promise=(async()=>{
   // A persisted claim prevents an uncertain model request from being repeated after restart.
   const fallback='你最近想学点什么？可以是语言、金融、AI，也可以直接说一个你想弄懂的问题。';
   let reply=fallback;
   if(session.welcome!=='pending'){
     session.welcome='pending';await save(sessionPath(session.id),session);
     try{
       const answer=await piPrompt({directory:dir+'/chats/'+session.id,timeout:30000,message:(await runtimeMessages()).chatWelcome,
         system:(await readFile(root+'prompts/pi-chat.md','utf8'))+'\n'+await readFile(root+'prompts/teaching-policy.md','utf8')});
       if(answer.trim()&&!answer.includes('```'))reply=answer.trim();
     }catch{/* Let first-time visitors continue even if Pi is unavailable. */}
   }
   if(!entry.skip&&!session.messages.length)session.messages.push({id:'welcome-'+session.id,role:'assistant',text:reply});
   session.welcome='done';await save(sessionPath(session.id),session);
 })().finally(()=>welcomes.delete(session.id));
 welcomes.set(session.id,entry);
 return entry.promise;
}
export async function classroomApi(req,res,url,{json,body}){if(!url.pathname.startsWith('/api/pi/')&&!url.pathname.startsWith('/course-artifact/'))return false;
const sid=(req.headers.cookie||'').match(/(?:^|;\s*)pi_chat=([a-f0-9-]+)/)?.[1];let s=await getSession(sid);
if(url.pathname==='/api/pi/session'&&req.method==='GET'){if(!s){s={id:randomUUID(),messages:[],requests:{},jobs:[]};sessions.set(s.id,s);await save(sessionPath(s.id),s);res.setHeader('Set-Cookie',`pi_chat=${s.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`)}let settings;try{settings=await piSettings()}catch(e){settings={error:e.message}}const knownJobs=(await Promise.all(s.jobs.map(getJob))).filter(Boolean);for(const job of knownJobs)await publishReadyCard(job,s);json(res,200,{...s,settings,jobStates:knownJobs.filter(j=>!j.parentJobId).map(jobState)});return true}
if(!s){json(res,401,{error:'请先打开聊天建立会话'});return true}
if(url.pathname==='/api/pi/welcome'&&req.method==='POST'){
 if(req.headers['x-chat-session']!==s.id){json(res,409,{error:'聊天已切换'});return true}
 await welcomeOnEntry(s);json(res,200,{ok:true});return true;
}
if(url.pathname==='/api/pi/context'&&req.method==='GET'){json(res,200,await callContext(req,url.searchParams.get('job'),url.searchParams.get('voice')));return true}
if(url.pathname==='/api/pi/chat'&&req.method==='POST'){const input=JSON.parse(await body(req));if(typeof input.text!=='string'||!input.text.trim()||input.text.length>12000||!valid(input.requestId))throw Error('消息格式不正确');const opening=welcomes.get(s.id);if(opening){opening.skip=true;await opening.promise}if(s.requests[input.requestId]){json(res,409,{error:'该消息已提交，请刷新查看结果，未重复发送'});return true}if(busy.has(s.id)){json(res,409,{error:'请等待当前回复或总结同步完成'});return true}busy.add(s.id);s.requests[input.requestId]='sent';s.messages.push({id:input.requestId,role:'user',text:input.text});await save(sessionPath(s.id),s);res.writeHead(200,{'Content-Type':process.env.FRONTEND_SHARE_ORIGIN?'application/octet-stream':'text/event-stream','Cache-Control':'no-store'});const emit=e=>{if(!res.destroyed)res.write('data: '+JSON.stringify(e)+'\n\n')};emit({type:'accepted',requestId:input.requestId});try{let readSaved;let text=await piPrompt({directory:dir+'/chats/'+s.id,message:await chatInput(s,input.text),system:(await readFile(root+'prompts/pi-chat.md','utf8'))+'\n'+await readFile(root+'prompts/teaching-policy.md','utf8'),onDelta:text=>{if(!text)return;if(!readSaved){s.requests[input.requestId]='read';readSaved=save(sessionPath(s.id),s);readSaved.catch(()=>{})}emit({type:'delta',text})}});if(readSaved)await readSaved;text=await repairReply(s,text);const m={id:randomUUID(),role:'assistant',text};s.messages.push(m);s.requests[input.requestId]='succeeded';await save(sessionPath(s.id),s);const prepared=[];for(const action of voiceActions(text)){prepared.push(jobState(await ensureCourse(s,m,action.index)))}emit({type:'done',message:m,jobs:prepared})}catch(e){s.requests[input.requestId]='unknown';await save(sessionPath(s.id),s);emit({type:'error',message:e.message})}finally{busy.delete(s.id);res.end()}return true}
if(url.pathname==='/api/pi/jobs'&&req.method==='POST'){const input=JSON.parse(await body(req));const m=s.messages.find(m=>m.id===input.messageId&&m.role==='assistant');if(!m)throw Error('消息不存在');let target=m;if(!voiceActions(m.text).length){if(busy.has(s.id))throw Error('请等待当前回复完成');busy.add(s.id);try{const text=await repairReply(s,m.text);target={id:randomUUID(),role:'assistant',text};s.messages.push(target);await save(sessionPath(s.id),s)}finally{busy.delete(s.id)}}const job=await ensureCourse(s,target,input.index);json(res,202,jobState(job));return true}
const materialMatch=url.pathname.match(/^\/api\/pi\/jobs\/([a-f0-9-]+)\/materials$/);if(materialMatch){const parent=await ownedJob(req,materialMatch[1]);if(!parent||parent.parentJobId){json(res,404,{error:'课堂不存在'});return true}if(req.method==='GET'){const materials=(await Promise.all((parent.materials||[]).map(getJob))).filter(Boolean).filter(material=>{
 const legacyPreview=material.updateMode==='revise'&&material.course_brief?.startsWith('围绕课堂目标「')&&material.course_brief.includes('准备一个相关但不同的后续知识点');
 return !(legacyPreview&&parent.voicePermit?.at&&material.createdAt<parent.voicePermit.at);
});json(res,200,{materials:materials.map(j=>({...materialInfo(j),directory:dir+'/jobs/'+j.id,files:['Lesson.tsx','quick-pages.json','worker/output/outline.json']}))});return true}if(req.method==='POST'){if(parent.status==='voice_ready'){json(res,410,{error:'此课堂使用语音老师直接生成的画板'});return true}const input=JSON.parse(await body(req));await callContext(req,parent.id,input.voiceTicket);const work=(materialQueues.get(parent.id)||Promise.resolve()).catch(()=>{}).then(()=>prepareMaterial(parent,input,{get:getJob,persist:async j=>{jobs.set(j.id,j);await persistJob(j)},session:s,saveSession:s=>save(sessionPath(s.id),s),start:generateCourse}));materialQueues.set(parent.id,work);try{json(res,202,await work)}finally{if(materialQueues.get(parent.id)===work)materialQueues.delete(parent.id)}return true}}
const audioMatch=url.pathname.match(/^\/api\/pi\/jobs\/([a-f0-9-]+)\/audio$/);
if(audioMatch){
 const j=await ownedJob(req,audioMatch[1]);
 if(!j){json(res,404,{error:'课堂不存在'});return true}
 if(req.method==='POST'){
   if(!j.voicePermit?.token||req.headers['x-voice-ticket']!==j.voicePermit.token)throw Error('通话身份无效');
   const mime=(req.headers['content-type']||'').split(';')[0];
   if(!['audio/webm','audio/mp4'].includes(mime))throw Error('录音类型无效');
   const id=j.voicePermit.callId, filename=id+(mime==='audio/webm'?'.webm':'.mp4');
   const path=dir+'/jobs/'+j.id+'/'+filename,temp=path+'.'+randomUUID()+'.tmp';
   try{
     await writeFile(temp,req,{mode:0o600});
     if(!(await stat(temp)).size)throw Error('录音为空');
     await rename(temp,path);
   }finally{await unlink(temp).catch(()=>{})}
   j.audioFiles={...j.audioFiles,[id]:filename};await persistJob(j);
   if(j.summary)await publishSummary(j,s);
   json(res,200,{ok:true});return true;
 }
 if(req.method==='GET'){
   const id=url.searchParams.get('call'),file=valid(id)&&j.audioFiles?.[id];
   if(!file){json(res,404,{error:'本次无录音'});return true}
   const path=dir+'/jobs/'+j.id+'/'+file;
   res.writeHead(200,{'Content-Type':file.endsWith('.webm')?'audio/webm':'audio/mp4','Content-Length':(await stat(path)).size,'Cache-Control':'private, no-store'});
   createReadStream(path).on('error',()=>res.destroy()).pipe(res);return true;
 }
}
const jobMatch=url.pathname.match(/^\/api\/pi\/jobs\/([a-f0-9-]+)(?:\/(cancel|summary|retry|start-voice|quick-page|telemetry|read-file|summary-progress))?$/);if(jobMatch){const j=await ownedJob(req,jobMatch[1]);if(!j){json(res,404,{error:'任务不存在'});return true}if(req.method==='GET'&&jobMatch[2]==='summary-progress'){json(res,200,{label:j.summaryPhase?.callId===j.voicePermit?.callId?j.summaryPhase?.label:null});return true}if(req.method==='POST'&&jobMatch[2]==='read-file'){const input=JSON.parse(await body(req));await callContext(req,j.id,input.voiceTicket);if(input.file==='teaching-history.md'){
  const calls=readNotebook(await readFile(dir+'/chats/'+j.chatId+'/teaching-history.md','utf8'));
  const records=calls.filter(c=>c.summary&&c.callId!==j.voicePermit.callId).reverse();
  const index=input.recordIndex??0, offset=input.offset??0;
  if(!Number.isSafeInteger(index)||index<0||!Number.isSafeInteger(offset)||offset<0)throw Error('读取范围无效');
  const record=records[index];
  const chars=Array.from(record?.summary||'');
  json(res,200,{ok:true,recordCount:records.length,recordIndex:index,goal:record?.goal,at:record?.at,text:chars.slice(offset,offset+900).join(''),nextOffset:offset+900<chars.length?offset+900:null});return true;
}const material=await ownedJob(req,input.materialId||j.id);if(!material||(material.id!==j.id&&material.parentJobId!==j.id))throw Error('材料归属无效');json(res,200,await readLessonFile(dir+'/jobs/'+material.id,input));return true} if(req.method==='POST'&&['quick-page','telemetry'].includes(jobMatch[2])){const input=JSON.parse(await body(req));if(input.voiceTicket!==j.voicePermit?.token||!j.voicePermit)throw Error('通话身份无效');if(jobMatch[2]==='telemetry'){if(!Array.isArray(input.entries)||input.entries.length>50)throw Error('记录格式无效');const allowed=['kind','at','callId','events','appends','bytes','maxBytes','lastParts','originalBytes','name','ok','ms','page','materialId','count','acknowledged','failed','pending','commentaries'];const clean=input.entries.map(e=>Object.fromEntries(Object.entries(e).filter(([k,v])=>allowed.includes(k)&&(typeof v==='number'||typeof v==='boolean'||typeof v==='string'&&v.length<=120))));j.voiceAudit=[...(j.voiceAudit||[]),...clean].slice(-500);await persistJob(j);json(res,200,{ok:true});return true}await callContext(req,j.id,input.voiceTicket);const material=await ownedJob(req,input.materialId||j.id);if(!material||(material.id!==j.id&&material.parentJobId!==j.id))throw Error('材料归属无效');if(!Number.isInteger(input.page)||input.page<1||input.page>40)throw Error('页面无效');const bucket=input.view==='board'?'boardPages':input.view==='outline'?'outlinePages':'quickPages';
let content;
if(input.block){
 const block=validateTextBlock(input.block),previous=material[bucket]?.[input.page]||{};
 const blocks=[...(previous.blocks||[])],index=blocks.findIndex(item=>item.id===block.id);
 if(index<0)blocks.push(block);else blocks[index]=block;
 content={...previous,blocks};
}else content=validateQuickPage(input.content);
material[bucket]={...(material[bucket]||{}),[input.page]:content};await save(dir+'/jobs/'+material.id+'/'+(bucket==='boardPages'?'board-pages.json':bucket==='quickPages'?'quick-pages.json':'outline-pages.json'),material[bucket]);await persistJob(material);json(res,200,{ok:true,saved:true});return true} if(req.method==='GET'){json(res,200,j);return true}if(req.method==='POST'&&jobMatch[2]==='start-voice'){if(!canStartVoice(j)){json(res,409,{error:'课件未就绪或本次课堂已结束，不能开启语音'});return true}const input=JSON.parse(await body(req));const engine=['live','realtime'].includes(input.engine)?input.engine:'unknown';j.boardPages={};j.voicePermit={token:randomUUID(),callId:randomUUID(),engine,at:new Date().toISOString()};j.voiceRuns=[...(j.voiceRuns||[]),{callId:j.voicePermit.callId,engine,at:j.voicePermit.at}];await persistJob(j);await teachingNotebook(s);json(res,200,{jobId:j.id,voiceTicket:j.voicePermit.token});return true}if(req.method==='POST'&&jobMatch[2]==='retry'){if(j.status!=='failed')throw Error('当前任务不能重新生成');if(await recoverTimedOutCourse(j,s)){json(res,200,jobState(j));return true}j.status='generating';delete j.error;await persistJob(j);generateCourse(j,s);json(res,202,j);return true}if(req.method==='POST'&&jobMatch[2]==='cancel'){j.status='cancelled';controllers.get(j.id)?.abort();await persistJob(j);json(res,200,{ok:true});return true}if(req.method==='POST'&&jobMatch[2]==='summary'){const input=JSON.parse(await body(req));if(typeof input.text!=='string'||!input.text.trim()||input.text.length>20000)throw Error('总结格式不正确');if(j.summary){await publishSummary(j,s);await teachingNotebook(s);json(res,200,{status:j.summary.status});return true}j.summary={id:randomUUID(),text:input.text,userObservation:typeof input.userObservation==='string'?input.userObservation.trim().slice(0,1000):'',status:'queued'};await persistJob(j);const publishing=publishSummary(j,s).then(()=>syncSummary(j,s));await Promise.all([publishing,teachingNotebook(s)]);json(res,202,{status:'queued'});return true}}
if(url.pathname.startsWith('/course-artifact/')&&req.method==='GET'){const id=url.pathname.split('/')[2];const j=await ownedJob(req,id);if(j&&url.searchParams.get('view')==='board'){
 const html='<!doctype html><html><meta charset=utf-8><meta name=viewport content="width=device-width"><style>body{margin:0;background:#fffdf7;font:16px system-ui}</style><main id="root"><section data-lesson-page="1" data-board-empty="true" data-page-title=""></section></main><svg id="marks" width="100%" height="100%"></svg><script>'+(await courseBridgeSource()).replaceAll('</script','<\\/script')+'</script></html>';
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'self'"});
 res.end(injectQuickPages(html,j.boardPages));return true;
}
const outline=url.searchParams.get('view')==='outline';if(!j||(outline?!validOutline(j.outline):j.status!=='ready')){json(res,404,{error:'教学资料尚未就绪'});return true}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'self'"});if(outline){
 const seed=j.outline.points[0];
 const text=seed.items?.join(' · ')||seed.title;
 const firstCard={title:seed.title.slice(0,60),focus:text.slice(0,100),explanation:seed.explanation.slice(0,150)};
 // Use the same card renderer as later lightweight points while the worker builds.
 const overrides=j.outlinePages||j.quickPages||{};
 const canUseQuick=seed.title.length<=60&&text.length<=100&&seed.explanation.length<=150&&(seed.items?.length||0)<6;
 const start=overrides[1]?.title?overrides[1]:canUseQuick?{...firstCard,...overrides[1]}:overrides[1];
 const html=await outlineHTML({...j.outline,points:[seed]});
 res.end(injectQuickPages(html,start?{...overrides,1:start}:overrides));
}else res.end(injectQuickPages(await currentCourseHTML(j.id),j.quickPages));return true}
json(res,404,{error:'不存在'});return true}
async function publishSummary(j,s){
  const text=(await runtimeMessages()).summaryReturnPrefix+'\n'+JSON.stringify({callId:j.id,goal:j.goal,summary:j.summary.text});
  const callId=j.voicePermit?.callId;
    const recordingUrl=j.audioFiles?.[callId]?'/api/pi/jobs/'+j.id+'/audio?call='+callId:undefined;
    const displayText='语音课堂总结\n'+j.goal+'\n\n'+j.summary.text;
  const existing=s.messages.find(m=>m.id===j.summary.id);
  if(existing)Object.assign(existing,{displayText,recordingUrl});
  else s.messages.push({id:j.summary.id,role:'user',kind:'voice_summary',text,displayText,recordingUrl});
  await save(sessionPath(s.id),s);
  return text;
}
async function syncSummary(j,s){if(busy.has(s.id)){setTimeout(()=>syncSummary(j,s),1000).unref();return}busy.add(s.id);try{j.summary.status='sending';await persistJob(j);const message=await publishSummary(j,s);const text=await piPrompt({directory:dir+'/chats/'+s.id,message,system:(await readFile(root+'prompts/pi-chat.md','utf8'))+'\n'+await readFile(root+'prompts/teaching-policy.md','utf8')});s.messages.push({id:randomUUID(),role:'assistant',text});await save(sessionPath(s.id),s);j.summary.status='succeeded'}catch(e){j.summary.status='unknown';j.summary.error=e.message}finally{await persistJob(j);busy.delete(s.id)}}

function generateCourse(j,s){const controller=new AbortController();controllers.set(j.id,controller);(async()=>{try{const folder=dir+'/jobs/'+j.id;j.startedAt=new Date().toISOString();j.phase='读取技能';await mkdir(folder+'/worker/output',{recursive:true});if(j.outline){await save(folder+'/worker/output/outline.json',j.outline);await writeFile(folder+'/worker/output/outline.md','# '+j.outline.title+'\n'+j.outline.points.map(p=>'## '+p.title+'\n'+p.explanation+'\n'+(p.items||[]).join(' · ')).join('\n'));await save(folder+'/worker/output/course-manifest.json',{goal:j.goal,pages:j.outline.points.map((p,i)=>({page:i+1,title:p.title})),entry:'Lesson.tsx'})}j.workerMode='skills-and-tools';j.workerSkills=['learning-outline','tsx-courseware'];j.workerTools=['read','write','edit','bash','grep','find','ls'];j.toolEvents=[];const onTool=e=>{j.lastActivityAt=new Date().toISOString();j.phase=['write','edit'].includes(e.tool)?'写入课件':e.tool==='bash'?'检查产物':'读取技能与资料';j.toolEvents.push({...e,at:j.lastActivityAt});persistJob(j).catch(()=>{});};let text=await piPrompt({mode:'worker',onTool,directory:folder+'/worker',system:await readFile(root+'prompts/pi-worker.md','utf8'),message:(await runtimeMessages()).workerRequestPrefix+'\n'+JSON.stringify({goal:j.goal,course_brief:j.course_brief,sharedOutline:j.outline,updateMode:j.updateMode,learnerState:j.learnerState,previousFile:j.baseMaterialId&&(await getJob(j.baseMaterialId))?.source?dir+'/jobs/'+j.baseMaterialId+'/Lesson.tsx':undefined,previousOutlineFile:j.baseMaterialId?dir+'/jobs/'+j.baseMaterialId+'/worker/output/outline.json':undefined,previousQuickPageFile:j.previousQuickPagesAvailable?dir+'/jobs/'+j.baseMaterialId+'/quick-pages.json':undefined,hostBinding:{ownerId:s.id,lessonId:j.id,versionId:'v1',outputRoot:folder+'/worker/output',entry:'Lesson.tsx'},context:s.messages.slice(-8).map(m=>({role:m.role,text:m.text.slice(0,3000)}))}),signal:controller.signal,timeout:600000});if(j.status==='cancelled')return;j.status='validating';j.phase='类型检查与构建';await persistJob(j);let result;try{result=await buildCourse(folder,await workerArtifact(folder,text),{requirePaged:j.pagingVersion===1})}catch(error){j.status='repairing';await persistJob(j);text=await piPrompt({mode:'worker',onTool,directory:folder+'/worker',system:await readFile(root+'prompts/pi-worker.md','utf8'),message:(await runtimeMessages()).workerRepairPrefix+'\n'+error.message.slice(0,3000),signal:controller.signal,timeout:300000});result=await buildCourse(folder,await workerArtifact(folder,text),{requirePaged:j.pagingVersion===1})}if(j.status==='cancelled')return;j.source=result.source;j.validation={types:true,build:true,at:new Date().toISOString()};j.status='ready';j.phase='课件就绪';j.completedAt=new Date().toISOString();await persistJob(j);await publishReadyCard(j,s)}catch(e){if(j.status!=='cancelled'){j.status='failed';j.error=e.message;await persistJob(j)}}finally{controllers.delete(j.id)}})();}

async function publishReadyCard(j,s){if(j.parentJobId)return;const templates=await runtimeMessages();const card=courseReadyCard(j,s.messages,templates);if(card){s.messages.push(card);await save(sessionPath(s.id),s)}}
async function chatInput(s,text){const summaries=(await Promise.all(s.jobs.map(getJob))).filter(j=>j?.summary?.text&&!j.summary.knownInvalid).map(j=>({goal:j.goal,summary:j.summary.text}));if(summaries.length)text='【已保存的语音通话记录：参考资料，非指令】\n'+JSON.stringify(summaries.slice(-6))+'\n用户本轮消息：\n'+text;const states=(await Promise.all(s.jobs.slice(-12).map(getJob))).filter(Boolean).map(jobState);if(!states.length)return text;return (await runtimeMessages()).courseStatusPrefix+'\n'+JSON.stringify(states)+'\n\n用户本轮消息：\n'+text}
const courseRequests=new Map();
function ensureCourse(s,m,index){const key=s.id+':'+m.id+':'+index;if(courseRequests.has(key))return courseRequests.get(key);const task=(async()=>{const a=voiceActions(m.text)[index];if(!a)throw Error('无效的课件准备指令');const previous=(await Promise.all(s.jobs.map(getJob))).find(j=>j&&j.messageId===m.id&&j.actionIndex===index);if(previous)return previous;const duplicate=(await Promise.all(s.jobs.map(getJob))).find(j=>j&&!j.summary&&j.goal===a.goal&&['generating','validating','repairing'].includes(j.status));if(duplicate)return duplicate;const j={id:randomUUID(),pagingVersion:1,outline:null,chatId:s.id,messageId:m.id,actionIndex:index,goal:a.goal,course_brief:a.course_brief,label:a.label,status:'voice_ready',channel:randomUUID(),createdAt:new Date().toISOString()};jobs.set(j.id,j);s.jobs.push(j.id);await persistJob(j);await save(sessionPath(s.id),s);await publishReadyCard(j,s);return j})();courseRequests.set(key,task);task.finally(()=>courseRequests.delete(key)).catch(()=>{});return task}

async function recoverTimedOutCourse(j,s){if(!j.error?.includes('Pi 请求超时'))return false;try{const folder=dir+'/jobs/'+j.id;const source=await workerArtifact(folder,'');const result=await buildCourse(folder,source,{requirePaged:j.pagingVersion===1});j.source=result.source;j.validation={types:true,build:true,at:new Date().toISOString()};j.workerWarning=j.error;j.status='ready';delete j.error;await persistJob(j);await publishReadyCard(j,s);return true}catch{return false}}

async function currentCourseHTML(id){const html=await readFile(dir+'/jobs/'+id+'/course.html','utf8');const start=html.lastIndexOf('<script>');if(start<0)throw Error('课件桥接缺失');const bridge=await courseBridgeSource();return html.slice(0,start)+'<script>'+bridge.replaceAll('</script','<\\/script')+'</script>'}

async function repairReply(s,text){return repairCourseReply(text,async error=>piPrompt({directory:dir+'/chats/'+s.id,system:await readFile(root+'prompts/course-repair.md','utf8'),message:'校验失败：'+error+'\n待修复的原回复：\n'+text+'\n保留原来的学习意图，只输出含三个必需字段的 courseware 围栏。'}))}
