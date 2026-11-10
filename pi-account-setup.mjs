import{readFile,writeFile,mkdir}from'node:fs/promises';import{fileURLToPath}from'node:url';import{piPrompt}from'./pi-runtime.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),tasks=process.env.PI_ACCOUNT_TASK_DIR||root+'private/pi-accounts',running=new Map();const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
export async function setupRecord(id){if(!valid(id))throw Error('账号创建任务无效');return JSON.parse(await readFile(tasks+'/'+id+'/account.json','utf8'))}
export async function createPiAccount(id){if(!valid(id))throw Error('账号创建任务无效');if(running.has(id))return running.get(id);const task=(async()=>{const dir=tasks+'/'+id;await mkdir(dir,{recursive:true,mode:0o700});try{const result=JSON.parse(await readFile(dir+'/pi-return.json','utf8'));return{...result,setupId:id}}catch(e){if(e.code!=='ENOENT')throw e}
 try{const saved=await setupRecord(id);if(saved.email&&saved.uid&&saved.password)return{...saved,setupId:id}}catch(e){if(e.code!=='ENOENT')throw e}
 const system=await readFile(root+'prompts/pi-account-register.md','utf8');let result;try{result=await piPrompt({mode:'account',directory:dir,timeout:120000,system,message:'本次任务目录：'+dir+'。请用bash执行这一个固定命令，不改写或绕过执行器：\n'+quote(process.execPath)+' '+quote(root+'scripts/pi-create-account-once.mjs')+' '+quote(dir)+'\n工具返回成功后，最终仅输出工具返回的email、password、uid JSON。'});
 }catch(e){
   // The executor may have succeeded before Pi lost its connection.
   try{const saved=await setupRecord(id);if(saved.email&&saved.password&&saved.uid)return {...saved,setupId:id}}
   catch(readError){if(readError.code!=='ENOENT')throw readError}
   throw e;
 }
 let returned;try{returned=JSON.parse(result.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}catch{try{returned=await setupRecord(id)}catch{throw Error('Pi已响应，但注册执行器没有取得已核验的账号；请在此页继续原任务。')}}
 const saved=await setupRecord(id);if(['email','password','uid'].some(k=>saved[k]!==returned[k]))throw Error('Pi返回与CLI创建记录不一致');await writeFile(dir+'/pi-return.json',JSON.stringify(saved),{mode:0o600});return{...saved,setupId:id};})();running.set(id,task);try{return await task}finally{running.delete(id)}}
export async function initializePiIdentity(account,credentials){const dir=(process.env.CLASSROOM_DATA_DIR||root+'private/pi-classroom')+'/chats/'+account.localChatId;try{const done=JSON.parse(await readFile(dir+'/identity-ready.json','utf8'));if(done.uid===account.uid)return}catch(e){if(e.code!=='ENOENT')throw e}
 const text=await piPrompt({directory:dir,timeout:120000,system:await readFile(root+'prompts/pi-account-identity.md','utf8'),message:JSON.stringify({source:'verified_account_initialization',email:credentials.email,password:credentials.password,uid:account.uid,localConversationId:account.localChatId})});
 await writeFile(dir+'/identity-ready.json',JSON.stringify({uid:account.uid,at:new Date().toISOString(),acknowledged:true}),{mode:0o600});return text;
}
