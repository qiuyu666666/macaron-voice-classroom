// Fail closed. Enabling transport requires a separately reviewed contract and server flow.
document.getElementById('safe-login').addEventListener('submit',e=>{e.preventDefault();document.getElementById('readiness').textContent='真实提交尚未启用，未传送任何凭据'});
fetch('/api/login/readiness').then(r=>r.json()).then(d=>{document.getElementById('readiness').textContent=d.reason}).catch(()=>{document.getElementById('readiness').textContent='无法确认后台状态，登录保持关闭'});
