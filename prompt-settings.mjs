import {voiceOptions,validateVoiceOptions} from './public/voice-options.mjs';
import {voiceBoardTools as lessonTools} from './public/lesson-tools.mjs';
import{workerSkills,workerTools,piSettings}from'./pi-runtime.mjs';
import{readFile,writeFile,mkdir,rename,stat}from'node:fs/promises';import{fileURLToPath}from'node:url';import{createHash,randomUUID}from'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url));
const files={piAccountRegister:'prompts/pi-account-register.md',piAccountIdentity:'prompts/pi-account-identity.md',courseRepair:'prompts/course-repair.md',liveVoice:'prompts/live-voice.md',liveBackend:'prompts/live-backend.md',teachingPolicy:'prompts/teaching-policy.md',piChat:'prompts/pi-chat.md',piWorker:'prompts/pi-worker.md'};
const skillRoot=process.env.HOME+'/.pi/agent/skills/';
Object.assign(files,{outlineSkill:skillRoot+'learning-outline/SKILL.md',tsxSkill:skillRoot+'tsx-courseware/SKILL.md',outlineStorage:skillRoot+'learning-outline/references/local-storage.md',outlineContract:skillRoot+'learning-outline/references/outline-contract.md',tsxStorage:skillRoot+'tsx-courseware/references/local-storage.md',tsxRendering:skillRoot+'tsx-courseware/references/local-rendering.md',tsxAnnotations:skillRoot+'tsx-courseware/references/annotation-runtime.md'});
const diskPath=p=>p.startsWith('/')?p:root+p;
const keys=['chatWelcome','navigationNotice',...voiceOptions.map(o=>o.key),'voiceDelivery','segmentSummary','snapshotTeacher','livePauseSeconds','livePauseHint','outlineReadyMessage','progressiveTeacher','courseAvailableMessage','courseFailedMessage','voiceOpening','voiceContextPrefix','voiceSummary','workerRequestPrefix','workerRepairPrefix','summaryReturnPrefix','courseReadyMessage','voiceCallLabel','courseStatusPrefix'];
export async function runtimeMessages(){return JSON.parse(await readFile(root+'prompts/runtime-messages.json','utf8'))}
const timesPath=root+'data/prompt-change-times.json';
async function times(){
 try{return JSON.parse(await readFile(timesPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;return {}}
}
async function snapshot(){
 const texts={},modified={},runtime=await runtimeMessages(),stored=await times();
 await Promise.all(Object.entries(files).map(async([key,file])=>{
   const path=diskPath(file);texts[key]=await readFile(path,'utf8');modified[key]=(await stat(path)).mtime.toISOString();
 }));
 const sharedTime=(await stat(root+'prompts/runtime-messages.json')).mtime.toISOString();
 for(const key of Object.keys(runtime))modified[key]=stored[key]?.value===runtime[key]?stored[key].at:sharedTime;
 const revision=createHash('sha256').update(JSON.stringify([Object.keys(files).map(key=>texts[key]),runtime])).digest('hex');
 const voiceTools=lessonTools.map(({name,description})=>({name,description}));
 const toolTime=(await stat(root+'public/lesson-tools.mjs')).mtime.toISOString();
 const piTime=(await stat(root+'pi-runtime.mjs')).mtime.toISOString();
 modified.screenEvents=(await stat(root+'public/app.mjs')).mtime.toISOString();
 Object.assign(modified,{realtimeTools:toolTime,liveTools:toolTime,workerTools:piTime,accountTools:piTime});
 return {texts,runtime,files,modified,revision,piModel:await piSettings().then(s=>s.provider+' / '+s.model).catch(()=>'Pi 本机配置'),voiceTools,workerTools};
}
async function writeChanged(input,old){
 const now=new Date().toISOString(),stored=await times();
 const changed=Object.keys(input.runtime).filter(k=>input.runtime[k]!==old.runtime[k]);
 if(changed.length){
   for(const [key,value] of Object.entries(input.runtime))stored[key]={value,at:changed.includes(key)?now:old.modified[key]};
   await writeFile(timesPath+'.tmp',JSON.stringify(stored),{mode:0o600});await rename(timesPath+'.tmp',timesPath);
   const path=root+'prompts/runtime-messages.json';
   await writeFile(path+'.tmp',JSON.stringify(input.runtime,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path);
 }
 for(const [key,file] of Object.entries(files)){
   if(input.texts[key]===old.texts[key])continue;
   const path=diskPath(file);
   await writeFile(path+'.tmp',input.texts[key],{mode:0o600});await rename(path+'.tmp',path);
 }
}
let saving=Promise.resolve();
export async function promptSettingsApi(req,res,url,{json,body}){if(url.pathname==='/api/prompts/runtime'&&req.method==='GET'){json(res,200,await runtimeMessages());return true}if(url.pathname!=='/api/prompts')return false;if(req.method==='GET'){json(res,200,await snapshot());return true}if(req.method==='POST'){const input=JSON.parse(await body(req));const result=await(saving=saving.catch(()=>{}).then(async()=>{const old=await snapshot();if(input.base!==old.revision)throw Error('提示词已被其他窗口修改，请重新加载后保存');if(!input.texts||!input.runtime||Object.keys(input.texts).sort().join()!==Object.keys(files).sort().join()||Object.keys(input.runtime).sort().join()!==[...keys].sort().join())throw Error('提示词字段不匹配');for(const v of [...Object.values(input.texts),...Object.values(input.runtime)])if(typeof v!=='string'||!v.trim()||v.length>30000)throw Error('每项须为 1–30000 字');if(!Number.isFinite(Number(input.runtime.livePauseSeconds))||Number(input.runtime.livePauseSeconds)<1||Number(input.runtime.livePauseSeconds)>60)throw Error('静默时间须为 1–60 秒');validateVoiceOptions(input.runtime);const backup=root+'private/prompt-manager-backups';await mkdir(backup,{recursive:true,mode:0o700});await writeFile(backup+'/'+Date.now()+'-'+randomUUID()+'.json',JSON.stringify(old,null,2),{mode:0o600});await writeChanged(input,old);return snapshot()}));json(res,200,result);return true}json(res,405,{error:'不支持的操作'});return true}
