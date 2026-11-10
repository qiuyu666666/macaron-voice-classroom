import {validateQuickPage} from './quick-lesson.mjs';
import {LivePause} from './live-pause.mjs';
const livePause=new LivePause();
import {LocalRecording} from './recording.mjs';
let callRecording,summaryCommitted=false;
import{LiveAdapter}from'./live-adapter.mjs';
const liveMode=(new URLSearchParams(location.search).get('engine')||(new URLSearchParams(location.search).has('job')?'live':'realtime'))==='live';let liveAdapter=null,liveCloseResolve=null;
import{isSummaryResponse,summaryTextFrom,validCallSummary,formatCallSummary}from'./summary-turn.mjs';
import {MicMonitor} from './mic-monitor.mjs';
const courseJob=new URLSearchParams(location.search).get('job');const voiceTicket=new URLSearchParams(location.search).get('voice');let generatedContext=null,generatedReady=false,configLoaded=false,autoStarted=false,contextAck=null;
function maybeStartCourse(){if(courseJob&&voiceTicket&&generatedReady&&configLoaded&&!autoStarted){autoStarted=true;document.getElementById('connect').click()}}
import {toolCommand,semanticGate} from './lesson-tools.mjs';
const pendingLessonTools=new Map(),gateLesson=semanticGate();
function dispatchLesson(name,args){return new Promise(resolve=>{let command;try{command=toolCommand(name,args)}catch{resolve({ok:false,error:'invalid_tool_arguments'});return}const frame=document.getElementById('paged-lesson');if(!frame?.contentWindow){resolve({ok:false,error:'lesson_unavailable'});return}const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pendingLessonTools.delete(requestId);resolve({ok:false,error:'lesson_timeout'})},3000);pendingLessonTools.set(requestId,result=>{clearTimeout(timer);resolve(result)});frame.contentWindow.postMessage({source:'lesson-tool-request',channel:courseJob?lessonChannel():undefined,requestId,command},courseJob?'*':location.origin)})}
window.addEventListener('message',e=>{if(e.source!==document.getElementById('paged-lesson')?.contentWindow||(courseJob?(e.origin!=='null'||e.data?.channel!==lessonChannel()):e.origin!==location.origin)||e.data?.source!=='lesson-tool-result')return;const done=pendingLessonTools.get(e.data.requestId);if(done){pendingLessonTools.delete(e.data.requestId);done(e.data.result)}});
import {AudioOrb} from './audio-orb.mjs';
let lastVoiceHint='',lastSound=0,teacherIntent='';
const teacherLabels=new Map([['waiting','正在等你回答'],['practicing','留点时间给你试试'],['preparing','正在准备例子']]);
function showTeacherStatus(state){
 const label=teacherLabels.get(state);
 if(!label||ending||!connected)return {ok:false};
 teacherIntent=label;
 if(performance.now()-lastSound>900||!lastSound)voiceHint(label);
 return {ok:true};
}
function voiceHint(label){
 if(!courseJob||lastVoiceHint===label)return;
 lastVoiceHint=label;
 parent.postMessage({source:'voice-activity',jobId:courseJob,label},location.origin);
}
function voiceActivity(event){
 if(courseJob&&!ending&&!browseAnchor&&['session.output_transcript.delta','response.output_audio_transcript.delta'].includes(event.type)&&typeof event.delta==='string'){
   const pageId=pointLayouts.get(lessonView)?.pageId;
   if(pageId)lessonFrames.get(lessonView)?.frame.contentWindow?.postMessage({
     source:'lesson-spoken-text',channel:lessonChannel(),pageId,delta:event.delta,turn:event.item_id||event.response_id||''
   },'*');
 }
 if(liveMode&&event.type==='session.input_transcript.delta')livePause.activity('user',performance.now());
 if(liveMode&&event.type==='session.output_transcript.delta')livePause.activity('teacher',performance.now());

 if(['input_audio_buffer.speech_started','input_audio_buffer.committed','session.input_transcript.delta'].includes(event.type))teacherIntent='';
 const hints={'input_audio_buffer.speech_started':'听到你说话','input_audio_buffer.committed':'已收到你的语音','response.created':'正在回应','session.input_transcript.delta':'已收到你的语音','session.output_transcript.delta':'正在回应','output_audio_buffer.started':'老师在说','output_audio_buffer.stopped':teacherIntent||'等你说话'};
 if(!ending&&hints[event.type])voiceHint(hints[event.type]);
 if(['session.output_transcript.delta','output_audio_buffer.started'].includes(event.type))planNextPractice();
}
const audioOrb=new AudioOrb(level=>{if(level>.09&&!ending&&connected){lastSound=performance.now();if(liveMode)livePause.activity('teacher',lastSound);voiceHint('老师在说')}else if(lastVoiceHint==='老师在说'&&performance.now()-lastSound>900&&!ending)voiceHint(teacherIntent||'等你说话');document.getElementById('teacher-orb')?.style.setProperty('--level',String(level));document.getElementById('paged-lesson')?.contentWindow?.postMessage({source:'teacher-audio-level',level},location.origin)});
import {summaryRequest} from './summary-turn.mjs';
let summaryToken=null;let runtimeMessages={},ending=false,summaryTimer,summaryText='',summaryResponseId,summarySent=false;
import {attachMicrophone,releaseMedia,setMicEnabled} from './voice.mjs';
import {session,update,message,pageEvent,toolOutput,respond,instructions,contextMessage} from './protocol.mjs';
let micStream=null,voiceMode=false,muted=false,connectionTimer,disconnectTimer,connectionAbort,awaitingVoice=false;
const $=id=>document.getElementById(id);let micSpeechEvents=0,micCommitEvents=0,userSpeaking=false;const micMonitor=new MicMonitor(s=>{if(liveMode&&connected&&!ending&&s.enabled&&s.level>.18)livePause.activity('sound',performance.now());if(connected&&!ending&&s.enabled&&s.level>.18&&performance.now()-lastSound>900&&lastVoiceHint!=='已收到你的语音')voiceHint('麦克风检测到声音');$('mic-device').textContent='麦克风：'+s.label;$('mic-level').value=s.level;$('mic-signal').textContent=!s.enabled?'麦克风已静音':s.muted?'设备没有提供音频':s.hasSignal?'检测到输入声音':'当前输入很轻或无声音';$('mic-upload').textContent=s.bytes>0?'音频已上传 '+Math.round(s.bytes/1024)+' KB':'尚未上传音频'});let configState,current,pc,dc,connected=false,epoch=0,busy=false,pendingResponse=false,imageData=null,events=[],handled=new Set(),responses=new Map();
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500)}
async function api(path,body){if(courseJob&&!liveMode&&path.endsWith('/summary'))await callRecording?.stop();const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});if(!r.headers.get('content-type')?.includes('application/json'))throw Error('连接暂时中断，请重试');let data;try{data=await r.json()}catch{throw Error('回复传输中断，请重试')}if(!r.ok)throw Error(data.error);return data;}
function log(event,status){events.push({at:new Date().toISOString(),status,event});if(events.length>150)events.shift();const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');s.textContent=`${status} · ${event.type}`;p.textContent=JSON.stringify(event,(k,v)=>k==='image_url'?'[图片 data URL，已省略]':v,2);d.append(s,p);$('events').prepend(d);if($('events').children.length>150)$('events').lastChild.remove();}
function send(event){const live=connected&&dc?.readyState==='open';if(live){if(liveMode){if(event.type==='conversation.item.create'&&event.item?.type==='message')liveAdapter?.context(event.item.content.filter(c=>c.type==='input_text').map(c=>c.text).join('\n'));}else dc.send(JSON.stringify(event));}log(event,live?'已发送，待服务端确认':'离线预览 · 未发送');return live;}
function bubble(text,kind='system',image){$('messages').querySelector('.empty')?.remove();const b=document.createElement('div');b.className='bubble '+kind;const tag=document.createElement('small');tag.textContent=kind==='assistant'?'老师 · 真实 Realtime':kind==='user'?(connected?'你 · 当前会话':'你 · 离线草稿'):'调试台';b.append(tag,document.createTextNode(text));if(image){const img=new Image();img.src=image;b.append(img)}$('messages').append(b);b.scrollIntoView({block:'nearest'});return b;}
function readEditor(){return {instructions:$('instructions').value,lesson:$('lesson').value,model:$('model').value,macaron:$('macaron').checked}}
function render(){current=configState.versions.at(-1);$('model-status').textContent='已保存对话模型：'+current.config.model;for(const k of ['instructions','lesson','model'])$(k).value=current.config[k];$('macaron').checked=current.config.macaron;$('compiled').textContent=instructions(current.config);renderToolCatalog();$('saved').textContent=`已保存 ${current.id.slice(0,8)} · ${new Date(current.at).toLocaleString()}`;$('versions').replaceChildren();for(const v of [...configState.versions].reverse()){const o=document.createElement('option');o.value=v.id;o.textContent=`${v.id.slice(0,8)} · ${new Date(v.at).toLocaleString()}`;$('versions').append(o)}}
async function save(config=readEditor()){configState=await api('/api/config',{config,base:current.id});render();$('context-ready').textContent='已保存前置上下文；未来新会话会使用，当前会话需单独应用。';toast('保存成功：未来新会话使用此版本；当前会话未自动修改');log(update(current.config),'已保存 · 尚未应用');}
$('save').onclick=()=>save().catch(e=>toast(e.message));$('restore').onclick=()=>save(configState.versions.find(v=>v.id===$('versions').value).config).catch(e=>toast(e.message));
$('apply').onclick=()=>{send(update(current.config));toast(connected?'已提交老师规则；前置上下文更改需重新连接，避免叠加旧资料':'离线：仅展示老师规则 session.update；资料在新连接单独发送')};
let openingState=null;
function startRealtimeWarmup(){
 openingState={epoch,greetingDone:false,page:null,userSpoke:false,continued:false};
 send({type:'response.create',response:{output_modalities:[voiceMode?'audio':'text'],tool_choice:'none',metadata:{purpose:'warm_greeting'},instructions:runtimeMessages.voiceOpening}});
 send({type:'response.create',response:{conversation:'none',output_modalities:['text'],metadata:{purpose:'opening_board'},
   input:[message('当前学习目标：'+generatedContext.job.goal+'。课堂背景：'+generatedContext.job.course_brief).item],
   tool_choice:{type:'function',name:'present_board'},instructions:'静默生成第一屏，使用 present_board，mode=current。只写本次目标的一小点。不要生成面向用户的文字或语音。'}});
}
function continueAfterGreeting(){
 const s=openingState;
 if(!s||s.epoch!==epoch||s.continued||!s.greetingDone||(!s.page&&!s.retry)||s.userSpoke||ending||!connected||busy||teacherAudioPlaying)return;
 s.continued=true;
 send(message(s.page?'首屏已显示：'+s.page+'。接着问候自然进入这一点，不重复打招呼或描述制作过程。':'请直接调用 present_board 写出眼前这一点，再自然继续，不播报操作。'));
 requestResponse();
}
async function finishOpeningBoard(response){
 const s=openingState;if(!s||s.epoch!==epoch||ending)return;
 const call=response.output?.find(o=>o.type==='function_call'&&o.name==='present_board');
 try{
   if(!call)throw Error('未生成首屏');
   const current=await dispatchLesson('get_lesson_layout',{});
   if(s.epoch!==epoch||ending||!current.layout?.emptyBoard)return;
   const args=JSON.parse(call.arguments);
   const result=await classroomTool('present_board',{...args,mode:'current'},call.call_id);
   if(!result.ok)throw Error('首屏未展示');
   if(s.epoch!==epoch||ending)return;
   s.page=args.title;send(message('课堂画板已展示：'+args.title+'\n'+args.markdown));continueAfterGreeting();
 }catch{if(s.epoch===epoch&&!ending){s.retry=true;continueAfterGreeting()}}
}
function requestResponse(){if(ending||liveMode)return;if(connected&&busy){pendingResponse=true;return}send(respond(voiceMode));if(connected)busy=true;}
function disconnect(){callRecording?.stop().catch(e=>toast(e.message));if(ending&&!liveMode&&courseJob&&$('summary-status').textContent.match(/超时|未取得|失败/))parent.postMessage({source:'voice-summary-failed',jobId:courseJob,reason:$('summary-status').textContent},location.origin);micMonitor.stop();$('voice-finish').disabled=true;userSpeaking=false;audioOrb.stop();clearTimeout(summaryTimer);ending=false;summarySent=false;$('summary-end').disabled=true;$('active-model').textContent='当前会话模型：未连接';epoch++;clearTimeout(connectionTimer);clearTimeout(disconnectTimer);connectionAbort?.abort();connected=false;busy=false;pendingResponse=false;awaitingVoice=false;releaseMedia(micStream,$('remote-audio'));micStream=null;dc?.close();pc?.close();dc=null;pc=null;handled.clear();responses.clear();$('status').textContent='离线';$('voice-state').textContent='语音已停止 · 麦克风已释放';$('connect').hidden=false;$('connect').disabled=false;$('disconnect').hidden=true;$('voice').disabled=false;$('transcribe').disabled=true;$('mic').disabled=true;$('play-audio').hidden=true;$('remote-audio').hidden=true;}
$('disconnect').onclick=()=>beginSummary();
$('immediate-end').onclick=()=>beginSummary();
$('mic').onclick=()=>{muted=!muted;setMicEnabled(micStream,!muted);$('mic').textContent=muted?'取消静音':'静音';$('voice-state').textContent=muted?'麦克风已静音':'麦克风正在传输到 Realtime';};
$('play-audio').onclick=()=>{$('remote-audio').play().then(()=>{$('play-audio').hidden=true}).catch(()=>toast('播放受限，请使用音频控件播放'))};
$('connect').onclick=async()=>{let connectionEpoch;try{if(courseJob&&(!voiceTicket||!generatedContext||!generatedReady))throw Error('课件尚未加载完成');runtimeMessages=await api('/api/prompts/runtime');livePause.delay=(Number(runtimeMessages.livePauseSeconds)||5)*1000;const info=await api('/api/config');if(!info.configured){toast('未配置服务端 OPENAI_API_KEY；未申请麦克风，未连接 OpenAI。');$('status').textContent='语音服务未配置';return}configState=info;render();voiceMode=$('voice').checked;muted=false;$('diagnostic').textContent=voiceMode?'准备申请麦克风权限':'文字模式：不使用麦克风、不生成语音';if(voiceMode&&(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia))throw Error('此页面无法使用麦克风，请使用本机 http://127.0.0.1:4317 或 HTTPS 浏览器页面');$('connect').disabled=true;$('voice').disabled=true;$('transcribe').disabled=true;$('disconnect').hidden=false;$('status').textContent='加载已保存上下文 · 连接中';connectionEpoch=++epoch;connectionAbort=new AbortController();connectionTimer=setTimeout(()=>{if(epoch===connectionEpoch){disconnect();toast('连接超时，麦克风已释放')}},30000);const peer=new RTCPeerConnection();pc=peer;
peer.ontrack=e=>{if(epoch!==connectionEpoch)return;const audio=$('remote-audio');$('voice-state').textContent='远端音轨已建立 · 尚未确认播放';audio.srcObject=e.streams[0]||new MediaStream([e.track]);callRecording?.add(audio.srcObject);audioOrb.start(audio.srcObject).catch(()=>{});audio.hidden=false;audio.play().catch(()=>{$('play-audio').hidden=false;toast('点击开启声音播放')})};
if(voiceMode){$('voice-state').textContent='等待麦克风权限…';micStream=await attachMicrophone(peer,navigator.mediaDevices,()=>epoch===connectionEpoch,runtimeMessages);if(epoch!==connectionEpoch)return;micSpeechEvents=0;micCommitEvents=0;micMonitor.start(micStream,peer).catch(()=>{$('mic-signal').textContent='输入音量监测不可用'});if(courseJob){
 callRecording=new LocalRecording({onStatus:text=>$('recording-status').textContent=text,save:async blob=>{
 const res=await fetch('/api/pi/jobs/'+courseJob+'/audio',{method:'POST',headers:{'Content-Type':blob.type,'X-Voice-Ticket':voiceTicket},body:blob});
 if(!res.ok)throw Error('完整录音未保存，可重试挂断');return res.json();
 }});
 await callRecording.start(micStream);
}for(const track of micStream.getTracks())track.onended=()=>{if(epoch===connectionEpoch&&!ending){disconnect();toast('麦克风不可用，连接已关闭')}};$('voice-state').textContent='麦克风就绪 · 正在建立安全连接';}else peer.addTransceiver('audio',{direction:'recvonly'});
dc=peer.createDataChannel('oai-events');if(liveMode)liveAdapter=new LiveAdapter({send:event=>{if(dc?.readyState==='open')dc.send(JSON.stringify(event))},tool:async(name,args,callId)=>{if(ending)return{ok:false,error:'call_ended'};return classroomTool(name,args,callId)},onStarted:async()=>{connected=true;clearTimeout(connectionTimer);$('status').textContent='已接通 · GPT-Live-1';$('active-model').textContent='GPT-Live-1';$('connect').hidden=true;$('disconnect').hidden=false;$('mic').disabled=false;$('summary-end').disabled=false;liveAdapter.commentary(runtimeMessages.voiceOpening);liveAdapter.context(JSON.stringify({source:'initial_screen',...(await dispatchLesson('get_lesson_layout',{}))}));liveAdapter.startBoard(generatedContext.job.goal,generatedContext.job.course_brief)},onContextStats:stats=>{log({type:'live.context.stats',...stats},'上下文追加计数');queueVoiceAudit({kind:'live_context',...stats})},onClosed:()=>{connected=false;liveCloseResolve?.();liveCloseResolve=null},onError:message=>{queueVoiceAudit({kind:'live_event_error',name:String(message).slice(0,110)});$('diagnostic').textContent='Live错误：'+message;toast(message)}});dc.onmessage=e=>{if(epoch===connectionEpoch){try{const event=JSON.parse(e.data);voiceActivity(event);if(liveMode)liveAdapter.receive(event).catch(err=>toast(err.message));else receive(event)}catch(err){toast('事件处理失败：'+err.message)}}};dc.onopen=async()=>{if(epoch!==connectionEpoch)return;if(liveMode)return;clearTimeout(connectionTimer);connected=true;$('diagnostic').textContent='信令成功，数据通道已打开';$('status').textContent='已接通 · 等待模型首段输出';$('connect').hidden=true;$('disconnect').hidden=false;$('mic').disabled=!voiceMode;$('voice-finish').disabled=!voiceMode;$('summary-end').disabled=false;$('mic').textContent='静音';$('voice-state').textContent=voiceMode?'麦克风正在传输到 Realtime':'文字模式 · 未采集麦克风';bubble('通道已连接，前置上下文将作为 user 资料消息提交；正在请求老师开场。此前离线记录未发送。版本 '+current.id.slice(0,8));try{const context=courseJob?message(generatedContext.text):contextMessage(current.config);context.item.id='ctx_'+crypto.randomUUID().replaceAll('-','').slice(0,24);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{contextAck=null;reject(Error('上下文确认超时'))},10000);contextAck={id:context.item.id,resolve:()=>{clearTimeout(timer);contextAck=null;resolve()}};send(context)});if(epoch!==connectionEpoch)return;if(courseJob)send(message(JSON.stringify({source:'initial_screen',...(await dispatchLesson('get_lesson_layout',{}))})));if(courseJob)startRealtimeWarmup();else{send(message(runtimeMessages.voiceOpening));requestResponse()}}catch(e){if(epoch===connectionEpoch){disconnect();toast(e.message)}}};dc.onclose=()=>{if(liveMode&&ending)return;if(epoch===connectionEpoch){disconnect();toast('数据通道已关闭')}};dc.onerror=()=>{if(epoch===connectionEpoch){disconnect();toast('数据通道错误')}};
peer.onconnectionstatechange=()=>{if(epoch!==connectionEpoch)return;clearTimeout(disconnectTimer);if(peer.connectionState==='failed'||peer.connectionState==='closed'){disconnect();toast('连接中断，请手动重连')}else if(peer.connectionState==='disconnected'){$('status').textContent='网络中断 · 等待恢复';disconnectTimer=setTimeout(()=>{if(epoch===connectionEpoch){disconnect();toast('网络持续中断，已释放麦克风')}},5000)}else if(peer.connectionState==='connected'&&connected)$('status').textContent=voiceMode?'已连接 · 语音模式':'已连接 · 文字模式';};
const offer=await peer.createOffer();await peer.setLocalDescription(offer);log({type:'realtime.calls',session:session(current.config,voiceMode,$('transcribe').checked)},'握手配置 · 服务端读取保存版本');if(liveMode&&peer.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{peer.removeEventListener('icegatheringstatechange',check);reject(Error('ICE准备超时'))},10000);function check(){if(peer.iceGatheringState==='complete'){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',check);resolve()}}peer.addEventListener('icegatheringstatechange',check);check()});const r=await fetch(liveMode?'/api/live-call':'/api/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:peer.localDescription.sdp,version:current.id,voice:voiceMode,transcribe:$('transcribe').checked,...(courseJob?{jobId:courseJob,voiceTicket}: {})}),signal:connectionAbort.signal});if(!r.ok)throw Error((await r.json()).error);const answer=liveMode?(await r.json()).transport.sdp:await r.text();if(epoch!==connectionEpoch)return;await peer.setRemoteDescription({type:'answer',sdp:answer});}catch(e){if(connectionEpoch!==undefined&&epoch!==connectionEpoch)return;disconnect();const reason=({NotAllowedError:'麦克风权限未授予：请在浏览器地址栏的网站权限中允许麦克风，然后重连',NotFoundError:'没有找到麦克风设备',NotReadableError:'麦克风不可读取：可能被系统拒绝或设备占用'})[e.name]||e.message;$('diagnostic').textContent=reason;toast(reason)}};
window.addEventListener('pagehide',disconnect);
window.addEventListener('offline',()=>{if(pc){disconnect();toast('网络离线，麦克风已释放')}});
window.addEventListener('message',e=>{if(e.source!==$('classroom').contentWindow||e.origin!=='null'||e.data?.source!=='classroom-demo-v1')return;const p=e.data.payload;if(!p||typeof p!=='object')return;if(p.event==='annotated_image'){if(typeof p.image!=='string'||!p.image.startsWith('data:image/png;base64,')||p.image.length>3000000)return;send(message('学生在原课堂中的圈选截图',p.image));bubble('原课堂圈选截图','user',p.image);}else{const text=JSON.stringify(p);if(text.length>4000)return;send(message(text));bubble('原课堂操作：'+(p.target||p.text||p.event));}if($('auto').checked)requestResponse();});
async function generate(request,mode,callId){const startedEpoch=epoch;$('generate').disabled=true;$('job').textContent='等待模拟适配器返回…';try{const result=await api('/api/generate',{request,mode});$('job').textContent=JSON.stringify(result,null,2);if(epoch!==startedEpoch){log({type:'adapter.result',result},'会话已更换 · 未回传');return}if(callId){send(toolOutput(callId,result));requestResponse()}else{send(message('手动调试适配器结果（非模型工具调用）：'+JSON.stringify(result)));bubble('模拟适配器：'+(result.content||result.error));}}catch(e){const result={status:'failed',simulated:true,error:e.message};$('job').textContent=e.message;if(callId&&epoch===startedEpoch){send(toolOutput(callId,result));requestResponse()}}finally{$('generate').disabled=false}}
$('generate').onclick=()=>generate($('generate-request').value,$('generate-mode').value);
function receive(e){
 if(e.response?.metadata?.purpose==='opening_board'){if(e.type==='response.done')void finishOpeningBoard(e.response);return}
 if(e.type==='input_audio_buffer.speech_started'&&openingState)openingState.userSpoke=true;
 if(e.type==='response.done'&&e.response?.metadata?.purpose==='warm_greeting'&&openingState)openingState.greetingDone=true;
 if(e.type==='output_audio_buffer.stopped'||e.type==='response.done')queueMicrotask(continueAfterGreeting);
 if(e.type==='output_audio_buffer.started'){queueVoiceAudit({kind:'realtime_audio_started'});teacherAudioPlaying=true;$('status').textContent='通话中 · 老师正在讲解';$('voice-state').textContent='正在播放老师语音'}if(e.type==='output_audio_buffer.stopped'&&connected&&!ending){teacherAudioPlaying=false;$('status').textContent='通话中 · 等待你说话'}if(['conversation.item.created','conversation.item.done'].includes(e.type)&&e.item?.id===contextAck?.id)contextAck.resolve();log(voiceMode?{type:e.type,event_id:e.event_id,response_id:e.response_id,note:'语音事件内容默认隐藏'}:e,'服务端收到');if((e.type==='session.created'||e.type==='session.updated')&&e.session?.model)$('active-model').textContent='服务端确认会话模型：'+e.session.model;if(e.type==='session.updated')toast('服务端已确认 session.updated');if(e.type==='error'){busy=false;pendingResponse=false;$('diagnostic').textContent='Realtime 错误：'+(e.error?.code||'查看事件流水');toast(e.error?.message||'Realtime 错误')}if(e.type==='response.created'){queueVoiceAudit({kind:'realtime_response'});busy=true;if(ending&&summarySent&&isSummaryResponse(e.response,summaryToken)){summaryResponseId=e.response.id;voiceHint('已开始生成小结')}}if(e.type==='input_audio_buffer.speech_started'&&!ending){userSpeaking=true;pendingResponse=false;$('voice-state').textContent='正在听你说话'}if(e.type==='input_audio_buffer.speech_stopped'){queueVoiceAudit({kind:'realtime_speech_stopped'});userSpeaking=false}if(e.type==='input_audio_buffer.committed'&&!ending){micCommitEvents++;$('mic-server').textContent='已收到你的第 '+micCommitEvents+' 段发言'}if(e.type==='response.output_text.delta'||e.type==='response.output_audio_transcript.delta'){if(ending&&e.response_id===summaryResponseId&&e.type==='response.output_text.delta')summaryText+=e.delta;else if(!voiceMode&&e.type==='response.output_text.delta'){let item=responses.get(e.item_id);if(!item){item=bubble('','assistant');responses.set(e.item_id,item)}item.append(document.createTextNode(e.delta));}}if(e.type==='response.done'&&ending&&isSummaryResponse(e.response,summaryToken)){summaryText=summaryTextFrom(e.response)||summaryText;const structured=validCallSummary(summaryText);if(e.response.status!=='completed'||!structured){$('summary-status').textContent='未取得完整总结，未回传';disconnect();return}clearTimeout(summaryTimer);const text=formatCallSummary(structured);$('summary-status').textContent=text;api(courseJob?'/api/pi/jobs/'+courseJob+'/summary':'/api/summary',{text,userObservation:structured.userObservation}).then(r=>{$('summary-status').textContent+=(courseJob?' 已保存，正在回传原聊天':' 已保存：'+r.path);if(courseJob)parent.postMessage({source:'voice-summary-saved',jobId:courseJob},location.origin);disconnect()}).catch(()=>{if(courseJob)parent.postMessage({source:'voice-summary-failed',jobId:courseJob,reason:'总结保存失败，可再次挂断重试'},location.origin);$('summary-status').textContent+=' 保存失败，点击结束通话重试';ending=false;summarySent=false;$('disconnect').disabled=false});return}if(e.type==='response.done'&&ending){busy=false;if(!summarySent)sendSummaryOnce();return}if(e.type==='response.done'){if(e.response?.status==='failed'){$('diagnostic').textContent='模型生成失败：'+(e.response.status_details?.error?.code||'请查看事件流水');}busy=false;const calls=(e.response?.output||[]).filter(x=>x.type==='function_call');for(const call of calls){if(handled.has(call.call_id))continue;handled.add(call.call_id);try{const args=JSON.parse(call.arguments);if(call.name==='show_teacher_status'){send(toolOutput(call.call_id,showTeacherStatus(args.state)));continue}if(call.name==='wait_for_user'){send(toolOutput(call.call_id,{ok:true,waiting:true}));pendingResponse=false;continue}if(['get_lesson_layout','circle_lesson_element','clear_teacher_marks','activate_lesson_control','select_learning_view','go_to_lesson_page','set_lesson_focus','request_lesson_material','update_lesson_page','patch_lesson_text','append_lesson_point','present_board','read_lesson_file','prepare_next_point','show_prepared_point'].includes(call.name)){const callEpoch=epoch;classroomTool(call.name,args,call.call_id).then(result=>{if(epoch!==callEpoch||ending)return;send(toolOutput(call.call_id,result));requestResponse()});continue}if(call.name!=='generate_lesson_content')throw Error('不支持的工具');generate(args.request,'success',call.call_id)}catch(err){send(toolOutput(call.call_id,{status:'failed',error:err.message}));pendingResponse=true}}if(pendingResponse){pendingResponse=false;requestResponse()}}}
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('input').value.trim();if(!text&&!imageData)return;send(message(text||'请看这张课堂截图',imageData));bubble(text||'课堂截图','user',imageData);requestResponse();$('input').value='';clearImage()};
for(const b of document.querySelectorAll('[data-target]'))b.onclick=()=>{send(pageEvent(b.dataset.target));bubble('页面点击：'+b.dataset.target);if($('auto').checked)requestResponse()};
function clearImage(){imageData=null;$('image').value='';$('image-name').textContent='';$('remove-image').hidden=true}
$('remove-image').onclick=clearImage;$('image').onchange=async()=>{const file=$('image').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){clearImage();return toast('请选择 2 MB 内的 PNG、JPEG 或 WebP')}const reader=new FileReader();reader.onload=()=>{imageData=reader.result;$('image-name').textContent=file.name;$('remove-image').hidden=false};reader.readAsDataURL(file)};
$('clear').onclick=()=>{$('messages').replaceChildren();toast('已清空本地显示；服务端历史仍保留，需断开重连开启新会话')};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(events,(k,v)=>k==='image_url'?'[图片数据已省略]':v,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='realtime-events.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
try{configState=await api('/api/config');render();configLoaded=true;maybeStartCourse();log({type:'session.create.preview',session:session(current.config)},'离线配置预览')}catch(e){toast('无法读取配置：'+e.message)}

// File selection grants access only to these user-selected files; content is never executed.
const selectedContext={};
async function loadContextFile(id,key){const file=$(id).files[0];if(!file)return;try{if(file.size>12*1024)throw Error('每份文件不得超过 12 KB');const text=await file.text();selectedContext[key]={name:file.name,text};$('context-preview').textContent=Object.entries(selectedContext).map(([k,v])=>`来源：${v.name}（${k}，${v.text.length} 字）\n${v.text}`).join('\n\n');$('context-ready').textContent='文件已读取并预览，尚未合并或保存';}catch(e){delete selectedContext[key];toast(e.message)}}
$('context-file').onchange=()=>loadContextFile('context-file','Markdown');$('history-file').onchange=()=>loadContextFile('history-file','聊天记录');
$('merge-context').onclick=()=>{const parts=Object.entries(selectedContext).map(([k,v])=>`【${k}来源：${v.name}】\n${v.text}`);if($('history-text').value.trim())parts.push('【手动粘贴的聊天记录】\n'+$('history-text').value);const text=parts.join('\n\n');if(!text)return toast('请先选择文件或填写聊天记录');if(text.length>10000)return toast('合并后超过 10000 字，请减少内容');$('lesson').value=text;$('context-ready').textContent=`已合并 ${text.length} 字到草稿。请检查前置上下文后保存；未保存不会发送。`;};
$('remote-audio').addEventListener('loadeddata',()=>{$('voice-state').textContent='音频媒体数据已加载 · 等待播放'});
$('remote-audio').addEventListener('playing',()=>{$('voice-state').textContent='浏览器正在播放远端音频（不代表已确认扬声器可听见）';$('status').textContent='已接通 · 播放中'});
$('remote-audio').addEventListener('waiting',()=>{$('voice-state').textContent='音频缓冲中'});

function sendSummaryOnce(){if(!ending||summarySent)return;summarySent=true;summaryToken=crypto.randomUUID();voiceHint('已请求生成小结');send(summaryRequest(runtimeMessages.voiceSummary,summaryToken));}
function beginSummary(){if(callRecording)callRecording.stop().catch(e=>toast(e.message));if(courseJob&&(connected||liveMode&&liveAdapter))parent.postMessage({source:'voice-summary-started',jobId:courseJob},location.origin);if(liveMode)return finishLive();if(!connected||ending)return;ending=true;summaryToken=null;$('status').textContent='正在整理本次学习…';summarySent=false;summaryText='';summaryResponseId=null;pendingResponse=false;awaitingVoice=false;micStream?.getTracks().forEach(t=>t.stop());$('mic').disabled=true;$('summary-end').disabled=true;$('summary-status').textContent='正在请求一次文本总结（有模型费用），最多等待45秒；可立即挂断。总结可能不完整或有误。';summaryTimer=setTimeout(()=>{$('summary-status').textContent='总结超时，已断开；未自动重试';disconnect()},45000);send({type:'session.update',session:{type:'realtime',audio:{input:{turn_detection:null}}}});send({type:'output_audio_buffer.clear'});if(busy)send({type:'response.cancel'});else sendSummaryOnce();}
$('summary-end').onclick=beginSummary;



window.addEventListener('message',e=>{if(e.source!==$('paged-lesson')?.contentWindow||e.origin!==location.origin||e.data?.source!=='paged-lesson-v1')return;const p=e.data.payload;if(!p||typeof p!=='object')return;if(p.event==='annotated_image'){if(typeof p.image!=='string'||!p.image.startsWith('data:image/png;base64,')||p.image.length>3000000)return;send(message(JSON.stringify({source:p.source,pageId:p.pageId,revision:p.revision,description:p.description}),p.image))}else{const text=JSON.stringify(p);if(text.length>12000)return;gateLesson(p,payload=>send(message(JSON.stringify(payload))))}if($('auto').checked)requestResponse()});

function renderToolCatalog(){const root=$('tool-catalog');if(!root)return;root.replaceChildren();const outputs={get_lesson_layout:'{ok, layout:{pageId,revision,viewport,elements:[{id,x,y,width,height}]}}',circle_lesson_element:'{ok, action, elementId} 或 {ok:false,error}',clear_teacher_marks:'{ok:true} 或 {ok:false,error}',generate_lesson_content:'{status,simulated:true,provider,content} 或 {status,error}'};for(const tool of session(current.config).tools){const card=document.createElement('details');card.className='tool-card';const title=document.createElement('summary');title.textContent=tool.name;const badge=document.createElement('p');badge.className='tool-badge';badge.textContent=tool.name==='generate_lesson_content'?'模拟 · 已配置启用':'本机可执行 · 新会话注册 · 真实模型未验证';const desc=document.createElement('p');desc.textContent=tool.description;const schema=document.createElement('pre');schema.textContent='入参\n'+JSON.stringify(tool.parameters,null,2)+'\n出参\n'+outputs[tool.name];card.append(title,badge,desc,schema);root.append(card)}if(!current.config.macaron){const p=document.createElement('p');p.textContent='generate_lesson_content：未注册（模拟开关关闭）。入参 {request:string}；出参模拟内容或失败状态。';root.append(p)}const note=document.createElement('p');note.className='small';note.textContent='未接通：真实 Macaron 生成、TSX 编辑、任意坐标画圈。Schema 列表不是执行权限；页版本与参数仍须校验。';root.append(note)}

let lessonView='outline',courseReady=false,courseNotice=null,courseNotified=false,teacherAudioPlaying=false;
const lessonFrames=new Map(),materialNotices=[],materialNoticeKeys=new Set();
async function sendLessonSnapshot(view,entry,p){
 const channel=lessonChannel(view);
 let ok=false;
 try{
   if(view!==lessonView||!connected||ending||dc?.readyState!=='open')throw Error('请先接通语音再发送标注');
   if(typeof p.image!=='string'||!p.image.startsWith('data:image/jpeg;base64,')||p.image.length>2000000)throw Error('截图过大');
   const frame=entry.frame,sessionEpoch=epoch;
   const text='学生发送了第 '+p.page+' 页的截图。橙色是学生的笔迹，供下一次自然接话时参考。';
   const msg=message(text,p.image);
   if(!liveMode&&JSON.stringify(msg).length<Math.min(pc.sctp?.maxMessageSize||65536,64000)){
     if(!send(msg))throw Error('语音连接已关闭');
   }else{
     const result=await api('/api/lesson-snapshot',{jobId:courseJob,voiceTicket,image:p.image});
     if(epoch!==sessionEpoch||ending||!connected||frame!==document.getElementById('paged-lesson'))throw Error('课堂页面已切换，请重新发送');
     if(liveMode){liveAdapter.context('学生第'+p.page+'页截图的视觉观察：'+result.text)}
     else send(message('学生第'+p.page+'页截图的视觉观察：'+result.text))
   }
   ok=true;voiceHint('已发送课件标注');
 }catch(error){toast(error.message)}
 entry.frame.contentWindow?.postMessage({source:'snapshot-result',channel,ok},'*');
}
function queueMaterialNotice(key,payload){if(materialNoticeKeys.has(key))return;queueVoiceAudit({kind:payload.event,materialId:payload.materialId});materialNoticeKeys.add(key);materialNotices.push(payload);flushCourseNotice()}
let preparedPoint=null;
const preparingAfter=new Set();
function currentMaterialId(){return lessonView.startsWith('material:')?lessonView.slice(9):courseJob}
if(liveMode&&courseJob){
 let idleNotice=0;
 const pauseTimer=setInterval(()=>{
   if(livePause.check(performance.now(),connected&&!ending&&!muted&&!document.hidden)){
     liveAdapter?.context('通话观察 '+(++idleNotice)+'：'+runtimeMessages.livePauseHint.replaceAll('{seconds}',String(livePause.delay/1000)));
   }
 },250);
 window.addEventListener('pagehide',()=>clearInterval(pauseTimer),{once:true});
}
const pointLayouts=new Map();
function teachingKey(){const l=pointLayouts.get(lessonView);return l&&JSON.stringify([currentMaterialId(),l.page,l.pages?.find(p=>p.page===l.page)?.title||generatedContext.job.goal])}
function teacherNotice(text){
 if(!connected||ending)return;
 if(liveMode)liveAdapter.context(text);else send(message(text));
}
let browseAnchor;
function onBrowse(previous,current){
 browseAnchor??=previous?.title||'原教学进度';
 const page=current?.title||'另一知识点';
 teacherNotice((runtimeMessages.navigationNotice||'用户翻到了「{page}」，仅供参考。').replaceAll('{page}',()=>page)+' 上一个教学位置：'+browseAnchor);
 if(current?.title===browseAnchor)browseAnchor=null;
}
function planNextPractice(){
 if(!courseJob||!connected||ending||browseAnchor)return;
 const key=teachingKey(),layout=pointLayouts.get(lessonView);
 if(!key||!layout||layout.emptyBoard||preparingAfter.has(key))return;
 preparingAfter.add(key);
 teacherNotice('当前知识点已展示；可以静默准备后续内容。若学生提出新例子或正在追问规律，先沿着他的思路讲清并同步当前屏幕，预备材料可以暂不使用。');
}
async function classroomTool(name,args,callId){
 if(name==='present_board'){
   const {layout}=await dispatchLesson('get_lesson_layout',{});
   if(!layout)return{ok:false,error:'board_unavailable'};
   const empty=layout.emptyBoard;
   const content={title:args.title,focus:args.title,markdown:args.markdown,purpose:'knowledge'};
   return classroomTool(empty||args.mode==='current'?'update_lesson_page':'append_lesson_point',{pageId:layout.pageId,revision:layout.revision,content},callId);
 }
 if(['prepare_next_point','update_lesson_page','append_lesson_point'].includes(name)&&args.content){
   args={...args,content:{...args.content,purpose:args.content.purpose||'knowledge'}};
   try{validateQuickPage(args.content)}catch(e){return {ok:false,error:e.message,hint:'普通知识页不带题目；确需评估则以 purpose=assessment 单独开页。'}}
   if(name==='update_lesson_page'&&args.content.purpose==='assessment')name='append_lesson_point';
 }
 if(name==='get_lesson_layout'){
   const result=await dispatchLesson(name,args);
   if(result.ok&&preparedPoint&&preparedPoint.key===teachingKey())result.nextPoint={id:preparedPoint.id,title:preparedPoint.content.title,ready:true};
   return result;
 }
 if(name==='go_to_lesson_page'&&preparedPoint?.key===teachingKey()&&preparedPoint){
   const {layout}=await dispatchLesson('get_lesson_layout',{});
   if(layout&&args.pageId===layout.pageId&&args.revision===layout.revision&&args.page===layout.pages.length+1)
     return classroomTool('show_prepared_point',{id:preparedPoint.id});
 }
 if(name==='prepare_next_point'){
   try{const content=validateQuickPage(args.content);preparedPoint={id:crypto.randomUUID(),content,key:teachingKey()};return{ok:true,id:preparedPoint.id,title:content.title,displayed:false}}
   catch{return{ok:false,error:'invalid_quick_page'}}
 }
 if(name==='show_prepared_point'){
   const point=preparedPoint;
   if(!point||(args.id&&args.id!==point.id)||point.key!==teachingKey())return{ok:false,error:'prepared_point_missing'};
   const {layout}=await dispatchLesson('get_lesson_layout',{});
   if(!layout)return{ok:false,error:'no_current_page'};
   const result=await classroomTool('append_lesson_point',{pageId:layout.pageId,revision:layout.revision,content:point.content});
   if(result.ok&&preparedPoint===point){preparedPoint=null;queueVoiceAudit({kind:'point_shown',materialId:point.id,page:result.page})}
   return result;
 }
 if(['select_learning_view','go_to_lesson_page','append_lesson_point','show_prepared_point','update_lesson_page','patch_lesson_text'].includes(name))browseAnchor=null;
 if(name==='show_teacher_status')return showTeacherStatus(args?.state);
 const started=performance.now();if(name==='request_lesson_material')voiceHint('正在安排下一份练习');queueVoiceAudit({kind:'tool_request',name});
 if(name==='read_lesson_file'){try{return await api('/api/pi/jobs/'+courseJob+'/read-file',{...args,voiceTicket})}catch(e){return{ok:false,error:e.message}}}
 if(['update_lesson_page','patch_lesson_text','append_lesson_point','set_lesson_focus'].includes(name)){
 const current=pointLayouts.get(lessonView);
 const currentTitle=current?.pages?.find(p=>p.page===current.page)?.title;
 if(name==='append_lesson_point'&&current?.emptyBoard)name='update_lesson_page';
 const frameView=lessonView;
 const result=await dispatchLesson(name,args);if(name==='set_lesson_focus'&&!result.block)return result;
 if(result.ok){try{const saved=await api('/api/pi/jobs/'+courseJob+'/quick-page',{voiceTicket,materialId:frameView.startsWith('material:')?frameView.slice(9):courseJob,view:frameView==='board'?'board':frameView==='outline'?'outline':'course',page:result.page,content:args.content,block:result.block||args.block});result.saved=saved.saved}catch(e){result.saved=false;result.saveError=e.message}}queueVoiceAudit({kind:'quick_page',ok:result.ok,ms:Math.round(performance.now()-started),page:result.page});return result}

 if(name==='request_lesson_material'){if(!courseJob)return{ok:false,error:'no_active_lesson'};try{const result=await api('/api/pi/jobs/'+courseJob+'/materials',{...args,voiceTicket,requestId:callId||crypto.randomUUID()});return{ok:true,...result}}catch(e){return{ok:false,error:e.message}}}
 return name==='select_learning_view'?selectLearningView(args):dispatchLesson(name,args);
}

function lessonChannel(view=lessonView){return generatedContext?.job.channel+':'+view}
const taughtViews=[];
function updateNeighbors(){
 if(!taughtViews.includes(lessonView))taughtViews.push(lessonView);
 const index=taughtViews.indexOf(lessonView);
 lessonFrames.get(lessonView)?.frame.contentWindow?.postMessage({source:'lesson-neighbors',channel:lessonChannel(),back:index>0,forward:index+1<taughtViews.length},'*');
}
async function navigateKnowledge(delta){
 const target=taughtViews[taughtViews.indexOf(lessonView)+delta];if(!target)return;
 const layout=pointLayouts.get(lessonView),previous=layout?.pages?.find(p=>p.page===layout.page);
 const result=await selectLearningView(target==='outline'?{view:'outline'}:{view:'course',materialId:target==='course'?courseJob:target.slice(9)});
 if(result.ok)onBrowse(previous,result.layout.pages?.find(p=>p.page===result.layout.page));
}
async function selectLearningView(args){if(!courseJob||!args||Object.keys(args).some(k=>!['view','materialId'].includes(k))||!['outline','course'].includes(args.view)||args.materialId&&args.view!=='course')return{ok:false,error:'invalid_view'};if(args.view==='course'&&!args.materialId&&[...lessonFrames].some(([key,entry])=>key.startsWith('material:')&&entry.ready))return{ok:false,error:'material_id_required',message:'请选择新通知的materialId；省略会误回初始课件',available:[courseJob,...[...lessonFrames].filter(([k,e])=>k.startsWith('material:')&&e.ready).map(([k])=>k.slice(9))]};const view=args.materialId&&args.materialId!==courseJob?'material:'+args.materialId:args.view;const target=lessonFrames.get(view);if(!target?.ready)return{ok:false,error:'view_not_ready',currentView:lessonView};const currentFrame=$('paged-lesson');if(currentFrame!==target.frame){currentFrame.contentWindow?.postMessage({source:'clear-page-ink',channel:lessonChannel()},'*');currentFrame.id='lesson-'+lessonView;currentFrame.hidden=true;target.frame.id='paged-lesson';target.frame.hidden=false;target.frame.style.visibility='';target.frame.style.pointerEvents='';target.frame.removeAttribute('aria-hidden');lessonView=view;}updateNeighbors();queueVoiceAudit({kind:'material_selected',materialId:args.materialId||courseJob});return{ok:true,view:args.view,materialId:args.materialId||courseJob,layout:(await dispatchLesson('get_lesson_layout',{})).layout}}
function flushCourseNotice(){if(!connected||ending)return;if(liveMode){while(materialNotices.length)liveAdapter.context(JSON.stringify(materialNotices.shift()));if(courseNotice){liveAdapter.context(JSON.stringify(courseNotice));courseNotice=null;courseNotified=true}return}if(!busy&&!userSpeaking&&!teacherAudioPlaying){while(materialNotices.length)send(message(JSON.stringify(materialNotices.shift())));if(courseNotice){send(message(JSON.stringify(courseNotice)));courseNotice=null;courseNotified=true}}}
if(courseJob){
 document.body.classList.add('call-view');$('connect').textContent='重试连接';$('disconnect').textContent='结束通话';$('immediate-end').hidden=true;$('mic').textContent='静音';
 const style=document.createElement('style');style.textContent=`html,body.call-view{height:100%;margin:0;background:#fffdf7;color:#2a2a29;font-family:system-ui}.call-view{display:flex;flex-direction:column;overflow:hidden}.call-view main,.call-view .chat{display:contents}.call-view main>aside,.call-view header,.call-view .voicebar,.call-view .chat-title,.call-view .notice,.call-view .context,.call-view #chat-form,.call-view #messages,.call-view .classroom-panel:has(#classroom),.call-view .teacher-orb{display:none!important}.call-view .classroom-panel:has(#paged-lesson){display:block!important;position:static!important;inset:auto!important;border:0;padding:0;margin:0;box-shadow:none;flex:1;min-height:0;overflow:hidden;background:#fffdf7}.call-view .classroom-panel>summary,.call-view .classroom-panel>p{display:none}.call-view .classroom-panel iframe{height:100%!important;width:100%;border:0}.call-view .classroom-panel{display:none!important}.classroom-stage{flex:1;min-height:0;position:relative;overflow:hidden}.classroom-stage iframe{position:absolute;inset:0;width:100%;height:100%!important;border:0;background:#fffdf7}.call-view iframe[hidden]{display:none!important}.call-tabs{display:flex;justify-content:center;gap:8px;margin-top:10px}.call-tabs button{border:0;border-radius:20px;padding:7px 12px;background:#f1eee8;color:#4b4b48;font-size:12px}.call-tabs button:disabled{opacity:.45}.call-footer{padding:8px 18px 12px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;background:#fffdf7}.call-footer button{border:0;border-radius:24px;padding:12px 20px;font-size:14px;background:#eeeae4;color:#2a2a29}.call-footer #disconnect{background:#f26e83;color:white}.call-footer #immediate-end{font-size:11px;padding:8px}.call-footer #play-audio{background:#fff0cf}.call-footer .call-state{flex-basis:100%;text-align:center;font-size:12px;color:#777;line-height:1.5}.call-view #toast{max-width:85%;font-size:13px}`;document.head.append(style);
 const manual=document.createElement('button');manual.textContent='提交并回应';manual.hidden=true;manual.onclick=()=>{if(connected&&!ending)requestResponse()};
 const toggleManual=()=>{manual.hidden=liveMode||!connected||runtimeMessages.rtAuto!=='false'};
 new MutationObserver(toggleManual).observe($('status'),{childList:true,subtree:true});
 const footer=document.createElement('div');footer.className='call-footer';const callState=document.createElement('div');callState.className='call-state';callState.textContent='正在接通…';footer.append(callState,manual,$('connect'),$('mic'),$('disconnect'),$('immediate-end'),$('play-audio'));document.body.append(footer);
 const reflect=()=>{const text=$('status').textContent;callState.textContent=text==='离线'?'通话已结束':text;parent.postMessage({source:'voice-call-status',jobId:courseJob,status:text,connected},location.origin)};new MutationObserver(reflect).observe($('status'),{childList:true,subtree:true,characterData:true});new MutationObserver(()=>{if($('diagnostic').textContent.includes('失败')||$('diagnostic').textContent.includes('错误'))callState.textContent=$('diagnostic').textContent}).observe($('diagnostic'),{childList:true,subtree:true});
 try{
 generatedContext=await api('/api/pi/context?job='+encodeURIComponent(courseJob)+'&voice='+encodeURIComponent(voiceTicket||''));lessonView='board';
 const panel=document.createElement('div');panel.className='classroom-stage';panel.append($('paged-lesson'));document.body.insertBefore(panel,footer);
 function mountView(view,initial=false,material=null){if(lessonFrames.has(view))return;const frame=initial?$('paged-lesson'):document.createElement('iframe');frame.title=view==='outline'?'知识脉络':'互动课件';frame.setAttribute('sandbox','allow-scripts');frame.hidden=false;if(!initial){frame.style.visibility='hidden';frame.style.pointerEvents='none';frame.setAttribute('aria-hidden','true');frame.id='lesson-'+view;panel.append(frame)}const entry={frame,ready:false,material};lessonFrames.set(view,entry);frame.src='/course-artifact/'+(material?.id||courseJob)+(view==='board'?'?view=board':view==='outline'?'?view=outline':'')+'#'+lessonChannel(view);entry.timer=setTimeout(()=>{if(!entry.ready){if(initial){$('diagnostic').textContent='教学资料加载失败，请返回聊天重试';callState.textContent='教学资料加载失败'}else{if(material)queueMaterialNotice(material.id+':failed',{event:'material_failed',materialId:material.id,text:runtimeMessages.courseFailedMessage});else courseNotice={event:'course_failed',text:runtimeMessages.courseFailedMessage}}}},20000)}
 window.addEventListener('message',e=>{const match=[...lessonFrames.entries()].find(([view,entry])=>e.source===entry.frame.contentWindow&&e.data?.channel===lessonChannel(view));if(!match||e.origin!=='null'||e.data?.source!=='generated-course')return;const [view,entry]=match,p=e.data.payload;if(p?.layout&&['course_ready','page_ready','user_navigation'].includes(p.event))pointLayouts.set(view,p.layout);if(liveMode&&view===lessonView&&['interaction','user_navigation','value_changed','learner_snapshot'].includes(p?.event))livePause.activity('interaction',performance.now());if(p?.event==='knowledge_boundary'&&view===lessonView&&[-1,1].includes(p.delta)){navigateKnowledge(p.delta);return}if(p?.event==='learner_snapshot'){sendLessonSnapshot(view,entry,p);return}if(!p||JSON.stringify(p).length>24000)return;if(p.event==='course_ready'){clearTimeout(entry.timer);entry.ready=true;if(entry.material)queueMaterialNotice(entry.material.id+':ready',{event:'material_available',materialId:entry.material.id,goal:entry.material.goal,mode:entry.material.mode,directory:entry.material.directory,files:entry.material.files,layout:p.layout,text:runtimeMessages.courseAvailableMessage});if(view===lessonView){updateNeighbors();generatedReady=true;maybeStartCourse()}if(view==='course'){courseReady=true;if(generatedContext.job.outline&&lessonView!=='course')courseNotice={event:'course_available',text:runtimeMessages.courseAvailableMessage,materialId:courseJob,layout:p.layout};}flushCourseNotice()}else if(p.event==='course_error'){entry.ready=false;if(entry.material){queueMaterialNotice(entry.material.id+':failed',{event:'material_failed',materialId:entry.material.id,text:runtimeMessages.courseFailedMessage});}else if(view==='course'){courseReady=false;courseNotice={event:'course_failed',text:runtimeMessages.courseFailedMessage};if(lessonView==='course'&&lessonFrames.get('outline')?.ready)selectLearningView({view:'outline'});}else callState.textContent='教案加载失败';}else if(view===lessonView&&connected&&!ending){if(p.event==='user_navigation'){onBrowse(p.previousPage,p.currentPage);return}if(p.event==='page_ready'&&browseAnchor)return;const interaction=['interaction','value_changed'].includes(p.event)&&p.actor!=='tool';if(liveMode&&interaction)liveAdapter.interaction(p);else send(message(JSON.stringify(p)));}});
 mountView(lessonView,true);$('status').textContent='正在接通…';window.addEventListener('pagehide',()=>{for(const entry of lessonFrames.values())clearTimeout(entry.timer)},{once:true});
 }catch(e){$('diagnostic').textContent=e.message;callState.textContent=e.message;parent.postMessage({source:'voice-call-status',jobId:courseJob,status:'连接失败'},location.origin)}
}

$('voice-finish').onclick=()=>{if(!connected||ending)return;pendingResponse=false;awaitingVoice=true;if(busy)send({type:'response.cancel'});send({type:'input_audio_buffer.commit'});$('mic-server').textContent='正在提交你的发言，等待服务端确认'};

window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.source==='finish-voice-call'&&e.data.jobId===courseJob){if(ending)return;if(connected||liveMode&&liveAdapter)beginSummary();else parent.postMessage({source:'voice-call-closed',jobId:courseJob},location.origin)}});

