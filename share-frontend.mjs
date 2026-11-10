import {reserveShareAccount,releaseShareReservation} from './share-capacity.mjs';
import {createPiAccount,initializePiIdentity} from './pi-account-setup.mjs';
import {timingSafeEqual,createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const assets=new Set('accounts.js app.mjs audio-orb.mjs chat.css classroom-bridge.js live-adapter.mjs live-context.mjs live-pause.mjs lesson-tools.mjs lesson.bundle.js lesson-state.json mic-monitor.mjs paged-lesson protocol.mjs quick-lesson.mjs recording.mjs ringback.mjs style.css summary-turn.mjs voice-action.mjs voice.mjs'.split(' '));
const chatAssets=new Map();
let compactChat;
export function splitChatAssets(html){
 if(compactChat)return compactChat;
 compactChat=html.replace(/data:(image\/png|image\/svg\+xml|font\/ttf);base64,([A-Za-z0-9+/=]+)/g,(_,type,raw)=>{
   const id=createHash('sha256').update(raw).digest('hex');
   const path='/experience-assets/'+id;
   if(!chatAssets.has(path))chatAssets.set(path,{type,bytes:Buffer.from(raw,'base64')});
   return path;
 });
 return compactChat;
}
const publicPages=new Set(['/chat','/accounts','/classroom.html']);
function visitorTask(cookie,requestId=''){
 const owner=cookie?.match(/(?:^|;\s*)pi_visitor=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!owner)return null;
 const hex=createHash('sha256').update('pi-register:'+owner+(requestId?':'+requestId:'')).digest('hex').slice(0,32);
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
const signingIn=new Map();
function signInWithPi(id,auth,cookie){
 if(signingIn.has(id))return signingIn.get(id);
 const task=(async()=>{
   await reserveShareAccount(process.env.PI_ACCOUNT_TASK_DIR,id,auth);
   const credentials=await createPiAccount(id);
   const login=await auth.authenticate({mode:'login',email:credentials.email,password:credentials.password,piSetupId:id},cookie);
   try{
     const account=await auth.current(login.cookie);
     if(!account||account.uid!==credentials.uid)throw Error('账号身份核验失败');
     await initializePiIdentity(account,credentials);
     return login.cookie;
   }catch(error){
     await auth.logout(login.cookie);
     throw error;
   }
 })().finally(()=>{releaseShareReservation(id);signingIn.delete(id)});
 signingIn.set(id,task);
 return task;
}
export async function frontendGate(req,res,url,{origin,token,auth,body,json}){
 const path=url.pathname;
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.headers.host!==new URL(origin).host || (req.method==='POST'&&req.headers.origin!==origin)) {json(res,403,{error:'来源无效'});return true}
 if(req.method==='GET'&&equal(path,'/try/'+token)){
   res.writeHead(302,{'Set-Cookie':'experience='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000',Location:'/chat','Cache-Control':'no-store'});res.end();return true;
 }
 const granted=(req.headers.cookie||'').match(/(?:^|;\s*)experience=([^;]+)/)?.[1];
 if(req.method==='GET' && path==='/'){
   if(equal(granted,token)){
     res.writeHead(302,{Location:'/chat','Cache-Control':'no-store'});res.end();
   }else{
     res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
     res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Macaron 体验入口</title><main><h1>Macaron 体验入口</h1><p>首次体验，请打开邀请人发来的完整链接（包含 /try/ 的那条）。打开后就可以注册或登录。</p></main></html>');
   }
   return true;
 }
 if(!equal(granted,token)){json(res,403,{error:'请打开邀请链接'});return true}
 if(req.method==='GET'&&path==='/accounts'){
   if(await auth.current(req.headers.cookie)){
     res.writeHead(302,{Location:'/chat','Cache-Control':'no-store'});res.end();return true;
   }
   if(!visitorTask(req.headers.cookie))res.setHeader('Set-Cookie','pi_visitor='+randomBytes(32).toString('hex')+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(await readFile(new URL('./public/pi-login.html',import.meta.url),'utf8'));return true;
 }
 if(path==='/accounts.js'&&req.method==='GET'){
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
   res.end(await readFile(new URL('./public/pi-login.js',import.meta.url),'utf8'));return true;
 }
 if(path==='/api/auth/status'&&req.method==='GET'){json(res,200,{account:auth.public(await auth.current(req.headers.cookie)),accounts:[]});return true}
 if(path==='/api/auth/pi-register'&&req.method==='POST'){
   const {requestId}=JSON.parse(await body(req));
   if(typeof requestId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId))throw Error('账号创建任务无效');
   const id=visitorTask(req.headers.cookie,requestId);if(!id)throw Error('请刷新账号页后重试');
   if(!await auth.current(req.headers.cookie)){
     const cookie=await signInWithPi(id,auth,req.headers.cookie);
     res.setHeader('Set-Cookie',cookie+'; Secure');
   }
   json(res,200,{ok:true});return true;
 }
 if(req.method==='POST'&&path==='/api/auth/logout')return false;
 const guest=await auth.current(req.headers.cookie);
 if(!guest){if(req.method==='GET'&&path==='/chat'){res.writeHead(302,{Location:'/accounts'});res.end()}else json(res,401,{error:'请先登录'});return true}
 if(req.method==='GET'&&chatAssets.has(path)){
   const {type,bytes}=chatAssets.get(path);
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'private, max-age=86400'});res.end(bytes);return true;
 }
 const allow=req.method==='GET'&&(publicPages.has(path)||assets.has(path.slice(1))||path==='/console'&&url.searchParams.has('job')||path==='/api/config'||path==='/api/prompts/runtime'||path.startsWith('/course-artifact/'))||
 ['GET','POST'].includes(req.method)&&path.startsWith('/api/pi/')||
 req.method==='POST'&&['/api/call','/api/live-call','/api/live-summary','/api/lesson-snapshot'].includes(path);
 if(!allow){json(res,404,{error:'无此测试页面'});return true}
 return false;
}
