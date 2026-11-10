// Credential-blind Pi boundary. Only trusted backend code supplies sessions and approvals.
import{randomBytes}from'node:crypto';
export class AccountBroker{
 #sessions=new Map();
 constructor(upstream){this.upstream=upstream}
 open(){const sid=randomBytes(32).toString('hex');this.#sessions.set(sid,{busy:false,identity:null,expires:Date.now()+30*60*1000});return sid}
 #get(sid){const s=this.#sessions.get(sid);if(!s||s.expires<Date.now())throw Error('authentication_required');return s}
 status(sid){const s=this.#get(sid);return{authenticated:!!s.identity,busy:s.busy}}
 logout(sid){const s=this.#sessions.get(sid);s?.controller?.abort();if(s)s.identity=null;this.#sessions.delete(sid)}
 // Never expose this method as a model tool. Approval must be bound server-side to this operation/session.
 async authenticate(sid,operation,credentials,approval){
  const s=this.#get(sid);if(!['register','login'].includes(operation)||!approval||approval.sid!==sid||approval.operation!==operation||approval.consumed)throw Error('specific_approval_required');if(s.busy)throw Error('request_in_progress');if(!this.upstream)throw Error('upstream_not_connected');approval.consumed=true;s.busy=true;s.identity=null;s.controller=new AbortController();
  try{const identity=await this.upstream[operation](credentials,{signal:s.controller.signal});if(!identity?.token||!identity.userId||!identity.chatId)throw Error('bad_identity');if(approval.expected&&(identity.userId!==approval.expected.userId||identity.chatId!==approval.expected.chatId))throw Error('unexpected_account');const verified=await this.upstream.self(identity.token,{signal:s.controller.signal});if(verified.chatId!==identity.chatId||(verified.userId&&verified.userId!==identity.userId))throw Error('identity_mismatch');if(this.#sessions.get(sid)!==s||s.controller.signal.aborted)throw Error('session_closed');s.identity=identity;return{authenticated:true};}catch{throw Error('authentication_failed_or_unknown_do_not_retry')}finally{s.busy=false}
 }
 async operation(sid,op,args={}){
  const allowed={status:[],history:['cursor','limit'],send:['text']};if(!allowed[op]||!args||typeof args!=='object'||Object.keys(args).some(k=>!allowed[op].includes(k)))throw Error('operation_not_allowed');if(op==='status')return this.status(sid);
  const s=this.#get(sid);if(!s.identity)throw Error('authentication_required');if(s.busy)throw Error('request_in_progress');if(op==='send'&&(typeof args.text!=='string'||!args.text.trim()||args.text.length>10000))throw Error('invalid_text');if(op==='history'&&((args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>50))||(args.cursor!==undefined&&typeof args.cursor!=='string')))throw Error('invalid_pagination');s.busy=true;s.controller=new AbortController();
  try{const result=await this.upstream[op]({...args,token:s.identity.token,chatId:s.identity.chatId,userId:s.identity.userId,signal:s.controller.signal});if(this.#sessions.get(sid)!==s||s.controller.signal.aborted)throw Error('session_closed');if(op==='send')return{ok:true,text:typeof result.text==='string'?result.text:''};return{items:(result.items||[]).map(i=>({role:i.role,text:i.text,at:i.at})),nextCursor:result.nextCursor??null};}catch{throw Error('account_operation_failed_or_unknown')}finally{s.busy=false}
 }
}
// Pi receives these names only; no shell, tokens, UID, URL or credential arguments.
export const piAccountOperations=['status','history','send'];
