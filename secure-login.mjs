import{randomBytes,timingSafeEqual}from'node:crypto';
export class SecureLoginGate{
 #challenges=new Map();
 constructor({broker,verifiedContract=false,resolveExistingAccount}={}){this.broker=broker;this.verifiedContract=verifiedContract;this.resolveExistingAccount=resolveExistingAccount}
 readiness(){return{enabled:this.verifiedContract&&!!this.broker&&!!this.resolveExistingAccount,recipient:'https://alpha-api.macaron.im/users/login',reason:'当前字段组合和禁止自动注册语义尚未正式确认'}}
 challenge(sid){if(!this.readiness().enabled)throw Error('login_disabled');const csrf=randomBytes(32).toString('hex');this.#challenges.set(sid,{csrf,expires:Date.now()+120000});return csrf}
 async submit(sid,{email,password,consent,csrf},origin,expectedOrigin){
  if(!this.readiness().enabled)throw Error('login_disabled');if(origin!==expectedOrigin)throw Error('origin_rejected');const c=this.#challenges.get(sid);if(!c||c.expires<Date.now()||typeof csrf!=='string'||csrf.length!==c.csrf.length||!timingSafeEqual(Buffer.from(csrf),Buffer.from(c.csrf)))throw Error('csrf_rejected');if(consent!==true)throw Error('explicit_consent_required');this.#challenges.delete(sid);
  if(typeof email!=='string'||typeof password!=='string'||!password||password.length>256)throw Error('invalid_input');
  // A verified existing-account lookup is required; never treat login as account discovery.
  const expected=await this.resolveExistingAccount(email);if(!expected?.userId||!expected?.chatId)throw Error('unknown_account_login_blocked');
  return this.broker.authenticate(sid,'login',{email,password},{sid,operation:'login',expected});
 }
}
