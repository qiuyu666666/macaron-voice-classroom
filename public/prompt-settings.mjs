import {previewVoice} from './voice-preview.mjs';
let stopPreview;
import {audioPanels,validateVoiceOptions,voiceLabel} from './voice-options.mjs';
const $=id=>document.getElementById(id);
let bundle,config,dirty=false,selected=location.hash.slice(1)||'teachingPolicy';
const system='系统提示词',message='插入消息',tool='Tool · 只读',skill='Skill',reference='Skill 参考文件',setting='运行参数',copy='界面文案';
const groups=[
 ['共同规则 · 先从这里调',[['voiceDelivery','说话语气与表达节奏',system,'两种语音老师共用。适合写希望的语气、语速感和重音方式。新通话生效。'],['teachingPolicy','共同的课堂体验',system,'优先在这里改语气、停顿时如何引导、掌握判断、备课、翻页和高亮。下一通 Live 与 Realtime，以及下一次 Pi 主聊天请求都读取这一份。']]],
 ['Live · 语音老师',[
  ['liveAudio','音色与委派参数',setting,'Live 使用原生全双工，没有 Realtime 那组音量门槛和自动打断开关。附和、让话和安静时怎么做，由共同规则和 Live 静默提醒决定。'],
  ['liveVoice','Live 专属语音指令',system,'新通话与共享课堂规则一同加载。此处只调整全双工语音和工具委派。'],
  ['livePauseSeconds','静默提醒秒数',setting,'通话中双方安静达到设定秒数时，程序发一次内部提醒。修改后影响下一通 Live 的提醒时机，填 1–60 秒。'],
  ['livePauseHint','静默时给老师的提示',message,'达到静默时间时作为背景信息送给 Live。修改后影响老师如何判断继续等、重复问题或给提示。']]],
 ['Live · 工具后台',[
  ['liveBackend','委派与工具执行',system,'Live 委派任务时由后台模型读取。修改后影响它怎样读文件、选工具和操作屏幕。新通话生效。'],
  ['liveTools','可调用的课堂工具',tool,'Live 委派给工具后台时可用。展开当前实际注册的工具及用途；工具实现在程序中维护。']]],
 ['Realtime · 语音老师',[
  ['realtimeAudio','打断、接话与声音',setting,'新通话生效。语义检测按话意判断；音量检测才使用门槛、保留时长和句尾静默。'],
  ['teacher','Realtime 专属指令',system,'新通话与共享课堂规则一同加载。此处只调整 Realtime 协议与专属行为。'],
  ['progressiveTeacher','课堂附加规则',system,'Realtime 课堂连接时追加在教师指令末尾。修改后影响教学模式、资料使用和页面控制。'],
  ['realtimeTools','可调用的课堂工具',tool,'Realtime 模型在通话中直接选择这些工具。这里展示当前注册项和调用条件。']]],
 ['跨模型 · 教学与通话',[
  ['voiceContextPrefix','开场资料说明',message,'两种语音引擎开场时，放在通话次数、历史文件位置、课件和最近聊天之前。修改后影响新通话如何理解这些资料。'],
  ['voiceOpening','开场引导',message,'Realtime 接通后作为开场消息发送；Live 在初始输入和接通提示中使用。修改后影响第一轮怎么开口。'],
  ['navigationNotice','用户翻页提示',message,'学生自主翻页时给老师的静默背景消息。{page} 是浏览页标题，不改变教学进度。'],
  ['screenEvents','课件现场事件','自动消息 · 只读','点击答案、翻页或发送圈画时，宿主把对应资料插入当前通话。字段由程序生成。'],
  ['snapshotTeacher','截图解读',system,'学生发送圈画时，Live 和较大的 Realtime 截图交给视觉后台；修改后影响它怎样描述标注。'],
  ['segmentSummary','长通话分段整理',system,'Live 挂断且转写较长时，文字后台先分段提取证据；修改后影响最终小结收到的材料。'],
  ['voiceSummary','挂断总结指令','归档指令','挂断时 Realtime 收到单次总结指令，Live 的文字总结模型收到归档指令。修改后影响成果选择与评估；保留 JSON 字段约定。']]],
 ['设备 · 两种通话共用',[['micAudio','麦克风声音处理',setting,'改变浏览器申请麦克风时的条件，新通话生效。']]],
 ['Pi · 文字聊天',[
  ['chatWelcome','首次进入 · 学习兴趣引导',message,'首次打开空白聊天时，私下发给本账号的 Pi 主会话。用户只看到老师的开场白；已有聊天不会重发。'],
  ['piChat','主聊天与邀请生成',system,'每次 Pi 主聊天请求读取。修改后影响文字回复及语音邀请条件。此 Agent 不加载工具或 Skill。'],
  ['courseRepair','邀请格式修正',system,'Pi 输出的课堂指令校验失败时，发起一次纠正请求。修改后影响该次修复。'],
  ['courseStatusPrefix','聊天里的课件状态',message,'有课堂任务时，状态说明随下一条聊天输入发给 Pi。修改后影响 Pi 对任务状态的理解。'],
  ['summaryReturnPrefix','挂断总结回传',message,'总结写回原聊天时，放在归档内容之前发给 Pi。修改后影响主聊天如何承接语音成果。']]],
 ['Pi · 账号流程',[
  ['piAccountRegister','注册任务',system,'点击「让 Pi 创建测试账号」时用于独立注册会话，影响固定执行器的调用和结果返回。'],
  ['accountTools','注册工具',tool,'仅账号注册会话使用 bash 执行固定注册脚本；不加载 Skill。'],
  ['piAccountIdentity','主聊天身份初始化',system,'账号首次登录并校验 UID 后，用于初始化该账号的 Pi 主聊天。修改后影响下一次身份初始化。']]],
 ['聊天界面 · 邀请卡',[
  ['outlineReadyMessage','轻量课堂邀请',copy,'聊天创建课堂时显示在新邀请卡上。只改变卡片文字。'],
  ['voiceCallLabel','拨号按钮',copy,'新建邀请卡时显示在按钮上。只改变按钮文字。'],
  ['courseReadyMessage','旧课堂邀请',copy,'兼容没有轻量教案的旧课堂：已有课件准备好时使用此文案。']]]
];
const entries=new Map(groups.flatMap(([group,items])=>items.map(([id,title,type,description])=>[id,{id,title,type,description,group}])));
function modelFor(id,group){
 if(id==='liveAudio')return 'gpt-live-1 / 工具后台';
 if(id==='micAudio')return '浏览器麦克风';
 if(id==='voiceDelivery')return 'GPT-Live-1 + Realtime';
 if(id==='teachingPolicy')return 'GPT-Live-1 / GPT-Realtime-2.1 / Live 工具后台 / Pi 主聊天';
 if(['snapshotTeacher','segmentSummary'].includes(id))return 'gpt-6-luna';
 if(id==='voiceSummary')return config.versions.at(-1).config.model+' / gpt-6-luna';
 if(group.startsWith('Realtime'))return config.versions.at(-1).config.model;
 if(group.startsWith('Live · 工具'))return 'gpt-6-luna';
 if(group.startsWith('Live'))return 'gpt-live-1';
 if(group.startsWith('Pi'))return bundle.piModel;
 return group.startsWith('聊天界面')?'聊天客户端':'gpt-live-1 + '+config.versions.at(-1).config.model;
}
async function api(path,body){
 const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const result=await response.json();if(!response.ok)throw Error(result.error);return result;
}
function toolText(id){
 if(id==='screenEvents')return '用户答题 → 当前题目、选项、所选答案与已知反馈。\n翻页 → 操作者、变化前后的页与内容。\n截图 → 用户圈画局部或视觉后台的文字观察。\n画板内容 → 接通后语音老师生成并展示。\n\nLive 追加背景信息；Realtime 追加会话消息。这些操作不会强制开启一轮语音。';
 if(id==='workerTools')return bundle.workerTools.join('、');
 if(id==='accountTools')return 'bash';
 let tools=bundle.voiceTools;
 if(id==='liveTools')tools=tools.filter(t=>t.name!=='wait_for_user');
 if(id==='realtimeTools'&&config.versions.at(-1).config.macaron)tools=[...tools,{name:'generate_lesson_content',description:'调试台启用的模拟生成工具。'}];
 return tools.map(t=>t.name+'\n'+t.description).join('\n\n');
}
const valueNames={true:'开启',false:'关闭',default:'使用服务默认',off:'关闭',semantic_vad:'按话意检测',server_vad:'按音量检测'};
function renderPanel(fields){
 stopPreview?.();stopPreview=null;
 const panel=$('audio-panel');panel.replaceChildren();panel.hidden=!fields;
 if(!fields)return;
 for(const field of fields){
   const label=document.createElement('label'),title=document.createElement('strong');
   title.textContent=field.title;label.append(title);
   const input=document.createElement(field.values?'select':'input');input.dataset.option=field.key;
   if(field.values){
     const isVoice=['liveVoiceName','rtVoiceName'].includes(field.key);
     for(const v of field.values)input.add(new Option(isVoice?voiceLabel(v,field.key==='liveVoiceName'?'live':'realtime'):valueNames[v]||v,v));
   }
   else{input.type='number';Object.assign(input,{min:field.min,max:field.max,step:field.step})}
   input.value=bundle.runtime[field.key];label.append(input);
   const help=document.createElement('small');help.textContent=field.help;label.append(help);panel.append(label);
 }
 const voice=panel.querySelector('[data-option="liveVoiceName"],[data-option="rtVoiceName"]');
 if(voice){
   const button=document.createElement('button'),hint=document.createElement('small');button.type='button';button.textContent='试听音色';hint.textContent='播放一句中文示例，按所选模型的短会话计费。';
   button.onclick=()=>{if(stopPreview){stopPreview();return}button.textContent='停止试听';
     stopPreview=previewVoice(voice.dataset.option==='liveVoiceName'?'live':'realtime',voice.value,Number(panel.querySelector('[data-option="rtSpeed"]')?.value||1),(msg,done)=>{hint.textContent=msg;if(done){stopPreview=null;button.textContent='试听音色'}});
   };
   voice.addEventListener('change',()=>stopPreview?.());
   panel.append(button,hint);
   const info=document.createElement('p'),source=document.createElement('a');
   info.textContent='偏女声、偏男声描述的是听感。语言和口音是音色特色，可用上方的中文示例试听。';
   source.href='https://developers.openai.com/api/docs/guides/live-conversations#voice-options';source.target='_blank';source.rel='noopener';source.textContent='官方音色表';info.append(' ',source);panel.append(info);
 }
 function conditions(){
   const vad=panel.querySelector('[data-option="rtVad"]')?.value;
   for(const el of panel.querySelectorAll('[data-option]')){
     const k=el.dataset.option;
     el.disabled=k==='rtEagerness'&&vad!=='semantic_vad'||['rtThreshold','rtSilence','rtPrefix','rtIdle'].includes(k)&&vad!=='server_vad'||k==='rtStrength'&&panel.querySelector('[data-option="rtNoise"]')?.value==='off';
   }
 }
 conditions();panel.oninput=()=>{conditions();dirty=true;$('status').textContent='尚未保存'};
}
function render(){
 if(!entries.has(selected))selected='teachingPolicy';
 const {id,title,type,description,group}=entries.get(selected),teacher=id==='teacher',readonly=type===tool||id==='screenEvents';
 const fields=audioPanels[id],version=config.versions.at(-1),time=fields?fields.map(o=>bundle.modified[o.key]).filter(Boolean).sort().at(-1):teacher?version.at:bundle.modified[id];
 renderPanel(fields);$('editor').hidden=!!fields;
 $('scope').textContent=group+' · '+type+' · '+modelFor(id,group);
 $('title').textContent=title;$('description').textContent=description;
 $('source').textContent='最近修改 '+(time?new Date(time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未知')+'（北京时间）';
 $('editor').readOnly=readonly;$('save').hidden=readonly;
 $('editor').value=teacher?version.config.instructions:readonly?toolText(id):bundle.texts[id]??bundle.runtime[id];
 for(const btn of $('sections').querySelectorAll('button'))btn.classList.toggle('active',btn.dataset.key===id);
 dirty=false;$('status').textContent='';
}
for(const [group,items] of groups){
 const label=document.createElement('h3');label.textContent=group;$('sections').append(label);
 for(const [id,title,type] of items){
   const button=document.createElement('button');button.dataset.key=id;button.textContent=title;
   const tag=document.createElement('small');tag.textContent=type;button.append(tag);
   button.onclick=()=>{if(dirty&&!confirm('放弃未保存的修改？'))return;selected=id;history.replaceState(null,'','#'+id);render()};$('sections').append(button);
 }
}
async function load(){[bundle,config]=await Promise.all([api('/api/prompts'),api('/api/config')]);render()}
$('editor').oninput=()=>{dirty=true;$('status').textContent='尚未保存'};
$('reload').onclick=()=>{if(!dirty||confirm('放弃当前未保存修改？'))load().catch(e=>$('status').textContent=e.message)};
$('save').onclick=async()=>{
 const id=selected;$('save').disabled=true;
 try{
   if(id==='teacher'){const v=config.versions.at(-1);config=await api('/api/config',{base:v.id,config:{...v.config,instructions:$('editor').value}})}
   else{const next=structuredClone(bundle);if(audioPanels[id]){for(const el of $('audio-panel').querySelectorAll('[data-option]'))next.runtime[el.dataset.option]=el.value;validateVoiceOptions(next.runtime)}else (Object.hasOwn(next.texts,id)?next.texts:next.runtime)[id]=$('editor').value;bundle=await api('/api/prompts',{base:bundle.revision,texts:next.texts,runtime:next.runtime})}
   render();$('status').textContent='已保存';
 }catch(e){$('status').textContent=e.message}finally{$('save').disabled=false}
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
window.addEventListener('hashchange',()=>{const key=location.hash.slice(1);if(bundle&&entries.has(key)&&!dirty){selected=key;render()}});
load().catch(e=>$('status').textContent=e.message);

window.addEventListener('pagehide',()=>stopPreview?.());
