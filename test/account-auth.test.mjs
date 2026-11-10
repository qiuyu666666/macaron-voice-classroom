import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{AccountAuth}from'../account-auth.mjs';
async function fixture(){const directory=await mkdtemp(tmpdir()+'/macaron-auth-');const calls=[];const users=new Map([['one@example.com',{uid:'1',password:'password1'}],['two@example.com',{uid:'2',password:'password2'}]]);let mismatch=false,failCreate=false;const auth=new AccountAuth({directory,chatDirectory:directory+'/chats',adminToken:async()=> 'admin',fetcher:async(url,o)=>{calls.push({url,method:o.method});let metadata,code=200;const u=new URL(url),b=o.body&&JSON.parse(o.body);if(u.pathname==='/admin/users')metadata={user_list:users.has(u.searchParams.get('email'))?[{email:u.searchParams.get('email'),user_id:users.get(u.searchParams.get('email')).uid}]:[]};else if(u.pathname==='/users/login'){const user=users.get(b.email);if(!user||user.password!==b.password)code=401;else metadata={user_id:mismatch?'wrong':user.uid,email:b.email,token:user.uid}}else if(u.pathname==='/admin/users/create-user'){if(failCreate)throw Error('network');const uid='3';users.set(b.email,{uid,password:b.password});metadata={user_id:uid,email:b.email,token:uid,chat_id:'chat'+uid}}else if(u.pathname==='/chats/self')metadata={chat_id:'chat'+o.headers.Authorization.slice(7)};else throw Error('unexpected');return{ok:code===200,json:async()=>({code,metadata})}}});return{auth,calls,cleanup:()=>rm(directory,{recursive:true,force:true}),mismatch:()=>mismatch=true,failCreate:()=>failCreate=true}}
test('real identities map to separate persistent local chats; switch revokes prior session; passwords never public',async()=>{const f=await fixture();try{const a=await f.auth.authenticate({email:'one@example.com',password:'password1',savePassword:true});const first=await f.auth.current(a.cookie);assert.equal(first.uid,'1');assert.equal(a.account.password,undefined);const b=await f.auth.authenticate({email:'two@example.com',password:'password2'},a.cookie);assert.equal(await f.auth.current(a.cookie),null);assert.notEqual((await f.auth.current(b.cookie)).localChatId,first.localChatId);const again=await f.auth.authenticate({mode:'saved',uid:'1'},b.cookie);assert.equal((await f.auth.current(again.cookie)).localChatId,first.localChatId);assert.equal(JSON.stringify(await f.auth.list()).includes('password1'),false);await f.auth.logout(again.cookie);assert.equal(await f.auth.current(again.cookie),null)}finally{await f.cleanup()}});
test('unknown email and wrong password do not register; mismatched UID cannot login',async()=>{const f=await fixture();try{await assert.rejects(f.auth.authenticate({email:'unknown@example.com',password:'pass'}),/未找到/);assert.equal(f.calls.some(c=>c.method==='POST'),false);await assert.rejects(f.auth.authenticate({email:'one@example.com',password:'wrong'}));f.mismatch();await assert.rejects(f.auth.authenticate({email:'one@example.com',password:'password1'}),/身份不一致/);assert.equal((await f.auth.list()).length,0)}finally{await f.cleanup()}});
test('explicit registration creates once; ambiguous registration never automatically retries',async()=>{const f=await fixture();try{const a=await f.auth.authenticate({mode:'register',email:'new@example.com',password:'password3'});assert.equal(a.account.uid,'3');await assert.rejects(f.auth.authenticate({mode:'register',email:'new@example.com',password:'password3'}),/已注册/);f.failCreate();await assert.rejects(f.auth.authenticate({mode:'register',email:'pending@example.com',password:'password3'}));await assert.rejects(f.auth.authenticate({mode:'register',email:'pending@example.com',password:'password3'}),/待核查/);assert.equal(f.calls.filter(c=>c.url.endsWith('/create-user')).length,2)}finally{await f.cleanup()}});
test('login recovers a dropped response and never submits a create request',async()=>{
 const f=await fixture();try{
  const fetcher=f.auth.fetcher;let tries=0;
  f.auth.fetcher=(url,options)=>{
   if(url.endsWith('/users/login')&&++tries===1)throw Error('connection reset');
   return fetcher(url,options);
  };
  const result=await f.auth.authenticate({email:'one@example.com',password:'password1'});
  assert.equal(result.account.uid,'1');assert.equal(tries,2);assert(!f.calls.some(c=>c.url.endsWith('/create-user')));
 }finally{await f.cleanup()}
});
test('lost create response recovers the verified account with exactly one create',async()=>{
 const f=await fixture();try{
  const fetcher=f.auth.fetcher;
  f.auth.fetcher=async(url,options)=>{
   const response=await fetcher(url,options);
   if(url.endsWith('/create-user'))throw Error('response lost');
   return response;
  };
  const result=await f.auth.authenticate({mode:'register',email:'lost@example.com',password:'password3'});
  assert.equal(result.account.uid,'3');assert.equal(f.calls.filter(c=>c.url.endsWith('/create-user')).length,1);
 }finally{await f.cleanup()}
});
