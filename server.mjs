import {frontendGate,splitChatAssets} from './share-frontend.mjs';
import {audioPanels} from './public/voice-options.mjs';
import {transcriptText,summarizeLesson} from './live-summary.mjs';
import {auth,accountRoutes} from './account-auth.mjs';
import{liveSession}from'./live-config.mjs';
import {runtimeMessages,promptSettingsApi} from './prompt-settings.mjs';
import {classroomApi,callContext} from './classroom-api.mjs';
import {MacaronAppAdapter} from './macaron-app-adapter.mjs';
import {ChatAdapter} from './chat-adapter.mjs';
import {loadLocalKey} from './key-config.mjs';
import http from 'node:http';
import {readFile,writeFile,mkdir,rename,readdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {defaults,validate,session} from './public/protocol.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const apiKey=process.env.OPENAI_API_KEY?.trim() || (process.env.CONSOLE_DATA_DIR ? '' : await loadLocalKey(root+'private/api-key.json'));
const data=process.env.CONSOLE_DATA_DIR||root+'data';
const port=Number(process.env.PORT||4327);
await mkdir(data,{recursive:true,mode:0o700});
const path=data+'/config.json';
let state;try{state=JSON.parse(await readFile(path,'utf8'));validate(state.versions.at(-1).config)}catch(e){if(e.code!=='ENOENT')throw e;state={versions:[{id:randomUUID(),at:new Date().toISOString(),config:defaults}]};await writeFile(path,JSON.stringify(state,null,2),{mode:0o600});}
let saving=Promise.resolve();
export async function mockGenerate(request,{mode='success',signal}={}){await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,mode==='timeout'?1500:350);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('生成超时'))},{once:true});});if(mode==='error')throw Error('模拟适配器返回失败');return {status:'completed',simulated:true,provider:'mock-macaron',content:`模拟内容（非 Macaron 生成）：${request}\n建议先观察灯泡，再描述电流回路。`};}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
async function classroomInstructions(adapter){
 const [rules,specific]=await Promise.all([readFile(root+'prompts/teaching-policy.md','utf8'),adapter]);
 return specific+'\n\n'+rules;
}
async function body(req, limit=100000){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('请求过大');chunks.push(chunk)}
 return Buffer.concat(chunks).toString('utf8');
}


