const button=document.getElementById('pi-login');
const statusMessage=document.getElementById('status');
const taskKey='pi-registration-request';
async function signIn(){
 if(button.disabled)return;
 button.disabled=true;
 try{
   let requestId=sessionStorage.getItem(taskKey);
   if(!requestId){
     requestId=crypto.randomUUID();
     sessionStorage.setItem(taskKey,requestId);
   }
   statusMessage.textContent='Pi 正在准备账号并登录…';
   const delays=[1500,4000,8000];
   for(let attempt=0;;attempt++){
     let response;
     try{
       response=await fetch('/api/auth/pi-register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId})});
     }catch(error){if(!(error instanceof TypeError))throw error}
     const result=response?await response.json().catch(()=>null):null;
     if(response?.ok&&result?.ok){
       sessionStorage.removeItem(taskKey);
       location.replace('/chat');
       return;
     }
     if(response && ![502,503,504,524].includes(response.status))throw Error(result?.error||'登录失败，请重试');
     if(attempt===delays.length)throw Error('连接仍未恢复。再次点击将继续本次登录。');
     statusMessage.textContent='连接暂时中断，正在继续本次登录…';
     await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
   }
 }catch(error){
   statusMessage.textContent=error.message;
   button.disabled=false;
 }
}
button.onclick=signIn;
if(sessionStorage.getItem(taskKey))signIn();
