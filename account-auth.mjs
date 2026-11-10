import{createPiAccount,setupRecord,initializePiIdentity}from'./pi-account-setup.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const hash=s=>createHash('sha256').update(s).digest('hex');
async function activeAdminToken(){
 const directory=homedir()+'/.macaron-dev-cli';
 const active=(await readFile(directory+'/active_account','utf8')).trim();
 const tokens=JSON.parse(await readFile(directory+'/token.json','utf8'));
 const entry=tokens.filter(t=>t.source==='admin' && active===t.user_id+'|admin' && t.expires_at>Date.now()/1000)
   .sort((a,b)=>b.issued_at-a.issued_at)[0];
 if(!entry?.token)throw Error('请在本机用飞书登录 Macaron 管理账号');
 return entry.token;
}
export class AccountAuth {
 constructor({directory=process.env.AUTH_DATA_DIR||root+'private/auth',chatDirectory=(process.env.CLASSROOM_DATA_DIR||root+'private/pi-classroom')+'/chats',fetcher=fetch,adminToken}={}){Object.assign(this,{directory,chatDirectory,fetcher});this.adminToken=adminToken||activeAdminToken;this.queue=Promise.resolve();}
 async load(){if(this.db)return;await mkdir(this.directory,{recursive:true,mode:0o700});try{this.db=JSON.parse(await readFile(this.directory+'/accounts.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e;this.db={accounts:{},sessions:{},pending:{}}}}
 async save(){const temp=this.directory+'/'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(this.db,null,2),{mode:0o600});await rename(temp,this.directory+'/accounts.json')}
 serial(fn){const p=this.queue.catch(()=>{}).then(async()=>{await this.load();return fn()});this.queue=p;return p}
 async request(base,path,{token,body}={}){
   const route=path.split('?')[0];
   const create=route==='/admin/users/create-user';
   const step=route==='/users/login'?'登录验证':route==='/chats/self'?'聊天身份核查':'账号查询';
   const attempts=create?1:3;
   for(let attempt=1;attempt<=attempts;attempt++){
     let r,j;
     try{
       r=await this.fetcher(base+path,{
         method:body?'POST':'GET',
         headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
         ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)
       });
       if(r.ok||![502,503,504,524].includes(r.status))j=await r.json();
     }catch(error){
       if(r && !r.ok && r.status>=400 && r.status<500)throw Error(step+'请求被拒绝，请检查账号信息');
     }
     if(j){
       if(!r.ok||j.code!==200)throw Error(route==='/users/login'?'账号或密码不正确，或登录请求被拒绝':step+'请求被拒绝');
       return j.metadata;
     }
     if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,attempt*500));
   }
   if(create)throw Object.assign(Error('注册请求已提交，正在核查原账号'),{code:'CREATE_UNCONFIRMED'});
   throw Error(step+'暂时连不上，已自动重试两次。请稍后用同一账号再试。');
 }
 async find(email){const token=await this.adminToken();const m=await this.request('https://gke-api-alpha.macaron.xin','/admin/users?'+new URLSearchParams({email,page:'1',pageSize:'10'}),{token});return(m.user_list||[]).find(a=>a.email?.toLowerCase()===email)}
 public(a){return a?{uid:a.uid,email:a.email,name:a.name}:null}
 async current(cookie=''){await this.load();const sid=cookie.match(/(?:^|;\s*)macaron_auth=([\w-]+)/)?.[1];const s=sid&&this.db.sessions[hash(sid)];return s&&s.expires>Date.now()?this.db.accounts[s.uid]:null}
 async list(){await this.load();return Object.values(this.db.accounts).map(a=>({...this.public(a),savedLogin:!!a.password}))}
 async authenticate(input,cookie=''){return this.serial(async()=>{let {mode='login',email,password,name,savePassword=false}=input;if(mode==='saved'){const a=this.db.accounts[input.uid];if(!a?.password)throw Error('没有已保存的密码，请手动登录');({email,password,name}=a);savePassword=true}
 email=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<1||password.length>256)throw Error('请填写有效邮箱和密码');if(!['login','register','saved'].includes(mode))throw Error('未知登录方式');
 const existing=await this.find(email);let identity;
 if(mode==='register'){
 if(password.length<8)throw Error('注册密码至少 8 位');if(existing)throw Error('这个邮箱已注册，请切换到登录');if(this.db.pending[email])throw Error('这个邮箱有待核查的注册请求，请先尝试登录，不重复注册');
 this.db.pending[email]={at:new Date().toISOString()};await this.save();
 try{
   identity=await this.request('https://gke-api-alpha.macaron.xin','/admin/users/create-user',{token:await this.adminToken(),body:{email,password}});
 }catch(e){
   if(e.code!=='CREATE_UNCONFIRMED')throw e;
   const registered=await this.find(email);
   if(!registered)throw Error('这个邮箱的注册结果暂未确认。请稍后用原邮箱和密码登录。');
   identity=await this.request('https://alpha-api.macaron.im','/users/login',{body:{email,password}});
   if(String(identity?.user_id)!==String(registered.user_id))throw Error('账号身份核查失败');
 }
 }else{if(!existing)throw Error('未找到这个邮箱，请先注册');identity=await this.request('https://alpha-api.macaron.im','/users/login',{body:{email,password}});if(String(identity.user_id)!==String(existing.user_id))throw Error('登录身份不一致，未建立会话')}
 if(!identity?.token||!identity.user_id||identity.email?.toLowerCase()!==email)throw Error('账号返回信息不完整，未建立会话');
 const self=await this.request('https://alpha-api.macaron.im','/chats/self',{token:identity.token});if(!self.chat_id||(identity.chat_id&&String(identity.chat_id)!==String(self.chat_id)))throw Error('聊天归属校验失败');
 const uid=String(identity.user_id),old=this.db.accounts[uid];if(old&&old.email!==email)throw Error('账号绑定不一致');
 const a={uid,email,name:String(name||old?.name||identity.nickname||email).trim().slice(0,80),chatId:String(self.chat_id),localChatId:old?.localChatId||randomUUID(),...(input.piSetupId||old?.piSetupId?{piSetupId:input.piSetupId||old.piSetupId}:{}),...(savePassword?{password}:{})};
 await mkdir(this.chatDirectory+'/'+a.localChatId,{recursive:true,mode:0o700});try{await writeFile(this.chatDirectory+'/'+a.localChatId+'/state.json',JSON.stringify({id:a.localChatId,messages:[],requests:{},jobs:[]}),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}
 this.db.accounts[uid]=a;delete this.db.pending[email];const prior=cookie.match(/(?:^|;\s*)macaron_auth=([\w-]+)/)?.[1];if(prior)delete this.db.sessions[hash(prior)];for(const [key,s] of Object.entries(this.db.sessions))if(s.expires<Date.now())delete this.db.sessions[key];
 const session=randomBytes(32).toString('base64url');this.db.sessions[hash(session)]={uid,expires:Date.now()+30*86400000};await this.save();return{account:this.public(a),cookie:`macaron_auth=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`};
 })}
 async logout(cookie=''){return this.serial(async()=>{const sid=cookie.match(/(?:^|;\s*)macaron_auth=([\w-]+)/)?.[1];if(sid)delete this.db.sessions[hash(sid)];await this.save()})}
}
export const auth=new AccountAuth();
export async function accountRoutes(req,res,url,{json,body}){
 if(!url.pathname.startsWith('/api/auth/'))return false;
 try{if(req.method==='GET'&&url.pathname==='/api/auth/status')json(res,200,{account:auth.public(await auth.current(req.headers.cookie)),accounts:await auth.list(),environment:'Alpha'});
 else if(req.method==='POST'&&url.pathname==='/api/auth/pi-register'){const input=JSON.parse(await body(req));json(res,200,await createPiAccount(input.requestId))}
 else if(req.method==='POST'&&url.pathname==='/api/auth/login'){const input=JSON.parse(await body(req));let credentials;if(input.piSetupId){credentials=await setupRecord(input.piSetupId);if(input.mode!=='login'||input.email!==credentials.email||input.password!==credentials.password)throw Error('请使用Pi返回的账号登录，不能重复注册')}const result=await auth.authenticate(input,req.headers.cookie);const account=await auth.current(result.cookie);if(account.piSetupId&&!credentials)credentials=await setupRecord(account.piSetupId);if(credentials){if(account.uid!==credentials.uid){await auth.logout(result.cookie);throw Error('账号UID不一致')}try{await initializePiIdentity(account,credentials)}catch{await auth.logout(result.cookie);throw Error('账号已创建，但Pi身份初始化未完成，请用同一账号重试登录')}}res.setHeader('Set-Cookie',result.cookie);json(res,200,{account:result.account})}
 else if(req.method==='POST'&&url.pathname==='/api/auth/logout'){await auth.logout(req.headers.cookie);res.setHeader('Set-Cookie','macaron_auth=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(res,200,{ok:true})}
 else json(res,404,{error:'不存在'});
 }catch(e){if(e.code==='PI_UNAVAILABLE'&&url.pathname==='/api/auth/pi-register')json(res,503,{error:e.message,code:e.code});else json(res,400,{error:e.message})}return true;
}