async function submitLiveTranscript(){
 let active=true;
 const timer=setInterval(async()=>{try{const progress=await api('/api/pi/jobs/'+courseJob+'/summary-progress');if(active&&progress.label)voiceHint(progress.label)}catch{}},1200);
 try{return await api('/api/live-summary',{jobId:courseJob,voiceTicket,transcript:liveAdapter.transcript,summaryVersion:2})}
 finally{active=false;clearInterval(timer)}
}
async function finishRecording(){
 try{await callRecording?.stop()}catch{throw Error('文字小结已保存，录音上传中断。可再次点击挂断重试录音')}
}
async function finishLive(){if(ending||!liveAdapter)return;ending=true;$('status').textContent='正在保存Live通话…';micStream?.getTracks().forEach(t=>t.stop());try{if(!summaryCommitted){if(connected){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{liveCloseResolve=null;liveAdapter.transcript.length?resolve():reject(Error('Live关闭未确认且尚无转写，请重试保存'))},12000);liveCloseResolve=()=>{clearTimeout(timer);resolve()};liveAdapter.close()})}voiceHint('正在提交通话文字');const r=await submitLiveTranscript();voiceHint('小结已生成 · 正在保存');const structured=validCallSummary(r.text);if(!structured)throw Error('总结格式不完整，记录仍在当前页面，可重试');await api('/api/pi/jobs/'+courseJob+'/summary',{text:formatCallSummary(structured),userObservation:structured.userObservation});summaryCommitted=true}await finishRecording();parent.postMessage({source:'voice-summary-saved',jobId:courseJob},location.origin);disconnect()}catch(e){ending=false;parent.postMessage({source:'voice-summary-failed',jobId:courseJob,reason:e.message},location.origin);queueVoiceAudit({kind:'summary_error',name:String(e.message).slice(0,110)});$('status').textContent=summaryCommitted?e.message:'总结未保存：'+e.message+' · 可再次点击挂断重试';toast(e.message)}}

