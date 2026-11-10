const $=id=>document.getElementById(id);let mode='login',busy=false,piSetupId=null,piRequestId=null;
function setMode(value){mode=value;if(value==='register')piSetupId=null;$('nameRow').hidden=value!=='register';$('loginTab').setAttribute('aria-selected',value==='login');$('registerTab').setAttribute('aria-selected',value==='register');$('password').autocomplete=value==='register'?'new-password':'current-password';$('submit').textContent=value==='register'?'注册并进入聊天':'登录并进入聊天';$('message').textContent=''}
$('loginTab').onclick=()=>setMode('login');$('registerTab').onclick=()=>setMode('register');
async function login(data){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);$('message').textContent=data.mode==='register'?'正在创建并核对账号…':(data.piSetupId?'正在登录，并把账号身份交给 Pi…':'正在登录并核对账号…');try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error);sessionStorage.removeItem('pi-registration-request');location.href='/chat'}catch(e){$('message').textContent=e.message}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
$('form').onsubmit=e=>{e.preventDefault();login({mode,email:$('email').value,password:$('password').value,name:$('name').value,savePassword:$('save').checked,piSetupId,piRequestId})};
fetch('/api/auth/status').then(r=>r.json()).then(s=>{if(s.account){$('current').hidden=false;const title=document.createElement('div');title.textContent='当前账号：'+s.account.name;const link=document.createElement('a');link.href='/chat';link.textContent='继续聊天';const small=document.createElement('small');small.textContent=s.account.email+' · UID '+s.account.uid;const logout=document.createElement('button');logout.id='logout';logout.textContent='退出登录';logout.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload()};$('current').append(title,small,link,document.createElement('br'),logout)}$('savedSection').hidden=!s.accounts.length;for(const a of s.accounts){const b=document.createElement('button');b.type='button';b.textContent=a.name+(a.savedLogin?' · 点击登录':'');const detail=document.createElement('small');detail.textContent=a.email+' · UID '+a.uid;b.append(detail);b.onclick=()=>a.savedLogin?login({mode:'saved',uid:a.uid}):(setMode('login'),$('email').value=a.email,$('password').focus());$('saved').append(b)}}).catch(()=>{$('message').textContent='无法连接本机服务，请重新打开聊天入口'});

async function requestPiRegistration(requestId){
  const delays=[1500,4000,8000];
  for(let attempt=0;;attempt++){
    let response;
    try{
      response=await fetch('/api/auth/pi-register',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId})
      });
    }catch(error){
      if(!(error instanceof TypeError))throw error;
    }
    if(response?.ok)return response.json();
    const failure=response?await response.json().catch(()=>null):null;
    const temporary=!response||[502,503,504,524].includes(response.status);
    if(!temporary)throw Error(failure?.error||'注册请求失败');
    if(attempt===delays.length)throw Error('连接仍未恢复，已保留本次任务。稍后可继续同一任务。');
    $('message').textContent='连接暂时中断，正在自动重试同一注册任务（'+(attempt+1)+'/'+delays.length+'）…';
    await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
  }
}
async function registerWithPi(){
  if(busy)return;
  busy=true;
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  let requestId=sessionStorage.getItem('pi-registration-request');
  if(!requestId){
    requestId=crypto.randomUUID();
    sessionStorage.setItem('pi-registration-request',requestId);
  }
  $('message').textContent='Pi 正在通过 Macaron CLI 创建测试账号…';
  try{
    const a=await requestPiRegistration(requestId);
    piSetupId=a.setupId;piRequestId=requestId;
    sessionStorage.removeItem('pi-registration-request');
    setMode('login');
    $('email').value=a.email;$('password').value=a.password;$('name').value='Pi 测试账号 '+a.uid.slice(-6);
    $('pi-register').textContent='让 Pi 再创建一个测试账号';
    $('message').textContent='Pi 已创建账号，UID：'+a.uid+'。点击登录，将账号信息交给对应的 Pi 对话。';
  }catch(e){$('message').textContent=e.message}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}
}
$('pi-register').onclick=registerWithPi;
if(sessionStorage.getItem('pi-registration-request'))queueMicrotask(registerWithPi);
