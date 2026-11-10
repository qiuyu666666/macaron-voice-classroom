import{randomUUID}from'node:crypto';
export function materialRequest(input){
 if(!input||!['create','revise'].includes(input.mode)||typeof input.requestId!=='string'||!/^[\w|:.-]{1,200}$/.test(input.requestId))throw Error('课件请求格式错误');
 for(const [key,max]of [['request',3000],['learnerState',2000]])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max)throw Error('请提供具体的小课件需求和用户当前表现');
 if(input.baseMaterialId!==undefined&&(typeof input.baseMaterialId!=='string'||!/^[a-f0-9-]{36}$/.test(input.baseMaterialId)))throw Error('课件版本无效');
 return{mode:input.mode,request:input.request.trim(),learnerState:input.learnerState.trim(),requestId:input.requestId,baseMaterialId:input.baseMaterialId};
}
export const materialInfo=j=>({id:j.id,status:j.status,goal:j.goal,mode:j.updateMode,baseMaterialId:j.baseMaterialId,error:['failed','unknown','cancelled'].includes(j.status)?'本次材料未能准备完成，可继续使用当前内容':undefined});
export async function prepareMaterial(parent,input,{get,persist,session,saveSession,start}){
 const r=materialRequest(input);if(parent.summary||!parent.voicePermit)throw Error('课堂已结束或尚未开始');
 const children=(await Promise.all((parent.materials||[]).map(get))).filter(Boolean);
 const previous=children.find(j=>j.requestId===r.requestId);if(previous)return materialInfo(previous);
 if(children.some(j=>['generating','validating','repairing'].includes(j.status)))throw Error('已有材料正在准备，请先继续当前对话，等待准备结果');
 if(children.length>=20)throw Error('本次通话已达到材料数量上限');
 const base=r.mode==='revise'?await get(r.baseMaterialId||parent.id):null;
 if(r.mode==='revise'&&(!base||base.chatId!==parent.chatId||(base.id!==parent.id&&base.parentJobId!==parent.id)))throw Error('只能修改本次课堂所属的材料');
 const j={id:randomUUID(),chatId:parent.chatId,parentJobId:parent.id,requestId:r.requestId,updateMode:r.mode,baseMaterialId:base?.id,previousQuickPagesAvailable:!!base?.quickPages,pagingVersion:1,goal:r.request.slice(0,150),course_brief:r.request,learnerState:r.learnerState,outline:null,label:'课堂补充材料',status:'generating',channel:randomUUID(),createdAt:new Date().toISOString()};
 await persist(j);parent.materials=[...(parent.materials||[]),j.id];session.jobs.push(j.id);await persist(parent);await saveSession(session);start(j,session);return materialInfo(j);
}
