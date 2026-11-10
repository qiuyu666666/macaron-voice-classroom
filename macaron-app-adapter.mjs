// Protocol from macaron-account-chat-flow. Never use an admin token here.
import {randomInt} from 'node:crypto';
const HOST='https://alpha-api.macaron.im';
export class MacaronAppAdapter {
 constructor(fetchImpl=fetch){this.fetch=fetchImpl;this.sessions=new Map()}
 async bind(sid,{token,user_id,chat_id,role}){
  if(role!=='user'||!token||!user_id||!chat_id)throw Error('需要完整普通用户注册/认证结果');
  const r=await this.fetch(HOST+'/chats/self',{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('用户身份核验失败');const d=await r.json();
  if(d.code!==200||d.metadata?.chat_id!==chat_id)throw Error('聊天归属不匹配');
  this.sessions.set(sid,{token,user_id,chat_id,busy:false});
 }
 logout(sid){this.sessions.get(sid)?.controller?.abort();this.sessions.delete(sid)}
 async *send(sid,text){
  const s=this.sessions.get(sid);if(!s)throw Error('需要认证');if(s.busy)throw Error('请等待当前回复完成');
  if(typeof text!=='string'||!text.trim()||text.length>10000)throw Error('消息长度无效');s.busy=true;s.controller=new AbortController();
  try{
   const r=await this.fetch(HOST+'/macaron/chat',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${s.token}`,'Content-Type':'application/json',Accept:'text/event-stream'},signal:AbortSignal.any([AbortSignal.timeout(180000),s.controller.signal]),body:JSON.stringify({chat_request_type:'normal_chat',chat_id:s.chat_id,thread_topic_id:'',request_id:`${Date.now()}_${String(randomInt(100000)).padStart(5,'0')}`,message_data:{message_content_list:[{type:'text',text}]},stream_mode:'start'})});
   if(!r.ok||!r.headers.get('content-type')?.includes('text/event-stream'))throw Error('上游未返回聊天流');
   let buffer='',finished=false;const decoder=new TextDecoder();
   for await(const chunk of r.body){if(this.sessions.get(sid)!==s||s.controller.signal.aborted)throw Error('session_closed');buffer+=decoder.decode(chunk,{stream:true});buffer=buffer.replaceAll('\r\n','\n');if(buffer.length>2000000)throw Error('响应过大');let boundary;
    while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const raw=event.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!raw)continue;const obj=JSON.parse(raw);
     if(obj.res_type==='assistant_text_part'&&typeof obj.message==='string')yield{type:'delta',text:obj.message};
     if(obj.res_type==='finish'){finished=true;yield{type:'done'}}
    }
   }if(!finished)throw Error('聊天流提前结束');
  }catch{yield{type:'error',message:'聊天请求失败或中断；未自动重试'}}finally{s.busy=false}
 }
}
