import{contextChunks,compactContext,utf8Bytes}from'./live-context.mjs';
// Live owns speech timing; this adapter only handles context, tool execution and archival.
export class LiveAdapter{
 constructor({send,tool,onStarted,onClosed,onError,onContextStats=()=>{}}){Object.assign(this,{send,tool,onStarted,onClosed,onError,onContextStats});this.contextStats={events:0,appends:0,bytes:0,maxBytes:0,acknowledged:0,failed:0,commentaries:0};this.contextPending=new Set();this.lastContext=null;this.transcript=[];this.delegations=new Map();this.handled=new Set();}
 context(text){const compact=compactContext(text);if(compact===this.lastContext)return;this.lastContext=compact;this.contextStats.events++;const parts=contextChunks(compact);const batch=this.contextStats.events;for(const [i,part]of parts.entries()){const content=parts.length===1?part:`[context ${batch} ${i+1}/${parts.length}] ${part}`;const n=utf8Bytes(content);const event_id=crypto.randomUUID();this.contextPending.add(event_id);this.send({type:'session.thinking.append',event_id,delegation_id:null,content});this.contextStats.appends++;this.contextStats.bytes+=n;this.contextStats.maxBytes=Math.max(n,this.contextStats.maxBytes)}this.onContextStats({...this.contextStats,lastParts:parts.length,originalBytes:utf8Bytes(text)})}
 commentary(text){const parts=contextChunks(text);if(parts.length>1){this.context(text);text='请结合刚收到的完整资料，自然继续当前交流。'}const event_id=crypto.randomUUID();this.contextPending.add(event_id);this.contextStats.commentaries++;this.send({type:'session.commentary.append',event_id,delegation_id:null,content:text})}
 interaction(payload){this.context(JSON.stringify({source:'learning_interaction',...payload}))}

 async receive(e){
 if(['session.thinking.appended','session.commentary.appended'].includes(e.type)&&this.contextPending.delete(e.client_event_id)){this.contextStats.acknowledged++;this.onContextStats({...this.contextStats,pending:this.contextPending.size});return}
 if(e.type==='error'&&this.contextPending.delete(e.client_event_id||e.error?.event_id)){this.contextStats.failed++;this.onContextStats({...this.contextStats,pending:this.contextPending.size})}
 if(e.type==='session.started'){this.onStarted(e);return}
 if(e.type==='session.closed'){this.onClosed();return}
 if(e.type==='error'){this.onError(e.error?.message||e.message||'Live事件失败');return}
 if(['session.input_transcript.delta','session.output_transcript.delta'].includes(e.type)){this.transcript.push({speaker:e.type.includes('input_')?'user':'assistant',text:e.delta,start_ms:e.start_ms,end_ms:e.end_ms});return}
 if(e.type!=='response.event')return;const event=e.event;const id=e.delegation_id;let batch=this.delegations.get(id);if(!batch){batch=[];this.delegations.set(id,batch)}
 if(event.type==='response.output_item.done'&&event.item?.type==='function_call'&&!this.handled.has(event.item.call_id)){this.handled.add(event.item.call_id);const call=event.item;
 const screenAction=['select_learning_view','go_to_lesson_page','update_lesson_page','patch_lesson_text','append_lesson_point','present_board','show_prepared_point','prepare_next_point','set_lesson_focus','circle_lesson_element'].includes(call.name);
 const execute=async()=>{try{return await this.tool(call.name,JSON.parse(call.arguments),call.call_id)}catch(error){return {ok:false,error:error.message}}};
 const early=call.name==='show_teacher_status'?execute():screenAction?(this.screenQueue=(this.screenQueue||Promise.resolve()).then(execute)):null;
 batch.push({call,execute,early})}
 if(event.type==='response.failed'){this.onError('Live后台工具处理失败');this.delegations.delete(id);return}
 if(event.type==='response.completed'&&batch.length){this.delegations.delete(id);for(const {call,execute,early} of batch){const result=await (early||execute());this.send({type:'response.item.create',event_id:crypto.randomUUID(),item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}})}this.send({type:'response.create',event_id:crypto.randomUUID()})}
 }
 startBoard(goal,context){
   this.send({type:'response.item.create',event_id:crypto.randomUUID(),item:{type:'message',role:'user',content:[{type:'input_text',text:'老师正在问候学生。你在后台准备首屏，向语音端只返回可见的教学内容，不要建议老师播报准备过程。目标：'+goal+'。会话背景：'+context+'。请直接调用 present_board，mode=current，创作和展示第一屏标题、Markdown。只写眼前一个点。'}]}});
   this.send({type:'response.create',event_id:crypto.randomUUID()});
 }
 close(){this.send({type:'session.close',event_id:crypto.randomUUID()})}
}
