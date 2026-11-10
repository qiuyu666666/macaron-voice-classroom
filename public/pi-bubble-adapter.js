let callRing;const ringReady=import('/ringback.mjs').then(m=>callRing=new m.Ringback());
// Runs in the original chat closure; actual transport is local Pi RPC.
let piSessionId=null,summaryActivity='',welcomeRequested=false;
let piBusy=false,piChunks=t=>[t],activeJob=null,piReady=false,refreshing=false;
const seen=new Set(),jobStates=new Map();
document.title='Macaron · 学习聊天';const piStyle=document.createElement('style');piStyle.textContent='#controls{display:none!important}body:has(#phone.in-call) .pi-status-bar{display:none!important}#phone.in-call #latest,#phone.in-call .navbar,#phone.in-call #history,#phone.in-call>footer{visibility:hidden}#phone.in-call #header{height:59px;background:#fffdf7}';document.head.append(piStyle);
const piBar=document.createElement('div');piBar.className='pi-status-bar';piBar.style='position:fixed;top:8px;left:8px;z-index:999;background:#fffdf7;padding:10px;border:1px solid #ddd;border-radius:12px;font:13px system-ui;max-width:240px';piBar.textContent='正在连接本机 Pi…';document.body.append(piBar);
const callPanel=document.createElement('div');callPanel.style='position:absolute;inset:59px 0 18px;background:#fffdf7;z-index:4;display:none;flex-direction:column;overflow:hidden';const callTop=document.createElement('div');callTop.style='height:28px;flex:none;padding:0 16px;display:flex;align-items:center';const callStatus=document.createElement('span');const closeCall=document.createElement('button');closeCall.textContent='‹ 返回聊天';closeCall.style='border:0;background:transparent;color:#75716b;font:13px system-ui;padding:4px';callStatus.setAttribute('role','status');callStatus.style.cssText='font:12px/20px system-ui;color:#404b46;padding:1px 12px;border-radius:16px;background:linear-gradient(105deg,#e5f2e9,#f1eef8 65%,#fff2df);margin-left:auto';callTop.append(closeCall,callStatus);const callFrame=document.createElement('iframe');callFrame.title='语音课堂';callFrame.allow='microphone; autoplay';callFrame.style='border:0;width:100%;height:0;flex:1;min-height:0;background:#fffdf7';callPanel.append(callTop,callFrame);document.getElementById('phone').append(callPanel);
async function readPiJSON(response){
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('连接暂时中断，正在核对聊天记录');
 try{return await response.json()}catch{throw Error('回复传输中断，正在核对聊天记录')}
}
async function piAPI(path,body){const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json','X-Chat-Session':piSessionId||''},body:JSON.stringify(body)}:{headers:{'X-Chat-Session':piSessionId||''}});if(r.status===401){location.href='/accounts';throw Error('请重新登录')}const d=await readPiJSON(r);if(!r.ok)throw Error(d.error||'请求失败');return d}
// Include invitation cards before the original renderer measures rows and restores its scroll anchor.
const originalContent=content;
content=function(m){const body=originalContent(m);if(m.recordingUrl&&/^\/api\/pi\/jobs\/[a-f0-9-]+\/audio\?call=[a-f0-9-]+$/.test(m.recordingUrl))return body+'<p><a target="_blank" rel="noopener" href="'+esc(m.recordingUrl)+'">播放完整通话录音</a></p>';if(m.kind!=='course_ready')return body;const state=jobStates.get(m.jobId),disabled=!!activeJob||!state?.voiceAvailable||!!state?.summaryStatus;return body+`<div class="pi-course-card" style="margin:8px;padding:14px;border:1px solid #bad3c6;border-radius:18px;background:#f3f8f5"><div style="font-size:13px;margin-bottom:10px">${esc(m.goal)}</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><select aria-label="语音模型" data-voice-model="${esc(m.jobId)}" style="padding:10px 8px;border-radius:12px;min-width:0;flex:1"><option value="live">GPT-Live-1</option><option value="realtime">Realtime 2.1</option></select><button data-pi-call="${esc(m.jobId)}" ${disabled?'disabled':''} style="padding:12px 18px;border-radius:18px;background:#e5f2eb;border:1px solid #bad3c6;cursor:pointer">${esc(state?.summaryStatus?'本次课堂已结束':m.label||'开启语音对话')}</button></div></div>`};
const originalRender=render;render=function(...args){originalRender(...args);for(const b of M.querySelectorAll('[data-pi-call]'))b.onclick=()=>startVoice(b.dataset.piCall)};
// Establish following before inserting the new outgoing bubble, not after anchoring it.
const originalSubmit=submit;
let connecting,waitingToSend=false;
function connectChat(){
 if(!connecting)connecting=refreshPi().finally(()=>{connecting=null});
 return connecting;
}
submit=async function(event){
 event?.preventDefault();
 if(!INPUT.value.trim()||waitingToSend)return;
 if(piBusy){piBar.textContent='请等待当前回复完成';return}
 if(!piReady){
   waitingToSend=true;
   const draft=INPUT.value;
   try{await connectChat()}catch(error){piBar.textContent=error.message;return}finally{waitingToSend=false}
   if(!piReady||INPUT.value!==draft)return;
 }
 cancelAnimationFrame(layoutFrame);layoutFrame=0;following=true;
 return originalSubmit();
};
document.getElementById('composer').onsubmit=submit;
// Streaming text, font/layout changes and the final animation frame can all change the bottom.
const piSizeObserver=new ResizeObserver(()=>{if(following&&!activeJob&&document.getElementById('overlay').hidden){H.scrollTop=H.scrollHeight;document.getElementById('latest').hidden=true}});piSizeObserver.observe(M);

function voiceSummaryText(message) {
  if(message.kind==='voice_summary'&&message.displayText)return message.displayText;
  if (message.role !== 'user' || !message.text || !message.text.includes('\n')) return null;
  try {
    const record = JSON.parse(message.text.slice(message.text.indexOf('\n') + 1));
    if (record.callId && typeof record.summary === 'string' && (message.kind==='voice_summary'||jobStates.has(record.callId))) {
      return '语音课堂总结\n' + record.goal + '\n\n' + record.summary;
    }
  } catch {}
  return message.kind==='voice_summary'?'语音课堂总结已保存，重新打开聊天可查看。':null;
}
const historyUsers=new Map();
function appendMessage(m,requestStatus){
 const status=({sent:'Sent',sending:'Sent',read:'Read',unknown:'failed'})[requestStatus];
 if(seen.has(m.id)){
   const item=historyUsers.get(m.id);
   if(item&&item.status!==status)update(item,{status});
   return;
 }
seen.add(m.id);if(m.kind==='course_ready'){add({...m,role:'mac',full:true});return}const summary=voiceSummaryText(m);if(summary){add({id:m.id+'-summary',role:'mac',text:summary,recordingUrl:m.recordingUrl,full:true});return}const chunks=m.role==='assistant'?piChunks(m.text):[m.text];chunks.forEach((text,i)=>{
 const item=add({id:m.id+'-part-'+i,group:m.role==='assistant'&&i>0,role:m.role==='user'?'user':'mac',text,full:true,realDelivery:true,status:m.role==='user'?status:undefined});
 if(m.role==='user')historyUsers.set(m.id,item);
})}

async function refreshPi(){if(refreshing||piBusy)return;refreshing=true;try{const s=await piAPI('/api/pi/session');piSessionId=s.id;if(piBusy)return;let changed=false;for(const j of s.jobStates||[]){if(JSON.stringify(jobStates.get(j.id))!==JSON.stringify(j))changed=true;jobStates.set(j.id,j)}for(const m of s.messages)appendMessage(m,s.requests?.[m.id]);piReady=true;
if(!welcomeRequested&&!s.messages.length&&s.welcome!=='done'){
 welcomeRequested=true;
 piAPI('/api/pi/welcome',{}).then(()=>refreshPi()).catch(()=>{welcomeRequested=false});
}
if(changed)render();const preparing=[...jobStates.values()].some(j=>['generating','validating','repairing'].includes(j.status));const failed=[...jobStates.values()].some(j=>['failed','unknown'].includes(j.status));piBar.textContent=s.settings.error||(preparing?(()=>{const j=[...jobStates.values()].filter(j=>['generating','validating','repairing'].includes(j.status)).at(-1);const seconds=Math.floor((Date.now()-Date.parse(j.createdAt))/1000);return (j.phase||'准备课件')+' · '+Math.floor(seconds/60)+'分'+seconds%60+'秒 · 可先听教案'})():failed?'有课件未准备成功，请稍后重试':`Pi · ${s.settings.model} · 文字聊天`);for(const job of jobStates.values()){if(job.status!=='failed')continue;const retry=document.createElement('button');retry.textContent='重新准备：'+job.goal;retry.style='display:block;margin-top:8px';retry.onclick=async()=>{retry.disabled=true;try{await piAPI('/api/pi/jobs/'+job.id+'/retry',{});await refreshPi()}catch(e){piBar.textContent=e.message}};piBar.append(retry)}if(summaryActivity)piBar.textContent=summaryActivity;return s}finally{refreshing=false}}
transmit=async m=>{if(!piReady||piBusy){update(m,{status:'failed'});piBar.textContent='请等待当前回复完成';return}if(m.piSubmitted){piBar.textContent='消息已提交，请刷新核查结果；未重复发送';return}m.piSubmitted=true;piBusy=true;m.requestId=crypto.randomUUID();seen.add(m.requestId);m.realDelivery=true;historyUsers.set(m.requestId,m);
update(m,{status:'pending'});const timer=setTimeout(()=>{if(m.status==='pending')update(m,{status:'Sending…'})},3000);
const parts=[add({type:'loading'})];let text='';function show(value){const chunks=piChunks(value);chunks.forEach((text,i)=>{if(!parts[i])parts[i]=add({text,group:i>0,full:true});else update(parts[i],{type:undefined,text,group:i>0,full:true})});if(!chunks.length)update(parts[0],{type:undefined,text:'正在为你准备课件…',full:true})}try{const r=await fetch('/api/pi/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Chat-Session':piSessionId||''},body:JSON.stringify({text:m.text,requestId:m.requestId})});if(!r.ok)throw Error((await readPiJSON(r)).error);if(!/(text\/event-stream|application\/octet-stream)/.test(r.headers.get('content-type')||''))throw Error('连接暂时中断，正在核对聊天记录');let buffer='',done=false;const reader=r.body.getReader(),decoder=new TextDecoder();while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let i;while((i=buffer.indexOf('\n\n'))>=0){const raw=buffer.slice(0,i);buffer=buffer.slice(i+2);if(!raw.startsWith('data:'))continue;let e;try{e=JSON.parse(raw.slice(5))}catch{throw Error('回复传输中断，正在核对聊天记录')}if(e.type==='accepted'){clearTimeout(timer);update(m,{status:'Sent'});continue}if(e.type==='error')throw Error(e.message);if(e.type==='delta'&&e.text){clearTimeout(timer);if(m.status!=='Read')update(m,{status:'Read'});text+=e.text;show(text)}if(e.type==='done'){done=true;seen.add(e.message.id);const extra=parts.splice(Math.max(1,piChunks(e.message.text).length));if(extra.length){messages=messages.filter(m=>!extra.includes(m));render()}show(e.message.text);for(const j of e.jobs||[])jobStates.set(j.id,j);update(m,{status:undefined})}}}if(!done)throw Error('回复中断，请刷新核查结果')}catch(e){
 // Reload canonical messages using the original request ID. Never render transport errors as a teacher reply.
 messages=messages.filter(item=>!parts.includes(item));render();update(m,{status:'failed'});piBar.textContent=e.message;
}finally{clearTimeout(timer);piBusy=false;refreshPi().catch(e=>{piBar.textContent=e.message})}};
let dialing=false,callAttempt=0;
async function startVoice(id){
 if(activeJob)return;
 const attempt=++callAttempt;
 const engine=[...M.querySelectorAll('[data-voice-model]')].find(e=>e.dataset.voiceModel===id)?.value||'live';
 activeJob=id;dialing=true;
 callFrame.style.visibility='hidden';callFrame.inert=true;
 callStatus.textContent='拨打电话中…';closeCall.textContent='‹ 返回聊天';
 callPanel.style.display='flex';document.getElementById('phone').classList.add('in-call');
 render();callRing?.start();
 try{
   const permit=await piAPI('/api/pi/jobs/'+id+'/start-voice',{engine});
   if(attempt!==callAttempt||activeJob!==id)return;
   callFrame.src='/console?engine='+engine+'&job='+encodeURIComponent(id)+'&voice='+encodeURIComponent(permit.voiceTicket);
 }catch(e){if(attempt===callAttempt){leaveCall();piBar.textContent=e.message}}
}
function leaveCall(){callAttempt++;dialing=false;summaryActivity='';following=true;callRing?.stop();activeJob=null;callFrame.src='about:blank';callPanel.style.display='none';document.getElementById('phone').classList.remove('in-call');render();refreshPi().catch(e=>{piBar.textContent=e.message})}
window.addEventListener('message',event=>{
  if(event.source!==callFrame.contentWindow||event.origin!==location.origin||event.data?.jobId!==activeJob)return;
  if(event.data.source==='voice-activity'){callStatus.textContent=event.data.label;if(summaryActivity)piBar.textContent=summaryActivity=event.data.label;return;}
  if(event.data.source==='voice-summary-started'){
    following=true;
    callPanel.style.display='none';
    document.getElementById('phone').classList.remove('in-call');
    summaryActivity='正在整理本次通话…';piBar.textContent=summaryActivity;
    H.scrollTop=H.scrollHeight;
  } else if(event.data.source==='voice-summary-failed'){
    callPanel.style.display='flex';
    document.getElementById('phone').classList.add('in-call');
    closeCall.textContent='‹ 返回聊天';
    summaryActivity='';callStatus.textContent=event.data.reason;
  }
});
closeCall.onclick=()=>{if(dialing){leaveCall();return}if(activeJob){closeCall.textContent='正在保存通话…';callFrame.contentWindow.postMessage({source:'finish-voice-call',jobId:activeJob},location.origin)}else leaveCall()};
window.addEventListener('message',e=>{if(e.source===callFrame.contentWindow&&e.origin===location.origin&&e.data?.jobId===activeJob&&['voice-summary-saved','voice-call-closed'].includes(e.data.source)){closeCall.textContent='‹ 返回聊天';leaveCall()}});
for(const id of ['play','all','mediaFail','cardLoad','long','missing','pause','reset','attach']){const el=document.getElementById(id);if(el)el.disabled=true}document.getElementById('quick').hidden=true;document.getElementById('info').onclick=()=>toast('先文字聊天和准备课件；点击邀请卡后才开启语音');
reset();messages=[];render();
import('/voice-action.mjs').then(m=>{piChunks=m.chatChunks}).catch(()=>{});
connectChat().catch(e=>{piBar.textContent=e.message});
setInterval(()=>{if(!piBusy&&!document.hidden)connectChat().catch(e=>{piBar.textContent=e.message})},2000);
window.addEventListener('message',e=>{if(e.source!==callFrame.contentWindow||e.origin!==location.origin||e.data?.source!=='voice-call-status'||e.data?.jobId!==activeJob)return;if(dialing){
 if(e.data.connected===true){
   callRing?.stop();dialing=false;callFrame.style.visibility='visible';callFrame.inert=false;
 }else{
   if(/失败|错误|结束|离线|未配置/.test(e.data.status)){callRing?.stop();callStatus.textContent=e.data.status}
   return;
 }
}
callStatus.textContent=e.data.status;if(/失败|错误|结束|离线|未配置/.test(e.data.status))callRing?.stop()});

const accountButton=document.createElement('button');accountButton.textContent='切换账号';accountButton.style='position:fixed;top:8px;right:8px;z-index:999;border:1px solid #dedbd3;border-radius:12px;background:#fffdf7;padding:10px;font:13px system-ui';document.body.append(accountButton);accountButton.onclick=()=>{if(activeJob||piBusy){piBar.textContent='请先结束通话或等待回复完成，再切换账号';return}location.href='/accounts'};fetch('/api/auth/status').then(r=>r.json()).then(s=>{if(s.account)accountButton.textContent=s.account.name+' · 切换账号'});

window.addEventListener('pagehide',()=>callRing?.stop());
