import{randomUUID}from'node:crypto';
// Backend-only session identifiers. No Pi subprocess or model is launched here.
export function workflowPlan({flow,browserSession,skillRef,approvedSkills=[]}){
 if(!['register','login','chat','course'].includes(flow)||typeof browserSession!=='string'||!browserSession)throw Error('invalid_workflow');
 if(flow==='course'&&(!skillRef||!approvedSkills.includes(skillRef)))throw Error('explicit_reviewed_course_skill_required');
 return{jobId:randomUUID(),piSessionId:randomUUID(),binding:browserSession,flow,loadAmbientContext:false,inheritCredentials:false,skillRefs:flow==='course'?[skillRef]:[],operations:flow==='course'?['submit_course_candidate']:flow==='chat'?['status','history','send']:[`request_${flow}_handoff`],executionEnabled:false};
}
