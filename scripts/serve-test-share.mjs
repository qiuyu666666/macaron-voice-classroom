import{readFile}from'node:fs/promises';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../private/test-share/',import.meta.url));
const {origin,token}=JSON.parse(await readFile(root+'link.json','utf8'));
Object.assign(process.env,{FRONTEND_SHARE_ORIGIN:origin,FRONTEND_SHARE_TOKEN:token,AUTH_DATA_DIR:root+'auth',PI_ACCOUNT_TASK_DIR:root+'pi-accounts',CLASSROOM_DATA_DIR:root+'classroom',PORT:'4378'});
await import('../server.mjs');
