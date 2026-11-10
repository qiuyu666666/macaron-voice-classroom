// A short, isolated session with silent input; never opens the device microphone.
export function previewVoice(engine,voice,speed,update){
 const pc=new RTCPeerConnection(),ctx=new AudioContext(),out=new Audio();
 const silent=ctx.createMediaStreamDestination(),abort=new AbortController();
 const oscillator=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0;oscillator.connect(gain).connect(silent);oscillator.start();
 pc.addTrack(silent.stream.getAudioTracks()[0],silent.stream);
 const dc=pc.createDataChannel('oai-events');
 let stopped=false,analysis,heard=0,timeout;
 function stop(label='已停止'){
   if(stopped)return;stopped=true;abort.abort();clearTimeout(timeout);clearInterval(meter);
   if(engine==='live'&&dc.readyState==='open')dc.send(JSON.stringify({type:'session.close'}));
   pc.close();oscillator.stop();silent.stream.getTracks().forEach(t=>t.stop());out.pause();out.srcObject=null;ctx.close().catch(()=>{});update(label,true);
 }
 const meter=setInterval(()=>{
   if(!analysis)return;const data=new Uint8Array(256);analysis.getByteTimeDomainData(data);
   if(data.some(v=>Math.abs(v-128)>4)){if(!heard)update('正在试听');heard=performance.now()}
   else if(heard&&performance.now()-heard>1500)stop('试听结束');
 },130);
 pc.ontrack=e=>{const stream=e.streams[0]||new MediaStream([e.track]);out.srcObject=stream;
   analysis=ctx.createAnalyser();analysis.fftSize=256;ctx.createMediaStreamSource(stream).connect(analysis);
   out.play().catch(()=>stop('浏览器未允许播放，请再点一次试听'));
 };
 const line='只说一句：“你好，我是马卡龙。今天想一起学点什么？” 说完就停。';
 dc.onopen=()=>{if(engine==='realtime')dc.send(JSON.stringify({type:'response.create',response:{instructions:line,output_modalities:['audio']}}))};
 dc.onmessage=e=>{const m=JSON.parse(e.data);if(engine==='live'&&m.type==='session.started')dc.send(JSON.stringify({type:'session.commentary.append',event_id:crypto.randomUUID(),delegation_id:null,content:line}));if(m.type==='error'&&!heard)stop(m.error?.message||'试听失败')};
 async function connect(){
   update('正在连接试听…');await ctx.resume();await pc.setLocalDescription(await pc.createOffer());
   if(engine==='live'&&pc.iceGatheringState!=='complete')await new Promise(resolve=>{
     const timer=setTimeout(done,5000);
     function done(){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve()}
     function check(){if(pc.iceGatheringState==='complete')done()}pc.addEventListener('icegatheringstatechange',check);
   });
   if(stopped)return;
   const r=await fetch('/api/voice-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,voice,speed,sdp:pc.localDescription.sdp}),signal:abort.signal});
   const data=await r.json();if(!r.ok)throw Error(data.error||'试听服务不可用');
   await pc.setRemoteDescription({type:'answer',sdp:data.sdp});
 }
 timeout=setTimeout(()=>stop(heard?'试听结束':'试听连接超时'),40000);
 connect().catch(e=>stop(e.message));return stop;
}
