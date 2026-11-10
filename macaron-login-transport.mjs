// Candidate contract from cached OpenAPI + local skill. Not enabled on real service.
const HOST='https://alpha-api.macaron.im';
export class MacaronLoginTransport{
 constructor({transport}={}){this.transport=transport}
 async login({email,password},{signal}={}){
  if(!this.transport)throw Error('login_disabled_pending_verified_contract_and_per_attempt_consent');
  if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>256)throw Error('invalid_credentials');
  try{
   const r=await this.transport(HOST+'/users/login',{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});if(!r.ok)throw Error();const raw=await r.json(),u=raw.metadata??raw;const token=u.token,userId=u.user_id??u.userId;if(!token||!userId)throw Error();
   const self=await this.self(token,{signal});return{token,userId,chatId:self.chatId};
  }catch{throw Error('login_failed_or_unknown_no_automatic_retry')}
 }
 async self(token,{signal}={}){if(!this.transport)throw Error('disabled');const r=await this.transport(HOST+'/chats/self',{redirect:'error',signal,headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('identity_check_failed');const d=await r.json(),m=d.metadata??d;const chatId=m.chat_id??m.chatId;if(!chatId)throw Error('identity_check_failed');return{chatId,userId:m.user_id??m.userId}}
 async register(){throw Error('registration_blocked_cli_password_argv_no_safe_input')}
}
