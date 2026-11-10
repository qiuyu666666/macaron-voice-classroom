import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const html=await readFile(new URL('../public/accounts.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/accounts.js',import.meta.url),'utf8');
const account={uid:'test-1',setupId:'setup',email:'a@example.test',password:'example'};
for(const statuses of [[503,502,200],[503,503,503,503],[400]]){
  test('Pi registration handles '+statuses.join('/'),async()=>{
    const dom=new JSDOM(html,{url:'https://example.test/accounts',runScripts:'outside-only'});
    const w=dom.window,ids=[];
    try{
      w.sessionStorage.setItem('pi-registration-request','existing-task');
      w.setTimeout=fn=>queueMicrotask(fn);
      w.fetch=async(path,options)=>{
        if(path.endsWith('/status'))return Response.json({accounts:[]});
        ids.push(JSON.parse(options.body).requestId);
        const status=statuses[ids.length-1];
        return Response.json(status===200?account:{error:'test error'},{status});
      };
      w.eval(script);
      await new Promise(resolve=>setImmediate(resolve));
      assert.deepEqual(ids,statuses.map(()=>'existing-task'));
      assert.equal(w.document.getElementById('email').value,statuses.at(-1)===200?account.email:'');
      assert.equal(w.sessionStorage.getItem('pi-registration-request'),statuses.at(-1)===200?null:'existing-task');
    }finally{w.close()}
  });
}
