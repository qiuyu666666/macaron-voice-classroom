import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {reserveShareAccount,releaseShareReservation,shareOccupancy} from '../share-capacity.mjs';

test('share admits the 40th account once, preserves retries and releases unsubmitted tasks',async()=>{
  const dir=await mkdtemp(tmpdir()+'/share-capacity-');
  try{
    const accounts=Array.from({length:38},(_,i)=>({uid:String(i)}));
    const auth={list:async()=>accounts};
    await mkdir(dir+'/existing');
    await writeFile(dir+'/existing/pending.json','{}');
    await mkdir(dir+'/failed-before-create');
    await writeFile(dir+'/failed-before-create/session.jsonl','');
    const results=await Promise.allSettled(['last','extra'].map(id=>reserveShareAccount(dir,id,auth)));
    assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
    await reserveShareAccount(dir,'existing',auth);
    releaseShareReservation('existing');
    releaseShareReservation('last');
    await reserveShareAccount(dir,'extra',auth);
    releaseShareReservation('extra');
    await writeFile(dir+'/existing/account.json',JSON.stringify({uid:'known'}));
    accounts.push({uid:'known'});
    assert.equal((await shareOccupancy(dir,accounts)).size,39);
  }finally{
    for(const id of ['existing','last','extra']) releaseShareReservation(id);
    await rm(dir,{recursive:true,force:true});
  }
});
