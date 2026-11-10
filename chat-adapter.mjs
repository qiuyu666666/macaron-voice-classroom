import {randomBytes} from 'node:crypto';
// Transport injection is mandatory. No implicit production endpoint or account.
export class ChatAdapter {
 #sessions=new Map();
 constructor(upstream){this.upstream=upstream}
 async login(email,password){const result=await this.upstream.login({email,password});if(!result?.token||!result?.userId)throw Error('认证响应不完整');const sid=randomBytes(32).toString('hex');this.#sessions.set(sid,{token:result.token,userId:result.userId,history:[],expires:Date.now()+30*60*1000});return{sid,userId:result.userId}}
 history(sid,{cursor=0,limit=20}={}){const s=this.#sessions.get(sid);if(!s||s.expires<Date.now())throw Error('需要登录');if(!Number.isInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('分页参数错误');const end=Math.max(0,s.history.length-cursor),start=Math.max(0,end-limit);return{items:s.history.slice(start,end),nextCursor:start>0?cursor+limit:null,simulated:true}}
 logout(sid){this.#sessions.delete(sid)}
 async *chat(sid,text){const session=this.#sessions.get(sid);if(!session||session.expires<Date.now())throw Error('需要登录');if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('消息格式错误');session.history.push({role:'user',text,at:new Date().toISOString()});let answer='';yield{type:'loading'};try{for await(const event of this.upstream.chat({token:session.token,userId:session.userId,text})){if(event.type==='delta'&&typeof event.text==='string'){answer+=event.text;yield{type:'delta',text:event.text}}}session.history.push({role:'assistant',text:answer,at:new Date().toISOString()});yield{type:'done'}}catch{yield{type:'error',message:'聊天服务失败，请重试'}}}
}
