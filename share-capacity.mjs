import {mkdir,readdir,readFile} from 'node:fs/promises';

export const shareCapacity=40;
const active=new Set();
let queue=Promise.resolve();

export async function shareOccupancy(directory,accounts){
  const occupied=new Set(active);
  const tasksByUid=new Map();
  await mkdir(directory,{recursive:true,mode:0o700});
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    const files=await readdir(directory+'/'+entry.name);
    if(files.includes('pending.json')||files.includes('account.json')||files.includes('pi-return.json')){
      occupied.add(entry.name);
    }
    if(files.includes('account.json')&&!active.has(entry.name)){
      const record=JSON.parse(await readFile(directory+'/'+entry.name+'/account.json','utf8'));
      tasksByUid.set(String(record.uid),entry.name);
    }
  }
  for(const account of accounts){
    occupied.add(account.piSetupId||tasksByUid.get(String(account.uid))||'account:'+account.uid);
  }
  return occupied;
}

export function reserveShareAccount(directory,id,auth){
  const task=queue.then(async()=>{
    const occupied=await shareOccupancy(directory,await auth.list());
    if(!occupied.has(id)&&occupied.size>=shareCapacity)throw Error('本轮 40 个测试账号名额已满');
    active.add(id);
  });
  queue=task.catch(()=>{});
  return task;
}

export function releaseShareReservation(id){active.delete(id)}