var voiceAuditQueue=[],voiceAuditTimer,voiceAuditCallId=generatedContext?.job.voicePermit?.callId||crypto.randomUUID();
function queueVoiceAudit(entry){if(!courseJob)return;voiceAuditQueue.push({...entry,at:new Date().toISOString(),callId:generatedContext?.job.voicePermit?.callId||voiceAuditCallId});if(voiceAuditQueue.length>100)voiceAuditQueue.shift();if(!voiceAuditTimer)voiceAuditTimer=setTimeout(flushVoiceAudit,2000)}
async function flushVoiceAudit(){clearTimeout(voiceAuditTimer);voiceAuditTimer=null;if(!voiceAuditQueue.length||!courseJob)return;const entries=voiceAuditQueue.splice(0,40);try{await api('/api/pi/jobs/'+courseJob+'/telemetry',{voiceTicket,entries});if(voiceAuditQueue.length&&!voiceAuditTimer)voiceAuditTimer=setTimeout(flushVoiceAudit,2000)}catch{voiceAuditQueue.unshift(...entries);voiceAuditQueue=voiceAuditQueue.slice(-100)}}
window.addEventListener('pagehide',()=>{if(voiceAuditQueue.length&&courseJob)fetch('/api/pi/jobs/'+courseJob+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceTicket,entries:voiceAuditQueue.slice(-40)}),keepalive:true}).catch(()=>{})});