export const realAdapter=new MacaronAppAdapter();
const realSid=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('real_sid='))?.slice(9);
const demoAdapter=new ChatAdapter({login:async()=>({token:randomUUID(),userId:'demo-'+randomUUID()}),async *chat({text}){await new Promise(r=>setTimeout(r,400));if(text==='模拟失败')throw Error('demo error');yield{type:'delta',text:'【模拟回复，非 Macaron】收到：'+text}}});
const demoRequests=new Map();
const demoSid=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('demo_sid='))?.slice(9);
export const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(process.env.FRONTEND_SHARE_ORIGIN){
   if(!process.env.FRONTEND_SHARE_TOKEN)throw Error('邀请链接未配置');
   if(await frontendGate(req,res,url,{origin:process.env.FRONTEND_SHARE_ORIGIN,token:process.env.FRONTEND_SHARE_TOKEN,auth,body,json}))return;
 }else{
   if(!['127.0.0.1:'+(server.address()?.port||port),'localhost:'+(server.address()?.port||port)].includes(req.headers.host))return json(res,403,{error:'仅限本机访问'});
   if(req.method==='POST'&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'拒绝跨站请求'});
 }
 if(url.pathname==='/api/account/status')url.pathname='/api/auth/status';
 if(url.pathname==='/api/account/logout')url.pathname='/api/auth/logout';
 if(url.pathname==='/api/login/submit')url.pathname='/api/auth/login';
 if(await accountRoutes(req,res,url,{json,body}))return;
 if(['/secure-login','/account-access'].includes(url.pathname)){res.writeHead(302,{Location:'/accounts'});return res.end()}
 const protectedRoute=['/chat','/chat-integrated','/api/live-call','/api/live-summary','/api/lesson-snapshot','/api/call'].includes(url.pathname)||url.pathname.startsWith('/api/pi/')||url.pathname.startsWith('/course-artifact/');
 if(protectedRoute){const account=await auth.current(req.headers.cookie);if(!account){if(url.pathname.startsWith('/chat')){res.writeHead(302,{Location:'/accounts'});return res.end()}return json(res,401,{error:'请先登录账号'})}
 if(req.headers['x-chat-session']&&req.headers['x-chat-session']!==account.localChatId)return json(res,409,{error:'账号已切换，请刷新页面后继续'});
 if(url.pathname==='/api/pi/chat'&&req.headers['x-chat-session']!==account.localChatId)return json(res,409,{error:'请刷新聊天页面后再发送'});
 req.headers.cookie='pi_chat='+account.localChatId;
 }
 if(await promptSettingsApi(req,res,url,{json,body}))return;
 if(await classroomApi(req,res,url,{json,body}))return;
 if(url.pathname==='/api/login/readiness'&&req.method==='GET')return json(res,200,{enabled:true,registrationEnabled:true,environment:'Alpha',page:'/accounts'});
 if(url.pathname==='/api/login/submit'&&req.method==='POST')return json(res,503,{error:'真实登录未启用，未调用上游；请勿提交密码'});

 if(url.pathname==='/api/account/logout'&&req.method==='POST'){realAdapter.logout(realSid(req));res.setHeader('Set-Cookie','real_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(url.pathname==='/api/account/status'&&req.method==='GET')return json(res,200,{authenticated:realAdapter.sessions.has(realSid(req)),registrationEnabled:false,loginEnabled:false,message:'真实协议适配器已接入；注册和登录凭据交接尚未启用'});
 if(url.pathname==='/api/account/chat'&&req.method==='POST'){
  const sid=realSid(req);if(!realAdapter.sessions.has(sid))return json(res,401,{error:'需要已核验的用户会话；未发送上游请求'});
  const input=JSON.parse(await body(req));if(Object.keys(input).some(k=>k!=='text'))return json(res,400,{error:'禁止指定账号、令牌或目标地址'});
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});
  for await(const event of realAdapter.send(sid,input.text)){if(res.destroyed)break;res.write('data: '+JSON.stringify(event)+'\n\n')}return res.end();
 }

 if(url.pathname==='/api/demo/stream'&&req.method==='POST'){const sid=demoSid(req);try{demoAdapter.history(sid,{limit:1})}catch{return json(res,401,{error:'需要模拟登录'})}const input=JSON.parse(await body(req));if(Object.keys(input).some(k=>!['text','requestId'].includes(k))||typeof input.requestId!=='string'||input.requestId.length>100)return json(res,400,{error:'参数无效'});let ids=demoRequests.get(sid);if(!ids){ids=new Set();demoRequests.set(sid,ids)}if(ids.has(input.requestId))return json(res,409,{error:'重复请求或未知结果；未再次发送'});if(ids.size>=100)return json(res,429,{error:'模拟会话请求上限'});ids.add(input.requestId);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});for await(const event of demoAdapter.chat(sid,input.text)){if(res.destroyed)break;res.write('data: '+JSON.stringify(event)+'\n\n')}return res.end();}
 if(url.pathname==='/api/demo/login'&&req.method==='POST'){const result=await demoAdapter.login('demo','unused');res.setHeader('Set-Cookie',`demo_sid=${result.sid}; HttpOnly; SameSite=Strict; Path=/api/demo; Max-Age=1800`);return json(res,200,{simulated:true});}
 if(url.pathname==='/api/demo/history'&&req.method==='POST'){const input=JSON.parse(await body(req));if(Object.keys(input).some(k=>!['cursor','limit'].includes(k)))throw Error('不允许指定账号或命令');return json(res,200,demoAdapter.history(demoSid(req),input));}
 if(url.pathname==='/api/demo/logout'&&req.method==='POST'){demoRequests.delete(demoSid(req));demoAdapter.logout(demoSid(req));res.setHeader('Set-Cookie','demo_sid=; HttpOnly; SameSite=Strict; Path=/api/demo; Max-Age=0');return json(res,200,{ok:true});}
 if(url.pathname==='/api/demo/chat'&&req.method==='POST'){const {text}=JSON.parse(await body(req));const events=[];for await(const event of demoAdapter.chat(demoSid(req),text))events.push(event);return json(res,200,{simulated:true,events});}
 if(url.pathname==='/api/recording'&&req.method==='POST')return json(res,410,{error:'本机通话只保存文字总结'});
 if(url.pathname==='/api/recordings'&&req.method==='GET'){const dir=root+'private/recordings';let names=[];try{names=await readdir(dir)}catch(e){if(e.code!=='ENOENT')throw e}const items=[];for(const name of names.filter(n=>/^[a-f0-9-]+\.(webm|mp4)$/.test(n))){const info=await stat(dir+'/'+name);let meta={name,startedAt:null,endedAt:info.mtime.toISOString(),durationSeconds:null};try{meta={...meta,...JSON.parse(await readFile(dir+'/'+name+'.json','utf8'))}}catch{}items.push(meta)}return json(res,200,{directory:dir,items:items.sort((a,b)=>b.endedAt.localeCompare(a.endedAt))});}
 if(url.pathname.startsWith('/api/recordings/')&&req.method==='GET'){const name=url.pathname.split('/').at(-1);if(!/^[a-f0-9-]+\.(webm|mp4)$/.test(name))return json(res,404,{error:'不存在'});const bytes=await readFile(root+'private/recordings/'+name);res.writeHead(200,{'Content-Type':name.endsWith('.mp4')?'audio/mp4':'audio/webm','Content-Length':bytes.length,'Cache-Control':'no-store'});return res.end(bytes);}
 if(url.pathname==='/api/summary'&&req.method==='POST'){const value=JSON.parse(await body(req));if(typeof value.text!=='string'||value.text.length>20000)throw Error('总结格式错误');const dir=root+'private/summaries';await mkdir(dir,{recursive:true,mode:0o700});const name=randomUUID()+'.txt';await writeFile(dir+'/'+name,value.text,{mode:0o600});return json(res,200,{path:dir+'/'+name});}
 if(url.pathname==='/api/config'&&req.method==='GET')return json(res,200,{...state,...(process.env.FRONTEND_SHARE_ORIGIN?{versions:state.versions.slice(-1)}:{}),configured:!!apiKey});
 if(url.pathname==='/api/config'&&req.method==='POST'){
 const input=JSON.parse(await body(req));const config=validate(input.config);
 const result=await (saving=saving.catch(()=>{}).then(async()=>{if(input.base!==state.versions.at(-1).id)throw Error('配置已被其他窗口修改，请刷新后再保存');const next={versions:[...state.versions,{id:randomUUID(),at:new Date().toISOString(),config}]};await writeFile(path+'.tmp',JSON.stringify(next,null,2),{mode:0o600});await rename(path+'.tmp',path);state=next;return next;}));return json(res,200,result);
 }
 if(url.pathname==='/api/voice-preview'&&req.method==='POST'){
   if(!apiKey)return json(res,503,{error:'语音服务尚未配置'});
   const {engine,voice,speed,sdp}=JSON.parse(await body(req));
   const live=engine==='live',allowed=audioPanels[live?'liveAudio':'realtimeAudio'][0].values;
   if(!['live','realtime'].includes(engine)||!allowed.includes(voice)||typeof sdp!=='string'||!sdp.startsWith('v=0')||!Number.isFinite(speed)||speed<.25||speed>1.5)throw Error('试听参数无效');
   const instructions=(await runtimeMessages()).voiceDelivery+'\n用中文只读收到的一句试听示例，不继续交谈。';
   const output={...(voice==='default'?{}:{voice}),...(!live?{speed}:{})};
   const session={model:live?'gpt-live-1':'gpt-realtime-2.1',instructions,audio:{output,...(!live?{input:{turn_detection:null}}:{})},...(!live?{type:'realtime'}:{input:[{type:'message',role:'developer',content:[{type:'input_text',text:'接通后主动用中文说一句：“你好，我是马卡龙。今天想一起学点什么？” 不等待用户先说话。'}]}]})};
   const headers={Authorization:'Bearer '+apiKey};
   let payload;
   if(live){headers['Content-Type']='application/json';payload=JSON.stringify({session,transport:{type:'webrtc',sdp}})}
   else{payload=new FormData();payload.set('sdp',sdp);payload.set('session',JSON.stringify(session))}
   const r=await fetch('https://api.openai.com/v1/'+(live?'live/sessions':'realtime/calls'),{method:'POST',headers,body:payload,signal:AbortSignal.timeout(25000)});
   if(!r.ok)return json(res,502,{error:'试听连接失败（'+r.status+'）：'+((await r.json().catch(()=>({}))).error?.message||'请重试')});
   return json(res,200,{sdp:live?(await r.json()).transport.sdp:await r.text()});
 }
 if(url.pathname==='/api/live-call'&&req.method==='POST'){
 if(!apiKey)return json(res,503,{error:'未配置API密钥'});
 const {sdp,jobId,voiceTicket}=JSON.parse(await body(req));if(typeof sdp!=='string'||!sdp.startsWith('v=0'))throw Error('无效SDP');const context=await callContext(req,jobId,voiceTicket);const runtime=await runtimeMessages();const [voicePrompt,backendPrompt]=await Promise.all(['live-voice','live-backend'].map(name=>classroomInstructions(readFile(root+'prompts/'+name+'.md','utf8'))));const config=liveSession({voicePrompt:voicePrompt+'\n'+runtime.voiceDelivery,backendPrompt,context:context.text,opening:runtime.voiceOpening,options:runtime});
 const r=await fetch('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({session:config,transport:{type:'webrtc',sdp}}),signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)return json(res,502,{error:data.error?.message||'Live连接失败'});return json(res,200,data);
 }
 if(url.pathname==='/api/lesson-snapshot'&&req.method==='POST'){
 const {jobId,voiceTicket,image}=JSON.parse(await body(req,2100000));await callContext(req,jobId,voiceTicket);
 if(typeof image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image))throw Error('截图格式无效');
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',instructions:(await runtimeMessages()).snapshotTeacher,input:[{role:'user',content:[{type:'input_image',image_url:image}]}],max_output_tokens:650}),signal:AbortSignal.timeout(30000)});
 const result=await r.json();const text=(result.output||[]).flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
 if(!r.ok||!text)throw Error('图片解读失败，请重试');return json(res,200,{text});
 }
 if(url.pathname==='/api/live-summary'&&req.method==='POST'){
 const {jobId,voiceTicket,transcript,summaryVersion}=JSON.parse(await body(req,32*1024*1024));
 const {job}=await callContext(req,jobId,voiceTicket);
 job.summaryPhase={callId:job.voicePermit.callId,label:'服务已收到转写'};
 const archive=(process.env.CLASSROOM_DATA_DIR||root+'private/pi-classroom')+'/jobs/'+job.id+'/transcript-'+(job.voicePermit.callId||job.id)+'.md';
 let text;
 if(Array.isArray(transcript)&&transcript.some(fragment=>['assistant','user'].includes(fragment?.speaker)&&typeof fragment.text==='string'&&fragment.text.trim())){
   text=transcriptText(transcript);
   const temp=archive+'.'+randomUUID()+'.tmp';
   await writeFile(temp,'# 通话文字记录\n\n'+text+'\n',{mode:0o600});await rename(temp,archive);
 }else{
   try{text=(await readFile(archive,'utf8')).replace(/^# 通话文字记录\s*/,'').trim()}
   catch(e){if(e.code!=='ENOENT')throw e}
   if(!text)throw Error('尚未收到本次通话的文字记录');
 }
 async function generate(instructions,input,max_output_tokens){
   job.summaryPhase.label=max_output_tokens===1200?'文字已保存 · 正在分段整理':'文字已保存 · 正在生成小结';
   const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',instructions,input,max_output_tokens}),signal:AbortSignal.timeout(90000)});
   const data=await r.json();if(!r.ok)throw Error(data.error?.message||'Live总结失败');
   const output=(data.output||[]).flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
   if(!output.trim())throw Error('未生成有效的文字总结');return output;
 }
 const prompts=await runtimeMessages();
 let summary=await summarizeLesson(text,prompts.voiceSummary,generate,prompts.segmentSummary);
 // Previously opened call pages validate the earlier summary fields on retry.
 if(summaryVersion!==2){
   const start=summary.indexOf('{'),end=summary.lastIndexOf('}');
   const result=JSON.parse(summary.slice(start,end+1));
   if(Array.isArray(result.outcomes))summary=JSON.stringify({...result,timeline:[result.endedAt],covered:result.outcomes.map(o=>o.point+'（'+o.level+'）：'+o.evidence),preferences:[result.userObservation].filter(Boolean),nextSteps:[]});
 }
 return json(res,200,{text:summary});

 }
 if(url.pathname==='/api/call'&&req.method==='POST'){
 if(!apiKey)return json(res,503,{error:'未配置 OPENAI_API_KEY；保持离线，未调用 OpenAI'});
 const {sdp,version,voice=false,transcribe=false,jobId,voiceTicket}=JSON.parse(await body(req));const current=state.versions.at(-1);if(version!==current.id)throw Error('提示词版本已变化，请刷新');if(typeof sdp!=='string'||!sdp.startsWith('v=0'))throw Error('无效 SDP');
 if(process.env.FRONTEND_SHARE_ORIGIN&&!jobId)throw Error('请从自己的课堂发起通话');if(jobId)await callContext(req,jobId,voiceTicket);
 const options=await runtimeMessages();const settings={...current.config,audioOptions:options,...(jobId?{macaron:false}:{})};if(jobId)settings.instructions=await classroomInstructions(current.config.instructions+'\n'+options.progressiveTeacher)+'\n'+options.voiceDelivery;
 const form=new FormData();form.set('sdp',sdp);form.set('session',JSON.stringify(session(settings,voice===true,false)));
 const upstream=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form,signal:AbortSignal.timeout(20000)});
 if(!upstream.ok)return json(res,502,{error:`OpenAI 连接失败（HTTP ${upstream.status}），请检查额度、模型权限和网络`});res.writeHead(200,{'Content-Type':'application/sdp','Cache-Control':'no-store'});return res.end(await upstream.text());
 }
 if(url.pathname==='/api/generate'&&req.method==='POST'){const {request,mode}=JSON.parse(await body(req));if(typeof request!=='string'||!request.trim()||request.length>4000)throw Error('内容请求须为 1–4000 字');try{return json(res,200,await mockGenerate(request,{mode,signal:AbortSignal.timeout(1000)}));}catch(e){return json(res,200,{status:mode==='timeout'?'timeout':'failed',simulated:true,error:e.message});}}
 if(url.pathname==='/classroom.html'&&req.method==='GET'){const original=await readFile(root+'reference/classroom-original.html','utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-ancestors 'self'"});return res.end(original.replace('</body>','<script src="/classroom-bridge.js"></script></body>'));}
 if(['/chat-integrated','/chat'].includes(url.pathname)&&req.method==='GET'){let html=await readFile(root+'reference/chat-original.html','utf8');const bridge=await readFile(root+'public/pi-bubble-adapter.js','utf8');if(process.env.FRONTEND_SHARE_ORIGIN)html=splitChatAssets(html);const index=html.lastIndexOf('</script>');html=html.slice(0,index)+bridge+html.slice(index);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'"});return res.end(html);}
 if(url.pathname==='/bubble-demo'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-ancestors 'self'"});return res.end(await readFile(root+'reference/chat-original.html'));}
 const files={'/voice-preview.mjs':'voice-preview.mjs','/voice-options.mjs':'voice-options.mjs','/live-pause.mjs':'live-pause.mjs','/live-context.mjs':'live-context.mjs','/quick-lesson.mjs':'quick-lesson.mjs','/ringback.mjs':'ringback.mjs','/accounts':'accounts.html','/accounts.js':'accounts.js','/live-adapter.mjs':'live-adapter.mjs','/summary-turn.mjs':'summary-turn.mjs','/settings':'prompt-settings.html','/prompt-settings.mjs':'prompt-settings.mjs','/prompt-settings.css':'prompt-settings.css','/secure-login':'secure-login.html','/secure-login.js':'secure-login.js','/account-access':'account-access.html','/lesson-tools.mjs':'lesson-tools.mjs','/audio-orb.mjs':'audio-orb.mjs','/paged-lesson':'paged-lesson.html','/lesson.bundle.js':'lesson.bundle.js','/lesson-state.json':'lesson-state.json','/voice-action.mjs':'voice-action.mjs','/account-generation.mjs':'account-generation.mjs','/recording.mjs':'recording.mjs','/console':'index.html','/chat.css':'chat.css','/chat.js':'chat.js','/mic-monitor.mjs':'mic-monitor.mjs','/voice.mjs':'voice.mjs','/classroom-bridge.js':'classroom-bridge.js','/course-bridge.js':'course-bridge.js','/':'index.html','/app.mjs':'app.mjs','/style.css':'style.css','/protocol.mjs':'protocol.mjs'};const f=files[url.pathname];if(req.method!=='GET'||!f)return json(res,404,{error:'不存在'});
 res.writeHead(200,{'Content-Type':(f.endsWith('.mjs')||f.endsWith('.js'))?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'"});res.end(await readFile(root+'public/'+f));
 }catch(e){if(e.code==='PI_UNAVAILABLE'&&req.url?.split('?')[0]==='/api/auth/pi-register')json(res,503,{error:e.message,code:e.code});else json(res,400,{error:e.message})}});
if(process.env.NODE_ENV!=='test')server.listen(port,'127.0.0.1',()=>console.log(`Realtime console: http://127.0.0.1:${server.address().port}`));
