// Runtime values are stored as strings in the editable settings bundle.
const choice=(key,title,values,initial,help)=>({key,title,values,initial,help});
const num=(key,title,min,max,step,initial,help)=>({key,title,min,max,step,initial:String(initial),help});
const bool=(key,title,on,help)=>choice(key,title,['true','false'],String(on),help);
const rtVoices='alloy ash ballad coral echo sage shimmer verse marin cedar'.split(' ');
const liveVoices='alloy ash ballad beacon bossa brise cedar cinder coral delta echo flitz gleam harema juni marin meridian nira noeul nuri quartz ripple sage shida shimmer sillage stone tempo verse vesper willow'.split(' ');
export const audioPanels={
 liveAudio:[choice('liveVoiceName','说话音色',['default',...liveVoices],'default','新通话生效；默认 marin。Live 语速在「说话语气与表达节奏」调，Realtime 的播放倍速不作用于 Live。'),choice('liveDelegateEffort','工具后台思考力度',['default','minimal','low','medium','high'],'default','给处理工具和复杂任务的后台模型更多或更少推理预算。越高可能越慢、消耗更多计费 token；普通语音的接话速度另调。')],
 realtimeAudio:[choice('rtVoiceName','说话音色',['default',...rtVoices],'default','新通话生效。'),num('rtSpeed','播放速度',0.25,1.5,0.05,1,'倍速；影响播放，不决定何时开口。'),choice('rtEffort','推理力度',['default','minimal','low','medium','high','xhigh'],'default','提高模型可用于推理的预算，复杂任务可能受益；也可能等待更久、消耗更多计费 token。'),choice('rtVad','话轮检测',['semantic_vad','server_vad'],'semantic_vad','语义判断是否说完，或按音量和静默时间判断。'),bool('rtInterrupt','检测到说话时打断老师',true,'关闭后，检测到声音不会自动取消老师当前的回复。'),bool('rtAuto','说完自动回应',true,'关闭后使用通话中的「提交并回应」。'),choice('rtEagerness','语义接话积极度',['auto','low','medium','high'],'high','仅语义检测；越高越早接话。'),num('rtThreshold','声音触发门槛',0,1,.05,.5,'仅音量检测；越高越难触发。'),num('rtSilence','句尾静默（毫秒）',100,5000,10,500,'仅音量检测；越短越容易提前接话。'),num('rtPrefix','保留开头声音（毫秒）',0,2000,10,300,'仅音量检测。'),num('rtIdle','等待后主动回应（秒）',0,30,1,0,'仅音量检测；0 关闭，否则 5–30 秒。'),choice('rtNoise','服务端降噪',['off','near_field','far_field'],'far_field','近讲麦克风选 near_field，远场麦克风选 far_field。'),num('rtStrength','降噪力度',0,1,.05,1,'仅在服务端降噪开启时生效。')],
 micAudio:[bool('micEcho','回声消除',true,'请求浏览器消除扬声器回声。'),bool('micNoise','麦克风降噪',true,'请求浏览器抑制环境噪声。'),bool('micGain','自动增益',false,'请求浏览器自动调节输入音量。设备支持程度可能不同。')]
};
export const voiceOptions=Object.values(audioPanels).flat();
export function validateVoiceOptions(values){
 for(const o of voiceOptions){
   const v=values[o.key],n=Number(v);
   if(typeof v!=='string'||!v.trim()||(o.values?!o.values.includes(v):!Number.isFinite(n)||n<o.min||n>o.max||o.step>=1&&!Number.isInteger(n)))throw Error('参数无效：'+o.title);
 }
 if(+values.rtIdle>0&&+values.rtIdle<5)throw Error('主动回应等待时间为 0 或 5–30 秒');
}

// OpenAI Live voice options: language and regional influence describe the sound.
const liveProfiles = new Map();
for (const [style, feminine, masculine] of [
  ['澳式英语','quartz','ripple'],['英式英语','','vesper'],['爱尔兰英语','willow','stone'],
  ['北美英语','gleam','meridian'],['巴西葡萄牙语','bossa','tempo'],
  ['菲律宾英语','','beacon'],['美国南部英语','delta','cinder'],
  ['德语','nuri juni','flitz'],['法语','brise','sillage'],['印地语','nira',''],
  ['日语','harema','shida'],['韩语','noeul','']
]) {
  for (const [names, sound] of [[feminine,'偏女声'],[masculine,'偏男声']])
    for (const name of names.split(' ').filter(Boolean)) liveProfiles.set(name,sound+' · '+style);
}
export function voiceLabel(name,engine){
  if(name==='default')return engine==='live'?'使用默认（marin）':'使用服务默认';
  return name+' · '+(liveProfiles.get(name)||'声线未标注');
}
