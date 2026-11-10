import {readFile,stat} from 'node:fs/promises';
export async function loadLocalKey(path){
 try{const info=await stat(path);if(info.mode&0o077)throw Error('本地密钥文件权限必须为 600');const config=JSON.parse(await readFile(path,'utf8'));if(typeof config.OPENAI_API_KEY!=='string')throw Error('invalid');return config.OPENAI_API_KEY.trim();}
 catch(e){if(e.code==='ENOENT')return '';if(e.message==='本地密钥文件权限必须为 600')throw e;throw Error('本地密钥配置格式错误，请检查 JSON；密钥内容不会显示');}
}
