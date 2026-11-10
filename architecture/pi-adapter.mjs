// Pure planning and parsing only. No spawn/network/file access or credential discovery.
export function piPlan({provider,model,goal,promptVersion}){
 if(!/^[a-z0-9_-]{1,50}$/i.test(provider||'')||typeof model!=='string'||!model||model.startsWith('-')||model.length>200||/[\r\n]/.test(model))throw Error('provider_model_required');
 if(typeof goal!=='string'||!goal.trim()||goal.length>12000||typeof promptVersion!=='string'||!promptVersion)throw Error('invalid_task');
 return {executable:'/opt/homebrew/bin/pi',args:['--mode','rpc','--no-session','--no-tools','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files','--provider',provider,'--model',model],inheritEnvironment:false,requiresIsolatedConfig:true,requiresApproval:true,command:{id:crypto.randomUUID(),type:'prompt',message:JSON.stringify({task:'course_candidate_only',goal,promptVersion,output:'Return outline, fields and TSX candidates as text; do not execute or publish.'})}};
}
export function jsonlDecoder(onEvent){let buffer='';return chunk=>{buffer+=chunk;if(buffer.length>2000000)throw Error('rpc_buffer_limit');let index;while((index=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);if(line)onEvent(JSON.parse(line))}}}
export class PiWorkerAdapter{
 constructor(transport){this.transport=transport}
 async submit(input){const plan=piPlan(input);if(!this.transport)throw Error('pi_execution_disabled_pending_provider_and_secure_setup');return this.transport(plan)}
}
