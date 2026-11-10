import test from'node:test';import assert from'node:assert/strict';import{courseActionError,repairCourseReply}from'../course-repair.mjs';import{voiceActions}from'../public/voice-action.mjs';
const action={label:'晚安',goal:'学习Goodnight',course_brief:'一个词',outline:{title:'晚安',points:[{title:'Goodnight',explanation:'睡前晚安',items:['Goodnight']}],example:'Goodnight!',check:'说晚安'}};const fence=x=>'```courseware\n'+JSON.stringify(x)+'\n```';
test('old chats can attach an incomplete or oversized outline without blocking a valid invitation',async()=>{
 for(const outline of [{points:Array(7).fill({title:'数字'})},{points:[{title:'1到10'}]}]){
   const text=fence({...action,outline});assert.equal(courseActionError(text),null);
   const [invitation]=voiceActions(text);assert.equal(invitation.goal,action.goal);assert.equal(invitation.outline,undefined);
   assert.equal(await repairCourseReply(text,()=>assert.fail('unnecessary repair')),text);
 }
});
test('malformed, missing and mixed invalid actions do not silently pass',async()=>{for(const bad of ['```courseware\n{','```courseware\n{}\n```',fence(action)+'\n```courseware\n{}\n```']){assert(courseActionError(bad));let calls=0;await assert.rejects(repairCourseReply(bad,async()=>{calls++;return '稍等一下'}),/未创建邀请卡/);assert.equal(calls,1)}});
test('ordinary chat and valid course actions never trigger a repair',async()=>{for(const text of ['你好',fence(action)])assert.equal(await repairCourseReply(text,()=>assert.fail('unexpected repair')),text)});
