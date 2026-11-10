export class LocalRecording {
 constructor({onStatus,save}){this.onStatus=onStatus;this.save=save;this.sources=[];this.parts=[];}
 async start(stream){this.startedAt=new Date().toISOString();this.context=new AudioContext();this.destination=this.context.createMediaStreamDestination();this.add(stream);const mime=['audio/webm;codecs=opus','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));this.recorder=new MediaRecorder(this.destination.stream,mime?{mimeType:mime}:{});this.recorder.ondataavailable=e=>{if(e.data.size)this.parts.push(e.data)};this.recorder.start(1000);await this.context.resume();this.onStatus('正在本机录音：你的麦克风与老师音频；请告知其他参与者。');}
 add(stream){if(!this.context)return;const source=this.context.createMediaStreamSource(stream);source.connect(this.destination);this.sources.push(source)}
 async stop(){
   if(!this.recorder)return;
   if(!this.finished)this.finished=(async()=>{
     await new Promise(resolve=>{this.recorder.onstop=resolve;this.recorder.stop()});
     this.sources.forEach(source=>source.disconnect());
     await this.context.close();
     return new Blob(this.parts,{type:this.recorder.mimeType});
   })();
   if(!this.upload)this.upload=this.finished.then(blob=>this.save(blob,this.startedAt)).then(result=>{
     this.onStatus('完整录音已保存');return result;
   }).catch(error=>{this.upload=null;throw error});
   return this.upload;
 }
}
export {summaryRequest} from './summary-turn.mjs';
