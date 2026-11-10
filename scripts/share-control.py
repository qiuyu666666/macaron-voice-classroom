"""Start or stop the invite-only frontend. Keep the local admin server independent."""
import json, os, re, secrets, shutil, signal, subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / 'private' / 'test-share'
STATE = STORE / 'processes.json'
STORE.mkdir(parents=True, exist_ok=True, mode=0o700)
env = dict(os.environ, HTTPS_PROXY='http://127.0.0.1:7890', HTTP_PROXY='http://127.0.0.1:7890', NO_PROXY='127.0.0.1,localhost')
def running(pid, marker):
    if not isinstance(pid,int) or pid < 2: return False
    return marker in subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
def spawn(argv, log):
    with open(STORE / log,'ab') as out:
        return subprocess.Popen(argv,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=out,start_new_session=True).pid
state = json.loads(STATE.read_text()) if STATE.exists() else {}
markers={'tunnel':'127.0.0.1:4378','server':'serve-test-share.mjs','awake':'caffeinate'}
def stop():
    for key,marker in markers.items():
        if running(state.get(key),marker): os.kill(state[key],signal.SIGTERM)
    time.sleep(.5)
    STATE.unlink(missing_ok=True)
if '--stop' in sys.argv:
    stop(); (ROOT/'体验链接.txt').write_text('体验入口已关闭。\n'); print('对外体验已关闭，本机聊天仍可用。');sys.exit()
log=STORE/'tunnel.log'
if not running(state.get('tunnel'),markers['tunnel']):
    log.write_text('')
    cf=shutil.which('cloudflared') or '/opt/homebrew/bin/cloudflared'
    state['tunnel']=spawn([cf,'tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:4378'],'tunnel.log')
    STATE.write_text(json.dumps(state))
# A reconnect can take longer than the launcher waits. Leave the process alive.
for _ in range(90):
    if not running(state['tunnel'],markers['tunnel']):
        sys.exit('公网连接进程已退出，请查看 private/test-share/tunnel.log。')
    match=re.search(r'https://[\w-]+\.trycloudflare\.com',log.read_text(errors='replace'))
    if match:break
    time.sleep(1)
else:
    sys.exit('公网地址尚未就绪，连接进程继续运行。稍后再打开此入口。')
config_path=STORE/'link.json'
config=json.loads(config_path.read_text()) if config_path.exists() else {}
if config.get('origin')!=match.group() or not config.get('token'):
    config={'origin':match.group(),'token':secrets.token_urlsafe(18)}
    config_path.write_text(json.dumps(config))
    # The frontend reads its allowed hostname on startup.
    if running(state.get('server'),markers['server']):
        os.kill(state['server'],signal.SIGTERM)
        time.sleep(.5)
if not running(state.get('server'),markers['server']):
    node=shutil.which('node') or '/opt/homebrew/bin/node'
    state['server']=spawn([node,'--use-env-proxy','scripts/serve-test-share.mjs'],'server.log')
    STATE.write_text(json.dumps(state))
    time.sleep(1)
    if not running(state['server'],markers['server']):
        sys.exit('体验服务启动失败，公网连接已保留。请查看 private/test-share/server.log。')
if not running(state.get('awake'),markers['awake']):
    state['awake']=spawn(['/usr/bin/caffeinate','-i','-w',str(state['server'])],'awake.log')
STATE.write_text(json.dumps(state))
config=json.loads((STORE/'link.json').read_text())
url=config['origin']+'/try/'+config['token']
(ROOT/'体验链接.txt').write_text(url+'\n')
subprocess.run(['pbcopy'],input=url,text=True,check=False)
print('体验链接已复制，可以直接发给测试者：\n'+url)
