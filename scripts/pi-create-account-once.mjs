import {AccountAuth} from '../account-auth.mjs';
// Fixed executor called by Pi. Capture CLI tokens privately; return only the requested credentials and UID.
import{readFile,writeFile,mkdir}from'node:fs/promises';import{randomBytes}from'node:crypto';import{spawn}from'node:child_process';import{homedir}from'node:os';
const dir=process.argv[2];if(!dir)throw Error('Missing task directory');await mkdir(dir,{recursive:true,mode:0o700});
const output=dir+'/account.json';let previous;try{previous=JSON.parse(await readFile(output,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}if(previous){console.log(JSON.stringify(previous));process.exit(0)}
let credentials={email:'macaron-pi-'+randomBytes(10).toString('hex')+'@example.com',password:randomBytes(24).toString('base64url')};try{await writeFile(dir+'/pending.json',JSON.stringify(credentials),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;
  credentials=JSON.parse(await readFile(dir+'/pending.json','utf8'));
  const auth=new AccountAuth();
  const existing=await auth.find(credentials.email);
  if(existing){
    const login=await auth.request('https://alpha-api.macaron.im','/users/login',{body:credentials});
    if(!login.user_id||String(existing.user_id)!==String(login.user_id)||login.email!==credentials.email)throw Error('账号身份核验失败');
    const account={...credentials,uid:String(login.user_id)};
    await writeFile(output,JSON.stringify(account),{mode:0o600});console.log(JSON.stringify(account));process.exit(0);
  }
  throw Error('原注册请求尚未核验到账号，保留任务等待核查。');}
const result=await new Promise((resolve,reject)=>{const child=spawn(homedir()+'/.local/bin/macaron-dev-cli',['user','create-user','--data',JSON.stringify(credentials),'--format','json'],{stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('CLI超时；结果待核查，不要重试注册'))},45000);child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',()=>{clearTimeout(timer);reject(Error('CLI无法启动'))});child.on('exit',code=>{clearTimeout(timer);if(code!==0){const reason=/expired|过期/i.test(err+out)?'身份已过期':/timeout|connect|网络/i.test(err+out)?'网络连接失败':'服务拒绝或未确认';return reject(Error('CLI注册失败：'+reason))}try{resolve(JSON.parse(out))}catch{reject(Error('CLI返回格式异常，不要重复创建'))}})});
await writeFile(dir+'/cli-result.json',JSON.stringify(result),{mode:0o600});const data=result.metadata||result.data||result;const uid=String(data.user_id||data.userId||'');if(!uid||data.email?.toLowerCase()!==credentials.email)throw Error('CLI未返回可验证账号');const account={...credentials,uid};await writeFile(output,JSON.stringify(account,null,2),{mode:0o600});console.log(JSON.stringify(account));
