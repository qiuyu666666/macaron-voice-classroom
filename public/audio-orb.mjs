export class AudioOrb{
 constructor(onLevel){this.onLevel=onLevel;this.closed=false}
 async start(stream){await this.stop();this.closed=false;this.context=new AudioContext();this.source=this.context.createMediaStreamSource(stream);this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.source.connect(this.analyser);this.data=new Uint8Array(256);await this.context.resume();const tick=()=>{if(this.closed)return;this.analyser.getByteTimeDomainData(this.data);let sum=0;for(const v of this.data)sum+=((v-128)/128)**2;this.onLevel(Math.min(1,Math.sqrt(sum/this.data.length)*3));this.frame=requestAnimationFrame(tick)};tick()}
 async stop(){this.closed=true;cancelAnimationFrame(this.frame);this.source?.disconnect();this.analyser?.disconnect();const c=this.context;this.context=null;this.onLevel(0);if(c&&c.state!=='closed')await c.close()}
}
